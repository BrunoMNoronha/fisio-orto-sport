// Reinicializa os dados do banco de DATABASE_URL preservando todos os usuários (issue #62).
// Padrão: SIMULAÇÃO (só mostra alvo, escopo e contagens). Regras em src/modules/manutencao/reset-cli.ts
// e procedimento em src/modules/manutencao/README.md.
//
// Uso: pnpm db:reset                                   (simulação)
//      pnpm db:reset --executar                        (pede o nome do banco e LIMPAR)
//      pnpm db:reset --executar --incluir-auditoria    (também apaga a auditoria anterior; exceção A5/A7)
// Para outro banco: $env:DATABASE_URL="<url direta>"; pnpm db:reset
// Nunca roda no build, no seed nem nas migrações.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runResetCli } from "../src/modules/manutencao/reset-cli";
import { createPrompt } from "./prompt";

const prompt = createPrompt();
runResetCli(
  process.argv.slice(2),
  process.env.DATABASE_URL,
  prompt,
  (connectionString) => new PrismaClient({ adapter: new PrismaPg({ connectionString }) }),
)
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prompt.close());
