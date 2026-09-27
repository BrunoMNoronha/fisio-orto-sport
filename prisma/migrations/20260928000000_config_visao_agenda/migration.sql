-- #69: visão inicial da agenda como configuração da clínica. Aditiva: a linha existente (se houver)
-- recebe 'dia', que é o comportamento anterior. Não altera agendamentos nem outros dados.

-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN     "agendaDefaultView" VARCHAR(10) NOT NULL DEFAULT 'dia';

-- Regra acrescentada manualmente (o Prisma não modela CHECKs): mesmos valores de AGENDA_VIEWS
-- (src/modules/agenda/validation.ts).
ALTER TABLE "ClinicSettings"
  ADD CONSTRAINT "ClinicSettings_agenda_default_view" CHECK ("agendaDefaultView" IN ('dia', 'semana', 'lista'));
