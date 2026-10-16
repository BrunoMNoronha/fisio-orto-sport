import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databaseTarget, api, promoteProduction, verifyBuildEnvironment, verifyRuntimeConnection, targets } from "../../scripts/pipeline/release.mjs";
import { runtimeChallenge, runtimeVerification, verifyRuntimeProof } from "../../src/modules/release/runtime-proof.mjs";

const sha = "a".repeat(40);
function env(environment = "Production") {
  const target = targets.environments[environment];
  return { RELEASE_ENV: environment, GITHUB_REPOSITORY: targets.repository, GITHUB_REF: "refs/heads/production", GITHUB_SHA: sha,
    GITHUB_TOKEN: "github-test", VERCEL_TOKEN: "vercel-test", VERCEL_AUTOMATION_BYPASS_SECRET: "bypass-test",
    VERCEL_PROJECT_ID: targets.vercelProjectId, VERCEL_ORG_ID: targets.vercelOrgId, NEON_PROJECT_ID: targets.neonProjectId,
    NEON_BRANCH_ID: target.branchId, NEON_HOST: target.host, NEON_DATABASE: target.database, NEON_ROLE: target.role,
    DATABASE_URL: `postgresql://${target.role}:same-secret@${target.host.replace(".", "-pooler.")}/${target.database}?sslmode=require`,
    DATABASE_URL_UNPOOLED: `postgresql://${target.role}:same-secret@${target.host}/${target.database}?sslmode=require` };
}
const production = env(), preview = env("Preview");
function request(challenge) {
  return new Request("https://candidate.vercel.app/api/release/verify", { headers: {
    "x-release-timestamp": challenge.timestamp, "x-release-nonce": challenge.nonce, "x-release-signature": challenge.signature,
  } });
}
function server(connectionString, actual = { database: "neondb", role: "neondb_owner" }) {
  return async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    return runtimeVerification(new Request(url, options), { connectionString, queryIdentity: async () => actual });
  };
}

test("runtime comprova conexão real, host, banco, role, pooling e TLS sem devolver segredo", async () => {
  const result = await verifyRuntimeConnection("candidate.vercel.app", production, server(production.DATABASE_URL));
  assert.deepEqual(result, { host: production.DATABASE_URL.split("@")[1].split("/")[0], database: "neondb", role: "neondb_owner" });
  assert.ok(!JSON.stringify(result).includes("same-secret"));
});

test("runtime Preview bloqueia Production mesmo com senha e nome de banco iguais", async () => {
  let queries = 0;
  const challenge = runtimeChallenge(production.DATABASE_URL);
  for (const connectionString of [preview.DATABASE_URL, preview.DATABASE_URL.replace("preview_owner", "neondb_owner")]) {
    const response = await runtimeVerification(request(challenge), { connectionString, queryIdentity: async () => { queries++; } });
    assert.equal(response.status, 404); assert.equal(queries, 0);
  }
  await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, server(preview.DATABASE_URL)), /promoção bloqueada/);
});

test("desafio ausente, adulterado, expirado e futuro não consultam o banco", async () => {
  const challenge = runtimeChallenge(production.DATABASE_URL);
  for (const changed of [{}, { ...challenge, signature: "0".repeat(64) }, { ...challenge, nonce: "wrong" }, runtimeChallenge(production.DATABASE_URL, Date.now() - 61_000), runtimeChallenge(production.DATABASE_URL, Date.now() + 61_000)]) {
    let queries = 0;
    const response = await runtimeVerification(request(changed), { connectionString: production.DATABASE_URL, queryIdentity: async () => { queries++; } });
    assert.equal(response.status, 404); assert.equal(queries, 0); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("configuração ausente e falha do banco não expõem URL ou erro do driver", async () => {
  const challenge = runtimeChallenge(production.DATABASE_URL);
  const unavailable = await runtimeVerification(request(challenge), { connectionString: "", queryIdentity: async () => { throw new Error("não executar"); } });
  assert.equal(unavailable.status, 404);
  const failure = await runtimeVerification(request(challenge), { connectionString: production.DATABASE_URL, queryIdentity: async () => { throw new Error(production.DATABASE_URL); } });
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("same-secret"));
});

test("resposta adulterada, de outro desafio ou conexão real divergente impede promoção", async () => {
  const challenge = runtimeChallenge(production.DATABASE_URL);
  const response = await runtimeVerification(request(challenge), { connectionString: production.DATABASE_URL, queryIdentity: async () => ({ database: "neondb", role: "neondb_owner" }) });
  const payload = await response.json();
  assert.throws(() => verifyRuntimeProof(production.DATABASE_URL, challenge, { ...payload, proof: "0".repeat(64) }), /inválida/);
  assert.throws(() => verifyRuntimeProof(production.DATABASE_URL, runtimeChallenge(production.DATABASE_URL), payload), /desafio/i);
  for (const actual of [{ database: "outro", role: "neondb_owner" }, { database: "neondb", role: "preview_owner" }]) {
    await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, server(production.DATABASE_URL, actual)), /promoção bloqueada/);
  }
});

test("senha diferente, conexão direta no runtime e TLS desligado são recusados", async () => {
  for (const url of [production.DATABASE_URL.replace("same-secret", "outro-segredo"), production.DATABASE_URL_UNPOOLED, production.DATABASE_URL.replace("sslmode=require", "sslmode=disable")]) {
    await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, server(url)), /promoção bloqueada/);
  }
});

test("redirect, endpoint indisponível e resposta sem prova falham fechados", async () => {
  for (const response of [new Response(null, { status: 307, headers: { location: "https://evil.test" } }), new Response(null, { status: 404 }), Response.json({ ok: true })]) {
    await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, async () => response), /promoção bloqueada/);
  }
  await assert.rejects(verifyRuntimeConnection("evil.test", production, server(production.DATABASE_URL)), /Host/);
});

test("configuração baixada pela CLI não pode sobrescrever o build Production com Preview", () => {
  const directory = mkdtempSync(join(tmpdir(), "fisio-release-env-"));
  const file = join(directory, ".env.production.local");
  try {
    assert.throws(() => verifyBuildEnvironment(production, directory), /não carregada/);
    writeFileSync(file, `DATABASE_URL="${preview.DATABASE_URL}"\nDATABASE_URL_UNPOOLED="${preview.DATABASE_URL_UNPOOLED}"\n`);
    assert.throws(() => verifyBuildEnvironment(production, directory), error => /endpoint incorreto/.test(error.message) && !error.message.includes("same-secret"));
    writeFileSync(file, `DATABASE_URL="${production.DATABASE_URL}"\nDATABASE_URL_UNPOOLED="${production.DATABASE_URL_UNPOOLED}"\nVERCEL_ENV=production\n`);
    assert.equal(verifyBuildEnvironment(production, directory).branchId, targets.environments.Production.branchId);
    writeFileSync(file, "RELEASE_ENV=Preview\n");
    assert.throws(() => verifyBuildEnvironment(production, directory), /sobrescrito/);
    writeFileSync(file, "VERCEL_ENV=preview\n");
    assert.throws(() => verifyBuildEnvironment(production, directory), /build divergente/);
  } finally { unlinkSync(file); rmdirSync(directory); }
});

function promotion({ runtimeUrl = production.DATABASE_URL, actual, modifiedDeployment = {}, currentSha = sha } = {}) {
  const events = [];
  const deployment = { id: "dpl_ABC", projectId: targets.vercelProjectId, readyState: "READY", target: "production", url: "candidate.vercel.app", meta: { githubCommitSha: sha, githubCommitRef: "production" }, ...modifiedDeployment };
  const options = {
    env: production, receipt: { sha, deploymentId: "dpl_ABC", url: "https://candidate.vercel.app" }, wait: async () => {},
    apiRequest: async (provider, path, options) => {
      if (path.startsWith("/v13/")) return deployment;
      if (provider === "github") { events.push("branch"); return { object: { sha: currentSha } }; }
      if (options?.method === "POST") { events.push(path); return null; }
      return { deploymentId: "dpl_ABC" };
    },
    runtimeCheck: async (host, environment) => { events.push("runtime"); return verifyRuntimeConnection(host, environment, server(runtimeUrl, actual)); },
  };
  return { events, options };
}

test("promove somente após validar runtime e SHA, com projeto explícito na API", async () => {
  const { events, options } = promotion();
  await promoteProduction(options);
  assert.deepEqual(events, ["runtime", "branch", `/v10/projects/${targets.vercelProjectId}/promote/dpl_ABC`]);
});

test("runtime errado, deployment estranho e branch avançada nunca disparam promoção", async () => {
  for (const overrides of [
    { runtimeUrl: preview.DATABASE_URL },
    { runtimeUrl: preview.DATABASE_URL.replace("preview_owner", "neondb_owner") },
    { actual: { database: "neondb", role: "preview_owner" } },
    { modifiedDeployment: { target: "preview" } },
    { modifiedDeployment: { id: "dpl_OTHER" } },
    { modifiedDeployment: { projectId: "outro" } },
    { modifiedDeployment: { readyState: "ERROR" } },
    { currentSha: "b".repeat(40) },
  ]) {
    const { events, options } = promotion(overrides);
    await assert.rejects(promoteProduction(options));
    assert.ok(!events.some(event => event.includes("/promote/")));
  }
});

test("promoção aguarda a confirmação do domínio e falha se o mapeamento não terminar", async () => {
  const { options } = promotion();
  const original = options.apiRequest;
  let polls = 0;
  options.apiRequest = async (provider, path, opts) => path.startsWith("/v4/") ? (polls++ < 2 ? { deploymentId: "anterior" } : { deploymentId: "dpl_ABC" }) : original(provider, path, opts);
  await promoteProduction(options);
  assert.equal(polls, 3);
  options.apiRequest = async (provider, path, opts) => path.startsWith("/v4/") ? { deploymentId: "anterior" } : original(provider, path, opts);
  await assert.rejects(promoteProduction(options), /ainda não confirmou/);
});

test("API de promoção usa token, equipe explícita e aceita resposta sem corpo", async () => {
  const path = `/v10/projects/${targets.vercelProjectId}/promote/dpl_ABC`;
  const result = await api("vercel", path, { method: "POST" }, async (url, options) => {
    assert.equal(url, `https://api.vercel.com${path}?teamId=${targets.vercelOrgId}`);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer vercel-test");
    return new Response(null, { status: 204 });
  }, production);
  assert.equal(result, null);
});

test("workflow mantém upload sem domínio e gates antes de migrar, promover e confirmar", () => {
  const workflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");
  const commands = ["release.mjs build-environment", "prisma migrate deploy", "release.mjs production-deployment", "release.mjs promote", "release.mjs published"];
  for (let i = 0; i < commands.length; i++) {
    assert.ok(workflow.includes(commands[i]));
    if (i) assert.ok(workflow.indexOf(commands[i - 1]) < workflow.indexOf(commands[i]));
  }
  assert.ok(workflow.includes("--skip-domain"));
  assert.ok(!workflow.includes('promote "$DEPLOYMENT_ID"'));
});

test("overrides de host, credenciais, options e parâmetros duplicados bloqueiam antes de migrar", async () => {
  for (const query of ["&host=preview.test", "&user=preview_owner", "&password=other", "&dbname=other", "&options=endpoint%3Dpreview", "&sslmode=disable", "&schema=shadow"]) {
    const connection = production.DATABASE_URL + query;
    assert.throws(() => databaseTarget({ ...production, DATABASE_URL: connection }), /parâmetros/);
    let queries = 0;
    const challenge = runtimeChallenge(production.DATABASE_URL);
    const response = await runtimeVerification(request(challenge), { connectionString: connection, queryIdentity: async () => { queries++; } });
    assert.equal(response.status, 404); assert.equal(queries, 0);
  }
});

test("secrets vazios ou redigidos no pull usam o runner para o build, mas nunca dispensam a prova de runtime", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fisio-release-sensitive-"));
  const file = join(directory, ".env.production.local");
  try {
    for (const value of ["", "[SENSITIVE]"]) {
      writeFileSync(file, `DATABASE_URL="${value}"\nDATABASE_URL_UNPOOLED="${value}"\nVERCEL_ENV=production\n`);
      assert.equal(verifyBuildEnvironment(production, directory).branchId, targets.environments.Production.branchId);
      assert.equal(readFileSync(file, "utf8"), "VERCEL_ENV=production\n");
    }
    await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, server("")), /promoção bloqueada/);
    await assert.rejects(verifyRuntimeConnection("candidate.vercel.app", production, server(preview.DATABASE_URL)), /promoção bloqueada/);
  } finally { unlinkSync(file); rmdirSync(directory); }
});
