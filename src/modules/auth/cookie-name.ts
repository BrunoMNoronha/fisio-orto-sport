// Nome do cookie de sessão, compartilhado entre o proxy e a sessão.
// Em produção usa o prefixo `__Host-`, que obriga Secure, Path=/ e ausência de Domain.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-session" : "session";
