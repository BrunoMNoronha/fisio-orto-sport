import { prisma } from "@/lib/db";
import { runtimeVerification } from "@/modules/release/runtime-proof.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runtimeVerification(request, {
    connectionString: process.env.DATABASE_URL ?? "",
    queryIdentity: async () => {
      // Mesma instância e conexão usadas pelo login e demais rotas da aplicação.
      const [identity] = await prisma.$queryRaw<Array<{ database: string; role: string }>>`SELECT current_database() AS database, current_user AS role`;
      return identity;
    },
  });
}
