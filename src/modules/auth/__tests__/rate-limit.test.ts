/** @jest-environment node */
import { MemoryRateLimitStore, RateLimiter, type RateLimitStore } from "../rate-limit";

describe("RateLimiter", () => {
  it("bloqueia ao passar do limite e libera após a janela", async () => {
    let now = 0;
    const limiter = new RateLimiter("t", 3, 1000, new MemoryRateLimitStore(() => now));
    for (let i = 0; i < 3; i++) expect(await limiter.consume("k")).toBe(true);
    expect(await limiter.consume("k")).toBe(false);
    expect(await limiter.consume("outra")).toBe(true);
    now = 999;
    expect(await limiter.consume("k")).toBe(false);
    now = 1000;
    expect(await limiter.consume("k")).toBe(true);
  });

  it("tentativas recusadas não estendem a janela", async () => {
    let now = 0;
    const limiter = new RateLimiter("t", 1, 1000, new MemoryRateLimitStore(() => now));
    await limiter.consume("k");
    now = 900;
    expect(await limiter.consume("k")).toBe(false);
    now = 1000;
    expect(await limiter.consume("k")).toBe(true);
  });

  it("reset limpa o contador", async () => {
    const limiter = new RateLimiter("t", 1, 1000, new MemoryRateLimitStore(() => 0));
    await limiter.consume("k");
    expect(await limiter.consume("k")).toBe(false);
    await limiter.reset("k");
    expect(await limiter.consume("k")).toBe(true);
  });

  it("instâncias com o mesmo armazenamento compartilham o limite", async () => {
    const store = new MemoryRateLimitStore(() => 0);
    const a = new RateLimiter("t", 2, 1000, store);
    const b = new RateLimiter("t", 2, 1000, store);
    const results = await Promise.all([a.consume("k"), b.consume("k"), a.consume("k"), b.consume("k")]);
    expect(results.filter(Boolean)).toHaveLength(2);
    // Nomes distintos não se misturam.
    expect(await new RateLimiter("outro", 2, 1000, store).consume("k")).toBe(true);
  });

  it("guarda só o hash da chave, nunca o valor", async () => {
    const increment = jest.fn(async () => 1);
    const limiter = new RateLimiter("login-email", 5, 1000, { increment, reset: jest.fn() });
    await limiter.consume("ana@x.com");
    const [key] = increment.mock.calls[0] as unknown as [string];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("ana");
  });

  it("com o armazenamento indisponível, limita em memória e não registra o valor", async () => {
    const failing: RateLimitStore = {
      increment: jest.fn(async () => {
        throw Object.assign(new Error("conexão recusada ana@x.com"), { code: "P1001" });
      }),
      reset: jest.fn(async () => {
        throw new Error("fora do ar");
      }),
    };
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const limiter = new RateLimiter("login-email", 2, 1000, failing, new MemoryRateLimitStore(() => 0));
    expect(await limiter.consume("ana@x.com")).toBe(true);
    expect(await limiter.consume("ana@x.com")).toBe(true);
    expect(await limiter.consume("ana@x.com")).toBe(false);
    await expect(limiter.reset("ana@x.com")).resolves.toBeUndefined();
    expect(await limiter.consume("ana@x.com")).toBe(true);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toMatch(/armazenamento indisponível/);
    expect(logged).toContain("P1001");
    expect(logged).not.toContain("ana");
    log.mockRestore();
  });
});
