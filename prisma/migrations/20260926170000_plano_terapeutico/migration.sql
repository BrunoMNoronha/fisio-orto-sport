-- CreateEnum
CREATE TYPE "TherapyPlanStatus" AS ENUM ('ATIVO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "TherapyPlanRevisionKind" AS ENUM ('INICIAL', 'CORRECAO', 'MUDANCA_CLINICA');

-- CreateTable
CREATE TABLE "TherapyPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "assessmentVersion" INTEGER NOT NULL,
    "status" "TherapyPlanStatus" NOT NULL DEFAULT 'ATIVO',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyPlanRevision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "TherapyPlanRevisionKind" NOT NULL,
    "reason" VARCHAR(500),
    "planDate" DATE NOT NULL,
    "goals" VARCHAR(2000) NOT NULL,
    "conduct" VARCHAR(4000) NOT NULL,
    "techniques" VARCHAR(4000),
    "exercises" VARCHAR(4000),
    "plannedSessions" SMALLINT,
    "frequency" VARCHAR(200),
    "reassessment" VARCHAR(500),
    "notes" VARCHAR(4000),
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapyPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyPlanStatusChange" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "fromStatus" "TherapyPlanStatus" NOT NULL,
    "toStatus" "TherapyPlanStatus" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapyPlanStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapyPlan_patientId_createdAt_id_idx" ON "TherapyPlan"("patientId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "TherapyPlan_assessmentId_patientId_idx" ON "TherapyPlan"("assessmentId", "patientId");

-- CreateIndex
CREATE INDEX "TherapyPlan_authorId_idx" ON "TherapyPlan"("authorId");

-- CreateIndex
CREATE INDEX "TherapyPlanRevision_authorId_idx" ON "TherapyPlanRevision"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapyPlanRevision_planId_number_key" ON "TherapyPlanRevision"("planId", "number");

-- CreateIndex
CREATE INDEX "TherapyPlanStatusChange_planId_createdAt_idx" ON "TherapyPlanStatusChange"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "TherapyPlanStatusChange_authorId_idx" ON "TherapyPlanStatusChange"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_id_patientId_key" ON "Assessment"("id", "patientId");

-- AddForeignKey
ALTER TABLE "TherapyPlan" ADD CONSTRAINT "TherapyPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlan" ADD CONSTRAINT "TherapyPlan_assessmentId_patientId_fkey" FOREIGN KEY ("assessmentId", "patientId") REFERENCES "Assessment"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlan" ADD CONSTRAINT "TherapyPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlanRevision" ADD CONSTRAINT "TherapyPlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TherapyPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlanRevision" ADD CONSTRAINT "TherapyPlanRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlanStatusChange" ADD CONSTRAINT "TherapyPlanStatusChange_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TherapyPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapyPlanStatusChange" ADD CONSTRAINT "TherapyPlanStatusChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras de integridade do plano (acrescentadas manualmente; o Prisma não modela CHECKs).
ALTER TABLE "TherapyPlan"
  ADD CONSTRAINT "TherapyPlan_assessmentVersion_positive" CHECK ("assessmentVersion" >= 1),
  ADD CONSTRAINT "TherapyPlan_currentRevision_positive" CHECK ("currentRevision" >= 1),
  ADD CONSTRAINT "TherapyPlan_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> '');

-- A primeira revisão é INICIAL e sem motivo; as seguintes são correção ou mudança clínica, com motivo.
ALTER TABLE "TherapyPlanRevision"
  ADD CONSTRAINT "TherapyPlanRevision_number_positive" CHECK ("number" >= 1),
  ADD CONSTRAINT "TherapyPlanRevision_kind_matches_number" CHECK (
    ("number" = 1 AND "kind" = 'INICIAL' AND "reason" IS NULL)
    OR ("number" > 1 AND "kind" <> 'INICIAL' AND "reason" IS NOT NULL AND btrim("reason") <> '')
  ),
  ADD CONSTRAINT "TherapyPlanRevision_goals_not_blank" CHECK (btrim("goals") <> ''),
  ADD CONSTRAINT "TherapyPlanRevision_conduct_not_blank" CHECK (btrim("conduct") <> ''),
  ADD CONSTRAINT "TherapyPlanRevision_plannedSessions_range" CHECK ("plannedSessions" IS NULL OR "plannedSessions" BETWEEN 1 AND 100),
  ADD CONSTRAINT "TherapyPlanRevision_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> '');

ALTER TABLE "TherapyPlanStatusChange"
  ADD CONSTRAINT "TherapyPlanStatusChange_changes_status" CHECK ("fromStatus" <> "toStatus"),
  ADD CONSTRAINT "TherapyPlanStatusChange_reason_not_blank" CHECK (btrim("reason") <> ''),
  ADD CONSTRAINT "TherapyPlanStatusChange_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> '');
