import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "../dal";

export async function listUsers() {
  await requirePermission("usuarios:ler");
  return prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, crefito: true, active: true, createdAt: true },
  });
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
