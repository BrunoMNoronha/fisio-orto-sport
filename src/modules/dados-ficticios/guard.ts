// Habilitação técnica da geração de dados fictícios (issue #73). Pura: recebe o ambiente, para ser
// testada sem mexer em process.env. Não é parâmetro de negócio: nada na interface a liga.
//
// Liga só quando TODAS as condições valem; qualquer dúvida desliga:
// - NODE_ENV = development (`next dev`) e fora da Vercel (VERCEL ausente);
// - DEMO_DATA_TARGET definida com o alvo permitido, "host/banco" (ex.: localhost/fisio_orto_sport);
// - DATABASE_URL válida, apontando exatamente para esse alvo, e o host é local (loopback).
// NODE_ENV sozinho não prova que a conexão é de desenvolvimento: por isso o alvo explícito e o host
// local. O gerador ainda confere current_database() na própria transação. A URL nunca é exposta.
import { describeTarget } from "@/modules/auth/admin-cli";

export type DevDataEnv = {
  NODE_ENV?: string;
  VERCEL?: string;
  DEMO_DATA_TARGET?: string;
  DATABASE_URL?: string;
};

export type DevDataAvailability =
  | { enabled: true; target: { label: string; database: string } }
  | { enabled: false; reason: string };

export const UNAVAILABLE = "Indisponível neste ambiente.";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function devDataAvailability(env: DevDataEnv): DevDataAvailability {
  if (env.NODE_ENV !== "development") return { enabled: false, reason: "Disponível apenas em desenvolvimento." };
  if (env.VERCEL) return { enabled: false, reason: "Indisponível em ambientes hospedados." };
  const allowed = env.DEMO_DATA_TARGET?.trim();
  if (!allowed) return { enabled: false, reason: "Geração de dados fictícios não habilitada (DEMO_DATA_TARGET)." };
  if (!env.DATABASE_URL) return { enabled: false, reason: "Banco de dados não configurado." };
  const target = describeTarget(env.DATABASE_URL);
  if (!target) return { enabled: false, reason: "Banco de dados com configuração inválida." };
  if (!LOOPBACK.has(target.hostname)) return { enabled: false, reason: "O banco configurado não é local." };
  if (target.label.toLowerCase() !== allowed.toLowerCase()) {
    return { enabled: false, reason: "O banco configurado não é o alvo permitido em DEMO_DATA_TARGET." };
  }
  return { enabled: true, target: { label: target.label, database: target.database } };
}

export function currentDevDataAvailability(): DevDataAvailability {
  return devDataAvailability({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    DEMO_DATA_TARGET: process.env.DEMO_DATA_TARGET,
    DATABASE_URL: process.env.DATABASE_URL,
  });
}
