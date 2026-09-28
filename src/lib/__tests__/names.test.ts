/** @jest-environment node */
import { normalizeName, normalizeOptionalName } from "../names";
import { createUserSchema, firstAdminSchema, updateUserSchema } from "@/modules/auth/validation";
import { settingsSchema } from "@/modules/configuracoes/validation";
import { patientSchema } from "@/modules/pacientes/validation";

describe("contrato de nomes (#78)", () => {
  it("maiúsculas preservando acentos, sem espaços sobrando", () => {
    expect(normalizeName("  João da Silva  ")).toBe("JOÃO DA SILVA");
    expect(normalizeName("maria  das   graças\tçãí")).toBe("MARIA DAS GRAÇAS ÇÃÍ");
    // Forma decomposta (NFD) vira composta (NFC): mesmo texto, mesmo tamanho.
    expect(normalizeName("José")).toBe("JOSÉ");
    expect(normalizeName("JOSÉ")).toBe("JOSÉ");
  });

  it("opcional vazio vira null", () => {
    expect(normalizeOptionalName("   ")).toBeNull();
    expect(normalizeOptionalName(undefined)).toBeNull();
    expect(normalizeOptionalName(" ana ")).toBe("ANA");
  });

  it("é aplicado nos schemas de usuário, primeiro acesso, paciente e clínica", () => {
    const user = { email: "a@x.com", role: "RECEPCAO", password: "12345678" };
    expect(createUserSchema.parse({ ...user, name: "  bia  souza " }).name).toBe("BIA SOUZA");
    expect(updateUserSchema.parse({ id: "u1", name: "bia", email: "bia@x.com", role: "ADMIN" }).name).toBe("BIA");
    expect(firstAdminSchema.parse({ ...user, name: "ana" }).name).toBe("ANA");

    const patient = patientSchema.parse({
      fullName: " joão  menor ",
      birthDate: `${new Date().getFullYear() - 10}-01-01`,
      sex: "MASCULINO",
      phone: "11987654321",
      guardianName: " márcia responsável ",
      guardianPhone: "11911112222",
      guardianRelationship: "mãe",
      occupation: "estudante",
      address: "rua das flores",
    });
    expect(patient).toMatchObject({
      fullName: "JOÃO MENOR",
      guardianName: "MÁRCIA RESPONSÁVEL",
      // Fora do contrato: não são nomes de pessoa ou instituição.
      guardianRelationship: "mãe",
      occupation: "estudante",
      address: "rua das flores",
    });

    const settings = settingsSchema.parse({
      displayName: " clínica  ortosport ",
      legalName: "ortosport ltda",
      address: "av. central",
      agendaDayStartHour: "7",
      agendaDayEndHour: "20",
      expectedVersion: "0",
    });
    expect(settings).toMatchObject({ displayName: "CLÍNICA ORTOSPORT", legalName: "ORTOSPORT LTDA", address: "av. central" });
  });

  it("valida o tamanho depois de normalizar", () => {
    const user = { email: "a@x.com", role: "RECEPCAO", password: "12345678" };
    // 120 caracteres úteis cercados de espaços cabem; o mínimo conta depois do trim.
    expect(createUserSchema.safeParse({ ...user, name: `  ${"a".repeat(120)}  ` }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...user, name: "  a  " }).success).toBe(false);
    // "ß" vira "SS": 61 caracteres digitados viram 122 e passam do limite.
    expect(createUserSchema.safeParse({ ...user, name: "ß".repeat(61) }).success).toBe(false);
  });
});
