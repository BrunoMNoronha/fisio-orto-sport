-- Inclusão aditiva: pacientes existentes permanecem sem informação de plano.
ALTER TABLE "Patient"
  ADD COLUMN "healthInsuranceProvider" VARCHAR(120),
  ADD COLUMN "healthInsurancePlan" VARCHAR(120),
  ADD COLUMN "healthInsuranceCard" VARCHAR(60),
  ADD COLUMN "healthInsuranceValidUntil" DATE;
