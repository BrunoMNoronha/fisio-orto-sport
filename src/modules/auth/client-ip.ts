import { isIP } from "node:net";

// IP do cliente para os limites de autenticação (issue #37). Cabeçalhos de proxy só são aceitos
// quando há um proxy confiável na frente: na Vercel (VERCEL=1), que sobrescreve x-forwarded-for
// e não repassa valores enviados pelo cliente, ou com TRUST_PROXY=true num proxy próprio que faça
// o mesmo. Fora disso (ex.: `next dev`), devolve null e o limite por IP não é aplicado; o limite
// por e-mail do login continua valendo.
type ProxyEnv = Record<string, string | undefined>;

export function clientIpFrom(headers: Headers, env: ProxyEnv = process.env): string | null {
  if (env.VERCEL !== "1" && env.TRUST_PROXY !== "true") return null;
  const candidate = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}
