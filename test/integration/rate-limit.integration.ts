// Integração com PostgreSQL real dos limites de autenticação (issue #37): vários clientes Prisma
// fazem o papel de instâncias diferentes compartilhando a tabela AuthRateLimit.
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { MemoryRateLimitStore, PostgresRateLimitStore, RateLimiter } from "@/modules/auth/rate-limit";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("limites de autenticação no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const suffix = Date.now();
  let seq = 0;
  const clients: PrismaClient[] = [];
  const client = () => {
    const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    clients.push(c);
    return c;
  };
  let a: PrismaClient;
  let b: PrismaClient;
  const name = () => `it-${suffix}-${++seq}`;

  before(() => {
    a = client();
    b = client();
  });

  after(async () => {
    await Promise.all(clients.map((c) => c.$disconnect()));
  });

  it("duas instâncias somam no mesmo limite e janela", async () => {
    const n = name();
    const onA = new RateLimiter(n, 3, 60_000, new PostgresRateLimitStore(a, 0));
    const onB = new RateLimiter(n, 3, 60_000, new PostgresRateLimitStore(b, 0));
    assert.equal(await onA.consume("1.2.3.4"), true);
    assert.equal(await onB.consume("1.2.3.4"), true);
    assert.equal(await onA.consume("1.2.3.4"), true);
    assert.equal(await onB.consume("1.2.3.4"), false);
    assert.equal(await onB.consume("5.6.7.8"), true);
  });

  it("chamadas simultâneas de várias instâncias não furam o limite", async () => {
    const n = name();
    const limiters = [a, b, client(), client()].map((c) => new RateLimiter(n, 10, 60_000, new PostgresRateLimitStore(c, 0)));
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => limiters[i % limiters.length].consume("ana@x.com")));
    assert.equal(results.filter(Boolean).length, 10);
    const [row] = await a.authRateLimit.findMany({ where: { count: 40 } });
    assert.ok(row, "o contador compartilhado deve registrar as 40 tentativas");
  });

  it("uma instância nova (cold start) continua vendo o bloqueio", async () => {
    const n = name();
    await new RateLimiter(n, 1, 60_000, new PostgresRateLimitStore(a, 0)).consume("k");
    const restarted = client();
    assert.equal(await new RateLimiter(n, 1, 60_000, new PostgresRateLimitStore(restarted, 0)).consume("k"), false);
  });

  it("a janela expira pelo relógio do banco e recomeça a contagem", async () => {
    const n = name();
    const limiter = new RateLimiter(n, 1, 300, new PostgresRateLimitStore(a, 0));
    assert.equal(await limiter.consume("k"), true);
    assert.equal(await limiter.consume("k"), false);
    await sleep(400);
    assert.equal(await limiter.consume("k"), true);
    assert.equal(await limiter.consume("k"), false);
  });

  it("reset zera para todas as instâncias", async () => {
    const n = name();
    const onA = new RateLimiter(n, 1, 60_000, new PostgresRateLimitStore(a, 0));
    const onB = new RateLimiter(n, 1, 60_000, new PostgresRateLimitStore(b, 0));
    await onA.consume("ana@x.com");
    assert.equal(await onB.consume("ana@x.com"), false);
    await onA.reset("ana@x.com");
    assert.equal(await onB.consume("ana@x.com"), true);
  });

  it("a tabela guarda só hashes e a limpeza remove janelas vencidas", async () => {
    const n = name();
    await new RateLimiter(n, 5, 1, new PostgresRateLimitStore(a, 0)).consume("ana@x.com");
    await sleep(20);
    const leaked = await a.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "AuthRateLimit" WHERE "key" !~ '^[0-9a-f]{64}$'`;
    assert.equal(Number(leaked[0].n), 0);
    await new RateLimiter(name(), 5, 60_000, new PostgresRateLimitStore(a, 1)).consume("x");
    const expired = await a.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "AuthRateLimit" WHERE "resetAt" < now()`;
    assert.equal(Number(expired[0].n), 0);
  });

  it("com o armazenamento indisponível, cai para o limite local", async () => {
    // Porta sem servidor: toda consulta falha, como com o banco fora do ar.
    const down = new URL(url!);
    down.port = "1";
    const broken = new PrismaClient({ adapter: new PrismaPg({ connectionString: down.toString(), connectionTimeoutMillis: 2000 }) });
    clients.push(broken);
    const original = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => void logs.push(args.join(" "));
    try {
      const limiter = new RateLimiter(name(), 2, 60_000, new PostgresRateLimitStore(broken, 0), new MemoryRateLimitStore());
      assert.equal(await limiter.consume("ana@x.com"), true);
      assert.equal(await limiter.consume("ana@x.com"), true);
      assert.equal(await limiter.consume("ana@x.com"), false);
    } finally {
      console.error = original;
    }
    assert.ok(logs.some((line) => line.includes("armazenamento indisponível")));
    assert.ok(logs.every((line) => !line.includes("ana@x.com")));
  });
});
