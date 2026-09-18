// Aceita apenas caminhos internos como destino pós-login (evita redirecionamento aberto).
// Recusa caracteres de controle/espaços (ex.: "/\t/evil.com", que o navegador normaliza
// para "//evil.com") e só devolve o caminho normalizado de uma URL de mesma origem.
const BASE = "http://interno.invalid";

export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s\x00-\x1F\x7F]/.test(value)) return "/";

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";

  const path = `${url.pathname}${url.search}`;
  if (path.startsWith("//") || url.pathname === "/login" || url.pathname.startsWith("/login/")) return "/";
  return path;
}
