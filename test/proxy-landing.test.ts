/** @jest-environment node */
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

describe("landing pública no proxy", () => {
  it.each(["/landing", "/landing/"])("deixa %s passar sem sessão", (path) => {
    const response = proxy(new NextRequest("https://example.test" + path));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("mantém a raiz (dashboard) atrás do login", () => {
    const response = proxy(new NextRequest("https://example.test/"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("não libera rotas que só começam com o mesmo prefixo", () => {
    const response = proxy(new NextRequest("https://example.test/landingpage"));
    expect(response.status).toBe(307);
  });
});
