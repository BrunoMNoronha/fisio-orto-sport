
-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('ATIVA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'ATIVA',
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "replacesChargeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" TEXT,
    "cancelReason" VARCHAR(500),

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Charge_idempotencyKey_key" ON "Charge"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_replacesChargeId_key" ON "Charge"("replacesChargeId");

-- CreateIndex
CREATE INDEX "Charge_dueDate_createdAt_id_idx" ON "Charge"("dueDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Charge_patientId_dueDate_createdAt_id_idx" ON "Charge"("patientId", "dueDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Charge_status_dueDate_createdAt_id_idx" ON "Charge"("status", "dueDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Charge_createdById_idx" ON "Charge"("createdById");

-- CreateIndex
CREATE INDEX "Charge_cancelledById_idx" ON "Charge"("cancelledById");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_replacesChargeId_fkey" FOREIGN KEY ("replacesChargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Regras acrescentadas manualmente (o Prisma não modela CHECKs nem triggers).
-- Valor exato em centavos, sempre positivo.
ALTER TABLE "Charge"
  ADD CONSTRAINT "Charge_amount_positive" CHECK ("amountCents" > 0);

ALTER TABLE "Charge"
  ADD CONSTRAINT "Charge_description_not_blank" CHECK (length(btrim("description")) > 0);

-- Cancelamento: data, autor e motivo vêm juntos, e só na cobrança CANCELADA.
ALTER TABLE "Charge"
  ADD CONSTRAINT "Charge_cancellation_consistent" CHECK (
    ("status" = 'ATIVA' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancelReason" IS NULL)
    OR ("status" = 'CANCELADA' AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL
        AND "cancelReason" IS NOT NULL AND length(btrim("cancelReason")) > 0)
  );

ALTER TABLE "Charge"
  ADD CONSTRAINT "Charge_not_self_replacement" CHECK ("replacesChargeId" IS NULL OR "replacesChargeId" <> "id");

-- Imutabilidade: sem exclusão física; a única alteração aceita é cancelar uma cobrança ATIVA uma
-- vez, preenchendo os campos do cancelamento. Corrigir valor, paciente, descrição ou vencimento é
-- cancelar e lançar a substituta. TRUNCATE não é barrado aqui: é a reinicialização manual
-- (`pnpm db:reset`), com confirmação e autorização registradas (ver manutencao/README.md).
CREATE FUNCTION "Charge_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Charge: cobranças não podem ser excluídas' USING ERRCODE = '23001';
  END IF;
  IF OLD."status" <> 'ATIVA' OR NEW."status" <> 'CANCELADA'
     OR ROW(NEW."id", NEW."patientId", NEW."description", NEW."amountCents", NEW."dueDate",
            NEW."idempotencyKey", NEW."replacesChargeId", NEW."createdById", NEW."createdAt")
        IS DISTINCT FROM
        ROW(OLD."id", OLD."patientId", OLD."description", OLD."amountCents", OLD."dueDate",
            OLD."idempotencyKey", OLD."replacesChargeId", OLD."createdById", OLD."createdAt") THEN
    RAISE EXCEPTION 'Charge: cobrança é imutável; só é possível cancelar uma cobrança ativa' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Charge_immutable"
  BEFORE UPDATE OR DELETE ON "Charge"
  FOR EACH ROW EXECUTE FUNCTION "Charge_guard"();

-- A substituta só pode apontar para uma cobrança já cancelada (o serviço cancela a original e lança
-- a substituta na mesma transação).
CREATE FUNCTION "Charge_replacement_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."replacesChargeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Charge" WHERE "id" = NEW."replacesChargeId" AND "status" = 'CANCELADA'
  ) THEN
    RAISE EXCEPTION 'Charge: a cobrança substituída precisa estar cancelada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Charge_replacement_cancelled"
  BEFORE INSERT ON "Charge"
  FOR EACH ROW EXECUTE FUNCTION "Charge_replacement_guard"();
