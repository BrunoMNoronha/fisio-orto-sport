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
import { createInterface } from "node:readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PromptClosedError, runAdminCli, type AdminCliIO } from "../src/modules/auth/admin-cli";

// Um único leitor para todas as perguntas (com várias interfaces, respostas vindas por pipe se
// perdiam). Ctrl+C ou fim da entrada rejeitam a pergunta pendente como cancelamento.
function createPrompt(): AdminCliIO & { close(): void } {
  const terminal = Boolean(process.stdin.isTTY);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal });
  const lines: string[] = [];
  let waiting: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  let closed = false;
  let muted = false;

  // Com a pergunta oculta, nada do que é digitado é ecoado no terminal.
  const writer = rl as unknown as { _writeToOutput: (text: string) => void };
  const write = writer._writeToOutput.bind(rl);
  writer._writeToOutput = (text) => {
    if (!muted) write(text);
  };

  rl.on("line", (line) => {
    if (waiting) {
      const pending = waiting;
      waiting = null;
      pending.resolve(line);
    } else {
      lines.push(line);
    }
  });
  rl.on("SIGINT", () => rl.close());
  rl.on("close", () => {
    closed = true;
    waiting?.reject(new PromptClosedError());
    waiting = null;
  });

  return {
    ask(question, { hidden = false } = {}) {
      process.stdout.write(question);
      muted = hidden && terminal;
      const done = (answer: string) => {
        muted = false;
        if (hidden) process.stdout.write("\n");
        return answer;
      };
      if (lines.length > 0) return Promise.resolve(done(lines.shift()!));
      if (closed) return Promise.reject(new PromptClosedError());
      return new Promise<string>((resolve, reject) => {
        waiting = { resolve: (line) => resolve(done(line)), reject };
      });
    },
    out: (message) => console.log(message),
    err: (message) => console.error(message),
    close: () => rl.close(),
  };
}

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
