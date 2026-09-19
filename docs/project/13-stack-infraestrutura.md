# Responsabilidade: stack, banco e infraestrutura

## CONFIRMADO

Stack atual: Next.js 16.3.5, React 19.2.8, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7.10.0, PostgreSQL, pnpm 11.25.0, Jest 30 e Docker Compose.

Modelos e migrações relevantes: `User`, `Session`, `Patient`, `Anamnesis` e `Appointment`, com migrações aditivas para autenticação, pacientes, agenda, anamnese e cadastro complementar.

Fontes: `package.json`, `pnpm-lock.yaml`, `prisma/schema.prisma`, `prisma/migrations/`, documentação dos módulos.

## DECISÃO TÉCNICA

Monólito modular em Next.js App Router, com autenticação própria baseada em sessão de banco e DAL `server-only`. A escolha reduz dependências e atende uma clínica única.

## PENDENTE / TBD

Hospedagem e infraestrutura de publicação ainda não foram definidos.
