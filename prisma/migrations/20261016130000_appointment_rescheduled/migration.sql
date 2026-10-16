-- Existing appointments have no reliable rescheduling history.
ALTER TABLE "Appointment" ADD COLUMN "lastRescheduledAt" TIMESTAMPTZ(3);
