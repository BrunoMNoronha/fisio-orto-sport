import "server-only";
import { headers } from "next/headers";

// IP do cliente para os limites de tentativa. Vem de `x-forwarded-for`, então só é
// confiável atrás de um proxy que sobrescreva esse cabeçalho.
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}
