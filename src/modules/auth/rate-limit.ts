// Limite de tentativas de login em memória (janela fixa). Suficiente para o monólito em
// uma única instância; com várias instâncias, trocar por armazenamento compartilhado.
type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  isBlocked(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) return false;
    if (bucket.resetAt <= this.now()) {
      this.buckets.delete(key);
      return false;
    }
    return bucket.count >= this.limit;
  }

  hit(key: string) {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      bucket.count += 1;
    }
    if (this.buckets.size > 10_000) this.prune(now);
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

const WINDOW_MS = 15 * 60 * 1000;
// Falhas por e-mail (força bruta numa conta) e tentativas por IP (varredura e custo do scrypt).
export const loginFailuresByEmail = new RateLimiter(5, WINDOW_MS);
export const loginAttemptsByIp = new RateLimiter(30, WINDOW_MS);
// Cadastro do primeiro usuário: a rota só existe com o banco vazio, mas o hash da senha
// é caro, então limitamos as tentativas por IP do mesmo jeito.
export const firstUserAttemptsByIp = new RateLimiter(10, WINDOW_MS);
