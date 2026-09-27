-- Configurações da clínica (issue #63). Migração aditiva: novo valor de enum, coluna opcional e
-- tabela nova. Nada existente é alterado, e o código anterior continua funcionando com ela.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CONFIGURACAO_ALTERADA';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "details" VARCHAR(500);

-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "displayName" VARCHAR(120),
    "legalName" VARCHAR(160),
    "cnpj" CHAR(14),
    "phone" VARCHAR(11),
    "email" VARCHAR(254),
    "address" VARCHAR(300),
    "agendaDayStartHour" INTEGER NOT NULL DEFAULT 7,
    "agendaDayEndHour" INTEGER NOT NULL DEFAULT 20,
    "suggestedDurationMinutes" INTEGER,
    "printShowClinicInfo" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "ClinicSettings_pkey" PRIMARY KEY ("id"),
    -- Clínica única.
    CONSTRAINT "ClinicSettings_singleton" CHECK ("id" = 1),
    -- Mesmos limites de src/modules/configuracoes/validation.ts.
    CONSTRAINT "ClinicSettings_day_range" CHECK ("agendaDayStartHour" >= 0 AND "agendaDayEndHour" <= 24 AND "agendaDayStartHour" < "agendaDayEndHour"),
    CONSTRAINT "ClinicSettings_duration" CHECK ("suggestedDurationMinutes" IS NULL OR ("suggestedDurationMinutes" BETWEEN 5 AND 720)),
    CONSTRAINT "ClinicSettings_cnpj_digits" CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$'),
    CONSTRAINT "ClinicSettings_phone_digits" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10,11}$'),
    CONSTRAINT "ClinicSettings_version" CHECK ("version" >= 1)
);

-- AddForeignKey
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
