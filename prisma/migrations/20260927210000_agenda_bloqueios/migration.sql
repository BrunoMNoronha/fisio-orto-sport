-- MEL-02 (#45): bloqueios de horário por profissional. Aditiva: tabela nova, sem backfill e sem
-- efeito nos agendamentos existentes (bloqueio sobre agendamento AGENDADO é recusado na aplicação).
-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "removedAt" TIMESTAMPTZ(3),
    "removedById" TEXT,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleBlock_professionalId_startsAt_idx" ON "ScheduleBlock"("professionalId", "startsAt");

-- CreateIndex
CREATE INDEX "ScheduleBlock_createdById_idx" ON "ScheduleBlock"("createdById");

-- CreateIndex
CREATE INDEX "ScheduleBlock_removedById_idx" ON "ScheduleBlock"("removedById");

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras acrescentadas manualmente (o Prisma não modela CHECKs).
ALTER TABLE "ScheduleBlock"
  ADD CONSTRAINT "ScheduleBlock_ends_after_starts" CHECK ("endsAt" > "startsAt");

-- Remoção lógica: data e autor vêm juntos.
ALTER TABLE "ScheduleBlock"
  ADD CONSTRAINT "ScheduleBlock_removal_consistent" CHECK (("removedAt" IS NULL) = ("removedById" IS NULL));
