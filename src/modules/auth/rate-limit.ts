import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

// Limite de tentativas de autenticação em janela fixa (issue #37). Os contadores ficam no
// PostgreSQL (tabela AuthRateLimit), compartilhados entre instâncias e preservados em cold
// starts. Se o armazenamento falhar, cada instância passa a limitar em memória até ele voltar.

export interface RateLimitStore {
  // Incrementa o contador da chave (reiniciando-o se a janela expirou) e devolve o valor novo.
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

// Uma única instrução, atômica por linha: chamadas simultâneas na mesma chave esperam o lock
// da linha e cada uma recebe um valor distinto. Usa o relógio do banco, comum a todas as
// instâncias.
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(
    private readonly db: Pick<PrismaClient, "$queryRaw" | "$executeRaw">,
    private readonly cleanupChance = 0.01,
  ) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const [row] = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO "AuthRateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${windowMs}::integer * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AuthRateLimit"."resetAt" <= now() THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "AuthRateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "AuthRateLimit"."resetAt" END
      RETURNING "count"`;
    // Limpeza ocasional das janelas vencidas, para a tabela não crescer sem limite.
    if (Math.random() < this.cleanupChance) {
      await this.db.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "resetAt" < now()`;
    }
    return row.count;
  }

  async reset(key: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "key" = ${key}`;
  }
}

type Bucket = { count: number; resetAt: number };

// Contadores por processo: usados nos testes e como reserva quando o banco falha.
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (this.buckets.size > 10_000) this.prune(now);
      return 1;
    }
    bucket.count += 1;
    return bucket.count;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

export class RateLimiter {
  constructor(
    private readonly name: string,
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly store: RateLimitStore,
    private readonly fallback: RateLimitStore = new MemoryRateLimitStore(),
  ) {}

  // Registra uma tentativa e diz se ela cabe no limite. Tentativas recusadas também contam, mas
  // não estendem a janela.
  async consume(value: string): Promise<boolean> {
    const key = this.key(value);
    let count: number;
    try {
      count = await this.store.increment(key, this.windowMs);
    } catch (error) {
      this.warn(error);
      count = await this.fallback.increment(key, this.windowMs);
    }
    return count <= this.limit;
  }

  async reset(value: string): Promise<void> {
    const key = this.key(value);
    await this.fallback.reset(key);
    try {
      await this.store.reset(key);
    } catch (error) {
      this.warn(error);
    }
  }

  // Nunca guarda nem registra o IP ou o e-mail em claro.
  private key(value: string) {
    return createHash("sha256").update(`${this.name}:${value}`).digest("hex");
  }

  private warn(error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const name = error instanceof Error ? error.name : typeof error;
    console.error(`[rate-limit] armazenamento indisponível (${this.name}); limite local em uso. ${name} ${code}`.trim());
  }
}

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
