// Adequa os nomes cadastrais já gravados ao contrato de nomes em maiúsculas (issue #78).
// Padrão: SIMULAÇÃO (só mostra alvo e contagens). Regras em src/modules/manutencao/names-cli.ts.
//
// Uso: pnpm db:normalizar-nomes              (simulação)
//      pnpm db:normalizar-nomes --executar   (pede o nome do banco)
// Para outro banco: $env:DATABASE_URL="<url direta>"; pnpm db:normalizar-nomes
// Nunca roda no build, no seed, nas migrações, no reset nem na geração de dados fictícios.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runNamesCli } from "../src/modules/manutencao/names-cli";
import { createPrompt } from "./prompt";

const prompt = createPrompt();
runNamesCli(
  process.argv.slice(2),
  process.env.DATABASE_URL,
  prompt,
  (connectionString) => new PrismaClient({ adapter: new PrismaPg({ connectionString }) }),
)
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prompt.close());
