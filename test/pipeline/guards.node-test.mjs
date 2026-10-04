import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCandidate, assertCompatibleMigrations, assertDeployment, databaseTarget, migrationState, releaseContext, repositoryMigrations, targets } from "../../scripts/pipeline/release.mjs";

const sha = "a".repeat(40);
function env(environment = "Preview") {
  const target = targets.environments[environment];
  return { RELEASE_ENV:environment, GITHUB_REPOSITORY:targets.repository, GITHUB_REF:"refs/heads/production", GITHUB_SHA:sha,
    GITHUB_TOKEN:"test", VERCEL_TOKEN:"test", VERCEL_AUTOMATION_BYPASS_SECRET:"test",
    VERCEL_PROJECT_ID:targets.vercelProjectId, VERCEL_ORG_ID:targets.vercelOrgId,
    NEON_PROJECT_ID:targets.neonProjectId, NEON_BRANCH_ID:target.branchId, NEON_HOST:target.host, NEON_DATABASE:target.database, NEON_ROLE:target.role,
    DATABASE_URL:`postgresql://${target.role}:secret@${target.host.replace(".","-pooler.")}/${target.database}?sslmode=require`,
    DATABASE_URL_UNPOOLED:`postgresql://${target.role}:secret@${target.host}/${target.database}?sslmode=require` };
}

test("Preview e Production aceitam somente suas próprias conexões", () => {
  for (const environment of ["Preview","Production"]) assert.equal(releaseContext(env(environment)).branchId,targets.environments[environment].branchId);
  assert.throws(() => databaseTarget({ ...env(), DATABASE_URL:env("Production").DATABASE_URL }), /endpoint incorreto/);
  assert.throws(() => databaseTarget({ ...env(), NEON_HOST:targets.environments.Production.host }), /alvo aprovado/);
});

test("bloqueia pooling na migração, role diferente, ausência de TLS e banco diferente", () => {
  const original = env();
  assert.throws(() => databaseTarget({ ...original, DATABASE_URL_UNPOOLED:original.DATABASE_URL }), /endpoint incorreto/);
  for (const value of [original.DATABASE_URL.replace("preview_owner:","neondb_owner:"),original.DATABASE_URL.replace("sslmode=require","sslmode=disable"),original.DATABASE_URL.replace("/neondb?","/outra_base?")]) {
    assert.throws(() => databaseTarget({ ...original, DATABASE_URL:value }));
  }
});

test("secret ausente, URL inválida e ferramentas locais falham sem ecoar segredo", () => {
  for (const name of ["DATABASE_URL","DATABASE_URL_UNPOOLED","VERCEL_TOKEN","GITHUB_TOKEN","VERCEL_AUTOMATION_BYPASS_SECRET"]) {
    assert.throws(() => releaseContext({ ...env(), [name]:"" }), new RegExp(name));
  }
  assert.throws(() => databaseTarget({ ...env(), DATABASE_URL:"senha-super-secreta" }), (error) => !error.message.includes("senha-super-secreta"));
  for (const name of ["SETUP_TOKEN","DEMO_DATA_TARGET","DEV_RESET_TARGET","DEV_QUICK_LOGIN","SEED_ADMIN_PASSWORD","INTEGRATION_DATABASE_URL"]) {
    assert.throws(() => databaseTarget({ ...env(), [name]:"enabled" }), /não permitida/);
  }
});

test("main, fork e SHA inválido não podem publicar", () => {
  for (const invalid of [{GITHUB_REF:"refs/heads/main"},{GITHUB_REPOSITORY:"outro/repositorio"},{GITHUB_SHA:"latest"}]) assert.throws(() => releaseContext({ ...env(),...invalid }));
});

test("migrações aplicadas são idempotentes e aceitam checksums dos finais de linha", () => {
  const migrations=repositoryMigrations();
  assert(migrations.length >= 24);
  for (const variant of [0,1]) {
    const rows=migrations.map((migration) => ({migration_name:migration.name,checksum:migration.acceptedChecksums.at(variant) ?? migration.checksum,finished_at:new Date(),rolled_back_at:null}));
    assert.deepEqual(migrationState(rows,migrations),[]);
  }
  assert.equal(migrationState([],migrations).length,migrations.length);
});

test("histórico corrompido, desconhecido ou com falha bloqueia migração", () => {
  const migration=repositoryMigrations()[0];
  const row={migration_name:migration.name,checksum:migration.checksum,finished_at:new Date(),rolled_back_at:null};
  for (const invalid of [{checksum:"corrompido"},{migration_name:"desconhecida"},{finished_at:null}]) assert.throws(() => migrationState([{ ...row,...invalid }],[migration]));
  assert.equal(migrationState([{...row,finished_at:null,rolled_back_at:new Date()}],[migration]).length,1);
});

test("SQL destrutivo exige procedimento próprio; comentários não causam bloqueio", () => {
  for (const sql of ["DROP TABLE users;","TRUNCATE users;","DELETE FROM users;","ALTER TABLE users ALTER COLUMN name SET NOT NULL;","ALTER TABLE users ALTER COLUMN name TYPE integer;"]) {
    assert.throws(() => assertCompatibleMigrations([{name:"nova",sql}]),/procedimento específico/);
  }
  assertCompatibleMigrations([{name:"aditiva",sql:"-- DROP TABLE exemplo\n/* TRUNCATE */ ALTER TABLE users ADD COLUMN optional text;"}]);
});

function candidate() {
  return { manifest:{version:1,environment:"Preview",repository:targets.repository,projectId:targets.vercelProjectId,sha,runId:"123",deploymentId:"dpl_ABC",migrationsDigest:"digest"},
    run:{id:123,status:"completed",conclusion:"success",head_branch:"production",head_sha:sha,path:".github/workflows/deploy-preview.yml",event:"push",head_repository:{full_name:targets.repository}} };
}

test("produção requer Preview bem-sucedido do mesmo commit, execução e migrações", () => {
  const {manifest,run}=candidate();
  assertCandidate(manifest,run,sha,"digest");
  for (const invalid of [{conclusion:"failure"},{status:"in_progress"},{head_branch:"main"},{head_sha:"b".repeat(40)},{path:".github/workflows/outro.yml"},{id:999},{event:"pull_request"},{head_repository:{full_name:"fork/repo"}}]) assert.throws(() => assertCandidate(manifest,{...run,...invalid},sha,"digest"));
  for (const invalid of [{projectId:"outro"},{environment:"Production"},{sha:"b".repeat(40)},{migrationsDigest:"alterado"},{deploymentId:"https://evil.test"}]) assert.throws(() => assertCandidate({...manifest,...invalid},run,sha,"digest"));
});

test("deployment precisa ser READY no projeto, ambiente e SHA aprovados", () => {
  const deployment={projectId:targets.vercelProjectId,readyState:"READY",target:null,url:"preview.vercel.app",meta:{githubCommitSha:sha,githubCommitRef:"production"}};
  assertDeployment(deployment,"Preview",sha);
  assertDeployment({...deployment,target:"production"},"Production",sha);
  for (const invalid of [{readyState:"ERROR"},{projectId:"outro"},{target:"production"},{url:"evil.test"},{meta:{githubCommitSha:sha,githubCommitRef:"main"}}]) assert.throws(() => assertDeployment({...deployment,...invalid},"Preview",sha));
});
