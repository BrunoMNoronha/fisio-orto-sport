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
**Neon**, só em produção (Bruno, 2026-09-19). A integração Neon ↔ Vercel cria
`DATABASE_URL` (com pooling, usada pela aplicação via `@prisma/adapter-pg`)
somente no escopo Production. As migrações usam a URL direta (sem pooling), com
`pnpm exec prisma migrate deploy` rodado localmente por Bruno. A extensão
`btree_gist` (agenda) é suportada pelo Neon.

Rollback: redeploy de um deployment anterior na Vercel e restauração
point-in-time/branch no Neon.

## PENDENTE / TBD

- domínio próprio;
- política formal de backup e observabilidade;
- `pnpm audit`: vulnerabilidades transitivas via `prisma` (ver `docs/AUDITORIA-DEPENDENCIAS.md`).
