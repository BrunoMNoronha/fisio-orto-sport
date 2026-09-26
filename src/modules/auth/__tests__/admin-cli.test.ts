/** @jest-environment node */
// Núcleo do `pnpm db:admin`: validação, confirmação e abortos antes de qualquer escrita, sem
// vazar senha nem URL do banco.
import { PromptClosedError, describeTarget, runAdminCli, type AdminCliDb, type AdminCliIO } from "../admin-cli";

const LOCAL = "postgresql://fisio:segredo-local@localhost:5432/fisio_orto_sport?schema=public";
const REMOTE = "postgresql://neondb_owner:segredo-remoto@ep-exemplo.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PASSWORD = "senha-forte-do-admin";

function makeIO(answers: (string | PromptClosedError)[]) {
  const output: string[] = [];
  const questions: { question: string; hidden: boolean }[] = [];
  const io: AdminCliIO = {
    ask: jest.fn(async (question: string, options?: { hidden?: boolean }) => {
      questions.push({ question, hidden: Boolean(options?.hidden) });
      const next = answers.shift();
      if (next === undefined || next instanceof PromptClosedError) throw next ?? new PromptClosedError();
      return next;
    }),
    out: (message) => output.push(message),
    err: (message) => output.push(message),
  };
  return { io, output, questions };
}

function makeDb(existing: { id: string; role: string; active: boolean } | null = null) {
  const tx = {
    user: { updateMany: jest.fn(async () => ({ count: 1 })) },
    session: { deleteMany: jest.fn(async () => ({ count: 2 })) },
  };
  const db = {
    user: {
      findUnique: jest.fn(async () => existing),
      create: jest.fn(async () => ({ id: "novo" })),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    $disconnect: jest.fn(async () => {}),
  };
  return { db, tx, open: jest.fn(() => db as unknown as AdminCliDb) };
}

const writes = (db: ReturnType<typeof makeDb>) =>
  db.db.user.create.mock.calls.length + db.db.$transaction.mock.calls.length;

describe("describeTarget", () => {
  it("mostra só host e banco, nunca usuário ou senha", () => {
    expect(describeTarget(LOCAL)).toEqual({ label: "localhost/fisio_orto_sport", database: "fisio_orto_sport", local: true });
    const remote = describeTarget(REMOTE);
    expect(remote).toEqual({ label: "ep-exemplo.sa-east-1.aws.neon.tech/neondb", database: "neondb", local: false });
    expect(JSON.stringify(remote)).not.toMatch(/segredo|neondb_owner/);
  });

  it("URL inválida ou sem banco devolve null", () => {
    expect(describeTarget("nao é url com segredo")).toBeNull();
    expect(describeTarget("postgresql://u:p@localhost:5432/")).toBeNull();
  });
});

describe("runAdminCli", () => {
  it("cria o Administrador com e-mail normalizado e senha só em hash", async () => {
    const db = makeDb();
    const { io, output, questions } = makeIO(["sim", PASSWORD, PASSWORD]);
    await expect(runAdminCli(["--email", " Ana@X.com ", "--name", "Ana"], LOCAL, io, db.open)).resolves.toBe(0);
    expect(db.db.user.create).toHaveBeenCalledWith({
      data: { name: "Ana", email: "ana@x.com", role: "ADMIN", passwordHash: expect.stringMatching(/^scrypt\$|\$/) },
    });
    const hash = (db.db.user.create.mock.calls[0] as unknown as [{ data: { passwordHash: string } }])[0].data.passwordHash;
    expect(hash).not.toContain(PASSWORD);
    expect(questions.filter((q) => q.hidden)).toHaveLength(2);
    expect(output.join("\n")).toContain("Administrador ana@x.com criado.");
    expect(output.join("\n")).not.toContain(PASSWORD);
    expect(output.join("\n")).not.toContain("segredo-local");
    expect(db.db.$disconnect).toHaveBeenCalled();
  });

  it("redefine a senha de um ADMIN, reativa e encerra as sessões na mesma transação", async () => {
    const db = makeDb({ id: "a1", role: "ADMIN", active: false });
    const { io, output, questions } = makeIO(["sim", PASSWORD, PASSWORD]);
    await expect(runAdminCli(["--email", "ana@x.com"], LOCAL, io, db.open)).resolves.toBe(0);
    expect(questions[0].question).toMatch(/será reativado/);
    expect(db.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "a1", role: "ADMIN" },
      data: { passwordHash: expect.any(String), active: true },
    });
    expect(db.tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "a1" } });
    expect(output.join("\n")).toMatch(/redefinida\. Sessões anteriores encerradas/);
  });

  it("não promove usuário de outro perfil e não pergunta nada", async () => {
    const db = makeDb({ id: "r1", role: "RECEPCAO", active: true });
    const { io, output } = makeIO([]);
    await expect(runAdminCli(["--email", "rec@x.com"], LOCAL, io, db.open)).resolves.toBe(1);
    expect(output.join("\n")).toMatch(/perfil RECEPCAO.*só cria ou altera Administradores/);
    expect(io.ask).not.toHaveBeenCalled();
    expect(writes(db)).toBe(0);
  });

  it("se o perfil mudar durante a operação, não grava nem derruba sessões", async () => {
    const db = makeDb({ id: "a1", role: "ADMIN", active: true });
    db.tx.user.updateMany.mockResolvedValueOnce({ count: 0 });
    const { io, output } = makeIO(["sim", PASSWORD, PASSWORD]);
    await expect(runAdminCli(["--email", "ana@x.com"], LOCAL, io, db.open)).resolves.toBe(1);
    expect(db.tx.session.deleteMany).not.toHaveBeenCalled();
    expect(output.join("\n")).toMatch(/deixou de ser Administrador/);
  });

  it.each([
    ["confirmação diferente de sim", ["não"], /Cancelado/],
    ["senha curta", ["sim", "curta", "curta"], /entre 8 e 128/],
    ["senhas diferentes", ["sim", PASSWORD, PASSWORD + "x"], /não conferem/],
    ["Ctrl+C na senha", ["sim", new PromptClosedError()], /Cancelado/],
    ["fim da entrada na confirmação", [], /Cancelado/],
  ])("%s: aborta antes de qualquer escrita", async (_caso, answers, message) => {
    const db = makeDb();
    const { io, output } = makeIO(answers as (string | PromptClosedError)[]);
    const code = await runAdminCli(["--email", "ana@x.com"], LOCAL, io, db.open);
    expect(code).not.toBe(0);
    expect(output.join("\n")).toMatch(message);
    expect(writes(db)).toBe(0);
    expect(db.db.$disconnect).toHaveBeenCalled();
  });

  it("banco remoto exige digitar o nome do banco; \"sim\" não basta", async () => {
    const db = makeDb();
    const { io, output, questions } = makeIO(["sim"]);
    await expect(runAdminCli(["--email", "ana@x.com"], REMOTE, io, db.open)).resolves.toBe(1);
    expect(output[0]).toBe("Banco: ep-exemplo.sa-east-1.aws.neon.tech/neondb (REMOTO)");
    expect(questions[0].question).toContain('("neondb")');
    expect(writes(db)).toBe(0);

    const ok = makeDb();
    const accepted = makeIO(["neondb", PASSWORD, PASSWORD]);
    await expect(runAdminCli(["--email", "ana@x.com"], REMOTE, accepted.io, ok.open)).resolves.toBe(0);
    expect(accepted.output.join("\n")).not.toMatch(/segredo-remoto|neondb_owner/);
  });

  it.each([
    [[], /Informe --email/],
    [["--email", "sem-arroba"], /E-mail inválido/],
    [["--email", "a@x.com", "--name", "A"], /--name deve ter/],
    [["--email", "a@x.com", "--senha", "x"], /Unknown option/],
  ])("argumentos inválidos (%j) param antes de abrir o banco", async (argv, message) => {
    const db = makeDb();
    const { io, output } = makeIO([]);
    await expect(runAdminCli(argv, LOCAL, io, db.open)).resolves.toBe(1);
    expect(output.join("\n")).toMatch(message);
    expect(output.join("\n")).toContain("Uso: pnpm db:admin");
    expect(db.open).not.toHaveBeenCalled();
  });

  it("DATABASE_URL ausente ou inválida não abre o banco nem ecoa o valor", async () => {
    const db = makeDb();
    const missing = makeIO([]);
    await expect(runAdminCli(["--email", "a@x.com"], undefined, missing.io, db.open)).resolves.toBe(1);
    const invalid = makeIO([]);
    await expect(runAdminCli(["--email", "a@x.com"], "lixo com segredo", invalid.io, db.open)).resolves.toBe(1);
    expect(invalid.output.join("\n")).toMatch(/DATABASE_URL inválida/);
    expect(invalid.output.join("\n")).not.toContain("segredo");
    expect(db.open).not.toHaveBeenCalled();
  });

  it("tabela ausente, e-mail criado em paralelo e falha do banco viram mensagens curtas", async () => {
    const missingTable = makeDb();
    missingTable.db.user.findUnique.mockRejectedValueOnce(Object.assign(new Error("table does not exist"), { code: "P2021" }));
    const a = makeIO([]);
    await expect(runAdminCli(["--email", "a@x.com"], LOCAL, a.io, missingTable.open)).resolves.toBe(1);
    expect(a.output.join("\n")).toMatch(/Rode as migrações/);

    const race = makeDb();
    race.db.user.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const b = makeIO(["sim", PASSWORD, PASSWORD]);
    await expect(runAdminCli(["--email", "a@x.com"], LOCAL, b.io, race.open)).resolves.toBe(1);
    expect(b.output.join("\n")).toMatch(/cadastrado por outra operação/);

    const down = makeDb();
    down.db.user.findUnique.mockRejectedValueOnce(
      Object.assign(new Error("Can't reach database server\nconfig: postgresql://u:segredo@host/db"), { code: "P1001" }),
    );
    const c = makeIO([]);
    await expect(runAdminCli(["--email", "a@x.com"], LOCAL, c.io, down.open)).resolves.toBe(1);
    expect(c.output.join("\n")).toBe("Banco: localhost/fisio_orto_sport (local)\nFalha (P1001): Can't reach database server");
    expect(down.db.$disconnect).toHaveBeenCalled();
  });
});
