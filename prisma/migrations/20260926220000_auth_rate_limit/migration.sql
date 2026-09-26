-- Limites de autenticação compartilhados entre instâncias (issue #37).
-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "key" CHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AuthRateLimit_resetAt_idx" ON "AuthRateLimit"("resetAt");
