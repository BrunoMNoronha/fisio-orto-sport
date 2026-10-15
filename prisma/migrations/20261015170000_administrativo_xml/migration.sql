-- AlterTable
ALTER TABLE "BillingGuide" ADD COLUMN     "newbornCode" CHAR(1),
ADD COLUMN     "requesterProviderCode" VARCHAR(14),
ADD COLUMN     "requesterProviderName" VARCHAR(70);

-- AlterTable
ALTER TABLE "BatchArtifact" ADD COLUMN     "generatorVersion" VARCHAR(40) NOT NULL DEFAULT 'legacy',
ADD COLUMN     "purpose" VARCHAR(12) NOT NULL DEFAULT 'LEGADO',
ADD COLUMN     "validationMetadata" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "TissProfile" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TissProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TissProfile_requestId_key" ON "TissProfile"("requestId");

-- CreateIndex
CREATE INDEX "TissProfile_actorId_idx" ON "TissProfile"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "TissProfile_contractId_version_key" ON "TissProfile"("contractId", "version");

-- AddForeignKey
ALTER TABLE "TissProfile" ADD CONSTRAINT "TissProfile_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TissProfile" ADD CONSTRAINT "TissProfile_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingGuide" ADD CHECK("newbornCode" IS NULL OR "newbornCode" IN ('S','N'));
ALTER TABLE "BatchArtifact" ADD CHECK(purpose IN ('LEGADO','HOMOLOGACAO','PRODUCAO'));
ALTER TABLE "TissProfile" ADD CHECK(version>0 AND length(btrim(reason))>0 AND fingerprint ~ '^[0-9a-f]{64}$');
CREATE TRIGGER "TissProfile_immutable" BEFORE UPDATE OR DELETE ON "TissProfile" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE FUNCTION batch_send_production_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "BatchArtifact" WHERE id=NEW."artifactId" AND purpose='PRODUCAO') THEN RAISE EXCEPTION 'Arquivo de homologação/legado não constitui envio de produção' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BatchSend_production_artifact" BEFORE INSERT ON "BatchSend" FOR EACH ROW EXECUTE FUNCTION batch_send_production_artifact();
