-- MEL-01 (#44): presença no agendamento e vínculo opcional do atendimento com a agenda.
-- Aditiva: colunas novas anuláveis, sem backfill. Atendimentos já existentes (legados) ficam sem
-- vínculo, e agendamentos existentes ficam sem presença marcada.

-- CreateEnum
CREATE TYPE "AppointmentAttendance" AS ENUM ('COMPARECEU', 'FALTA_AVISADA', 'FALTA_NAO_AVISADA');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "attendance" "AppointmentAttendance",
ADD COLUMN     "attendanceMarkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "attendanceMarkedById" TEXT;

-- AlterTable
ALTER TABLE "TreatmentSession" ADD COLUMN     "appointmentId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_attendanceMarkedById_idx" ON "Appointment"("attendanceMarkedById");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_patientId_key" ON "Appointment"("id", "patientId");

-- CreateIndex
CREATE INDEX "TreatmentSession_appointmentId_patientId_idx" ON "TreatmentSession"("appointmentId", "patientId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_attendanceMarkedById_fkey" FOREIGN KEY ("attendanceMarkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_appointmentId_patientId_fkey" FOREIGN KEY ("appointmentId", "patientId") REFERENCES "Appointment"("id", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras acrescentadas manualmente (o Prisma não modela CHECKs nem índices parciais).
-- Presença: marcação, data e autor vêm juntos, e só existem em agendamento AGENDADO
-- (cancelado nunca tem presença; para cancelar, a marcação é removida antes).
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_attendance_consistent" CHECK (
    ("attendance" IS NULL AND "attendanceMarkedAt" IS NULL AND "attendanceMarkedById" IS NULL)
    OR ("attendance" IS NOT NULL AND "attendanceMarkedAt" IS NOT NULL AND "attendanceMarkedById" IS NOT NULL
        AND "status" = 'AGENDADO')
  );

-- No máximo um atendimento VÁLIDO por agendamento. Invalidar o atendimento libera o agendamento para
-- um novo registro; o invalidado continua vinculado e consultável.
CREATE UNIQUE INDEX "TreatmentSession_appointmentId_valid_key"
  ON "TreatmentSession"("appointmentId")
  WHERE "status" = 'VALIDO' AND "appointmentId" IS NOT NULL;
