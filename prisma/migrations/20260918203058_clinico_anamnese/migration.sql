-- CreateEnum
CREATE TYPE "PainType" AS ENUM ('PONTADA', 'QUEIMACAO', 'PESO', 'IRRADIADA');

-- CreateTable
CREATE TABLE "Anamnesis" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorNameSnapshot" VARCHAR(120) NOT NULL,
    "assessmentDate" DATE NOT NULL,
    "chiefComplaint" VARCHAR(500) NOT NULL,
    "currentIllnessHistory" VARCHAR(4000),
    "personalPathologicalHistory" VARCHAR(4000),
    "surgeries" VARCHAR(2000),
    "currentMedications" VARCHAR(2000),
    "habitsPhysicalActivity" VARCHAR(2000),
    "painIntensity" SMALLINT,
    "painLocation" VARCHAR(200),
    "painTypes" "PainType"[],
    "functionalLimitations" VARCHAR(2000),
    "patientGoals" VARCHAR(2000),
    "clinicalNotes" VARCHAR(4000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anamnesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anamnesis_patientId_idx" ON "Anamnesis"("patientId");

-- CreateIndex
CREATE INDEX "Anamnesis_patientId_createdAt_id_idx" ON "Anamnesis"("patientId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Anamnesis_authorId_idx" ON "Anamnesis"("authorId");

-- AddForeignKey
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECKs manuais (não representados no schema Prisma; documentados em src/modules/clinico/README.md).
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_painIntensity_range" CHECK ("painIntensity" IS NULL OR "painIntensity" BETWEEN 0 AND 10);
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_chiefComplaint_not_blank" CHECK (length(btrim("chiefComplaint")) > 0);
ALTER TABLE "Anamnesis" ADD CONSTRAINT "Anamnesis_authorNameSnapshot_not_blank" CHECK (length(btrim("authorNameSnapshot")) > 0);
