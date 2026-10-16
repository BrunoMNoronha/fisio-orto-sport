/** @jest-environment node */
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

describe("exceção exata para atestação da release no proxy", () => {
  it("encaminha somente a rota de verificação ao handler que autentica por HMAC", () => {
    const response = proxy(new NextRequest("https://example.test/api/release/verify"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
  it.each(["/configuracoes", "/agenda", "/api/release/verify/extra", "/api/release", "/api/administrativo/lotes"])("preserva o login obrigatório em %s", (path) => {
    const response = proxy(new NextRequest("https://example.test" + path, { headers: { "x-release-signature": "fake" } }));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe(path);
  });
});
