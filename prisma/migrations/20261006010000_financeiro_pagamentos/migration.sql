-- FIN-02: migração aditiva. O histórico existente permanece intacto.
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "receivedOn" DATE NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "fingerprint" VARCHAR(67) NOT NULL,
  "replacesPaymentId" TEXT,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "Payment_received_on_range" CHECK ("receivedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT "Payment_key_format" CHECK ("idempotencyKey" ~ '^(RECEBIMENTO|CORRECAO):[A-Za-z0-9-]{8,64}$'),
  CONSTRAINT "Payment_fingerprint_format" CHECK ("fingerprint" ~ '^v1:[0-9a-f]{64}$'),
  CONSTRAINT "Payment_not_self_replacement" CHECK ("replacesPaymentId" IS NULL OR "replacesPaymentId" <> "id")
);

CREATE TABLE "PaymentReversal" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "reversedOn" DATE NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "fingerprint" VARCHAR(67) NOT NULL,
  CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReversal_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "PaymentReversal_reversed_on_range" CHECK ("reversedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT "PaymentReversal_key_format" CHECK ("idempotencyKey" ~ '^(ESTORNO|CORRECAO):[A-Za-z0-9-]{8,64}$'),
  CONSTRAINT "PaymentReversal_fingerprint_format" CHECK ("fingerprint" ~ '^v1:[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_replacesPaymentId_key" ON "Payment"("replacesPaymentId");
CREATE INDEX "Payment_chargeId_receivedOn_createdAt_id_idx" ON "Payment"("chargeId", "receivedOn" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");
CREATE UNIQUE INDEX "PaymentReversal_paymentId_key" ON "PaymentReversal"("paymentId");
CREATE UNIQUE INDEX "PaymentReversal_idempotencyKey_key" ON "PaymentReversal"("idempotencyKey");
CREATE INDEX "PaymentReversal_createdById_idx" ON "PaymentReversal"("createdById");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_replacesPaymentId_fkey" FOREIGN KEY ("replacesPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Só INSERT. TRUNCATE continua restrito à manutenção manual autorizada, como na FIN-01.
CREATE FUNCTION "Payment_immutable_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financeiro: pagamentos e estornos são imutáveis' USING ERRCODE = '23001';
END;
$$;
CREATE TRIGGER "Payment_immutable" BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "Payment_immutable_guard"();
CREATE TRIGGER "PaymentReversal_immutable" BEFORE UPDATE OR DELETE ON "PaymentReversal"
  FOR EACH ROW EXECUTE FUNCTION "Payment_immutable_guard"();

CREATE FUNCTION "Payment_insert_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  charge_status "ChargeStatus";
  charge_amount INTEGER;
  received BIGINT;
BEGIN
  -- Snapshot fixo não pode reler o saldo confirmado depois de aguardar outra transação.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Financeiro: operação exige READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  -- Trava primeiro; as leituras seguintes são comandos separados com snapshot novo.
  PERFORM 1 FROM "Charge" WHERE "id" = NEW."chargeId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financeiro: cobrança não encontrada' USING ERRCODE = '23503';
  END IF;
  SELECT "status", "amountCents" INTO charge_status, charge_amount FROM "Charge" WHERE "id" = NEW."chargeId";
  IF charge_status <> 'ATIVA' THEN
    RAISE EXCEPTION 'Financeiro: cobrança cancelada não recebe pagamento' USING ERRCODE = '23514';
  END IF;
  IF NEW."receivedOn" > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Financeiro: recebimento não pode ter data futura' USING ERRCODE = '23514';
  END IF;
  IF NEW."replacesPaymentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Payment" original
    JOIN "PaymentReversal" reversal ON reversal."paymentId" = original."id"
    WHERE original."id" = NEW."replacesPaymentId" AND original."chargeId" = NEW."chargeId"
  ) THEN
    RAISE EXCEPTION 'Financeiro: substituição exige original estornado da mesma cobrança' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(sum(payment."amountCents"), 0) INTO received FROM "Payment" payment
    WHERE payment."chargeId" = NEW."chargeId" AND NOT EXISTS (
      SELECT 1 FROM "PaymentReversal" reversal WHERE reversal."paymentId" = payment."id"
    );
  IF received + NEW."amountCents" > charge_amount THEN
    RAISE EXCEPTION 'Financeiro: pagamento excede o saldo da cobrança' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_insert_valid" BEFORE INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "Payment_insert_guard"();

CREATE FUNCTION "PaymentReversal_insert_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  charge_id TEXT;
  received_on DATE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Financeiro: operação exige READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  SELECT "chargeId" INTO charge_id FROM "Payment" WHERE "id" = NEW."paymentId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financeiro: pagamento não encontrado' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM "Charge" WHERE "id" = charge_id FOR UPDATE;
  SELECT "receivedOn" INTO received_on FROM "Payment" WHERE "id" = NEW."paymentId";
  IF NEW."reversedOn" < received_on OR NEW."reversedOn" > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Financeiro: estorno exige data entre recebimento e hoje' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PaymentReversal_insert_valid" BEFORE INSERT ON "PaymentReversal"
  FOR EACH ROW EXECUTE FUNCTION "PaymentReversal_insert_guard"();

-- Preserva a imutabilidade FIN-01 e acrescenta a barreira de pagamentos válidos no banco.
CREATE OR REPLACE FUNCTION "Charge_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Financeiro: operação exige READ COMMITTED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Payment" payment WHERE payment."chargeId" = OLD."id" AND NOT EXISTS (
      SELECT 1 FROM "PaymentReversal" reversal WHERE reversal."paymentId" = payment."id"
    )
  ) THEN
    RAISE EXCEPTION 'Financeiro: cobrança com pagamento válido não pode ser cancelada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
