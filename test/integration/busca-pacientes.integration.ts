// Integração com PostgreSQL real: a coluna de busca Patient.searchName (migração busca_sem_acento).
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado
// (os dados criados aqui não são limpos). Ver src/modules/clinico/README.md.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { normalizeSearch } from "@/modules/pacientes/validation";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("busca de pacientes sem acento no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let actorId: string;
  const suffix = Date.now();

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const actor = await prisma.user.create({
      data: { name: "Admin Teste", email: `admin-busca-${suffix}@teste.local`, passwordHash: "x", role: "ADMIN" },
    });
    actorId = actor.id;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("o trigger preenche e atualiza searchName a partir do nome", async () => {
    const created = await prisma.patient.create({
      data: {
        fullName: `Paginação Fictício ${suffix}`,
        birthDate: new Date("1990-01-01T00:00:00Z"),
        phone: "11987654321",
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true, searchName: true },
    });
    assert.equal(created.searchName, `paginacao ficticio ${suffix}`);

    const found = await prisma.patient.findMany({
      where: { searchName: { contains: normalizeSearch(`PAGINACAO FICTÍCIO ${suffix}`) } },
      select: { id: true },
    });
    assert.deepEqual(found, [{ id: created.id }]);

    const updated = await prisma.patient.update({
      where: { id: created.id },
      data: { fullName: `Ângela Conceição ${suffix}` },
      select: { searchName: true },
    });
    assert.equal(updated.searchName, `angela conceicao ${suffix}`);
  });

  it("a aplicação não consegue gravar um searchName divergente", async () => {
    const patient = await prisma.patient.create({
      data: {
        fullName: `José ${suffix}`,
        searchName: "outro nome",
        birthDate: new Date("1990-01-01T00:00:00Z"),
        phone: "11987654321",
        createdById: actorId,
        updatedById: actorId,
      },
      select: { searchName: true },
    });
    assert.equal(patient.searchName, `jose ${suffix}`);
  });
});
