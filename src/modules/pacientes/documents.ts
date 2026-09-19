import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";

// Documentos para impressão (termo, cartão de frequência, anamnese). Gerados na hora a partir
// do cadastro: nada é gravado no servidor.

export type AttendingPhysio = { name: string; crefito: string | null };

const PHYSIO_SELECT = { name: true, crefito: true } as const;

// Fisioterapeuta que atendeu o paciente, para o termo de consentimento:
// 1) profissional do agendamento não cancelado mais recente já iniciado;
// 2) senão, autor da anamnese vigente (só para quem tem `clinico:ler`);
// 3) senão, null (o termo sai com o campo em branco).
export async function getAttendingPhysio(patientId: string, now = new Date()): Promise<AttendingPhysio | null> {
  const actor = await requirePermission("pacientes:ler");
  if (!patientId || patientId.length > 64) return null;

  const appointment = await prisma.appointment.findFirst({
    where: { patientId, status: "AGENDADO", startsAt: { lt: now } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    select: { professional: { select: PHYSIO_SELECT } },
  });
  if (appointment) return appointment.professional;

  if (!can(actor.role, "clinico:ler")) return null;
  return getAnamnesisAuthor(patientId);
}

// Autor da anamnese vigente (mesma ordem de `getCurrentAnamnesis`), com o CREFITO atual.
export async function getAnamnesisAuthor(patientId: string): Promise<AttendingPhysio | null> {
  await requirePermission("clinico:ler");
  if (!patientId || patientId.length > 64) return null;
  const anamnesis = await prisma.anamnesis.findFirst({
    where: { patientId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { author: { select: PHYSIO_SELECT } },
  });
  return anamnesis?.author ?? null;
}

// Texto do Termo de Ciência e Consentimento (versão impressa em uso na clínica).
export const TERMO_SECTIONS: readonly { title: string; paragraphs: readonly string[] }[] = [
  {
    title: "Objeto",
    paragraphs: [
      "O presente Termo tem por finalidade registrar que o paciente recebeu todas as informações necessárias acerca do tratamento fisioterapêutico proposto e manifesta seu consentimento livre e esclarecido para sua realização.",
    ],
  },
  {
    title: "Do tratamento",
    paragraphs: [
      "Declaro que fui submetido(a) à avaliação fisioterapêutica e recebi esclarecimentos sobre o diagnóstico fisioterapêutico, objetivos do tratamento, benefícios esperados, possíveis desconfortos, limitações, necessidade de reavaliações e possibilidade de alteração do plano terapêutico conforme minha evolução clínica. Estou ciente de que não há garantia de resultados ou prazo determinado para recuperação.",
    ],
  },
  {
    title: "Dos recursos terapêuticos",
    paragraphs: [
      "Poderão ser utilizados, quando indicados: terapia manual, cinesioterapia, exercícios terapêuticos, fortalecimento muscular, alongamentos, treino funcional, propriocepção, liberação miofascial, bandagem funcional, dry needling, laser terapêutico, ultrassom terapêutico, TENS/FES, tecarterapia e outros recursos compatíveis com minha condição clínica.",
    ],
  },
  {
    title: "Das sessões",
    paragraphs: [
      "As sessões terão duração aproximada de 50 minutos. A frequência e a quantidade de sessões serão definidas pelo fisioterapeuta responsável e poderão ser modificadas conforme a evolução clínica.",
      "Para o pacote de 10 (dez) sessões, o paciente terá o prazo de 1 (um) mês, contado a partir da primeira sessão, para finalizar todas as 10 (dez) sessões contratadas.",
    ],
  },
  {
    title: "Dos agendamentos",
    paragraphs: [
      "Cancelamentos ou remarcações deverão ser comunicados com antecedência mínima de 24 horas. Em caso de atraso, o tempo da sessão poderá ser reduzido. A clínica poderá aplicar sua política de faltas quando houver ausência sem aviso prévio.",
    ],
  },
  {
    title: "Dos deveres do paciente",
    paragraphs: [
      "Comprometo-me a comparecer às sessões, seguir as orientações e exercícios prescritos, informar alterações no meu estado de saúde e comunicar o uso de novos medicamentos ou procedimentos.",
    ],
  },
  {
    title: "Da privacidade",
    paragraphs: [
      "Meus dados serão tratados com confidencialidade, em conformidade com a Lei Geral de Proteção de Dados (LGPD) e o Código de Ética da Fisioterapia.",
    ],
  },
  {
    title: "Uso de imagem",
    paragraphs: [
      "(   ) AUTORIZO    (   ) NÃO AUTORIZO o uso de fotografias e vídeos para fins científicos e institucionais da clínica, preservando minha identidade quando cabível.",
    ],
  },
  {
    title: "Consentimento",
    paragraphs: [
      "Declaro que todas as minhas dúvidas foram esclarecidas, recebi informações suficientes sobre o tratamento e concordo, de forma livre e esclarecida, com sua realização.",
    ],
  },
];
