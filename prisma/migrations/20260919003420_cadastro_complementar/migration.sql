-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMININO', 'MASCULINO', 'NAO_INFORMADO');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "occupation" VARCHAR(120),
ADD COLUMN     "sex" "Sex";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "crefito" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "User_crefito_key" ON "User"("crefito");

