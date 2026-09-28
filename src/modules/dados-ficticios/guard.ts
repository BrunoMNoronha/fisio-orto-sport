// Habilitação técnica das ferramentas de desenvolvimento das Configurações: geração de dados fictícios
// (issue #73, DEMO_DATA_TARGET) e limpeza da base (#78, DEV_RESET_TARGET). Cada ferramenta tem a sua
// variável, desligada por padrão: ligar a geração não liga a limpeza. Pura: recebe o ambiente, para ser
// testada sem mexer em process.env. Não é parâmetro de negócio: nada na interface as liga.
//
// Liga só quando TODAS as condições valem; qualquer dúvida desliga:
// - NODE_ENV = development (`next dev`) e fora da Vercel (VERCEL ausente);
// - a variável da ferramenta definida com o alvo permitido, "host/banco" (ex.: localhost/fisio_orto_sport);
// - DATABASE_URL válida, apontando exatamente para esse alvo, e o host é local (loopback).
// NODE_ENV sozinho não prova que a conexão é de desenvolvimento: por isso o alvo explícito e o host
// local. As operações ainda conferem current_database() na própria transação. A URL nunca é exposta.
import { describeTarget } from "@/modules/auth/admin-cli";

export type DevDataEnv = {
  NODE_ENV?: string;
  VERCEL?: string;
  DEMO_DATA_TARGET?: string;
  DEV_RESET_TARGET?: string;
  DATABASE_URL?: string;
};

export type DevDataAvailability =
  | { enabled: true; target: { label: string; database: string } }
  | { enabled: false; reason: string };

export const UNAVAILABLE = "Indisponível neste ambiente.";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

type ToolVariable = "DEMO_DATA_TARGET" | "DEV_RESET_TARGET";

function toolAvailability(env: DevDataEnv, variable: ToolVariable, tool: string): DevDataAvailability {
  if (env.NODE_ENV !== "development") return { enabled: false, reason: "Disponível apenas em desenvolvimento." };
  if (env.VERCEL) return { enabled: false, reason: "Indisponível em ambientes hospedados." };
  const allowed = env[variable]?.trim();
  if (!allowed) return { enabled: false, reason: `${tool} não habilitada (${variable}).` };
  if (!env.DATABASE_URL) return { enabled: false, reason: "Banco de dados não configurado." };
  const target = describeTarget(env.DATABASE_URL);
  if (!target) return { enabled: false, reason: "Banco de dados com configuração inválida." };
  if (!LOOPBACK.has(target.hostname)) return { enabled: false, reason: "O banco configurado não é local." };
  if (target.label.toLowerCase() !== allowed.toLowerCase()) {
    return { enabled: false, reason: `O banco configurado não é o alvo permitido em ${variable}.` };
  }
  return { enabled: true, target: { label: target.label, database: target.database } };
}

export function devDataAvailability(env: DevDataEnv): DevDataAvailability {
  return toolAvailability(env, "DEMO_DATA_TARGET", "Geração de dados fictícios");
}

export function devResetAvailability(env: DevDataEnv): DevDataAvailability {
  return toolAvailability(env, "DEV_RESET_TARGET", "Limpeza da base");
}

function currentEnv(): DevDataEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    DEMO_DATA_TARGET: process.env.DEMO_DATA_TARGET,
    DEV_RESET_TARGET: process.env.DEV_RESET_TARGET,
    DATABASE_URL: process.env.DATABASE_URL,
  };
}

export function currentDevDataAvailability(): DevDataAvailability {
  return devDataAvailability(currentEnv());
}

export function currentDevResetAvailability(): DevDataAvailability {
  return devResetAvailability(currentEnv());
}
