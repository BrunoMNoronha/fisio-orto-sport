-- CreateEnum
CREATE TYPE "ReassessmentGoalsStatus" AS ENUM ('ATINGIDOS', 'PARCIALMENTE_ATINGIDOS', 'NAO_ATINGIDOS');

-- CreateEnum
CREATE TYPE "ReassessmentConclusion" AS ENUM ('CONTINUIDADE', 'AJUSTE_PLANO', 'INDICACAO_ALTA');

-- AlterTable
ALTER TABLE "TherapyPlanRevision" ADD COLUMN     "reassessmentId" TEXT;

-- CreateTable
CREATE TABLE "Reassessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planRevisionId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "previousReassessmentId" TEXT,
    "referenceSnapshot" JSONB NOT NULL,
    "reassessmentDate" DATE NOT NULL,
    "inspection" VARCHAR(4000),
    "palpation" VARCHAR(4000),
    "functionalGait" VARCHAR(4000),
    "rangeOfMotion" VARCHAR(4000),
    "muscleStrength" VARCHAR(4000),
    "specialTests" VARCHAR(4000),
    "painLimitations" VARCHAR(4000),
    "progressSummary" VARCHAR(4000) NOT NULL,
    "goalsStatus" "ReassessmentGoalsStatus" NOT NULL,
    "goalsJustification" VARCHAR(2000) NOT NULL,
    "conclusion" "ReassessmentConclusion" NOT NULL,
    "conclusionSummary" VARCHAR(2000) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reassessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReassessmentChange" (
    "id" TEXT NOT NULL,
    "reassessmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "previousValue" VARCHAR(4000),
    "newValue" VARCHAR(4000),
    "reason" VARCHAR(500) NOT NULL,
    "editorId" TEXT NOT NULL,
    "editorNameSnapshot" VARCHAR(120) NOT NULL,
    "editorCrefitoSnapshot" VARCHAR(20),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReassessmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reassessment_patientId_reassessmentDate_createdAt_id_idx" ON "Reassessment"("patientId", "reassessmentDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Reassessment_planId_reassessmentDate_createdAt_idx" ON "Reassessment"("planId", "reassessmentDate" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Reassessment_planRevisionId_planId_idx" ON "Reassessment"("planRevisionId", "planId");

-- CreateIndex
CREATE INDEX "Reassessment_assessmentId_patientId_idx" ON "Reassessment"("assessmentId", "patientId");

-- CreateIndex
CREATE INDEX "Reassessment_previousReassessmentId_planId_idx" ON "Reassessment"("previousReassessmentId", "planId");

-- CreateIndex
CREATE INDEX "Reassessment_authorId_idx" ON "Reassessment"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Reassessment_id_planId_key" ON "Reassessment"("id", "planId");

-- CreateIndex
CREATE INDEX "ReassessmentChange_editorId_idx" ON "ReassessmentChange"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "ReassessmentChange_reassessmentId_version_field_key" ON "ReassessmentChange"("reassessmentId", "version", "field");

-- CreateIndex
CREATE UNIQUE INDEX "TherapyPlanRevision_reassessmentId_planId_key" ON "TherapyPlanRevision"("reassessmentId", "planId");

-- AddForeignKey
ALTER TABLE "TherapyPlanRevision" ADD CONSTRAINT "TherapyPlanRevision_reassessmentId_planId_fkey" FOREIGN KEY ("reassessmentId", "planId") REFERENCES "Reassessment"("id", "planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_planId_patientId_fkey" FOREIGN KEY ("planId", "patientId") REFERENCES "TherapyPlan"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_planRevisionId_planId_fkey" FOREIGN KEY ("planRevisionId", "planId") REFERENCES "TherapyPlanRevision"("id", "planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_assessmentId_patientId_fkey" FOREIGN KEY ("assessmentId", "patientId") REFERENCES "Assessment"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_previousReassessmentId_planId_fkey" FOREIGN KEY ("previousReassessmentId", "planId") REFERENCES "Reassessment"("id", "planId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reassessment" ADD CONSTRAINT "Reassessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReassessmentChange" ADD CONSTRAINT "ReassessmentChange_reassessmentId_fkey" FOREIGN KEY ("reassessmentId") REFERENCES "Reassessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReassessmentChange" ADD CONSTRAINT "ReassessmentChange_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras de integridade da reavaliação (acrescentadas manualmente; o Prisma não modela CHECKs).
ALTER TABLE "Reassessment"
  ADD CONSTRAINT "Reassessment_progressSummary_not_blank" CHECK (btrim("progressSummary") <> ''),
  ADD CONSTRAINT "Reassessment_goalsJustification_not_blank" CHECK (btrim("goalsJustification") <> ''),
  ADD CONSTRAINT "Reassessment_conclusionSummary_not_blank" CHECK (btrim("conclusionSummary") <> ''),
  ADD CONSTRAINT "Reassessment_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> ''),
  ADD CONSTRAINT "Reassessment_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "Reassessment_not_own_previous" CHECK ("previousReassessmentId" IS NULL OR "previousReassessmentId" <> "id");

ALTER TABLE "ReassessmentChange"
  ADD CONSTRAINT "ReassessmentChange_version_after_first" CHECK ("version" >= 2),
  ADD CONSTRAINT "ReassessmentChange_reason_not_blank" CHECK (btrim("reason") <> ''),
  ADD CONSTRAINT "ReassessmentChange_editorNameSnapshot_not_blank" CHECK (btrim("editorNameSnapshot") <> '');

-- Revisão motivada por reavaliação é sempre uma mudança clínica posterior à revisão inicial.
ALTER TABLE "TherapyPlanRevision"
  ADD CONSTRAINT "TherapyPlanRevision_reassessment_is_clinical_change" CHECK (
    "reassessmentId" IS NULL OR ("number" > 1 AND "kind" = 'MUDANCA_CLINICA')
  );
