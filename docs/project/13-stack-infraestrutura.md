# Responsabilidade: stack, banco e infraestrutura

## CONFIRMADO

Stack atual: Next.js 16.3.5, React 19.2.8, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7.10.0, PostgreSQL, pnpm 11.25.0, Jest 30 e Docker Compose.

Modelos e migrações relevantes: `User`, `Session`, `Patient`, `Anamnesis` e `Appointment`, com migrações aditivas para autenticação, pacientes, agenda, anamnese e cadastro complementar.

Hospedagem: aplicação na **Vercel** (projeto `fisio-orto-sport`) e banco de produção no **Neon** (projeto `fisio-orto-sport`, PostgreSQL 18, região `aws-sa-east-1`). O deploy de produção é feito pela integração nativa Vercel ↔ GitHub a cada push na `main`; as migrações são aplicadas pelo workflow `.github/workflows/deploy-migrations.yml`.

Fontes: `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, `prisma/migrations/`, `vercel.json`, `.github/workflows/deploy-migrations.yml`, documentação dos módulos.

## DECISÃO TÉCNICA

Monólito modular em Next.js App Router, com autenticação própria baseada em sessão de banco e DAL `server-only`. A escolha reduz dependências e atende uma clínica única.

Publicação sem etapa de CI própria de deploy: a Vercel constrói a partir do Git e o GitHub Actions cuida apenas do `prisma migrate deploy`. Evita manter token da Vercel como segredo e preserva rollback e Preview Deployments nativos.

A aplicação usa a connection string **pooled** do Neon; as migrações usam a **direta**, porque o pooler não suporta os advisory locks do `prisma migrate deploy`.

O schema `neon_auth` existente no banco foi criado pelo Neon Auth e não é usado pela aplicação, que tem autenticação própria. As migrações operam apenas no schema `public`.

## PENDENTE / TBD

- Ambiente de homologação dedicado (hoje existem apenas Preview Deployments por branch, sem banco separado).
- Domínio próprio, backup/retenção explícita e observabilidade de produção.
