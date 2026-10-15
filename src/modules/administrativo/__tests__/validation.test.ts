import { randomUUID } from "node:crypto";
import { operatorSchema, contractSchema, catalogFilters, contractPendingFields } from "../validation";

const meta = () => ({ id: randomUUID(), requestId: randomUUID(), expectedVersion: "0", reason: "Cadastro inicial", name: "  Clínica  sintética ", active: "true" });
const contract = () => ({ ...meta(), operatorId: randomUUID(), providerCode: "00012", cnes: "", tissVersion: "", manualReference: "" });

it("permite configuração pendente sem inventar ANS/CNES/versão/manual", () => {
  const operator = operatorSchema.parse({ ...meta(), registrationAns: "" });
  expect(operator.name).toBe("CLÍNICA SINTÉTICA");
  expect(operator.registrationAns).toBeNull();
  const parsed = contractSchema.parse(contract());
  expect(parsed.providerCode).toBe("00012");
  expect(parsed.cnes).toBeNull();
  expect(parsed.tissVersion).toBeNull();
  expect(contractPendingFields(parsed, null)).toEqual(["registro ANS", "versão TISS", "referência do manual"]);
});
it("preserva zeros e valida formato sem afirmar existência ou homologação", () => {
  expect(operatorSchema.parse({ ...meta(), registrationAns: "000001" }).registrationAns).toBe("000001");
  expect(contractSchema.parse({ ...contract(), cnes: "0000012", tissVersion: "04.03.00" }).cnes).toBe("0000012");
  for (const bad of ["12345", "12345a", "1234567"]) expect(operatorSchema.safeParse({ ...meta(), registrationAns: bad }).success).toBe(false);
  expect(contractSchema.safeParse({ ...contract(), tissVersion: "qualquer" }).success).toBe(false);
});
it("recusa identidade, versão e motivo inválidos", () => {
  for (const patch of [{ id: "x" }, { requestId: "x" }, { expectedVersion: -1 }, { reason: "  " }, { active: "yes" }]) {
    expect(contractSchema.safeParse({ ...contract(), ...patch }).success).toBe(false);
  }
});
it("não amplia consulta por filtro repetido, desconhecido ou página inválida", () => {
  expect(catalogFilters.parse({})).toEqual({ q: "", page: 1 });
  for (const raw of [{ q: ["a", "b"] }, { unknown: "a" }, { page: "0" }, { q: "a".repeat(121) }]) expect(catalogFilters.safeParse(raw).success).toBe(false);
});

 it("aplica padrões de planejamento e recusa limites vazios, negativos e fracionários", () => {
  const parsed = contractSchema.parse(contract());
  expect(parsed).toMatchObject({ monthlySessions: 1000, closingIntervalDays: 30, maxGuides: 100, maxItems: 1000, maxXmlBytes: 2097152, maxExportRows: 10000 });
  for (const maxGuides of ["", "0", "-1", "1.5", "10001"]) expect(contractSchema.safeParse({ ...contract(), maxGuides }).success).toBe(false);
  expect(contractSchema.parse({ ...contract(), maxGuides: "200", homologationChannel: "Portal de teste" })).toMatchObject({ maxGuides: 200, homologationChannel: "Portal de teste" });
 });
