import { randomUUID } from "node:crypto";
import { procedureSchema, tariffSchema, professionalSchema, parseCivilDate } from "../catalog-validation";
const meta = () => ({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0, reason: "Teste", active: "true" });
it("preserva códigos e normaliza nome sem assumir tabela TUSS", () => {
  const item = procedureSchema.parse({ ...meta(), contractId: randomUUID(), name: "  fisioterapia  ", tableCode: "00", code: "000123" });
  expect(item.code).toBe("000123"); expect(item.tableCode).toBe("00"); expect(item.name).toBe("FISIOTERAPIA");
});
it.each(["2026-02-29","2024-02-30","2026-1-01","1999-12-31","2101-01-01"])("recusa data civil inválida %s", (date) => {
  expect(parseCivilDate(date)).toBeNull();
});
it("aceita bissexto, prazo aberto e preço exato em centavos", () => {
  const item = tariffSchema.parse({ ...meta(), procedureId: randomUUID(), startsOn: "2024-02-29", endsOn: "", amount: "123,45" });
  expect(item.amount).toBe(12345); expect(item.endsOn).toBeNull(); expect(item.startsOn.toISOString()).toBe("2024-02-29T00:00:00.000Z");
});
it.each(["0","-1","1,234","1000000,00"])("recusa preço inválido %s", (amount) => {
  expect(tariffSchema.safeParse({ ...meta(), procedureId: randomUUID(), startsOn: "2026-01-01", endsOn: "", amount }).success).toBe(false);
});
it("recusa intervalo invertido e permite intervalo de um dia", () => {
  const base = { ...meta(), procedureId: randomUUID(), startsOn: "2026-01-02", amount: "10,00" };
  expect(tariffSchema.safeParse({ ...base, endsOn: "2026-01-01" }).success).toBe(false);
  expect(tariffSchema.safeParse({ ...base, endsOn: "2026-01-02" }).success).toBe(true);
});
it("permite profissional externo com identificação pendente, sem inferir conselho", () => {
  const item = professionalSchema.parse({ ...meta(), name: "Solicitante", userId: "", purpose: "SOLICITANTE", councilCode: "", councilNumber: "", councilState: "", occupationCode: "" });
  expect(item.userId).toBeNull(); expect(item.councilCode).toBeNull(); expect(item.occupationCode).toBeNull();
  expect(professionalSchema.safeParse({ ...meta(), ...item, active: "true", councilState: "XX" }).success).toBe(false);
});
