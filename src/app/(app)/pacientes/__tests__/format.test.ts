import type { PatientDetail } from "@/modules/pacientes/queries";
import { toFormValues } from "../format";

describe("toFormValues", () => {
  it("a edição carrega CPF e telefones já formatados", () => {
    const patient = {
      fullName: "Ana",
      birthDate: new Date("2012-05-10T00:00:00Z"),
      sex: "FEMININO",
      occupation: null,
      cpf: "11144477735",
      phone: "11987654321",
      email: null,
      address: null,
      notes: null,
      guardianName: "Maria",
      guardianPhone: "1133334444",
      guardianRelationship: null,
    } as unknown as PatientDetail;
    expect(toFormValues(patient)).toMatchObject({
      cpf: "111.444.777-35",
      phone: "(11) 98765-4321",
      guardianPhone: "(11) 3333-4444",
    });
  });

  it("CPF ausente continua vazio", () => {
    const patient = { birthDate: new Date("1990-01-01T00:00:00Z"), cpf: null, phone: "" } as unknown as PatientDetail;
    expect(toFormValues(patient)).toMatchObject({ cpf: "", phone: "" });
  });
});
