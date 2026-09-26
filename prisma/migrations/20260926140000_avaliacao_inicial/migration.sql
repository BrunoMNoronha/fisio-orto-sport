-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "anamnesisId" TEXT NOT NULL,
    "assessmentDate" DATE NOT NULL,
    "inspection" VARCHAR(4000),
    "palpation" VARCHAR(4000),
    "functionalGait" VARCHAR(4000),
    "rangeOfMotion" VARCHAR(4000),
    "muscleStrength" VARCHAR(4000),
    "specialTests" VARCHAR(4000),
    "diagnosis" VARCHAR(2000) NOT NULL,
    "therapeuticGoals" VARCHAR(2000),
    "clinicalNotes" VARCHAR(4000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "authorCrefitoSnapshot" VARCHAR(20),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentChange" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "previousValue" VARCHAR(4000),
    "newValue" VARCHAR(4000),
    "editorId" TEXT NOT NULL,
    "editorNameSnapshot" VARCHAR(120) NOT NULL,
    "editorCrefitoSnapshot" VARCHAR(20),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_patientId_assessmentDate_createdAt_id_idx" ON "Assessment"("patientId", "assessmentDate" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Assessment_anamnesisId_patientId_idx" ON "Assessment"("anamnesisId", "patientId");

-- CreateIndex
CREATE INDEX "Assessment_authorId_idx" ON "Assessment"("authorId");

-- CreateIndex
CREATE INDEX "AssessmentChange_editorId_idx" ON "AssessmentChange"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentChange_assessmentId_version_field_key" ON "AssessmentChange"("assessmentId", "version", "field");

-- CreateIndex
CREATE UNIQUE INDEX "Anamnesis_id_patientId_key" ON "Anamnesis"("id", "patientId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_anamnesisId_patientId_fkey" FOREIGN KEY ("anamnesisId", "patientId") REFERENCES "Anamnesis"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentChange" ADD CONSTRAINT "AssessmentChange_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentChange" ADD CONSTRAINT "AssessmentChange_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras de integridade da avaliação (acrescentadas manualmente; o Prisma não modela CHECKs).
ALTER TABLE "Assessment"
  ADD CONSTRAINT "Assessment_diagnosis_not_blank" CHECK (btrim("diagnosis") <> ''),
  ADD CONSTRAINT "Assessment_authorNameSnapshot_not_blank" CHECK (btrim("authorNameSnapshot") <> ''),
  ADD CONSTRAINT "Assessment_version_positive" CHECK ("version" >= 1);

ALTER TABLE "AssessmentChange"
  ADD CONSTRAINT "AssessmentChange_version_after_first" CHECK ("version" >= 2),
  ADD CONSTRAINT "AssessmentChange_editorNameSnapshot_not_blank" CHECK (btrim("editorNameSnapshot") <> '');
