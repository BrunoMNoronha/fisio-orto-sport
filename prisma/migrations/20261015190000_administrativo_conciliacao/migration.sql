BEGIN;
-- CreateTable
CREATE TABLE "OperatorReceivable" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "billedOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorSettlement" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "reversesId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorSettlementLine" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "glosaRootId" TEXT,
    "code" VARCHAR(40) NOT NULL DEFAULT '',
    "reversalPart" BOOLEAN NOT NULL DEFAULT false,
    "receivedDelta" BIGINT NOT NULL DEFAULT 0,
    "analysisDelta" BIGINT NOT NULL DEFAULT 0,
    "writtenOffDelta" BIGINT NOT NULL DEFAULT 0,
    "billedDelta" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "OperatorSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorReceivable_productionId_key" ON "OperatorReceivable"("productionId");

-- CreateIndex
CREATE INDEX "OperatorReceivable_contractId_billedOn_id_idx" ON "OperatorReceivable"("contractId", "billedOn", "id");

-- CreateIndex
CREATE INDEX "OperatorReceivable_batchId_idx" ON "OperatorReceivable"("batchId");

-- CreateIndex
CREATE INDEX "OperatorReceivable_guideId_idx" ON "OperatorReceivable"("guideId");

-- CreateIndex
CREATE INDEX "OperatorReceivable_sendId_idx" ON "OperatorReceivable"("sendId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSettlement_requestId_key" ON "OperatorSettlement"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSettlement_reversesId_key" ON "OperatorSettlement"("reversesId");

-- CreateIndex
CREATE INDEX "OperatorSettlement_contractId_effectiveOn_id_idx" ON "OperatorSettlement"("contractId", "effectiveOn", "id");

-- CreateIndex
CREATE INDEX "OperatorSettlement_actorId_idx" ON "OperatorSettlement"("actorId");

-- CreateIndex
CREATE INDEX "OperatorSettlementLine_settlementId_idx" ON "OperatorSettlementLine"("settlementId");

-- CreateIndex
CREATE INDEX "OperatorSettlementLine_receivableId_idx" ON "OperatorSettlementLine"("receivableId");

-- CreateIndex
CREATE INDEX "OperatorSettlementLine_glosaRootId_idx" ON "OperatorSettlementLine"("glosaRootId");

-- AddForeignKey
ALTER TABLE "OperatorReceivable" ADD CONSTRAINT "OperatorReceivable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorReceivable" ADD CONSTRAINT "OperatorReceivable_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BillingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorReceivable" ADD CONSTRAINT "OperatorReceivable_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "BillingGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorReceivable" ADD CONSTRAINT "OperatorReceivable_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorReceivable" ADD CONSTRAINT "OperatorReceivable_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "BatchSend"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlement" ADD CONSTRAINT "OperatorSettlement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlement" ADD CONSTRAINT "OperatorSettlement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlement" ADD CONSTRAINT "OperatorSettlement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "OperatorSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlementLine" ADD CONSTRAINT "OperatorSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "OperatorSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlementLine" ADD CONSTRAINT "OperatorSettlementLine_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "OperatorReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorSettlementLine" ADD CONSTRAINT "OperatorSettlementLine_glosaRootId_fkey" FOREIGN KEY ("glosaRootId") REFERENCES "OperatorSettlementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperatorReceivable" ADD CHECK("amountCents">0 AND id="productionId");
ALTER TABLE "OperatorSettlement" ADD CHECK(kind IN ('RECEBER','SUBSTITUIR','ESTORNAR','GLOSAR','LIBERAR','DEFINIR','REABRIR','AJUSTAR') AND "amountCents"<>0 AND (kind='AJUSTAR' OR "amountCents">0) AND length(btrim(reference))>0 AND length(btrim(reason))>0 AND fingerprint ~ '^[0-9a-f]{64}$' AND "effectiveOn">='2000-01-01' AND "effectiveOn"<='2100-12-31');

CREATE FUNCTION operator_receivable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "BatchSend" s JOIN "BillingBatch" b ON b.id=s."batchId",
 jsonb_array_elements(b.snapshot->'guides') g,jsonb_array_elements(g->'items') i
 WHERE s.id=NEW."sendId" AND s."correctsId" IS NULL AND b.id=NEW."batchId" AND b."contractId"=NEW."contractId"
 AND g->>'guideId'=NEW."guideId" AND i->>'id'=NEW."productionId" AND (i->'snapshot'->>'totalCents')::bigint=NEW."amountCents" AND s."sentOn"=NEW."billedOn") THEN
 RAISE EXCEPTION 'Obrigação exige item congelado do primeiro envio' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OperatorReceivable_guard" BEFORE INSERT ON "OperatorReceivable" FOR EACH ROW EXECUTE FUNCTION operator_receivable_guard();

-- Backfill apenas de obrigações efetivamente enviadas, sem pagamentos ou dívidas de pacientes.
INSERT INTO "OperatorReceivable"(id,"contractId","batchId","guideId","productionId","sendId","amountCents","billedOn")
SELECT i->>'id',b."contractId",b.id,g->>'guideId',i->>'id',s.id,(i->'snapshot'->>'totalCents')::bigint,s."sentOn"
FROM "BatchSend" s JOIN "BillingBatch" b ON b.id=s."batchId",
jsonb_array_elements(b.snapshot->'guides') g,jsonb_array_elements(g->'items') i WHERE s."correctsId" IS NULL;

CREATE FUNCTION operator_receivables_on_send() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."correctsId" IS NULL THEN
 INSERT INTO "OperatorReceivable"(id,"contractId","batchId","guideId","productionId","sendId","amountCents","billedOn")
 SELECT i->>'id',b."contractId",b.id,g->>'guideId',i->>'id',NEW.id,(i->'snapshot'->>'totalCents')::bigint,NEW."sentOn"
 FROM "BillingBatch" b,jsonb_array_elements(b.snapshot->'guides') g,jsonb_array_elements(g->'items') i WHERE b.id=NEW."batchId";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BatchSend_receivables" AFTER INSERT ON "BatchSend" FOR EACH ROW EXECUTE FUNCTION operator_receivables_on_send();

CREATE FUNCTION operator_settlement_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "OperatorSettlement";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:conciliacao:'||NEW."contractId",0));
 IF NEW."effectiveOn">(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Data efetiva futura' USING ERRCODE='23514'; END IF;
 IF NEW.kind IN ('ESTORNAR','SUBSTITUIR') THEN
 SELECT * INTO original FROM "OperatorSettlement" WHERE id=NEW."reversesId";
 IF original.id IS NULL OR original.kind NOT IN ('RECEBER','SUBSTITUIR') OR original."contractId"<>NEW."contractId" OR NEW."effectiveOn"<original."effectiveOn" OR (NEW.kind='ESTORNAR' AND NEW."amountCents"<>original."amountCents") THEN RAISE EXCEPTION 'Estorno exige recebimento correspondente e data compatível' USING ERRCODE='23514'; END IF;
 ELSIF NEW."reversesId" IS NOT NULL THEN RAISE EXCEPTION 'Vínculo de estorno incompatível' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OperatorSettlement_lock" BEFORE INSERT ON "OperatorSettlement" FOR EACH ROW EXECUTE FUNCTION operator_settlement_lock();

CREATE FUNCTION operator_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "OperatorSettlement"; r "OperatorReceivable"; origin "OperatorSettlementLine"; origin_event "OperatorSettlement"; valid boolean=false;
BEGIN
 SELECT * INTO e FROM "OperatorSettlement" WHERE id=NEW."settlementId";
 IF NOT EXISTS(SELECT 1 FROM "OperatorSettlement" WHERE id=NEW."settlementId" AND xmin::text=(txid_current()%4294967296)::text) THEN RAISE EXCEPTION 'Movimento confirmado não admite novas linhas' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:conciliacao:'||e."contractId",0));
 SELECT * INTO r FROM "OperatorReceivable" WHERE id=NEW."receivableId" FOR UPDATE;
 IF r.id IS NULL OR e."contractId"<>r."contractId" OR e."effectiveOn"<r."billedOn" THEN RAISE EXCEPTION 'Alocação exige obrigação do contrato e data posterior ao envio' USING ERRCODE='23514'; END IF;
 IF NEW."glosaRootId" IS NOT NULL THEN
 SELECT * INTO origin FROM "OperatorSettlementLine" WHERE id=NEW."glosaRootId";
 SELECT * INTO origin_event FROM "OperatorSettlement" WHERE id=origin."settlementId";
 IF origin.id IS NULL OR origin."receivableId"<>r.id OR origin_event.kind<>'GLOSAR' OR origin."glosaRootId" IS NOT NULL OR NEW."glosaRootId"=NEW.id OR e."effectiveOn"<origin_event."effectiveOn" THEN RAISE EXCEPTION 'Revisão exige glosa original do item e data compatível' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."reversalPart" THEN
 valid=e.kind IN ('ESTORNAR','SUBSTITUIR'); -- inversão exata conferida no commit
 ELSIF e.kind IN ('RECEBER','SUBSTITUIR') THEN valid=NEW."receivedDelta">0 AND NEW."analysisDelta"=CASE WHEN NEW."glosaRootId" IS NULL THEN 0 ELSE -NEW."receivedDelta" END AND NEW."writtenOffDelta"=0 AND NEW."billedDelta"=0 AND NEW.code='';
 ELSIF e.kind='GLOSAR' THEN valid=NEW."receivedDelta"=0 AND NEW."analysisDelta">0 AND NEW."writtenOffDelta"=0 AND NEW."billedDelta"=0 AND NEW."glosaRootId" IS NULL AND length(btrim(NEW.code))>0;
 ELSIF e.kind='LIBERAR' THEN valid=NEW."receivedDelta"=0 AND NEW."analysisDelta"<0 AND NEW."writtenOffDelta"=0 AND NEW."billedDelta"=0 AND NEW."glosaRootId" IS NOT NULL AND NEW.code='';
 ELSIF e.kind='DEFINIR' THEN valid=NEW."receivedDelta"=0 AND NEW."analysisDelta"<0 AND NEW."writtenOffDelta"=-NEW."analysisDelta" AND NEW."billedDelta"=0 AND NEW."glosaRootId" IS NOT NULL AND NEW.code='';
 ELSIF e.kind='REABRIR' THEN valid=NEW."receivedDelta"=0 AND NEW."writtenOffDelta"<0 AND NEW."analysisDelta"=-NEW."writtenOffDelta" AND NEW."billedDelta"=0 AND NEW."glosaRootId" IS NOT NULL AND NEW.code='';
 ELSIF e.kind='AJUSTAR' THEN valid=NEW."receivedDelta"=0 AND NEW."analysisDelta"=0 AND NEW."writtenOffDelta"=0 AND NEW."billedDelta"<>0 AND NEW."glosaRootId" IS NULL AND NEW.code='';
 END IF;
 IF NOT coalesce(valid,false) THEN RAISE EXCEPTION 'Movimento incompatível com operação' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "OperatorSettlementLine_guard" BEFORE INSERT ON "OperatorSettlementLine" FOR EACH ROW EXECUTE FUNCTION operator_line_guard();

CREATE FUNCTION operator_settlement_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid text; e "OperatorSettlement"; actual jsonb; expected jsonb; total numeric;
BEGIN
 IF TG_TABLE_NAME='OperatorSettlement' THEN eid=NEW.id; ELSE eid=NEW."settlementId"; END IF;
 SELECT * INTO e FROM "OperatorSettlement" WHERE id=eid;
 IF NOT EXISTS(SELECT 1 FROM "OperatorSettlementLine" WHERE "settlementId"=eid) THEN RAISE EXCEPTION 'Movimento sem alocações' USING ERRCODE='23514'; END IF;
 IF e.kind IN ('ESTORNAR','SUBSTITUIR') THEN
 SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') INTO expected FROM (SELECT jsonb_build_array("receivableId","glosaRootId",code,-"receivedDelta"::numeric,-"analysisDelta"::numeric,-"writtenOffDelta"::numeric,-"billedDelta"::numeric) x FROM "OperatorSettlementLine" WHERE "settlementId"=e."reversesId" AND NOT "reversalPart") q;
 SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') INTO actual FROM (SELECT jsonb_build_array("receivableId","glosaRootId",code,"receivedDelta","analysisDelta","writtenOffDelta","billedDelta") x FROM "OperatorSettlementLine" WHERE "settlementId"=eid AND "reversalPart") q;
 IF actual<>expected THEN RAISE EXCEPTION 'Estorno deve inverter exatamente as alocações originais' USING ERRCODE='23514'; END IF;
 END IF;
 IF e.kind<>'ESTORNAR' THEN
 SELECT sum(CASE WHEN e.kind IN ('RECEBER','SUBSTITUIR') THEN "receivedDelta"::numeric WHEN e.kind='GLOSAR' THEN "analysisDelta"::numeric WHEN e.kind='AJUSTAR' THEN "billedDelta"::numeric ELSE abs("analysisDelta"::numeric) END) INTO total FROM "OperatorSettlementLine" WHERE "settlementId"=eid AND NOT "reversalPart";
 IF total IS DISTINCT FROM e."amountCents"::numeric THEN RAISE EXCEPTION 'Valor deve ser 100 por cento alocado, sem crédito excedente' USING ERRCODE='23514'; END IF;
 ELSIF EXISTS(SELECT 1 FROM "OperatorSettlementLine" WHERE "settlementId"=eid AND NOT "reversalPart") THEN RAISE EXCEPTION 'Estorno não admite novas alocações' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "OperatorReceivable" r LEFT JOIN "OperatorSettlementLine" l ON l."receivableId"=r.id WHERE r.id IN (SELECT "receivableId" FROM "OperatorSettlementLine" WHERE "settlementId"=eid) GROUP BY r.id HAVING
 r."amountCents"::numeric+coalesce(sum(l."billedDelta"::numeric),0)<0 OR r."amountCents"::numeric+coalesce(sum(l."billedDelta"::numeric),0)>9223372036854775807 OR coalesce(sum(l."receivedDelta"::numeric),0)<0 OR coalesce(sum(l."analysisDelta"::numeric),0)<0 OR coalesce(sum(l."writtenOffDelta"::numeric),0)<0 OR
 r."amountCents"::numeric+coalesce(sum(l."billedDelta"::numeric),0)<coalesce(sum(l."receivedDelta"::numeric+l."analysisDelta"::numeric+l."writtenOffDelta"::numeric),0)) THEN RAISE EXCEPTION 'Saldo do item excedido ou classificação negativa' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM "OperatorSettlementLine" origin JOIN "OperatorSettlement" oe ON oe.id=origin."settlementId" LEFT JOIN "OperatorSettlementLine" l ON l."glosaRootId"=origin.id WHERE oe.kind='GLOSAR' AND origin."receivableId" IN(SELECT "receivableId" FROM "OperatorSettlementLine" WHERE "settlementId"=eid) GROUP BY origin.id HAVING
 origin."analysisDelta"::numeric+coalesce(sum(l."analysisDelta"::numeric),0)<0 OR coalesce(sum(l."writtenOffDelta"::numeric),0)<0 OR origin."analysisDelta"::numeric+coalesce(sum(l."analysisDelta"::numeric+l."writtenOffDelta"::numeric),0)>origin."analysisDelta"::numeric) THEN RAISE EXCEPTION 'Saldo da glosa excedido; revise a glosa correspondente' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "OperatorSettlement_balance" AFTER INSERT ON "OperatorSettlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION operator_settlement_reconcile();
-- Linhas só entram na transação que criou o cabeçalho (xmin); um gate por evento basta.
CREATE TRIGGER "OperatorReceivable_immutable" BEFORE UPDATE OR DELETE ON "OperatorReceivable" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "OperatorSettlement_immutable" BEFORE UPDATE OR DELETE ON "OperatorSettlement" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "OperatorSettlementLine_immutable" BEFORE UPDATE OR DELETE ON "OperatorSettlementLine" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
COMMIT;
