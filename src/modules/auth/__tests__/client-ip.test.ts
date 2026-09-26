/** @jest-environment node */
import { clientIpFrom } from "../client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIpFrom", () => {
  it("sem proxy confiável ignora os cabeçalhos (podem ser forjados)", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4" }), {})).toBeNull();
    expect(clientIpFrom(h({ "x-real-ip": "1.2.3.4" }), { TRUST_PROXY: "1" })).toBeNull();
  });

  it("na Vercel usa o primeiro x-forwarded-for, depois x-real-ip", () => {
    const env = { VERCEL: "1" };
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "5.6.7.8" }), env)).toBe("1.2.3.4");
    expect(clientIpFrom(h({ "x-real-ip": "2001:db8::1" }), env)).toBe("2001:db8::1");
    expect(clientIpFrom(h({}), env)).toBeNull();
  });

  it("com TRUST_PROXY=true também confia no proxy", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "9.9.9.9" }), { TRUST_PROXY: "true" })).toBe("9.9.9.9");
  });

  it("recusa valores que não são IP", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "desconhecido" }), { VERCEL: "1" })).toBeNull();
    expect(clientIpFrom(h({ "x-forwarded-for": "1.2.3.4<script>" }), { VERCEL: "1" })).toBeNull();
  });
});
