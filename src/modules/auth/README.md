# auth

Autenticação (e-mail e senha), sessão, perfis, permissões e gestão de usuários.

## Peças

| Arquivo | Papel |
|---|---|
| `permissions.ts` | **Mapa único de permissões por perfil** e `can(role, permission)`. Toda checagem de acesso passa por aqui. Não compare `role === "ADMIN"` no código. |
| `dal.ts` (`server-only`) | `getCurrentUser()`, `requireUser()`, `requirePermission()`, `requireRole()` (redirecionam para `/login` ou `/acesso-negado`) e `assertPermission()` (lança `AuthorizationError`, para Server Actions). |
| `session.ts` (`server-only`) | Cria e remove a sessão: token aleatório de 32 bytes no cookie `session` (`httpOnly`, `sameSite=lax`, `secure` em produção, 8 h) e só o hash SHA-256 do token na tabela `Session`. |
| `password.ts` | Hash de senha com scrypt (`node:crypto`, N=2^15, r=8, p=1, salt de 16 bytes). |
| `validation.ts` | Schemas zod (senha com 8 a 128 caracteres, e-mail normalizado). |
| `safeguards.ts` | Regras puras: ninguém desativa ou rebaixa a si mesmo, e ninguém remove o último Administrador ativo. |
| `actions.ts` | `login` (mensagem genérica, tempo constante contra enumeração) e `logout`. |
| `users/actions.ts` | Criar, editar (nome e perfil), ativar/desativar e redefinir a senha. Todas exigem `usuarios:gerir` no servidor. Desativar ou redefinir a senha encerra as sessões do usuário. |
| `redirect-path.ts` | Aceita só caminhos internos no `?next=` (evita redirecionamento aberto). |
| `src/proxy.ts` | Checagem **otimista** (presença do cookie). Não substitui a DAL. |

## Como proteger algo novo

1. Declare a permissão em `PERMISSIONS` e distribua-a em `ROLE_PERMISSIONS`.
2. Em páginas, chame `await requirePermission("modulo:acao")`, **em cada página**, não só no layout.
3. Em Server Actions e Route Handlers, chame `await assertPermission("modulo:acao")` antes de qualquer acesso a dados.
4. Na UI, esconda botões com `can(user.role, ...)`, sempre além da checagem no servidor, nunca no lugar dela.

## Matriz inicial (SUPOSIÇÃO a validar, ver docs/PROJECT.md)

| Permissão | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| `usuarios:ler` / `usuarios:gerir` | ✓ | — | — |
| `pacientes:ler` | ✓ | ✓ | ✓ |
| `pacientes:gerir` | ✓ | ✓ | — |
| `agenda:ler` | ✓ | ✓ | ✓ |
| `agenda:gerir` | ✓ | ✓ | — |
| `clinico:ler` / `clinico:gerir` | ✓ | — | ✓ (todos os pacientes) |

## Fora do escopo (por ora)

Recuperação de senha por e-mail, troca de senha pelo próprio usuário, OAuth/SSO, 2FA, limite de tentativas de login e trilha de auditoria de acesso.
