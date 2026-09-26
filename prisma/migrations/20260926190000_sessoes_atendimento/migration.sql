-- CreateEnum
CREATE TYPE "TreatmentSessionStatus" AS ENUM ('VALIDO', 'INVALIDADO');

-- CreateTable
CREATE TABLE "TreatmentSession" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planRevisionId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "professionalId" TEXT NOT NULL,
    "professionalNameSnapshot" VARCHAR(120) NOT NULL,
    "professionalCrefitoSnapshot" VARCHAR(20),
    "techniques" VARCHAR(4000),
    "exercises" VARCHAR(4000),
    "observations" VARCHAR(4000),
    "evolution" VARCHAR(4000) NOT NULL,
    "nextSteps" VARCHAR(2000),
    "status" "TreatmentSessionStatus" NOT NULL DEFAULT 'VALIDO',
    "invalidationReason" VARCHAR(500),
    "invalidatedAt" TIMESTAMPTZ(3),
    "invalidatedById" TEXT,
    "invalidatedByNameSnapshot" VARCHAR(120),
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentSessionChange" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "previousValue" VARCHAR(4000),
    "newValue" VARCHAR(4000),
    "reason" VARCHAR(500) NOT NULL,
    "editorId" TEXT NOT NULL,
    "editorNameSnapshot" VARCHAR(120) NOT NULL,
    "editorCrefitoSnapshot" VARCHAR(20),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentSessionChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentSession_idempotencyKey_key" ON "TreatmentSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TreatmentSession_patientId_occurredAt_createdAt_id_idx" ON "TreatmentSession"("patientId", "occurredAt" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "TreatmentSession_planId_status_idx" ON "TreatmentSession"("planId", "status");

-- CreateIndex
CREATE INDEX "TreatmentSession_planRevisionId_planId_idx" ON "TreatmentSession"("planRevisionId", "planId");

-- CreateIndex
CREATE INDEX "TreatmentSession_professionalId_idx" ON "TreatmentSession"("professionalId");

-- CreateIndex
CREATE INDEX "TreatmentSession_authorId_idx" ON "TreatmentSession"("authorId");

-- CreateIndex
CREATE INDEX "TreatmentSession_invalidatedById_idx" ON "TreatmentSession"("invalidatedById");

-- CreateIndex
CREATE INDEX "TreatmentSessionChange_editorId_idx" ON "TreatmentSessionChange"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentSessionChange_sessionId_version_field_key" ON "TreatmentSessionChange"("sessionId", "version", "field");

-- CreateIndex
CREATE UNIQUE INDEX "TherapyPlan_id_patientId_key" ON "TherapyPlan"("id", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapyPlanRevision_id_planId_key" ON "TherapyPlanRevision"("id", "planId");

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_planId_patientId_fkey" FOREIGN KEY ("planId", "patientId") REFERENCES "TherapyPlan"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_planRevisionId_planId_fkey" FOREIGN KEY ("planRevisionId", "planId") REFERENCES "TherapyPlanRevision"("id", "planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_invalidatedById_fkey" FOREIGN KEY ("invalidatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSessionChange" ADD CONSTRAINT "TreatmentSessionChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TreatmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSessionChange" ADD CONSTRAINT "TreatmentSessionChange_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras de integridade do atendimento (acrescentadas manualmente; o Prisma não modela CHECKs).
ALTER TABLE "TreatmentSession"
  ADD CONSTRAINT "TreatmentSession_evolution_not_blank" CHECK (btrim("evolution") <> ''),
  ADD CONSTRAINT "TreatmentSession_professionalNameSnapshot_not_blank" CHECK (btrim("professionalNameSnapshot") <> ''),
  ADD CONSTRAINT "TreatmentSession_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> ''),
  ADD CONSTRAINT "TreatmentSession_idempotencyKey_not_blank" CHECK (btrim("idempotencyKey") <> ''),
  ADD CONSTRAINT "TreatmentSession_version_positive" CHECK ("version" >= 1),
  -- VALIDO não tem dados de invalidação; INVALIDADO tem motivo, data e quem invalidou.
  ADD CONSTRAINT "TreatmentSession_invalidation_consistent" CHECK (
    ("status" = 'VALIDO' AND "invalidationReason" IS NULL AND "invalidatedAt" IS NULL AND "invalidatedById" IS NULL)
    OR ("status" = 'INVALIDADO' AND "invalidationReason" IS NOT NULL AND btrim("invalidationReason") <> ''
        AND "invalidatedAt" IS NOT NULL AND "invalidatedById" IS NOT NULL AND "invalidatedByNameSnapshot" IS NOT NULL)
  );

ALTER TABLE "TreatmentSessionChange"
  ADD CONSTRAINT "TreatmentSessionChange_version_after_first" CHECK ("version" >= 2),
  ADD CONSTRAINT "TreatmentSessionChange_reason_not_blank" CHECK (btrim("reason") <> ''),
  ADD CONSTRAINT "TreatmentSessionChange_editorNameSnapshot_not_blank" CHECK (btrim("editorNameSnapshot") <> '');
