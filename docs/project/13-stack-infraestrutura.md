# Responsabilidade: stack, banco e infraestrutura

## CONFIRMADO

Stack atual: Next.js 16.3.5, React 19.2.8, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7.10.0, PostgreSQL, pnpm 11.25.0, Jest 30 e Docker Compose.

Modelos e migrações relevantes: `User`, `Session`, `Patient`, `Anamnesis` e `Appointment`, com migrações aditivas para autenticação, pacientes, agenda, anamnese e cadastro complementar.

Fontes: `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, `prisma/migrations/`, documentação dos módulos.

## DECISÃO TÉCNICA

Monólito modular em Next.js App Router, com autenticação própria baseada em sessão de banco e DAL `server-only`. A escolha reduz dependências e atende uma clínica única.

## PUBLICAÇÃO

O alvo de publicação do aplicativo Next.js é a Vercel. O repositório contém
[`vercel.json`](../../vercel.json) com instalação reproduzível via
`pnpm install --frozen-lockfile` e build via `pnpm run build`.

As funções rodam em `gru1` (São Paulo), perto do banco e dos usuários.

A Vercel não deve executar migrações ou seed durante o build. Banco gerenciado:
**Neon**, com branches persistentes `production` e `preview` (Bruno, 2026-10-04).
Preview usa schema sem dados produtivos e role própria. A integração Neon ↔ Vercel cria
`DATABASE_URL` (com pooling, usada pela aplicação via `@prisma/adapter-pg`)
somente no escopo Production. Preview é configurado separadamente. As migrações
usam `DATABASE_URL_UNPOOLED` com `pnpm exec prisma migrate deploy` nos workflows,
antes do build/deploy. Atualizar `production` publica só Preview; Production é
manual e exige Preview válido do mesmo SHA. A extensão
`btree_gist` (agenda) é suportada pelo Neon.

Rollback: redeploy de um deployment anterior na Vercel e restauração
point-in-time/branch no Neon.

Workflows, proteções, variáveis e recuperação: [pipeline-deploy](pipeline-deploy.md).
O build não altera bancos e a integração Git da Vercel fica desabilitada.

## PENDENTE / TBD

- domínio próprio;
- primeiro teste de restauração em branch isolado (#42). A política de backup
  e observabilidade foi decidida em 26/09/2026 (PITR de 6 h, sem snapshots nem
  alertas; ver [15-retencao-rastreabilidade-recuperacao](15-retencao-rastreabilidade-recuperacao.md));
- `pnpm audit`: vulnerabilidades transitivas via `prisma` (ver `docs/AUDITORIA-DEPENDENCIAS.md`).
