CREATE TABLE "AppointmentBatch" (
  "id" TEXT NOT NULL,
  "requestKey" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "appointmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AppointmentBatch_createdById_requestKey_key" ON "AppointmentBatch"("createdById", "requestKey");
ALTER TABLE "Appointment" ADD COLUMN "batchId" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AppointmentBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Appointment_batchId_idx" ON "Appointment"("batchId");
ALTER TABLE "ClinicSettings" ADD COLUMN "maxRecurringSessions" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_maxRecurringSessions_check" CHECK ("maxRecurringSessions" BETWEEN 1 AND 100);
