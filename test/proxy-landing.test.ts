/** @jest-environment node */
import { NextRequest } from "next/server";
import { LANDING_HOST, proxy } from "../src/proxy";

const atLanding = (path: string) => new NextRequest("https://" + LANDING_HOST + path, { headers: { host: LANDING_HOST } });
const atApp = (path: string) => new NextRequest("https://app.example.test" + path, { headers: { host: "app.example.test" } });

describe("landing pública no proxy", () => {
  it("usa o domínio comercial como padrão", () => {
    expect(LANDING_HOST).toBe("fisio.dev2bless.tech");
  });

  it("no domínio comercial, a raiz é reescrita para a landing sem exigir sessão", () => {
    const response = proxy(atLanding("/"));
    expect(response.status).toBe(200);
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/landing");
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/landing", "/login", "/agenda", "/api/release/verify"])("no domínio comercial, %s volta à raiz", (path) => {
    const response = proxy(atLanding(path));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.host).toBe(LANDING_HOST);
    expect(target.pathname).toBe("/");
  });

  it("ignora a porta ao comparar o host", () => {
    const response = proxy(new NextRequest("http://" + LANDING_HOST + ":3000/", { headers: { host: LANDING_HOST + ":3000" } }));
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/landing");
  });

  it.each(["/landing", "/landing/"])("fora do domínio comercial, %s não é servida e volta à raiz", (path) => {
    const response = proxy(atApp(path));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("fora do domínio comercial, a raiz (dashboard) continua atrás do login", () => {
    const response = proxy(atApp("/"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});
