# auditoria

Trilha de auditoria de login e gestão de usuários (issue #56). As regras vêm das decisões de
Bruno em 26/09/2026, registradas em
[15-retencao-rastreabilidade-recuperacao](../../../docs/project/15-retencao-rastreabilidade-recuperacao.md)
(A1, A2, A4–A8).

## O que é registrado

| Ação | Onde | Resultado |
|---|---|---|
| `LOGIN` | `auth/actions.ts` (`login`) | `SUCESSO`, `FALHA` (dados inválidos, senha errada, conta inexistente ou inativa) ou `BLOQUEADO` (limite de tentativas) |
| `LOGOUT` | `auth/actions.ts` (`logout`) | `SUCESSO` |
| `ACESSO_NEGADO` | `auth/dal.ts` (`requirePermission`, `requireRole`, `assertPermission`) | `NEGADO`. Só para usuário logado sem a permissão; sem sessão não gera registro |
| `PRIMEIRO_ADMIN_CRIADO` | `auth/bootstrap.ts` | `SUCESSO` |
| `USUARIO_CRIADO`, `USUARIO_EDITADO`, `PERFIL_ALTERADO`, `USUARIO_ATIVADO`, `USUARIO_DESATIVADO`, `SENHA_REDEFINIDA` | `auth/users/actions.ts` | `SUCESSO` |
| `CLI_ADMIN_CRIADO`, `CLI_SENHA_REDEFINIDA` | `auth/admin-cli.ts` (`pnpm db:admin`) | `SUCESSO`, sem ator nem IP |

Leituras do prontuário e impressão de documentos **não** são auditadas (A1). Recusas da gestão de
usuários por salvaguarda ou dado duplicado não geram registro: a transação não se completa. O
acesso rápido de desenvolvimento (`dev-login.ts`, só em `next dev`) também não gera registro.

## Campos (A6)

`action`, `result`, `createdAt`, `actorId`, `actorRole`, `targetUserId`, `emailHash` e `ip`.

- Nunca guarda senha, token, user-agent ou conteúdo clínico.
- Na falha de login, o e-mail digitado vai só como SHA-256 do valor normalizado (`hashEmail`).
  `targetUserId` só é preenchido quando a conta existe. A resposta ao cliente não muda, então o
  registro não revela a existência da conta para quem tenta entrar. O hash é pseudonimização,
  não anonimização: quem já conhece um e-mail consegue conferi-lo.
- `ip` usa a mesma regra dos limites de login (`auth/client-ip.ts`): só atrás de proxy confiável
  (Vercel ou `TRUST_PROXY=true`). Em `next dev` fica vazio.
- `actorId` e `targetUserId` não têm chave estrangeira: o registro não depende do usuário.
- `createdAt` vem sempre do default do banco; a aplicação não data registros.

## Imutabilidade (A7)

O trigger `AuditLog_guard` (migração `auditoria`) recusa `UPDATE` e `TRUNCATE` sempre, e `DELETE`
de registros com menos de 7 dias. Vale também para acesso direto ao banco pelo papel da
aplicação. Um superusuário ainda pode desligar o trigger; a proteção é contra alteração pela
aplicação e por engano, não contra quem administra o banco.

## Retenção e expurgo (A5)

7 dias (`AUDIT_RETENTION_DAYS` em `events.ts`, o mesmo valor está no trigger). É uma decisão
operacional, não um prazo legal.

O expurgo (`purgeExpiredAudit`) roda sem ação manual, de forma oportunista: após cada login
bem-sucedido e a cada abertura da consulta. Não usa agendador (Vercel Cron exigiria um segredo
novo em produção). Consequência: se ninguém entrar no sistema por um período, os registros
vencidos só são removidos no próximo login ou consulta; a consulta nunca os mostra, porque expurga
antes de listar.

## Falha ao gravar (A8)

- Gestão de usuários, primeiro acesso e `db:admin`: o registro é gravado na mesma transação da
  alteração (`writeAudit`). Se ele falhar, a alteração é desfeita e a action falha.
- Login, logout e acesso negado: `recordAudit` nunca bloqueia. A falha vai para o log do servidor
  como `[auditoria] falha ao gravar <AÇÃO>. <erro> <código>`, sem e-mail, hash ou IP.

## Consulta (A4)

`/usuarios/auditoria`, permissão `auditoria:ler` (só Administrador). Filtros por usuário (quem agiu
ou alvo), ação e período (datas no fuso da clínica), 50 registros por página.

## Testes

- Unitários: `__tests__/record.test.ts`, e os testes de `auth` (login, DAL, usuários, primeiro
  acesso, `db:admin`).
- PostgreSQL real: `test/integration/auditoria.integration.ts` (trigger, expurgo e reversão da
  transação), `bootstrap.integration.ts` e `admin-cli.integration.ts`. Os registros recentes
  gravados nesses testes não podem ser apagados; use sempre um banco descartável.
