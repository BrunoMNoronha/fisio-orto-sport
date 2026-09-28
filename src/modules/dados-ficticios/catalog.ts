// Catálogo do conjunto de dados fictícios de desenvolvimento (issue #73). Puro: sem banco, sem
// `server-only`, para ser testado e exibido no resumo antes da execução.
//
// O conjunto é pequeno, fixo e reproduzível: o mesmo conteúdo a cada execução, com datas relativas à
// data de referência (hoje, no fuso da clínica). Nenhum dado de identificação real: sem CPF, e-mail
// ou endereço; telefones sintéticos; nomes marcados como fictícios. Os textos clínicos começam com
// CLINICAL_PREFIX e as observações do paciente levam o marcador estável do conjunto.
import type { AppointmentAttendance, Sex } from "@/generated/prisma/enums";

export const DATASET_ID = "demo-v1";

// Marcador estável gravado no início de Patient.notes (observação administrativa). É por ele que uma
// reexecução reconhece o conjunto; nunca é usado para dados reais.
export const MARKER_PREFIX = `[conjunto-ficticio:${DATASET_ID}:`;
export const patientMarker = (key: string) => `${MARKER_PREFIX}${key}]`;
export const CLINICAL_PREFIX = `[DADO FICTÍCIO — conjunto ${DATASET_ID}; não é atendimento real]`;

// Horários tentados para cada agendamento, em ordem, até achar um livre para o profissional (sem
// agendamento AGENDADO nem bloqueio ativo). Duração fixa.
export const SLOT_HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17, 18] as const;
export const APPOINTMENT_MINUTES = 50;

export type AppointmentSpec = {
  // Dias em relação à data de referência (negativo = passado).
  day: number;
  // Hora preferida (a primeira tentativa); se ocupada, segue SLOT_HOURS a partir dela.
  hour: number;
  // Passado: COMPARECEU (com atendimento) ou falta. Futuro: sem presença.
  attendance?: AppointmentAttendance;
  // Só em agendamento passado com COMPARECEU: gera o atendimento (sessão) vinculado.
  session?: { evolution: string; techniques: string; exercises: string };
  cancelled?: string;
};

export type PatientSpec = {
  key: string;
  fullName: string;
  // Idade em anos na data de referência (todos adultos: sem responsável legal).
  age: number;
  sex: Sex;
  occupation: string | null;
  phone: string;
  anamnesis?: {
    day: number;
    chiefComplaint: string;
    currentIllnessHistory: string;
    painIntensity: number;
    painLocation: string;
    patientGoals: string;
  };
  assessment?: { day: number; diagnosis: string; rangeOfMotion: string; muscleStrength: string; specialTests: string };
  plan?: { day: number; goals: string; conduct: string; exercises: string; plannedSessions: number; frequency: string };
  appointments: AppointmentSpec[];
  reassessment?: { day: number; progressSummary: string; goalsJustification: string; conclusionSummary: string };
};

export const PATIENTS: readonly PatientSpec[] = [
  {
    key: "P1",
    fullName: "Ana Fictícia Demonstração",
    age: 34,
    sex: "FEMININO",
    occupation: "Corredora amadora (fictício)",
    phone: "11900000001",
    anamnesis: {
      day: -28,
      chiefComplaint: "Dor no joelho direito ao correr (exemplo fictício).",
      currentIllnessHistory: "Início há dois meses após aumento de volume de treino (exemplo fictício).",
      painIntensity: 6,
      painLocation: "Joelho direito, região anterior",
      patientGoals: "Voltar a correr 10 km sem dor (exemplo fictício).",
    },
    assessment: {
      day: -28,
      diagnosis: "Síndrome da dor femoropatelar à direita (exemplo fictício).",
      rangeOfMotion: "Flexão de joelho preservada, dor no final do arco (exemplo fictício).",
      muscleStrength: "Glúteo médio direito 4/5 (exemplo fictício).",
      specialTests: "Teste de Clarke positivo à direita (exemplo fictício).",
    },
    plan: {
      day: -27,
      goals: "Reduzir a dor e fortalecer quadril e quadríceps (exemplo fictício).",
      conduct: "Fortalecimento progressivo e retorno gradual à corrida (exemplo fictício).",
      exercises: "Ponte unilateral, agachamento parcial, step-down (exemplo fictício).",
      plannedSessions: 10,
      frequency: "2x por semana",
    },
    appointments: [
      {
        day: -21,
        hour: 9,
        attendance: "COMPARECEU",
        session: {
          evolution: "Primeira sessão: dor 6/10, boa adesão às orientações (exemplo fictício).",
          techniques: "Liberação miofascial (exemplo fictício).",
          exercises: "Ponte bilateral 3x12 (exemplo fictício).",
        },
      },
      {
        day: -14,
        hour: 9,
        attendance: "COMPARECEU",
        session: {
          evolution: "Dor 4/10 após os exercícios (exemplo fictício).",
          techniques: "Mobilização patelar (exemplo fictício).",
          exercises: "Ponte unilateral 3x10, step-down 3x8 (exemplo fictício).",
        },
      },
      {
        day: -7,
        hour: 9,
        attendance: "COMPARECEU",
        session: {
          evolution: "Dor 2/10; iniciado trote leve (exemplo fictício).",
          techniques: "Treino de gesto esportivo (exemplo fictício).",
          exercises: "Agachamento parcial 3x12, trote 10 min (exemplo fictício).",
        },
      },
      { day: 3, hour: 9 },
    ],
    reassessment: {
      day: -1,
      progressSummary: "Redução da dor de 6/10 para 2/10 (exemplo fictício).",
      goalsJustification: "Corre 5 km sem dor; meta de 10 km ainda não atingida (exemplo fictício).",
      conclusionSummary: "Manter o plano com progressão de carga (exemplo fictício).",
    },
  },
  {
    key: "P2",
    fullName: "Bruno Fictício Demonstração",
    age: 52,
    sex: "MASCULINO",
    occupation: "Professor (fictício)",
    phone: "11900000002",
    anamnesis: {
      day: -10,
      chiefComplaint: "Dor no ombro esquerdo ao elevar o braço (exemplo fictício).",
      currentIllnessHistory: "Dor progressiva há três meses, sem trauma (exemplo fictício).",
      painIntensity: 5,
      painLocation: "Ombro esquerdo, região anterolateral",
      patientGoals: "Escrever no quadro sem dor (exemplo fictício).",
    },
    assessment: {
      day: -10,
      diagnosis: "Tendinopatia do manguito rotador à esquerda (exemplo fictício).",
      rangeOfMotion: "Abdução ativa até 120° com dor (exemplo fictício).",
      muscleStrength: "Rotadores externos 4/5 (exemplo fictício).",
      specialTests: "Teste de Neer positivo à esquerda (exemplo fictício).",
    },
    plan: {
      day: -9,
      goals: "Recuperar a elevação do braço sem dor (exemplo fictício).",
      conduct: "Exercícios isométricos evoluindo para isotônicos (exemplo fictício).",
      exercises: "Rotação externa com elástico, elevação no plano da escápula (exemplo fictício).",
      plannedSessions: 8,
      frequency: "2x por semana",
    },
    appointments: [
      {
        day: -3,
        hour: 10,
        attendance: "COMPARECEU",
        session: {
          evolution: "Tolerou bem os isométricos; dor 4/10 (exemplo fictício).",
          techniques: "Terapia manual glenoumeral (exemplo fictício).",
          exercises: "Isométricos de rotação 5x30 s (exemplo fictício).",
        },
      },
      { day: 2, hour: 10 },
    ],
  },
  {
    key: "P3",
    fullName: "Carla Fictícia Demonstração",
    age: 27,
    sex: "FEMININO",
    occupation: null,
    phone: "11900000003",
    anamnesis: {
      day: -5,
      chiefComplaint: "Entorse de tornozelo direito em jogo de vôlei (exemplo fictício).",
      currentIllnessHistory: "Entorse em inversão há uma semana (exemplo fictício).",
      painIntensity: 4,
      painLocation: "Tornozelo direito, região lateral",
      patientGoals: "Voltar ao vôlei com segurança (exemplo fictício).",
    },
    appointments: [
      { day: -4, hour: 11, attendance: "FALTA_AVISADA" },
      { day: 1, hour: 11 },
    ],
  },
  {
    key: "P4",
    fullName: "Diego Fictício Demonstração",
    age: 41,
    sex: "NAO_INFORMADO",
    occupation: null,
    phone: "11900000004",
    appointments: [
      { day: 4, hour: 14 },
      { day: 5, hour: 14, cancelled: "Cancelamento de exemplo (conjunto fictício)." },
    ],
  },
];

export const ENTITY_LABELS = {
  patients: "Pacientes",
  appointments: "Agendamentos",
  anamneses: "Anamneses",
  assessments: "Avaliações",
  therapyPlans: "Planos terapêuticos",
  planRevisions: "Revisões de plano",
  treatmentSessions: "Atendimentos (sessões)",
  reassessments: "Reavaliações",
} as const;

export type EntityCounts = Record<keyof typeof ENTITY_LABELS, number>;

export const ENTITY_KEYS = Object.keys(ENTITY_LABELS) as (keyof EntityCounts)[];

// Quantidades previstas, derivadas do próprio catálogo (fonte única para o resumo e as conferências).
export function expectedCounts(patients: readonly PatientSpec[] = PATIENTS): EntityCounts {
  const count = (fn: (p: PatientSpec) => number) => patients.reduce((sum, p) => sum + fn(p), 0);
  return {
    patients: patients.length,
    appointments: count((p) => p.appointments.length),
    anamneses: count((p) => (p.anamnesis ? 1 : 0)),
    assessments: count((p) => (p.assessment ? 1 : 0)),
    therapyPlans: count((p) => (p.plan ? 1 : 0)),
    planRevisions: count((p) => (p.plan ? 1 : 0)),
    treatmentSessions: count((p) => p.appointments.filter((a) => a.session).length),
    reassessments: count((p) => (p.reassessment ? 1 : 0)),
  };
}

// Consistência interna do catálogo (testada): cronologia e regras clínicas que o gerador assume.
export function catalogProblems(patients: readonly PatientSpec[] = PATIENTS): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const p of patients) {
    if (keys.has(p.key)) problems.push(`${p.key}: chave repetida.`);
    keys.add(p.key);
    if (p.age < 18) problems.push(`${p.key}: menor de idade exigiria responsável legal.`);
    if (p.assessment && !p.anamnesis) problems.push(`${p.key}: avaliação sem anamnese.`);
    if (p.assessment && p.anamnesis && p.assessment.day < p.anamnesis.day) problems.push(`${p.key}: avaliação antes da anamnese.`);
    if (p.plan && !p.assessment) problems.push(`${p.key}: plano sem avaliação.`);
    if (p.plan && p.assessment && p.plan.day < p.assessment.day) problems.push(`${p.key}: plano antes da avaliação.`);
    if (p.reassessment && !p.plan) problems.push(`${p.key}: reavaliação sem plano.`);
    if (p.reassessment && p.plan && p.reassessment.day < p.plan.day) problems.push(`${p.key}: reavaliação antes do plano.`);
    for (const day of [p.anamnesis?.day, p.assessment?.day, p.plan?.day, p.reassessment?.day]) {
      if (day !== undefined && day > 0) problems.push(`${p.key}: registro clínico com data futura.`);
    }
    for (const a of p.appointments) {
      if (a.attendance && a.day >= 0) problems.push(`${p.key}: presença em agendamento que ainda não começou.`);
      if (a.session && a.attendance !== "COMPARECEU") problems.push(`${p.key}: atendimento sem comparecimento.`);
      if (a.session && (!p.plan || a.day < p.plan.day)) problems.push(`${p.key}: atendimento sem plano vigente.`);
      if (a.cancelled && a.attendance) problems.push(`${p.key}: cancelado com presença.`);
      if (!SLOT_HOURS.includes(a.hour as (typeof SLOT_HOURS)[number])) problems.push(`${p.key}: hora fora da grade.`);
    }
  }
  return problems;
}
