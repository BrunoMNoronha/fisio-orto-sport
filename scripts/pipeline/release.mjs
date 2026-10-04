import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export const targets = JSON.parse(readFileSync(new URL("./targets.json", import.meta.url), "utf8"));
export class ReleaseError extends Error {}
const assert = (condition, message) => { if (!condition) throw new ReleaseError(message); };
const required = (env, name) => {
  assert(typeof env[name] === "string" && env[name].trim().length > 0, `${name} obrigatória.`);
  return env[name].trim();
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function databaseTarget(env) {
  const environment = required(env, "RELEASE_ENV");
  const target = targets.environments[environment];
  assert(target, "Ambiente de release inválido.");
  for (const [name, expected] of Object.entries({
    NEON_PROJECT_ID: targets.neonProjectId, NEON_BRANCH_ID: target.branchId,
    NEON_HOST: target.host, NEON_DATABASE: target.database, NEON_ROLE: target.role,
    VERCEL_PROJECT_ID: targets.vercelProjectId, VERCEL_ORG_ID: targets.vercelOrgId,
  })) assert(required(env, name) === expected, `${name} não corresponde ao alvo aprovado.`);
  for (const [name, pooled] of [["DATABASE_URL", true], ["DATABASE_URL_UNPOOLED", false]]) {
    let url;
    try { url = new URL(required(env, name)); } catch { throw new ReleaseError(`${name} inválida.`); }
    const host = pooled ? target.host.replace(".", "-pooler.") : target.host;
    assert(["postgres:", "postgresql:"].includes(url.protocol), `${name}: protocolo inválido.`);
    assert(url.hostname === host && (!url.port || url.port === "5432"), `${name}: endpoint incorreto.`);
    assert(decodeURIComponent(url.pathname.slice(1)) === target.database, `${name}: banco incorreto.`);
    assert(decodeURIComponent(url.username) === target.role && url.password.length > 0, `${name}: role incorreta ou senha ausente.`);
    assert(["require", "verify-full"].includes(url.searchParams.get("sslmode")), `${name}: TLS obrigatório.`);
  }
  for (const name of ["SETUP_TOKEN", "DEMO_DATA_TARGET", "DEV_RESET_TARGET", "DEV_QUICK_LOGIN", "SEED_ADMIN_PASSWORD", "INTEGRATION_DATABASE_URL"]) {
    assert(!env[name], `${name} não permitida na release.`);
  }
  return target;
}

export function releaseContext(env) {
  assert(env.GITHUB_REPOSITORY === targets.repository, "Repositório incorreto.");
  assert(env.GITHUB_REF === "refs/heads/production", "Release permitida somente em production.");
  assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ""), "SHA inválido.");
  const target = databaseTarget(env);
  for (const key of ["GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_AUTOMATION_BYPASS_SECRET"]) required(env, key);
  return target;
}

export function repositoryMigrations(directory = "prisma/migrations") {
  return readdirSync(directory).filter((name) => existsSync(`${directory}/${name}/migration.sql`)).sort().map((name) => {
    const sql = readFileSync(`${directory}/${name}/migration.sql`, "utf8");
    const lf = sql.replace(/\r\n/g, "\n");
    return { name, checksum: sha256(lf), acceptedChecksums: [...new Set([sha256(sql), sha256(lf), sha256(lf.replace(/\n/g, "\r\n"))])], sql };
  });
}

export function migrationState(rows, migrations) {
  const known = new Map(migrations.map((migration) => [migration.name, migration]));
  const applied = new Set();
  for (const row of rows) {
    if (row.rolled_back_at) continue;
    assert(row.finished_at, `Migração anterior com falha: ${row.migration_name}.`);
    const migration = known.get(row.migration_name);
    assert(migration, `Migração aplicada ausente do repositório: ${row.migration_name}.`);
    assert(migration.acceptedChecksums.includes(row.checksum), `Checksum divergente: ${row.migration_name}.`);
    applied.add(row.migration_name);
  }
  return migrations.filter((migration) => !applied.has(migration.name));
}

export function assertCompatibleMigrations(migrations) {
  for (const migration of migrations) {
    const sql = migration.sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
    assert(!/\b(DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bALTER\s+(?:COLUMN\s+)?[^;]*\b(?:SET\s+NOT\s+NULL|TYPE)\b/i.test(sql),
      `Migração potencialmente incompatível exige procedimento específico: ${migration.name}.`);
  }
}

const migrationsDigest = () => sha256(JSON.stringify(repositoryMigrations().map(({ name, checksum }) => ({ name, checksum }))));
const writeJson = (file, value) => { mkdirSync("release", { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };
const output = (name, value) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`); };
const summary = (message) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + "\n"); };

async function api(provider, path) {
  const vercel = provider === "vercel";
  const base = vercel ? "https://api.vercel.com" : "https://api.github.com";
  const suffix = vercel ? `${path.includes("?") ? "&" : "?"}teamId=${targets.vercelOrgId}` : "";
  const response = await fetch(base + path + suffix, {
    headers: { Authorization: `Bearer ${required(process.env, vercel ? "VERCEL_TOKEN" : "GITHUB_TOKEN")}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, `${provider}: consulta recusada (HTTP ${response.status}).`);
  return response.json();
}

async function currentProductionSha() {
  return (await api("github", `/repos/${targets.repository}/git/ref/heads/production`)).object.sha;
}

async function preflight() {
  const target = releaseContext(process.env);
  assert(await currentProductionSha() === process.env.GITHUB_SHA, "production avançou; execute o Preview do commit atual.");
  const project = await api("vercel", `/v9/projects/${targets.vercelProjectId}`);
  assert(project.id === targets.vercelProjectId && project.accountId === targets.vercelOrgId, "Projeto Vercel incorreto.");
  assert(project.framework === "nextjs" && project.nodeVersion === "24.x", "Framework ou Node Vercel divergente.");
  assert(project.link?.productionBranch === "production", "Production Branch da Vercel deve ser production.");
  const { envs } = await api("vercel", `/v9/projects/${targets.vercelProjectId}/env?decrypt=false`);
  const scope = process.env.RELEASE_ENV.toLowerCase();
  const scoped = envs.filter((item) => item.target?.includes(scope) && (!item.gitBranch || item.gitBranch === "production"));
  assert(scoped.some((item) => item.key === "DATABASE_URL"), "DATABASE_URL não configurada no ambiente Vercel.");
  for (const name of ["SETUP_TOKEN", "DEMO_DATA_TARGET", "DEV_RESET_TARGET", "DEV_QUICK_LOGIN", "SEED_ADMIN_PASSWORD", "INTEGRATION_DATABASE_URL"]) {
    assert(!scoped.some((item) => item.key === name), `${name} não permitida no ambiente Vercel.`);
  }
  console.log(JSON.stringify({ environment: process.env.RELEASE_ENV, host: target.host, database: target.database, sha: process.env.GITHUB_SHA }));
}

async function audit(complete) {
  const target = databaseTarget(process.env);
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED, connectionTimeoutMillis:15000 });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const actual = (await client.query("SELECT current_database() AS database, current_user AS role")).rows[0];
    assert(actual.database === target.database && actual.role === target.role, "Conexão não corresponde ao banco/role aprovado.");
    const table = (await client.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0];
    assert(table.name, "Banco não inicializado: histórico Prisma ausente.");
    const rows = (await client.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations")).rows;
    const pending = migrationState(rows, repositoryMigrations());
    assertCompatibleMigrations(pending);
    if (complete) assert(pending.length === 0, "Migrações pendentes após migrate deploy.");
    const result = { environment:process.env.RELEASE_ENV, branchId:target.branchId, database:target.database, pending:pending.map((migration) => migration.name), migrationsDigest:migrationsDigest() };
    writeJson(`release/database-${process.env.RELEASE_ENV.toLowerCase()}.json`, result);
    console.log(JSON.stringify(result));
    await client.query("ROLLBACK");
  } finally { await client.end(); }
}

export function assertDeployment(deployment, environment, sha) {
  assert((deployment.projectId ?? deployment.project?.id) === targets.vercelProjectId, "Deployment de outro projeto.");
  assert(deployment.readyState === "READY" || deployment.state === "READY", "Deployment não está READY.");
  const expected = environment === "Production" ? "production" : "preview";
  assert((deployment.target ?? "preview") === expected, "Deployment de outro ambiente.");
  assert(deployment.meta?.githubCommitSha === sha && deployment.meta?.githubCommitRef === "production", "Deployment de outro commit/branch.");
  assert(/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url ?? ""), "URL de deployment inválida.");
}

async function smoke(host) {
  assert(/^[a-z0-9-]+\.vercel\.app$/.test(host), "Host de verificação inválido.");
  const options = { headers:{ "x-vercel-protection-bypass":required(process.env,"VERCEL_AUTOMATION_BYPASS_SECRET") }, redirect:"manual", signal:AbortSignal.timeout(30000) };
  const login = await fetch(`https://${host}/login`, options);
  assert(login.status === 200 && (await login.text()).includes("Fisio OrtoSport"), "Página de login indisponível ou resposta de proteção Vercel.");
  const route = await fetch(`https://${host}/configuracoes`, { ...options, signal:AbortSignal.timeout(30000) });
  let location;
  try { location = new URL(route.headers.get("location"), `https://${host}`); } catch { throw new ReleaseError("Rota protegida sem redirecionamento válido."); }
  assert([303,307,308].includes(route.status) && location.hostname === host && location.pathname === "/login", "Rota protegida não exige login.");
}

async function inspectedDeployment(file, environment) {
  let url;
  try { url = new URL(readFileSync(file,"utf8").trim()); } catch { throw new ReleaseError("Saída de deploy inválida."); }
  assert(url.protocol === "https:" && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) && !url.username && !url.password && url.pathname === "/", "Saída de deploy inválida.");
  const deployment = await api("vercel", `/v13/deployments/${url.hostname}`);
  assertDeployment(deployment, environment, process.env.GITHUB_SHA);
  assert(await currentProductionSha() === process.env.GITHUB_SHA, "production avançou durante o deploy; valide o Preview atual antes de publicar.");
  assert(deployment.url === url.hostname, "URL não corresponde ao deployment.");
  await smoke(deployment.url);
  return deployment;
}

async function previewManifest() {
  const deployment = await inspectedDeployment("release/preview-url.txt", "Preview");
  const manifest = { version:1, repository:targets.repository, environment:"Preview", sha:process.env.GITHUB_SHA,
    runId:process.env.GITHUB_RUN_ID, projectId:targets.vercelProjectId, deploymentId:deployment.id,
    url:`https://${deployment.url}`, migrationsDigest:migrationsDigest(), createdAt:new Date().toISOString() };
  writeJson("release/preview.json",manifest);
  output("url",manifest.url);
  summary(`Preview validado: [${manifest.sha.slice(0,7)}](${manifest.url}). Execução para liberação manual: **${manifest.runId}**.`);
  console.log(JSON.stringify(manifest));
}

export function assertCandidate(manifest, run, sha, digest) {
  assert(manifest.version === 1 && manifest.environment === "Preview" && manifest.repository === targets.repository && manifest.projectId === targets.vercelProjectId, "Manifesto de outro projeto/ambiente.");
  assert(run.status === "completed" && run.conclusion === "success" && run.head_branch === "production" && run.path === ".github/workflows/deploy-preview.yml", "Execução de Preview inválida ou malsucedida.");
  assert(["push", "workflow_dispatch"].includes(run.event) && run.head_repository?.full_name === targets.repository, "Origem da execução de Preview inválida.");
  assert(String(run.id) === String(manifest.runId) && run.head_sha === manifest.sha && manifest.sha === sha, "SHA/execução diverge da release atual.");
  assert(manifest.migrationsDigest === digest, "Migrações divergem do Preview aprovado.");
  assert(/^dpl_[A-Za-z0-9]+$/.test(manifest.deploymentId ?? ""), "ID de deployment inválido.");
}

async function candidate() {
  assert(process.env.GITHUB_REF === "refs/heads/production", "Selecione production ao executar o workflow manual.");
  const id = required(process.env,"PREVIEW_RUN_ID");
  assert(/^[1-9][0-9]*$/.test(id), "ID de execução inválido.");
  const manifest = JSON.parse(readFileSync("release/candidate/preview.json","utf8"));
  const run = await api("github",`/repos/${targets.repository}/actions/runs/${id}`);
  assertCandidate(manifest,run,process.env.GITHUB_SHA,migrationsDigest());
  assert(await currentProductionSha() === manifest.sha, "production avançou; valide o novo Preview.");
  const deployment = await api("vercel",`/v13/deployments/${manifest.deploymentId}`);
  assertDeployment(deployment,"Preview",manifest.sha);
  assert(manifest.url === `https://${deployment.url}`, "URL do manifesto diverge do deployment.");
  await smoke(deployment.url);
  summary(`Release manual vinculada ao Preview **${id}**, commit **${manifest.sha}**.`);
}

async function recoveryPoint() {
  const alias = await api("vercel",`/v4/aliases/${targets.productionDomain}`);
  const previousDeploymentId = alias.deploymentId ?? alias.deployment?.id;
  assert(previousDeploymentId, "Deployment produtivo anterior não identificado.");
  const previous = await api("vercel",`/v13/deployments/${previousDeploymentId}`);
  assert((previous.projectId ?? previous.project?.id) === targets.vercelProjectId && previous.target === "production", "Alvo de recuperação inválido.");
  const recordedAt = new Date();
  const recovery = { sha:process.env.GITHUB_SHA, previousDeploymentId, previousSha:previous.meta?.githubCommitSha,
    neonProjectId:targets.neonProjectId, branchId:targets.environments.Production.branchId,
    recordedAt:recordedAt.toISOString(), recoveryWindowSeconds:targets.recoveryWindowSeconds,
    expiresAt:new Date(recordedAt.getTime()+targets.recoveryWindowSeconds*1000).toISOString() };
  writeJson("release/recovery.json",recovery);
  summary(`Recuperação registrada antes da migração: deployment anterior **${previousDeploymentId}**, PITR de 6 h a partir de **${recovery.recordedAt}**. Não há reversão automática do banco.`);
}

async function productionDeployment() {
  const deployment = await inspectedDeployment("release/production-url.txt","Production");
  output("deployment_id",deployment.id);
  output("url",`https://${deployment.url}`);
  writeJson("release/production.json",{ sha:process.env.GITHUB_SHA, deploymentId:deployment.id, url:`https://${deployment.url}` });
}

async function published() {
  const receipt = JSON.parse(readFileSync("release/production.json","utf8"));
  const alias = await api("vercel",`/v4/aliases/${targets.productionDomain}`);
  assert((alias.deploymentId ?? alias.deployment?.id) === receipt.deploymentId, "Domínio não aponta para a release publicada.");
  await smoke(targets.productionDomain);
  summary(`Production publicada: [${receipt.sha.slice(0,7)}](https://${targets.productionDomain}), deployment **${receipt.deploymentId}**. Validar sessão autenticada e logout conforme o procedimento de release.`);
}

async function main(command) {
  switch(command) {
    case "preflight": return preflight();
    case "audit": return audit(process.argv.includes("--complete"));
    case "preview-manifest": return previewManifest();
    case "candidate": return candidate();
    case "recovery-point": return recoveryPoint();
    case "production-deployment": return productionDeployment();
    case "published": return published();
    default: throw new ReleaseError("Comando de release inválido.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch((error) => {
    // Mensagens de drivers/HTTP podem conter credenciais ou parâmetros. Nunca ecoar essas respostas.
    console.error(error instanceof ReleaseError ? error.message : `Falha na release (${error.code ?? error.name ?? "erro"}).`);
    process.exitCode = 1;
  });
}
