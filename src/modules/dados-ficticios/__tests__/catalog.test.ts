/** @jest-environment node */
import { CLINICAL_PREFIX, PATIENTS, catalogProblems, expectedCounts, patientMarker, type PatientSpec } from "../catalog";
import { assignProfessionals } from "../generate";

describe("catálogo demo-v1", () => {
  it("é consistente (cronologia, comparecimento, plano vigente, adultos)", () => {
    expect(catalogProblems()).toEqual([]);
  });

  it("quantidades documentadas", () => {
    expect(expectedCounts()).toEqual({
      patients: 4,
      appointments: 10,
      anamneses: 3,
      assessments: 2,
      therapyPlans: 2,
      planRevisions: 2,
      treatmentSessions: 4,
      reassessments: 1,
    });
  });

  it("pacientes claramente fictícios e sem identificação real", () => {
    for (const p of PATIENTS) {
      expect(p.fullName).toMatch(/Fictíci[oa]/);
      expect(p.phone).toMatch(/^119000000\d\d$/);
      expect(patientMarker(p.key)).toBe(`[conjunto-ficticio:demo-v1:${p.key}]`);
    }
    expect(CLINICAL_PREFIX).toMatch(/FICTÍCIO/);
  });

  it("detecta inconsistências", () => {
    const bad: PatientSpec = {
      key: "X",
      fullName: "X Fictício",
      age: 10,
      sex: "FEMININO",
      occupation: null,
      phone: "11900000099",
      appointments: [{ day: 2, hour: 9, attendance: "COMPARECEU", session: { evolution: "e", techniques: "t", exercises: "x" } }],
    };
    expect(catalogProblems([bad, bad])).toEqual(
      expect.arrayContaining([
        "X: chave repetida.",
        "X: menor de idade exigiria responsável legal.",
        "X: presença em agendamento que ainda não começou.",
        "X: atendimento sem plano vigente.",
      ]),
    );
  });

  it("distribui os pacientes entre os profissionais em ordem estável", () => {
    const a = { id: "a", name: "A", crefito: "1-F" };
    const b = { id: "b", name: "B", crefito: "2-F" };
    expect([...assignProfessionals([a]).values()].map((p) => p.id)).toEqual(["a", "a", "a", "a"]);
    expect([...assignProfessionals([a, b]).values()].map((p) => p.id)).toEqual(["a", "b", "a", "b"]);
  });
});
