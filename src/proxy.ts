// Checagem OTIMISTA: só verifica a presença do cookie de sessão e redireciona o visitante
// anônimo para /login. A validação real (sessão no banco, usuário ativo, perfil) fica na DAL
// (src/modules/auth/dal.ts), chamada em cada página, Server Action e Route Handler.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!isPublic && !hasSession) {
    const url = new URL("/login", request.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos internos do Next e arquivos estáticos.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
