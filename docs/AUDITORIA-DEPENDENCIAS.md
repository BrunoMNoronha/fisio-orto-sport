# 📋 Auditoria de Requisitos e Dependências
## fisio-orto-sport | Data: 2026-09-19 (revisado com execução real de comandos)

---

## ⚠️ Nota de Revisão

A versão original desta auditoria (análise estática, sem executar comandos) afirmava
**"sem vulnerabilidades críticas conhecidas"**. Isso estava **incorreto**: a análise
estática não substitui `pnpm audit`. Uma segunda passada executando os comandos reais
(`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`,
`pnpm audit --prod`) encontrou **3 vulnerabilidades transitivas** (2 altas, 1 moderada) que
a leitura de código não detectaria. Esta versão incorpora esses resultados. Veja
[Verificação Executada em Ambiente Real](#-verificação-executada-em-ambiente-real-2026-09-19).

---

## 🎯 Sumário Executivo

| Aspecto | Status | Notas |
|---------|--------|-------|
| **Dependências diretas** | ✅ SAUDÁVEL | Versões atualizadas |
| **Dependências transitivas** | 🔴 3 VULNERABILIDADES | 2 altas + 1 moderada, via `prisma` (mysql2, deepmerge-ts) |
| **Configuração** | ⚠️ INCOMPLETA | Vercel + PostgreSQL gerenciado pendente |
| **Variáveis de Ambiente** | ⚠️ DISCREPÂNCIA | 2 variáveis não utilizadas; 1 documentação desatualizada |
| **Schema/Migrations** | ✅ PRONTO | 7 migrações sequenciais, aplicadas e verificadas em banco local |
| **TypeScript** | ✅ STRICT | `pnpm typecheck` passou |
| **Lint** | ✅ OK | `pnpm lint` passou |
| **Build** | ✅ OK | `pnpm build` passou |
| **Testes** | ✅ OK (nesta execução) | 25 suites / 311 testes passaram — ver nota de divergência abaixo |
| **Autenticação** | ✅ IMPLEMENTADA | Sistema próprio, sem AUTH_SECRET necessário |
| **Prontidão Desenvolvimento** | ✅ APTO COM RESSALVAS | Ambiente local funcional |
| **Prontidão Produção** | 🔴 NÃO APTO | Nenhuma evidência de ambiente de produção configurado |

**Recomendação Geral**: Ambiente de desenvolvimento está funcional e correto. Produção
ainda não existe (nenhum projeto Vercel/DB gerenciado comprovado). Antes de publicar:
1. Avaliar e tratar as 3 vulnerabilidades transitivas (via `prisma`)
2. Remover/documentar variáveis não utilizadas (DEV_QUICK_LOGIN, TRUST_PROXY)
3. Provisionar PostgreSQL gerenciado e configurar `DATABASE_URL` em Preview/Production
4. Comprovar migrations aplicadas e criação controlada do primeiro administrador em produção

---

## 🧪 Verificação Executada em Ambiente Real (2026-09-19)

Ao contrário da primeira passada (leitura estática de arquivos), esta seção reflete
comandos **efetivamente executados** no ambiente de desenvolvimento local, sem
alterações funcionais nem instalação de novas dependências.

| Verificação | Comando | Resultado |
|---|---|---|
| Runtime Node | `node --version` | `v24.19.0` |
| Package manager | `pnpm --version` | `11.25.0` — compatível com `packageManager` do `package.json` |
| Instalação reprodutível | `pnpm install --frozen-lockfile --offline` | ✅ Passou |
| Banco local | Docker `postgres:17-alpine` | ✅ Container saudável, porta `5432` |
| Migrações | `prisma migrate status` (via `db:migrate`) | ✅ 7 migrações aplicadas, banco atualizado |
| Tipos | `pnpm typecheck` | ✅ Passou |
| Lint | `pnpm lint` | ✅ Passou |
| Build de produção | `pnpm build` | ✅ Passou |
| Testes unitários | `pnpm test` | ✅ 25 suites, 311 testes passaram (após `jest --clearCache`, mesmo resultado) |
| Auditoria de dependências | `pnpm audit --prod` | 🔴 3 vulnerabilidades transitivas (2 altas, 1 moderada) |

### ⚠️ Divergência de Testes — Registrada, Não Resolvida

Um relatório anterior (gerado em outra execução/sessão) reportou que `pnpm test` **falhava**
porque o Jest não coletava os arquivos em `src/**/__tests__`. Nesta verificação, rodando
`pnpm test` diretamente na raiz do projeto — inclusive após `pnpm jest --clearCache` — os
**25 suites e 311 testes passaram integralmente**, sem alterar `jest.config.ts` nem nenhum
arquivo de teste. Não foi possível reproduzir a falha relatada.

Causas prováveis para a divergência (não confirmadas):
- comando executado em diretório diferente da raiz do projeto (`testPathIgnorePatterns`/`rootDir` relativo);
- estado de instalação diferente no momento daquela execução (ex.: antes de um `postinstall`/`prisma generate` completo);
- diferença de shell/ambiente (o projeto usa PowerShell como padrão; um shell POSIX mal configurado pode alterar `cwd`).

**Recomendação**: se a falha se repetir, capturar o comando exato e o `cwd` usado, e rodar
`pnpm test -- --listTests` para confirmar quais arquivos o Jest está enumerando antes de
investigar a config.

### 🔴 Vulnerabilidades Transitivas Confirmadas (`pnpm audit --prod`)

| Severidade | Pacote | Vulnerabilidade | Caminho | Corrigido em |
|---|---|---|---|---|
| **Alta** | `deepmerge-ts` | Stack exhaustion ao mesclar grafos de objetos recursivos ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)) | `.>@prisma/client>prisma>@prisma/config>deepmerge-ts` | `>=8.0.0` |
| **Alta** | `mysql2` | Downgrade do plugin de auth para `mysql_clear_password`, vazando credenciais em texto plano ([GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)) | `.>@prisma/client>prisma>mysql2` | `>=3.22.0` |
| **Moderada** | `mysql2` | Descompressão zlib ilimitada no protocolo MySQL comprimido, permitindo DoS por "decompression bomb" ([GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)) | `.>@prisma/client>prisma>mysql2` | `>=3.23.1` |

**Contexto importante**: o projeto usa exclusivamente PostgreSQL (`datasource db { provider = "postgresql" }`).
`mysql2` e `deepmerge-ts` chegam como dependências transitivas do CLI `prisma` (que empacota
suporte a múltiplos drivers e sua própria camada de config), **não são usados em runtime**
pela aplicação. O risco prático de exploração em produção é baixo porque o driver MySQL
nunca é invocado — mas a exposição existe na árvore de dependências e deve ser tratada:

1. Rodar `pnpm audit --prod` periodicamente (adicionar a CI/pre-deploy)
2. Verificar se uma versão mais recente de `prisma`/`@prisma/config` já resolve essas transitivas
3. Se não houver correção disponível upstream, documentar o risco aceito (dependência de build-time, não de runtime)

**Verificado agora**: `pnpm outdated` mostra que a única versão mais nova de `prisma` é
`8.0.0-rc.15` — ainda **release candidate**, não estável. Não há, hoje, um patch estável
de `prisma` 7.x que resolva as transitivas. Recomendação: manter 7.10.0, monitorar o
changelog do Prisma, e reavaliar quando 8.x sair da fase RC (ou quando 7.x receber um patch).
Não atualizar para uma pre-release em produção só para resolver uma vulnerabilidade em
dependência de build-time não utilizada em runtime.

### 📋 Dependências Desatualizadas (`pnpm outdated`)

| Pacote | Atual | Última | Tipo | Recomendação |
|---|---|---|---|---|
| `react` / `react-dom` | 19.2.8 | 19.3.0 | Patch/minor | ✅ Seguro atualizar |
| `@types/node` | 20.19.43 | 26.6.1 | Major | ⚠️ Node real é v24.19.0 — tipos `@types/node@20` estão desalinhados da runtime; considerar subir para `@types/node@24` (não necessariamente 26) |
| `dotenv` | 17.4.2 | 18.0.0 | Major | 🟢 Baixo risco, ler changelog antes |
| `eslint` | 9.39.5 | 10.10.0 | Major | 🟡 Testar regras novas antes de subir |
| `typescript` | 5.9.3 | 7.0.2 | Major (salto de 2 versões) | 🔴 Não atualizar sem plano — verificar breaking changes do 6.x e 7.x primeiro |
| `prisma` (dev) | 7.10.0 | 8.0.0-rc.15 | Major (pre-release) | 🔴 Não atualizar — ainda é release candidate |

---

## 📦 Análise de Dependências Node.js

### Dependências Diretas (Production)

| Pacote | Versão | Crítico | Status | Notas |
|--------|--------|---------|--------|-------|
| **next** | 16.3.5 | SIM | ✅ Atual | App Router, React Server Components |
| **react** | 19.2.8 | SIM | ✅ Atual | Última versão estável |
| **react-dom** | 19.2.8 | SIM | ✅ Atual | Sincronizado com react |
| **typescript** | 5.x | SIM | ✅ Atual | Strict mode habilitado |
| **prisma** | 7.10.0 | SIM | ✅ Atual | @prisma/client + @prisma/adapter-pg |
| **pg** | 8.23.0 | SIM | ✅ Atual | Driver PostgreSQL |
| **tailwindcss** | 4.x | NÃO | ✅ Atual | Com @tailwindcss/postcss |
| **zod** | 4.6.5 | SIM | ✅ Atual | Validação de schemas |
| **lucide-react** | 1.47.0 | NÃO | ✅ Atual | Icons |
| **shadcn** | 4.21.0 | NÃO | ✅ Atual | CLI para componentes |
| **@base-ui/react** | 1.8.0 | SIM | ✅ Atual | Componentes sem estilo |
| **clsx** | 2.1.1 | NÃO | ✅ Atual | Classname utilitário |
| **cn** | 0.3.0 | NÃO | ⚠️ VERIFICAR | Conflito com clsx? Ver uso. |
| **tailwind-merge** | 3.7.0 | NÃO | ✅ Atual | Merge de classes Tailwind |
| **server-only** | 0.0.1 | SIM | ✅ Atual | Previne vazamento de server code ao client |
| **next-themes** | 0.4.6 | NÃO | ✅ Atual | Tema escuro/claro |
| **tw-animate-css** | 1.4.0 | NÃO | ⚠️ RARO | Verificar se está em uso |

**⚠️ Observações:**
- `cn` e `clsx` parecem duplicados. Verificar se `cn` é realmente necessário.
- `tw-animate-css` é pacote raro; confirmar se está em uso no código.
- Não há dependências de produção com vulnerabilidades críticas.

### Dependências DevDependencies

| Pacote | Versão | Status | Notas |
|--------|--------|--------|-------|
| **@testing-library/react** | 16.3.3 | ✅ Atual | Testes de componentes |
| **jest** | 30.5.1 | ✅ Atual | Framework de testes |
| **tsx** | 4.23.13 | ✅ Atual | TypeScript executor |
| **ts-node** | 10.9.2 | ⚠️ REDUNDANTE | tsx já cobre; considerar remover |
| **@types/\*** | Várias | ✅ Atual | Tipos TypeScript |
| **eslint** | 9.x | ✅ Atual | Com eslint-config-next |
| **@tailwindcss/postcss** | 4.x | ✅ Atual | PostCSS plugin |
| **dotenv** | 17.4.2 | ✅ Atual | Carregamento de .env |

**Observação**: `ts-node` pode ser removido pois `tsx` já fornece mesma funcionalidade.

### Package Manager

- **Versão**: pnpm 11.25.0
- **Status**: ✅ Atual
- **Lock File**: pnpm-lock.yaml (não versioned, mas recomenda-se adicionar)
- **Workspace**: Single monolith (não há pnpm-workspace)

**Verificação de Scripts**:
```json
{
  "scripts": {
    "dev": "next dev",              // ✅ Inicializa servidor dev
    "build": "next build",          // ✅ Build para produção
    "start": "next start",          // ✅ Inicia servidor prod
    "lint": "eslint",               // ✅ Linting
    "typecheck": "tsc --noEmit",    // ✅ Verificação de tipos
    "test": "jest",                 // ✅ Testes unitários
    "test:watch": "jest --watch",   // ✅ Watch mode
    "db:*": "..."                   // ✅ Scripts de banco de dados
  }
}
```

**Status dos Scripts**: Todos os scripts essenciais estão presentes e funcionais.

---

## 🔐 Análise de Variáveis de Ambiente

### Variáveis Definidas vs Utilizadas

| Variável | Origem | Dev | Prod | Utilizada? | Tipo | Observação |
|----------|--------|-----|------|-----------|------|-----------|
| **DATABASE_URL** | .env.example | ✅ | ✅ | SIM | Crítico | Obrigatória em ambos |
| **POSTGRES_USER** | .env.example | ✅ | ❌ | NÃO | Config | Apenas para docker-compose |
| **POSTGRES_PASSWORD** | .env.example | ✅ | ❌ | NÃO | Config | Apenas para docker-compose |
| **POSTGRES_DB** | .env.example | ✅ | ❌ | NÃO | Config | Apenas para docker-compose |
| **POSTGRES_PORT** | .env.example | ✅ | ❌ | NÃO | Config | Apenas para docker-compose |
| **SEED_ADMIN_NAME** | .env.example | ✅ | ❌ | SIM | Obrigatória | Usado no `prisma/seed.ts` |
| **SEED_ADMIN_EMAIL** | .env.example | ✅ | ❌ | SIM | Obrigatória | Usado no `prisma/seed.ts` |
| **SEED_ADMIN_PASSWORD** | .env.example | ✅ | ❌ | SIM | Obrigatória | Usado no `prisma/seed.ts` |
| **NODE_ENV** | Built-in | ✅ | ✅ | SIM | Framework | Automático (next) |
| **DEV_QUICK_LOGIN** | .env | ✅ | ❌ | ❌ | DOCUMENTADO | **NÃO LIDA** no código — `dev-login.ts:10` habilita o recurso checando apenas `NODE_ENV === "development"`, ignorando esta flag |
| **TRUST_PROXY** | .env | ✅ | ⚠️ | ❌ | DOCUMENTADO | **NÃO LIDA** no código — `actions.ts` sempre confia em `X-Forwarded-For` (ver Análise de Segurança) |

**Nota sobre DEV_QUICK_LOGIN**: como a proteção real depende apenas de `NODE_ENV`, o risco
prático é baixo (builds de produção reais rodam com `NODE_ENV=production`), mas a variável
em si é enganosa — sugere um controle que não existe. Ou implementar a checagem, ou remover
a variável de `.env`/`.env.example` e documentar que o controle é só via `NODE_ENV`.

### Variáveis Utilizadas no Código

**Encontradas via grep**:
```
src/lib/db.ts:8           → process.env.DATABASE_URL
src/lib/db.ts:18          → process.env.NODE_ENV
src/modules/auth/cookie-name.ts:3  → process.env.NODE_ENV
src/app/(auth)/login/page.tsx:17   → process.env.NODE_ENV
src/modules/auth/dev-login.ts:10   → process.env.NODE_ENV
src/modules/auth/session.ts:42     → process.env.NODE_ENV
```

### 🚨 Discrepâncias Identificadas

| Problema | Severidade | Descrição |
|----------|-----------|-----------|
| **DEV_QUICK_LOGIN não utilizada** | 🟡 MÉDIO | Variável documentada em `.env` mas sem implementação no código |
| **TRUST_PROXY não utilizada** | 🟡 MÉDIO | Variável documentada em `.env` mas sem implementação no código |
| **Falta AUTH_SECRET** | 🟢 BAIXO | Documentação menciona que não há AUTH_SECRET (sistema próprio) |
| **SEED_ADMIN_PASSWORD visível** | 🟡 MÉDIO | Senha de exemplo em `.env.example` visível; produto conforme design |

### ✅ Recomendações para Variáveis

1. **Remover ou Implementar DEV_QUICK_LOGIN**:
   - Hoje o controle real é só `NODE_ENV === "development"` (`dev-login.ts:10`)
   - Se a flag extra é desejada: checá-la em `isDevLoginEnabled()`
   - Se não: remover de `.env` e `.env.example` para não sugerir um controle inexistente

2. **Implementar TRUST_PROXY no rate limiting de login**:
   - `clientIp()` em `actions.ts` deve checar `TRUST_PROXY === "1"` antes de confiar em `X-Forwarded-For`
   - Sem proxy confiável, usar uma chave fixa (rate limit global por IP) em vez do header falsificável
   - Isso é uma correção de segurança real, não apenas documentação (ver Análise de Segurança)

3. **`SESSION_SECRET` é opcional, não uma lacuna**:
   - O design documentado (token aleatório de 32 bytes + hash SHA-256 no banco) já dispensa `AUTH_SECRET`
   - Uma chave de assinatura adicional seria defesa em profundidade, não uma correção obrigatória

4. **Adicionar Variáveis para Produção** (opcional, conforme necessidade):
   - `LOG_LEVEL` (para observabilidade)
   - `SENTRY_DSN` (se usar error tracking)
   - `ENABLE_SEED` (flag para evitar seed acidental em prod)

---

## 🗄️ Análise de Banco de Dados

### Schema Prisma

**Modelos Definidos**: 6 modelos + 4 enums

| Modelo | Registros | Chaves | Índices | Proteção |
|--------|-----------|--------|---------|----------|
| **User** | Users do sistema | id (PK), email (UK) | ✅ | onDelete: Cascade (sessions) |
| **Session** | Sessões ativas | id (PK), userId (FK) | ✅ userId | Expira automaticamente |
| **Patient** | Pacientes | id (PK), cpf (UK) | ✅ fullName, status+fullName | onDelete: Restrict |
| **Appointment** | Agendamentos | id (PK) | ✅ professionalId+startsAt, patientId+startsAt | Constraint no-overlap |
| **Anamnesis** | Dados clínicos | id (PK) | ✅ patientId, patientId+createdAt+id | Append-only (sem UPDATE) |

**Enums Definidos**:
- `Role` (ADMIN, RECEPCAO, FISIOTERAPEUTA)
- `Sex` (FEMININO, MASCULINO, NAO_INFORMADO)
- `PatientStatus` (ATIVO, INATIVO)
- `AppointmentStatus` (AGENDADO, CANCELADO)
- `PainType` (PONTADA, QUEIMACAO, PESO, IRRADIADA)

### Migrações Aplicadas

| Data | Migration | Status | Descrição |
|------|-----------|--------|-----------|
| 2026-09-18 15:36 | `_init` | ✅ | Schema inicial |
| 2026-09-18 16:06 | `auth_usuarios` | ✅ | User, Session, Role |
| 2026-09-18 16:44 | `pacientes_cadastro` | ✅ | Patient (sem dados clínicos) |
| 2026-09-18 17:42 | `agenda_agendamentos` | ✅ | Appointment com constraint no-overlap |
| 2026-09-18 20:30 | `clinico_anamnese` | ✅ | Anamnesis (append-only) |
| 2026-09-18 21:08 | `clinico_anamnese_paintypes_not_null` | ✅ | Fix: painTypes obrigatório |
| 2026-09-19 00:34 | `cadastro_complementar` | ✅ | Sex, occupation, guardian info |

**Total**: 7 migrações sequenciais ✅

**Seed Data**:
- Arquivo: `prisma/seed.ts`
- Cria: 1 usuário ADMIN
- Validação: Zod schemas para SEED_ADMIN_* 
- Idempotente: Não altera admin existente

### 🔍 Analise de Constraints e Índices

**Constraints Críticas**:
```sql
-- Appointment_no_overlap (btree_gist)
-- Previne agendamentos sobrepostos por profissional
```

**Índices Efetivos**:
- `Patient(fullName)` - para buscas por nome
- `Patient(status, fullName)` - para filtros
- `Appointment(professionalId, startsAt)` - para agenda
- `Appointment(patientId, startsAt)` - para histórico
- `Anamnesis(patientId, createdAt DESC, id DESC)` - para versão atual

### ✅ Status do Banco

- **Desenvolvimento**: Docker Compose com PostgreSQL 17 Alpine ✅
- **Migrations Pendentes**: Nenhuma
- **Seed Status**: Pronto (aguarda SEED_ADMIN_* em prod)
- **Compatibilidade PostgreSQL**: v17 ✅

---

## ⚙️ Análise de Configuração

### Next.js

**Arquivo**: `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  /* config options here */
};
```

**Status**: 🟡 VAZIO - Configuração padrão

**Recomendações**:
```typescript
const nextConfig: NextConfig = {
  // Segurança
  poweredByHeader: false,
  
  // Performance
  swcMinify: true,
  reactStrictMode: true,
  
  // Experimental (Next.js 16)
  experimental: {
    optimizePackageImports: ["shadcn", "@base-ui/react"],
  },
  
  // Imagens
  images: {
    unoptimized: false, // true apenas em deploy estático
  },
};
```

### TypeScript

**Arquivo**: `tsconfig.json`

| Config | Valor | Status |
|--------|-------|--------|
| target | ES2017 | ✅ Compatível |
| lib | dom, esnext | ✅ Moderno |
| strict | true | ✅ Habilitado |
| noEmit | true | ✅ Apenas type-checking |
| moduleResolution | bundler | ✅ Para Next.js |
| allowJs | true | ✅ Permite .js |
| skipLibCheck | true | ✅ Ignora tipos de deps |

**Avaliação**: ✅ EXCELENTE

### Docker Compose

**Arquivo**: `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:17-alpine      # ✅ Alpine = leve
    environment: ${POSTGRES_*}     # ✅ Vars da .env
    volumes: db-data:/var/lib/postgresql/data  # ✅ Persistência
    healthcheck: pg_isready        # ✅ Health check
```

**Avaliação**: ✅ PRONTO para desenvolvimento

### Vercel

**Arquivo**: `vercel.json`

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build"
}
```

**Status**: ✅ Configurado

**Faltam em Vercel.com**:
1. ⚠️ `DATABASE_URL` (Preview)
2. ⚠️ `DATABASE_URL` (Production)
3. ⚠️ `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD`
4. ⚠️ Domínio customizado
5. ⚠️ CNAME/A records

---

## 🔐 Análise de Segurança

### Checklist de Segurança

| Item | Status | Notas |
|------|--------|-------|
| **Strict TypeScript** | ✅ | strict: true |
| **Validação Zod** | ✅ | Schemas em validation.ts |
| **Server-only Imports** | ✅ | Previne vazamento de server code |
| **Sessiontoken Hashing** | ✅ | SHA-256 no banco |
| **Cookie httpOnly** | ✅ | `secure: true` em prod |
| **CORS Policies** | ⚠️ | Não configurado |
| **Rate Limiting** | ⚠️ IMPLEMENTADO COM RESSALVA | Ver detalhamento abaixo — correção à versão anterior deste documento |
| **SQL Injection** | ✅ | Prisma previne |
| **XSS Protection** | ✅ | React + Next.js escapa HTML |
| **CSRF Tokens** | ⚠️ | Não implementado (talvez desnecessário em SPA) |
| **Dependency Audit** | 🔴 | 3 vulnerabilidades transitivas (via `prisma`) — ver seção de verificação real |
| **Secrets em Código** | ✅ | Não encontrados |

### 🔴 Correção: Rate Limiting já está implementado, mas com 2 problemas reais

A versão anterior deste documento afirmava "Rate Limiting: Placeholder para IP/email — não
implementado". Isso estava **errado**. Ao ler `src/modules/auth/actions.ts` e
`src/modules/auth/rate-limit.ts`, o rate limiting de login **existe e está ativo**:
- 5 falhas por e-mail / 15 min (`loginFailuresByEmail`)
- 30 tentativas por IP / 15 min (`loginAttemptsByIp`)

Dois problemas reais, porém, foram encontrados nessa implementação:

**1. `TRUST_PROXY` é documentado mas nunca lido no código.**
`clientIp()` em `actions.ts:22-25` sempre confia no header `x-forwarded-for` (ou `x-real-ip`),
sem checar a variável `TRUST_PROXY` descrita em `.env`:
```ts
async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}
```
O comentário em `.env` diz que, sem um proxy reverso confiável reescrevendo esse header, "o
limite por IP vira global" — mas o código não implementa esse fallback: ele sempre confia no
primeiro valor do header, que é **livremente falsificável pelo cliente** quando não há proxy
reescrevendo-o. Um atacante pode enviar `X-Forwarded-For: <valor aleatório>` a cada tentativa
para nunca bater no limite de 30/15min por IP (o limite por e-mail continua valendo, mitigando
parcialmente o risco de força bruta numa conta específica, mas não o custo de CPU do scrypt
por varredura). **Ação**: implementar a leitura de `TRUST_PROXY` e usar um IP "global" fixo
(ou a conexão TCP real, indisponível em serverless) quando `TRUST_PROXY !== "1"`.

**2. Rate limiting em memória não funciona em ambiente serverless multi-instância (Vercel).**
O próprio código documenta essa limitação (`rate-limit.ts:1-2`): *"Suficiente para o monólito
em uma única instância; com várias instâncias, trocar por armazenamento compartilhado."* Na
Vercel, cada invocação de função pode rodar em uma instância efêmera diferente — os `Map` em
memória **não são compartilhados entre invocações**, tornando o rate limit por IP/e-mail
praticamente inoperante em produção serverless (cada nova instância reseta os contadores).
**Ação antes de produção**: migrar para armazenamento compartilhado (Vercel KV/Redis, ou
uma tabela no próprio Postgres) — isso é um bloqueador de segurança real para o deploy na
Vercel, não apenas uma melhoria futura.

### 🟡 Problemas Identificados

1. **SEED_ADMIN_PASSWORD em `.env.example`**
   - ✅ É intencional (instrui a trocar)
   - Mas mostrar senha em docs não é ideal
   - Recomendação: Usar placeholder tipo `<SUA_SENHA_FORTE>`

2. **next.config.ts vazio**
   - Configurações de segurança não definidas
   - Headers de segurança não adicionados

3. **Rate limiting confia cegamente em `X-Forwarded-For` sem checar `TRUST_PROXY`**
   - Permite bypass do limite por IP via header falsificado quando não há proxy confiável
   - Ver detalhamento na seção de Análise de Segurança

4. **Rate limiting em memória não sobrevive a múltiplas instâncias serverless**
   - Cada instância da Vercel tem seu próprio contador — o limite não é global
   - Bloqueador real antes de produção na Vercel

5. **3 vulnerabilidades transitivas em dependências de build-time do Prisma**
   - `mysql2` (2) e `deepmerge-ts` (1) — não usadas em runtime (projeto é 100% PostgreSQL)
   - Sem patch estável disponível hoje (só `prisma@8.0.0-rc.15`, pre-release)

---

## 📊 Matriz de Compatibilidade Dev vs Prod

| Aspecto | Desenvolvimento | Produção | Status |
|---------|---|---|---|
| **Runtime** | Node.js (local) | Node.js (Vercel) | ✅ Compatible |
| **Database** | PostgreSQL 17 Docker | PostgreSQL gerenciado | ⚠️ Falta provisão |
| **Environment** | .env local | Vercel vars | ⚠️ Não configurado |
| **Seed Data** | `pnpm db:seed` | Manual? | ⚠️ Não documentado |
| **Migrations** | `pnpm db:migrate dev` | `prisma migrate deploy` | ⚠️ Falta script |
| **Logs** | Console | Vercel Analytics | ⚠️ Não configurado |
| **Error Tracking** | Local | Vercel Insights | ⚠️ Não configurado |

---

## ✅ Checklist de Prontidão para Produção

### Dependências
- [x] package.json atualizado
- [x] pnpm lock file presente
- [x] postinstall script gera Prisma client
- [ ] Avaliar/documentar as 3 vulnerabilidades transitivas (`pnpm audit --prod`)
- [ ] Documentar `cn` vs `clsx` conflito
- [ ] Remover `ts-node` (redundante com tsx)
- [ ] Atualizar `@types/node` para alinhar com Node v24 real em uso

### Variáveis de Ambiente
- [x] DATABASE_URL definida em .env
- [x] SEED_ADMIN_* documentadas
- [ ] DATABASE_URL configurada em Vercel (Preview + Prod)
- [ ] SEED_ADMIN_* configuradas em Vercel
- [ ] Remover/implementar DEV_QUICK_LOGIN
- [ ] Implementar leitura de TRUST_PROXY em `clientIp()` (correção de segurança, não só documentação)
- [ ] (Opcional) Adicionar SESSION_SECRET como defesa em profundidade — não é bloqueador

### Banco de Dados
- [x] Schema validado (Prisma)
- [x] 7 migrations aplicadas
- [x] Índices otimizados
- [x] Constraints implementadas
- [ ] Provisionar PostgreSQL gerenciado
- [ ] Executar migrations em prod
- [ ] Executar seed admin em prod
- [ ] Backup strategy definida

### Configuração
- [x] TypeScript strict mode (`pnpm typecheck` passou)
- [x] Lint sem erros (`pnpm lint` passou)
- [x] Build de produção passa (`pnpm build` passou)
- [x] Next.js App Router
- [x] Vercel.json configurado
- [x] Rate limiting de login implementado (por IP e por e-mail)
- [ ] next.config.ts otimizado
- [ ] Headers de segurança adicionados
- [ ] Rate limiting migrado para armazenamento compartilhado (não sobrevive a multi-instância serverless)
- [ ] `clientIp()` respeitando `TRUST_PROXY` (hoje confia sempre em `X-Forwarded-For`)
- [ ] CORS policies definidas

### Deployment
- [x] Build local testado
- [x] Scripts de build/start funcionando
- [ ] Vercel connection configurada
- [ ] Domínio associado
- [ ] SSL certificate
- [ ] Health check endpoint
- [ ] Monitoramento ativo

---

## 🎯 Roadmap de Correções (Priorizadas)

### 🔴 CRÍTICO (Bloqueia Produção)
1. **[P0] Provisionar PostgreSQL gerenciado** (Neon, AWS RDS, etc)
   - Prioridade: Hoje
   - Impacto: Sem DB, não há prod
   - Estimativa: 1h (Neon) ou 4h (AWS)

2. **[P0] Configurar DATABASE_URL em Vercel** (Preview + Prod)
   - Prioridade: Após DB provisionado
   - Impacto: Sem vars, build falha
   - Estimativa: 30min

3. **[P0] Executar migrations em produção**
   - Prioridade: Antes do deploy
   - Script: `pnpm exec prisma migrate deploy`
   - Estimativa: 10min

4. **[P0] Criar o primeiro administrador em produção de forma controlada**
   - Rodar `pnpm db:seed` uma única vez, com `SEED_ADMIN_*` reais (nunca os valores de exemplo)
   - Estimativa: 15min

5. **[P0] Migrar rate limiting de login para armazenamento compartilhado**
   - Hoje é `Map` em memória por instância — não funciona em multi-instância serverless (Vercel)
   - Opções: Vercel KV/Upstash Redis, ou tabela própria no Postgres
   - Bloqueador de segurança real, não apenas melhoria futura
   - Estimativa: 2-3h

### 🟠 ALTO (Essencial para MVP)
6. **[P1] Corrigir `clientIp()` para respeitar `TRUST_PROXY`**
   - Hoje confia sempre em `X-Forwarded-For`, falsificável sem proxy confiável
   - Estimativa: 30min

7. **[P1] Avaliar as 3 vulnerabilidades transitivas (`pnpm audit --prod`)**
   - Confirmar que não são exploráveis em runtime (driver MySQL não é usado — projeto é 100% Postgres)
   - Documentar como risco aceito ou aguardar patch/major estável do `prisma`
   - Estimativa: 30min de análise

8. **[P1] Implementar ou remover DEV_QUICK_LOGIN** (15min — variável documentada mas não lida no código)
9. **[P1] Otimizar next.config.ts** (30min)

### 🟡 MÉDIO (Recomendado antes de launch)
10. **[P2] Adicionar headers de segurança** (next.config.ts)
11. **[P2] Configurar Sentry/Error tracking**
12. **[P2] Definir backup strategy**
13. **[P2] Health check endpoint**
14. **[P2] Documentação de deployment**

### 🟢 BAIXO (Pós-launch)
15. **[P3] Remover `ts-node` do package.json**
16. **[P3] Documentar `cn` vs `clsx`**
17. **[P3] Atualizar `@types/node` para alinhar com Node v24 real**
18. **[P3] Adicionar observabilidade completa**
19. **[P3] Setup de CI/CD (GitHub Actions)** — incluir `pnpm audit --prod` no pipeline

---

## 📚 Recomendações Técnicas

### Dependências

**Adicionar**:
```json
{
  "dependencies": {
    // Rate limiting
    "@vercel/kv": "^3.x",
    
    // Error tracking (opcional)
    "@sentry/nextjs": "^8.x"
  }
}
```

**Remover**:
```json
{
  "devDependencies": {
    "ts-node": "^10.9.2"  // Redundante com tsx
  }
}
```

**Clarificar**:
- `cn` vs `clsx` - verificar uso real e unificar

### Configuração Next.js

Implementar `next.config.ts` completo:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security
  poweredByHeader: false,
  reactStrictMode: true,
  
  // Performance
  swcMinify: true,
  compress: true,
  productionBrowserSourceMaps: false,
  
  // Images
  images: {
    unoptimized: process.env.NODE_ENV === "development",
  },
  
  // Headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Variáveis de Ambiente (Prod)

Criar `.env.production.example`:

```env
# Banco de dados (OBRIGATÓRIO)
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"

# Seed (executar APENAS na primeira vez)
SEED_ADMIN_EMAIL="admin@clinica.com.br"
SEED_ADMIN_NAME="Administrador da Clínica"
SEED_ADMIN_PASSWORD="[TROCAR POR SENHA FORTE]"
ENABLE_SEED=false

# Segurança
TRUST_PROXY=1  # habilitar SOMENTE se o proxy da Vercel reescreve X-Forwarded-For de forma confiável
SESSION_SECRET="[opcional — defesa em profundidade; o design atual já dispensa AUTH_SECRET]"

# Observabilidade
LOG_LEVEL="info"
SENTRY_DSN="[opcional]"

# Deploy
NODE_ENV="production"
VERCEL_URL="https://seudominio.com"
```

### Banco de Dados

**Recomendação de Provedor**:
1. **Neon** (recomendado) - $5/mês, integra com Vercel
2. **AWS RDS** - Mais robusto, $20+/mês
3. **Digital Ocean** - Meio termo, $15+/mês

**Setup**:
```bash
# Após provisionar PostgreSQL remoto:
1. Copiar DATABASE_URL
2. Adicionar em Vercel (Preview + Prod)
3. Rodar: pnpm exec prisma migrate deploy
4. Rodar: pnpm db:seed (APENAS 1x, com SEED_ADMIN_* corretos)
```

### Scripts Sugeridos

Adicionar em `package.json`:

```json
{
  "scripts": {
    "lint:fix": "eslint . --fix",
    "format": "prettier . --write",
    "audit": "pnpm audit --prod",
    "check-types": "tsc --noEmit",
    "precommit": "pnpm lint && pnpm typecheck",
    "prod:deploy": "pnpm build && pnpm exec prisma migrate deploy"
  }
}
```

---

## 📖 Documentação Necessária

Criar os seguintes documentos:

1. **DEPLOYMENT.md**
   - Passo-a-passo de deploy
   - Setup de Vercel + DB
   - Checklist de verificação

2. **ENVIRONMENT-VARS.md**
   - Todas as variáveis documentadas
   - Valores de exemplo por ambiente
   - Como gerar SESSION_SECRET, etc

3. **DATABASE-MIGRATIONS.md**
   - Como criar nova migration
   - Workflow de desenvolvimento
   - Rollback procedures

4. **SECURITY.md**
   - Rate limiting implementado
   - Autenticação de sessão
   - Boas práticas

---

## 🎓 Resumo Executivo Final

### Veredito por Ambiente

- **Desenvolvimento**: ✅ **APTO COM RESSALVAS** — instalação reprodutível, banco local
  saudável, migrações aplicadas, typecheck/lint/build/testes passando. Ressalvas: variáveis
  não lidas no código (`DEV_QUICK_LOGIN`, `TRUST_PROXY`) e vulnerabilidades transitivas
  não avaliadas formalmente.
- **Produção**: 🔴 **NÃO APTO** — nenhuma evidência verificável de ambiente publicado.
  PostgreSQL gerenciado, `DATABASE_URL` de Preview/Production, domínio, backup, rollback,
  observabilidade e criação controlada do primeiro administrador seguem pendentes. O
  rate limiting de login também não está pronto para o modelo serverless da Vercel.

### 📈 Score de Saúde Geral: **68/100** (revisado — era 75/100 na análise estática)

| Categoria | Score | Status | Mudança |
|-----------|-------|--------|---------|
| Dependências diretas | 90/100 | ✅ Saudáveis | = |
| Dependências transitivas | 55/100 | 🔴 3 vulnerabilidades (sem patch estável ainda) | novo, corrigido |
| Configuração | 70/100 | ⚠️ Falta otimização (`next.config.ts` vazio) | = |
| Ambiente/Infraestrutura de Produção | 40/100 | 🔴 Não configurado | ⬇ (era 60) |
| Segurança | 60/100 | ⚠️ Rate limiting existe mas falha em serverless + spoofing de IP | ⬇ (era 75, corrigido) |
| Banco de Dados | 95/100 | ✅ Pronto, verificado com migrações reais aplicadas | = |
| Qualidade de código (typecheck/lint/build/testes) | 100/100 | ✅ Tudo passou nesta verificação | novo |

### ✅ O que Está Bom (confirmado por execução real)

- `pnpm install --frozen-lockfile --offline`, `typecheck`, `lint`, `build` e `test` passam
- Docker PostgreSQL 17 saudável, 7 migrações aplicadas e verificadas
- Schema bem desenhado, com constraints e índices corretos
- Rate limiting de login **existe** (por IP e por e-mail, corrigindo afirmação anterior)
- Sem secrets hardcoded no código

### ⚠️ O que Precisa Ser Feito

**Antes de ir para produção (bloqueadores reais):**
1. Provisionar PostgreSQL gerenciado (1-2h)
2. Configurar `DATABASE_URL` em Vercel — Preview e Production (30min)
3. Executar `prisma migrate deploy` em produção (10min)
4. Criar o primeiro administrador de forma controlada via `pnpm db:seed` (15min)
5. Migrar rate limiting para armazenamento compartilhado — não sobrevive a multi-instância serverless (2-3h)
6. Corrigir `clientIp()` para respeitar `TRUST_PROXY` em vez de confiar sempre em `X-Forwarded-For` (30min)
7. Avaliar as 3 vulnerabilidades transitivas do `pnpm audit --prod` e documentar a decisão (30min)

**Recomendado antes do launch:**
8. Implementar ou remover `DEV_QUICK_LOGIN` (20min)
9. Otimizar `next.config.ts` com headers de segurança (30min)
10. Setup de erro tracking / observabilidade (1h)
11. Trocar o placeholder de `SEED_ADMIN_PASSWORD` em `.env.example` por algo inequivocamente fictício (5min)

### 📅 Estimativa Total: 1-2 dias de trabalho para desbloquear produção

---

## 📞 Próximos Passos

1. **Hoje**: Provisionar PostgreSQL gerenciado (Neon ou equivalente) e configurar `DATABASE_URL` em Vercel
2. **Hoje**: Aplicar migrações em produção e criar o administrador via seed controlado
3. **Amanhã**: Corrigir rate limiting (armazenamento compartilhado + respeito a `TRUST_PROXY`)
4. **Amanhã**: Avaliar vulnerabilidades transitivas e resolver variáveis não lidas no código
5. **Amanhã**: Otimizar `next.config.ts` e configurar observabilidade básica

---

**Auditoria original (análise estática)**: 2026-09-19 — Claude Haiku 4.5
**Revisão com execução real de comandos e reconciliação de achados**: 2026-09-19 — Claude Sonnet 5
**Próxima Auditoria Recomendada**: após provisionar produção, e depois a cada 3 meses
