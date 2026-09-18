// Cria o primeiro Administrador a partir do .env. Idempotente: se o e-mail já existe,
// não altera nada (nem a senha). Uso: pnpm db:seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/password";
import { PASSWORD_MAX, PASSWORD_MIN } from "../src/modules/auth/validation";

const env = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL não definida."),
    SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("SEED_ADMIN_EMAIL inválido.")),
    SEED_ADMIN_PASSWORD: z
      .string()
      .min(PASSWORD_MIN, `SEED_ADMIN_PASSWORD deve ter pelo menos ${PASSWORD_MIN} caracteres.`)
      .max(PASSWORD_MAX),
    SEED_ADMIN_NAME: z.string().trim().min(2, "SEED_ADMIN_NAME deve ter pelo menos 2 caracteres."),
  })
  .safeParse(process.env);

if (!env.success) {
  console.error("Variáveis de seed inválidas:");
  for (const issue of env.error.issues) console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const { DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD } = env.data;

// Recusa os valores de exemplo do .env.example.
if (SEED_ADMIN_PASSWORD === "troque-esta-senha" || SEED_ADMIN_EMAIL === "admin@example.com") {
  console.error("Troque SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env (os valores de exemplo não são aceitos).");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: SEED_ADMIN_EMAIL }, select: { id: true } });
  if (existing) {
    console.log(`Administrador ${SEED_ADMIN_EMAIL} já existe. Nada a fazer.`);
    return;
  }
  await prisma.user.create({
    data: {
      name: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL,
      role: "ADMIN",
      passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    },
  });
  console.log(`Administrador ${SEED_ADMIN_EMAIL} criado.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
