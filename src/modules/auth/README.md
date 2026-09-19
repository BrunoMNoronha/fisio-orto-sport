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
| `actions.ts` | `login` (mensagem genérica, tempo constante contra enumeração), `logout` e `setupFirstAdmin` (primeiro acesso). |
| `setup.ts` (`server-only`) | `hasAnyUser()`: diz se a tabela de usuários já tem alguém (decide login × primeiro acesso). |
| `users/actions.ts` | Criar, editar (nome, perfil e CREFITO), ativar/desativar e redefinir a senha. Todas exigem `usuarios:gerir` no servidor. Desativar ou redefinir a senha encerra as sessões do usuário. |
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

## CREFITO do fisioterapeuta (Fase 2c)

- O CREFITO é do **profissional**, e o profissional é o próprio `User` com perfil `FISIOTERAPEUTA` (não há tabela de profissionais). Por isso fica em `User.crefito`, nunca em `Patient`.
- **Obrigatório** ao criar ou editar um usuário `FISIOTERAPEUTA`. Nos demais perfis é descartado (gravado `null`), inclusive quando o usuário deixa de ser fisioterapeuta.
- **Formato**: texto curto normalizado, com espaços nas pontas removidos, internos colapsados e letras em maiúsculas. Até 20 caracteres (`VarChar(20)`), sem validação de padrão.
- **Único quando informado** (`@unique`; vários `NULL` são aceitos). A duplicidade responde "Já existe um usuário com este CREFITO." sem ecoar o valor. A action distingue o P2002 do CREFITO do P2002 do e-mail procurando `crefito` em `error.meta`, formato conferido contra o PostgreSQL real em `test/integration/cadastro-complementar.integration.ts`.
- Fisioterapeutas cadastrados antes da 2c ficam com `NULL`, e a lista de usuários mostra "CREFITO não informado". Editar um deles exige informar o CREFITO.
- Quem edita: só `usuarios:gerir` (Administrador), com a matriz inalterada. A anamnese **não** guarda o CREFITO na assinatura (append-only inalterado).

## Fora do escopo (por ora)

Recuperação de senha por e-mail, troca de senha pelo próprio usuário, OAuth/SSO, 2FA e trilha de auditoria de acesso.

## Proteções do login

- Mensagem genérica e scrypt contra hash fictício (sem enumeração de contas por conteúdo ou tempo).
- Limite em memória (`rate-limit.ts`): 5 falhas por e-mail e 30 tentativas por IP a cada 15 min. Vale para uma instância; com várias, trocar por armazenamento compartilhado. O IP vem de `x-forwarded-for`, então só é confiável atrás de um proxy que sobrescreva esse cabeçalho. O limite por e-mail não depende dele.
- A sessão é criada numa transação serializável que confere se o usuário segue ativo e com o mesmo hash de senha (sem sessão residual após uma redefinição simultânea).
- Em produção o cookie se chama `__Host-session` (Secure, Path=/, sem Domain).

## Primeiro acesso (tabela de usuários vazia)

- Enquanto **não existe nenhum usuário**, `/login` mostra o formulário de cadastro (`setup-form.tsx`) no lugar do de login. O acesso rápido de desenvolvimento também some, porque não haveria quem listar.
- `setupFirstAdmin` cria o usuário com perfil **ADMIN** (nome, e-mail e senha; mesma política de senha do cadastro comum) e já abre a sessão, redirecionando para o `?next=` validado.
- A action **não exige autenticação** — não há quem autentique no primeiro acesso. A única barreira é a tabela estar vazia, reconferida com `count()` **dentro de uma transação serializável** antes do `create`, para que duas requisições simultâneas não criem dois administradores. `P2002` (e-mail já criado por outra requisição) e o conflito de serialização `P2034` são tratados sem vazar detalhes.
- Depois do primeiro usuário, a tela volta ao login normal e novos usuários passam a ser criados só em `/usuarios` (`usuarios:gerir`).
- **Risco aceito**: entre o deploy e o primeiro cadastro, quem alcançar `/login` cria o Administrador. Em ambiente exposto, faça o primeiro acesso logo após o deploy (ou rode o seed antes de publicar).

## Acesso rápido em desenvolvimento

Com `next dev`, a tela de login lista os usuários ativos; clicar em um entra direto como ele (`dev-login.ts`). Fora de `NODE_ENV=development` a lista não aparece e a action responde 404.
