/** @jest-environment node */
import { RateLimiter } from "../rate-limit";

describe("RateLimiter", () => {
  it("bloqueia ao atingir o limite e libera após a janela", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(limiter.isBlocked("k")).toBe(false);
      limiter.hit("k");
    }
    expect(limiter.isBlocked("k")).toBe(true);
    expect(limiter.isBlocked("outra")).toBe(false);
    now = 1000;
    expect(limiter.isBlocked("k")).toBe(false);
  });

  it("reset limpa o contador", () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    limiter.hit("k");
    expect(limiter.isBlocked("k")).toBe(true);
    limiter.reset("k");
    expect(limiter.isBlocked("k")).toBe(false);
  });
});
