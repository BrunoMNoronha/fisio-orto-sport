import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { CHARGE_DETAIL_SELECT } from "./queries";
import { PAGE_SIZE, isPlausibleId } from "./validation";

const LINKED_PAYMENT_SELECT = { id: true, amountCents: true, receivedOn: true } as const;

// Apenas dados administrativos do pagamento e nomes de autores. Nenhuma relação clínica.
export const PAYMENT_DETAIL_SELECT = {
  id: true,
  chargeId: true,
  amountCents: true,
  receivedOn: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  reversal: {
    select: { id: true, reason: true, reversedOn: true, createdAt: true, createdBy: { select: { name: true } } },
  },
  replaces: { select: LINKED_PAYMENT_SELECT },
  replacedBy: { select: LINKED_PAYMENT_SELECT },
} as const;

function summary(amountCents: number, receivedCents: number) {
  return {
    receivedCents,
    balanceCents: amountCents - receivedCents,
    settlement: receivedCents === 0 ? "Aberta" : receivedCents === amountCents ? "Quitada" : "Parcial",
  };
}

// Charge, total, saldo e histórico compartilham o snapshot, mesmo se um pagamento concorrente
// chegar entre consultas. A paginação nunca muda os totais da cobrança.
export async function getChargeFinancialDetail(id: string, requestedPage = 1) {
  await requirePermission("financeiro:ler");
  if (!isPlausibleId(id)) return null;
  const normalizedPage = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10_000 ? requestedPage : 1;
  return prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id }, select: CHARGE_DETAIL_SELECT });
    if (!charge) return null;
    // A transação usa uma única conexão pg; consultas concorrentes nessa conexão são obsoletas.
    const aggregate = await tx.payment.aggregate({ where: { chargeId: id, reversal: null }, _sum: { amountCents: true } });
    const total = await tx.payment.count({ where: { chargeId: id } });
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(normalizedPage, pageCount);
    const payments = await tx.payment.findMany({
      where: { chargeId: id },
      orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: PAYMENT_DETAIL_SELECT,
    });
    return { charge, ...summary(charge.amountCents, aggregate._sum.amountCents ?? 0), payments, total, page, pageCount };
  }, { isolationLevel: "RepeatableRead" });
}

// Formulários leem só a cobrança, saldo e, quando solicitado, o pagamento desta mesma cobrança.
export async function getPaymentFormContext(chargeId: string, paymentId?: string) {
  await requirePermission("financeiro:gerir");
  if (!isPlausibleId(chargeId) || (paymentId !== undefined && !isPlausibleId(paymentId))) return null;
  return prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, select: CHARGE_DETAIL_SELECT });
    if (!charge) return null;
    const payment = paymentId
      ? await tx.payment.findUnique({ where: { id: paymentId }, select: PAYMENT_DETAIL_SELECT })
      : null;
    if (paymentId && (!payment || payment.chargeId !== chargeId)) return null;
    const aggregate = await tx.payment.aggregate({ where: { chargeId, reversal: null }, _sum: { amountCents: true } });
    return { charge, ...summary(charge.amountCents, aggregate._sum.amountCents ?? 0), payment };
  }, { isolationLevel: "RepeatableRead" });
}

export type ChargeFinancialDetail = NonNullable<Awaited<ReturnType<typeof getChargeFinancialDetail>>>;
export type PaymentDetail = ChargeFinancialDetail["payments"][number];
