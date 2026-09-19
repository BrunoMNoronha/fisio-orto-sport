// Integração com PostgreSQL real da Fase 2c: colunas aditivas em Patient e CREFITO único em User.
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado
// (os dados criados aqui não são limpos). Ver src/modules/clinico/README.md.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("cadastro complementar no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let actorId: string;
  const suffix = Date.now();

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const actor = await prisma.user.create({
      data: { name: "Admin Teste", email: `admin-2c-${suffix}@teste.local`, passwordHash: "x", role: "ADMIN" },
    });
    actorId = actor.id;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("paciente sem sexo e profissão (cadastro anterior à 2c) continua válido", async () => {
    const patient = await prisma.patient.create({
      data: {
        fullName: "Paciente Antigo",
        birthDate: new Date("1980-01-01T00:00:00Z"),
        phone: "11987654321",
        createdById: actorId,
        updatedById: actorId,
      },
      select: { sex: true, occupation: true },
    });
    assert.deepEqual(patient, { sex: null, occupation: null });
  });

  it("o banco recusa sexo fora do enum", async () => {
    await assert.rejects(
      prisma.$executeRawUnsafe(`SELECT 'OUTRO'::"Sex"`),
    );
  });

  it("CREFITO duplicado gera P2002 identificável pela coluna (base da mensagem da action)", async () => {
    const crefito = `T${suffix}`.slice(0, 20);
    await prisma.user.create({
      data: { name: "Fisio A", email: `fa-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA", crefito },
    });
    const error = await prisma.user
      .create({
        data: { name: "Fisio B", email: `fb-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA", crefito },
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(error.code, "P2002");
    assert.ok(JSON.stringify(error.meta ?? {}).includes("crefito"));
  });

  it("vários usuários sem CREFITO convivem (único só quando informado)", async () => {
    for (const n of [1, 2]) {
      await prisma.user.create({
        data: { name: `Recepção ${n}`, email: `r${n}-${suffix}@teste.local`, passwordHash: "x", role: "RECEPCAO" },
      });
    }
    assert.ok((await prisma.user.count({ where: { crefito: null } })) >= 2);
  });
});
