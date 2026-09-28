-- #78: expediente da clínica (global, semanal, até 2 intervalos por dia), separado da faixa visual.
-- Aditiva e desligada por padrão: sem expediente configurado e com a chave desligada, a agenda
-- continua sem restrição. Formato validado na aplicação (src/modules/agenda/business-hours.ts); o
-- CHECK garante só a forma geral (7 trechos separados por ";").

-- AlterTable
ALTER TABLE "ClinicSettings"
  ADD COLUMN "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "businessHours" VARCHAR(200) NOT NULL DEFAULT ';;;;;;';

ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_business_hours_format"
  CHECK ("businessHours" ~ '^[0-9:,-]*(;[0-9:,-]*){6}$');
