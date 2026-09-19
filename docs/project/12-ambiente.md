# Responsabilidade: repositório, diretório e branch

## CONFIRMADO

- Repositório: `fisio-orto-sport`.
- Diretório: `C:\Development\Projects\fisio-orto-sport`.
- Branch principal: `main`, com remote `origin`.
- Estado verificado em 2026-09-19: working tree limpo e alinhado ao `origin/main` antes das alterações documentais desta sessão.

Fonte: `git status --short --branch` e `git log`.

## AMBIGUIDADE DOCUMENTAL

O checklist antigo de Agenda no `README.md` estava divergente do código e da documentação dos módulos. O roadmap foi atualizado para refletir a implementação verificada.

## CONFIRMADO — AMBIENTES (Bruno, 2026-09-19)

- **Apenas produção**, sem homologação: Vercel (região `gru1`, São Paulo) e banco
  Neon (região São Paulo), ligado ao projeto Vercel pela integração nativa.
- Deployments de Preview **não recebem** variáveis de banco: o banco de produção
  guarda dados de saúde (LGPD) e não pode ser acessado por previews.
- Migrações e seed **não** rodam no build. Bruno roda localmente, com a URL
  direta (sem pooling) do Neon: `pnpm exec prisma migrate deploy` e depois,
  uma vez, `pnpm db:seed`. Antes de cada migração futura, criar um ponto de
  restauração no Neon.

## PENDENTE / TBD

Domínio próprio, política formal de backup e observabilidade.

## FREEZE OPERACIONAL DE PRODUÇÃO — 2026-09-19 (SUSPENSO)

**Suspenso por aprovação explícita de Bruno em 2026-09-19** para a primeira
publicação, só em produção. Os itens de domínio, backup e observabilidade seguem
como pendências (acima). O requisito de Preview com banco próprio foi substituído
pela decisão "apenas produção". Texto original mantido como histórico:

Produção permanece congelada até que o alvo seja definido e comprovado. Durante o
freeze, não executar deploy, promoção de revisão, migração, seed, alteração de
variáveis, alteração de domínio ou operação em banco produtivo.

O freeze é uma decisão operacional preventiva; não constitui evidência de que
exista uma aplicação publicada, um projeto Vercel ativo ou um banco produtivo.

O desbloqueio exige, no mínimo:

- alvo Vercel e domínio confirmados;
- PostgreSQL gerenciado separado de desenvolvimento;
- `DATABASE_URL` configurada separadamente para Preview e Production, sem expor
  valores neste repositório;
- backup, rollback e observabilidade definidos;
- migrações aplicadas no banco autorizado com `pnpm exec prisma migrate deploy`;
- teste controlado de login, sessão, rota protegida e logout;
- aprovação explícita do escopo de publicação.

## LINHA DE BASE DE DESENVOLVIMENTO — 2026-09-19

Desenvolvimento usa PostgreSQL 17 local via Docker Compose e `.env` local não
versionado. O banco local foi verificado saudável e sem migrações pendentes.

Checks reproduzíveis:

- `pnpm install --frozen-lockfile --offline`;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm exec jest --runInBand`;
- `pnpm build`;
- `pnpm exec prisma migrate status`;
- `pnpm test:integration` somente com `INTEGRATION_DATABASE_URL` apontando para
  banco descartável isolado.

Resultado registrado: typecheck, lint, Jest (311 testes em 25 suítes), build e
estado das migrações locais passaram. A integração foi apenas pulada por falta
de `INTEGRATION_DATABASE_URL`; isso não equivale a uma homologação de produção.
