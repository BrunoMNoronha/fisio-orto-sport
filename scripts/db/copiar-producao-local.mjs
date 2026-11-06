/**
 * Copia o banco de produção (Neon) para o PostgreSQL local do Docker Compose.
 *
 * Produção é apenas lida: pg_dump e as consultas de conferência rodam numa sessão
 * somente leitura (PGOPTIONS default_transaction_read_only=on). A URL de produção vem
 * de um arquivo fora do repositório (--credencial <arquivo>, linha PGURL=...) e nunca é impressa.
 * O destino é sempre o serviço `db` do docker-compose.yml, que é apagado e recriado.
 *
 * Sem `--executar` é simulação: confere guardas, conecta em produção e mostra o que faria.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PRODUCTION_HOST = 'ep-plain-cherry-acntveqy.sa-east-1.aws.neon.tech';
const PRODUCTION_DATABASE = 'neondb';
const IMAGE = 'postgres:18-alpine';
const LOCAL_MAJOR = '18';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const READ_ONLY = '-c default_transaction_read_only=on';
const SESSION = "SET TIME ZONE 'UTC'; SET datestyle = 'ISO'; SET intervalstyle = 'postgres';\n";

const root = path.resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const execute = args.includes('--executar');
const envFileIndex = args.indexOf('--credencial');
const envFile = path.resolve(envFileIndex === -1 ? path.join(os.homedir(), '.secrets', 'fisio-prod.env') : args[envFileIndex + 1]);

const run = (command, commandArgs, options = {}) =>
  execFileSync(command, commandArgs, {cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'], ...options});
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const parseEnv = text =>
  Object.fromEntries(
    text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
    }),
  );

// --- Guardas da origem: o arquivo existe e aponta exatamente para a produção.
assert(existsSync(envFile), `Arquivo de credencial não encontrado: ${envFile} (esperado PGURL=postgresql://...).`);
const sourceUrl = parseEnv(readFileSync(envFile, 'utf8')).PGURL;
assert(sourceUrl, `${envFile} precisa ter a linha PGURL=postgresql://...`);
const source = new URL(sourceUrl);
assert.equal(source.hostname, PRODUCTION_HOST, 'PGURL não aponta para o endpoint direto de produção.');
assert.equal(source.pathname, `/${PRODUCTION_DATABASE}`, `PGURL não aponta para o banco ${PRODUCTION_DATABASE}.`);

// --- Guardas do destino: só o serviço `db` do Compose, em PostgreSQL 18, e o mesmo banco do .env.
const compose = (...composeArgs) => {
  const options = typeof composeArgs.at(-1) === 'object' ? composeArgs.pop() : {};
  return run('docker', ['compose', 'exec', '-T', 'db', ...composeArgs], options);
};
const localUser = compose('printenv', 'POSTGRES_USER').trim();
const localDatabase = compose('printenv', 'POSTGRES_DB').trim();
assert(localUser && localDatabase, 'Container db sem POSTGRES_USER/POSTGRES_DB. Rode `pnpm db:up`.');
const localVersion = compose('postgres', '--version').trim();
assert(localVersion.includes(` ${LOCAL_MAJOR}.`), `Container local deve ser PostgreSQL ${LOCAL_MAJOR} (${localVersion}).`);
const localEnv = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
const appUrl = new URL(localEnv.DATABASE_URL ?? '');
assert(LOOPBACK.has(appUrl.hostname), 'DATABASE_URL do .env precisa apontar para o banco local.');
assert.equal(appUrl.pathname, `/${localDatabase}`, 'DATABASE_URL do .env não aponta para o banco do container.');

// --- Consultas (todas só leitura) nas duas pontas.
const sourceSql = sql =>
  run('docker', ['run', '--rm', '-i', '--env-file', envFile, '-e', `PGOPTIONS=${READ_ONLY}`, IMAGE, 'sh', '-c', 'psql "$PGURL" -X -q -At -v ON_ERROR_STOP=1 -f -'], {input: SESSION + sql});
const localSql = sql => compose('psql', '-U', localUser, '-d', localDatabase, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-', {input: SESSION + sql});

const TABLES = `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename COLLATE "C";`;
// Uma linha por tabela: nome|linhas|md5 das linhas em JSON, ordenadas de forma determinística.
const rowsSql = tables =>
  tables
    .map(t => `SELECT ${literal(t)} AS tabela, count(*)::text AS linhas, coalesce(md5(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text COLLATE "C")), '') AS hash FROM public.${quote(t)} t`)
    .join('\nUNION ALL\n') + '\nORDER BY 1;';
// CHECKs são comparados por nome e colunas: o PostgreSQL pode reescrever casts ao restaurar.
const METADATA = `
SELECT 'constraint' AS tipo, c.conrelid::regclass::text AS objeto, c.conname AS nome, c.contype::text || ':' || c.conkey::text AS detalhe,
       CASE WHEN c.contype = 'c' THEN '' ELSE pg_get_constraintdef(c.oid) END AS definicao
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'trigger', c.relname, t.tgname, t.tgenabled::text, pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid), l.lanname || ':' || p.provolatile::text || ':' || p.prosecdef::text, md5(p.prosrc)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang WHERE n.nspname = 'public'
UNION ALL
SELECT 'enum', t.typname, '', '', string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
 WHERE n.nspname = 'public' GROUP BY t.typname
UNION ALL
SELECT 'column', table_name, column_name, ordinal_position::text, udt_name || ':' || is_nullable || ':' || coalesce(column_default, '')
  FROM information_schema.columns WHERE table_schema = 'public'
UNION ALL
SELECT 'index', tablename, indexname, '', indexdef FROM pg_indexes WHERE schemaname = 'public'
UNION ALL
SELECT 'extension', extname, extversion, '', '' FROM pg_extension
ORDER BY 1, 2, 3, 4;`;

const fingerprint = query => {
  const tables = query(TABLES).trim().split('\n').filter(Boolean);
  return {tables, rows: query(rowsSql(tables)), metadata: query(METADATA)};
};

const summary = sourceSql(`SELECT version() || E'\\n' || pg_size_pretty(pg_database_size(current_database())) || E'\\n' || current_setting('transaction_read_only');`).trim().split('\n');
assert.equal(summary[2], 'on', 'A sessão de produção precisa ser somente leitura.');
console.log(`Origem:  ${PRODUCTION_HOST}/${PRODUCTION_DATABASE} (${summary[1]}, sessão somente leitura) — ${summary[0].split(',')[0]}`);
console.log(`Destino: docker compose db → ${localUser}@${localDatabase} — ${localVersion}`);

const before = fingerprint(sourceSql);
const totalRows = before.rows.trim().split('\n').reduce((sum, line) => sum + Number(line.split('|')[1]), 0);
console.log(`Produção: ${before.tables.length} tabelas em public, ${totalRows} linhas. Schema neon_auth fica de fora.`);

if (!execute) {
  console.log('\nSIMULAÇÃO. Com --executar o script vai:');
  console.log(`  1. pg_dump (${IMAGE}, --exclude-schema=neon_auth, --no-owner, --no-privileges) para arquivo temporário fora do repositório;`);
  console.log(`  2. dropdb --force + createdb de ${localDatabase} no container local (apaga o banco local atual);`);
  console.log('  3. pg_restore --single-transaction --exit-on-error, ANALYZE e prisma migrate status;');
  console.log('  4. comparar linhas, hashes e metadados de todas as tabelas com produção; apagar o dump.');
  process.exit(0);
}

const folder = mkdtempSync(path.join(os.tmpdir(), 'fisio-prod-'));
const dump = path.join(folder, 'producao.dump');
try {
  const dumpStart = Date.now();
  const archive = execFileSync(
    'docker',
    ['run', '--rm', '--env-file', envFile, '-e', `PGOPTIONS=${READ_ONLY}`, IMAGE, 'sh', '-c', 'pg_dump --dbname "$PGURL" --exclude-schema=neon_auth --format=custom --no-owner --no-privileges'],
    {cwd: root, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit']},
  );
  writeFileSync(dump, archive);
  console.log(`Dump: ${(archive.length / 1024 / 1024).toFixed(1)} MB em ${Date.now() - dumpStart} ms.`);

  const restoreStart = Date.now();
  compose('sh', '-c', 'dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"');
  compose('pg_restore', '-U', localUser, '-d', localDatabase, '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', {input: archive, encoding: 'buffer'});
  localSql('ANALYZE;');
  console.log(`Restore: ${Date.now() - restoreStart} ms.`);

  const after = fingerprint(localSql);
  assert.deepEqual(after.tables, before.tables, 'Lista de tabelas diferente de produção.');
  assert.equal(after.metadata, before.metadata, 'Metadados (constraints, triggers, funções, enums, colunas, índices, extensões) diferentes de produção.');
  assert.equal(after.rows, before.rows, 'Linhas ou hashes por tabela diferentes de produção.');

  const status = run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'status']);
  assert.match(status, /Database schema is up to date/, `prisma migrate status inesperado:\n${status}`);

  for (const line of after.rows.trim().split('\n')) {
    const [table, rows] = line.split('|');
    if (Number(rows) > 0) console.log(`  ${table}: ${rows}`);
  }
  console.log(`PASS: ${after.tables.length} tabelas idênticas a produção (${totalRows} linhas); migrações em dia. Dump apagado.`);
} finally {
  rmSync(folder, {recursive: true, force: true});
}
