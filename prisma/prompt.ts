// Leitor de terminal dos comandos de manutenção (db:admin, db:reset).
import { createInterface } from "node:readline";
import type { AdminCliIO } from "../src/modules/auth/admin-cli";
import { PromptClosedError } from "../src/modules/auth/admin-cli";

// Um único leitor para todas as perguntas (com várias interfaces, respostas vindas por pipe se
// perdiam). Ctrl+C ou fim da entrada rejeitam a pergunta pendente como cancelamento.
export function createPrompt(): AdminCliIO & { close(): void } {
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
