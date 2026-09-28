/** @jest-environment node */
import { devDataAvailability, type DevDataEnv } from "../guard";

const LOCAL = "postgresql://fisio:segredo@localhost:5432/fisio_orto_sport?schema=public";
const ok: DevDataEnv = { NODE_ENV: "development", DEMO_DATA_TARGET: "localhost/fisio_orto_sport", DATABASE_URL: LOCAL };

describe("devDataAvailability", () => {
  it("habilita só com desenvolvimento, alvo explícito igual ao banco e host local", () => {
    expect(devDataAvailability(ok)).toEqual({
      enabled: true,
      target: { label: "localhost/fisio_orto_sport", database: "fisio_orto_sport" },
    });
    const loopback = {
      ...ok,
      DATABASE_URL: LOCAL.replace("localhost", "127.0.0.1"),
      DEMO_DATA_TARGET: "127.0.0.1/fisio_orto_sport",
    };
    expect(devDataAvailability(loopback).enabled).toBe(true);
  });

  it.each<[string, DevDataEnv]>([
    ["produção", { ...ok, NODE_ENV: "production" }],
    ["teste", { ...ok, NODE_ENV: "test" }],
    ["NODE_ENV ausente", { ...ok, NODE_ENV: undefined }],
    ["Vercel", { ...ok, VERCEL: "1" }],
    ["desligada por padrão (sem DEMO_DATA_TARGET)", { ...ok, DEMO_DATA_TARGET: undefined }],
    ["DEMO_DATA_TARGET vazia", { ...ok, DEMO_DATA_TARGET: "  " }],
    ["sem DATABASE_URL", { ...ok, DATABASE_URL: undefined }],
    ["DATABASE_URL inválida", { ...ok, DATABASE_URL: "não é url" }],
    ["alvo diferente do banco", { ...ok, DEMO_DATA_TARGET: "localhost/outro_banco" }],
    [
      "banco remoto, mesmo que declarado como alvo",
      { ...ok, DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/neondb", DEMO_DATA_TARGET: "ep-x.neon.tech/neondb" },
    ],
    [
      "host que só parece local",
      {
        ...ok,
        DATABASE_URL: "postgresql://u:p@localhost.evil.test/fisio_orto_sport",
        DEMO_DATA_TARGET: "localhost.evil.test/fisio_orto_sport",
      },
    ],
  ])("bloqueia: %s", (_label, env) => {
    const result = devDataAvailability(env);
    expect(result.enabled).toBe(false);
    // A resposta nunca carrega a URL nem credenciais.
    expect(JSON.stringify(result)).not.toMatch(/segredo|postgresql:|u:p@/);
  });
});
