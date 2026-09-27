// Cria o Administrador ou redefine a senha dele, no banco de DATABASE_URL.
// - E-mail inexistente: cria um usuário ADMIN ativo.
// - E-mail de um ADMIN existente: troca a senha, reativa se estiver inativo e encerra as sessões.
// - E-mail de outro perfil: recusa (não promove ninguém a ADMIN).
// A senha é pedida no terminal, sem eco, para não ficar no histórico do shell nem em arquivo.
// Banco remoto exige digitar o nome do banco para confirmar. Regras em src/modules/auth/admin-cli.ts.
//
// Uso: pnpm db:admin --email <email> [--name "<nome>"]
//      (--name só é usado na criação; padrão "Administrador")
// Para outro banco (ex.: Neon): $env:DATABASE_URL="<url direta>"; pnpm db:admin --email ...
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runAdminCli } from "../src/modules/auth/admin-cli";
import { createPrompt } from "./prompt";

const prompt = createPrompt();
runAdminCli(
  process.argv.slice(2),
  process.env.DATABASE_URL,
  prompt,
  (connectionString) => new PrismaClient({ adapter: new PrismaPg({ connectionString }) }),
)
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prompt.close());
