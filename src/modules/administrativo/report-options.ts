import { Prisma } from "@/generated/prisma/client";
export const REPORT_OPTION_KEYS = ['patientId', 'operatorId', 'contractId', 'procedureId', 'professionalId', 'authorizationId'] as const;
export type ReportOptionKey = typeof REPORT_OPTION_KEYS[number];
// Somente identificadores e rótulos administrativos. Não inclui prontuário, senha ou carteira.
export function reportOptionSource(key: ReportOptionKey): Prisma.Sql {
  switch (key) {
    case 'patientId': return Prisma.sql`SELECT id,"fullName" AS label,"searchName" AS search FROM "Patient"`;
    case 'operatorId': return Prisma.sql`SELECT id,name AS label,lower(name) AS search FROM "HealthOperator"`;
    case 'contractId': return Prisma.sql`SELECT c.id,o.name||' — '||c.name AS label,lower(o.name||' '||c.name) AS search FROM "OperatorContract" c JOIN "HealthOperator" o ON o.id=c."operatorId"`;
    case 'procedureId': return Prisma.sql`SELECT p.id,c.name||' — '||p."tableCode"||'/'||p.code||' — '||p.name AS label,lower(p.code||' '||p.name||' '||c.name) AS search FROM "BillingProcedure" p JOIN "OperatorContract" c ON c.id=p."contractId"`;
    case 'professionalId': return Prisma.sql`SELECT id,name AS label,lower(name) AS search FROM "User" WHERE role='FISIOTERAPEUTA'`;
    case 'authorizationId': return Prisma.sql`SELECT a.id,a.number||' — '||pt."fullName"||' — '||c.name AS label,lower(a.number||' '||pt."fullName"||' '||c.name) AS search FROM "BenefitAuthorization" a JOIN "BeneficiaryCoverage" cv ON cv.id=a."coverageId" JOIN "Patient" pt ON pt.id=cv."patientId" JOIN "OperatorContract" c ON c.id=a."contractId"`;
  }
}
