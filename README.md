# TechLab+  Fisio OrtoSport

> Sistema web para gestão de clínicas de fisioterapia, centralizando pacientes, agenda, avaliações, planos terapêuticos, sessões, evolução clínica e financeiro em uma única plataforma.

## Sobre o projeto

O **TechLab+  Fisio OrtoSport** é uma plataforma desenvolvida para simplificar e organizar a rotina de clínicas e profissionais de fisioterapia.

O sistema busca reduzir processos manuais e informações descentralizadas, oferecendo uma visão integrada de toda a jornada do paciente:

```text
Paciente
   ↓
Agendamento
   ↓
Avaliação inicial
   ↓
Plano terapêutico
   ↓
Sessões
   ↓
Evolução clínica
   ↓
Alta / Continuidade
```

Além do acompanhamento clínico, a plataforma poderá centralizar atividades administrativas, financeiras e operacionais da clínica.

---

## Objetivos

O TechLab+  Fisio OrtoSport tem como principais objetivos:

- centralizar as informações dos pacientes;
- facilitar o gerenciamento da agenda;
- registrar avaliações fisioterapêuticas;
- estruturar planos terapêuticos;
- acompanhar sessões e evolução clínica;
- manter histórico completo dos atendimentos;
- melhorar a organização da clínica;
- reduzir tarefas administrativas manuais;
- facilitar o acompanhamento financeiro;

---

## Funcionalidades

### Pacientes

- Cadastro de pacientes;
- Informações pessoais e de contato;
- Histórico clínico;
- Anamnese;
- Condições e observações relevantes;
- Histórico de atendimentos;
- Documentos e anexos;
- Busca e filtros.

---

### Agenda

- Agendamento de consultas e sessões;
- Visualização diária, semanal e mensal;
- Reagendamento;
- Cancelamento;
- Bloqueio de horários;
- Agenda por profissional.

---

### Avaliação fisioterapêutica

Registro estruturado da avaliação inicial do paciente, permitindo armazenar informações como:

- queixa principal;
- histórico da condição;
- avaliação funcional;
- amplitude de movimento;
- força muscular;
- dor;
- limitações;
- testes específicos;
- observações clínicas;
- diagnóstico fisioterapêutico;
- objetivos terapêuticos.

---

### Plano terapêutico

Permite definir e acompanhar o planejamento do tratamento:

- objetivos;
- exercícios;
- técnicas utilizadas;
- quantidade prevista de sessões;
- reavaliações;

---

### Sessões

Cada atendimento poderá possuir seu próprio registro contendo:

- data e horário;
- profissional responsável;
- exercícios;
- técnicas aplicadas;
- observações;
- evolução clínica;
- próximos passos.

---

### Evolução clínica

O sistema permitirá acompanhar a evolução do paciente ao longo do tratamento.

```text
Avaliação inicial
       ↓
   Sessão 01
       ↓
   Sessão 02
       ↓
   Sessão 03
       ↓
   Reavaliação
       ↓
Continuidade / Alta
```

O histórico deverá permitir visualizar facilmente a progressão do tratamento.

---

### Profissionais

- Cadastro de profissionais;
- Especialidades;
- Dados profissionais;
- Agenda individual;
- Pacientes vinculados;
- Histórico de atendimentos.

---

### Financeiro

Planejado para contemplar:

- cobrança de consultas e sessões;
- pagamentos;
- formas de pagamento;
- contas a receber;
- fluxo financeiro;
- relatórios.

---

### Relatórios

O sistema poderá disponibilizar indicadores como:

- quantidade de atendimentos;
- novos pacientes;
- sessões realizadas;
- tratamentos concluídos;
- faturamento;
- produtividade por profissional;

---

## Perfis de acesso

O TechLab+  Fisio OrtoSport deverá possuir controle de acesso baseado em perfis.

### Administrador

Acesso completo ao sistema.

Responsável por:

- usuários;
- configurações;
- profissionais;
- financeiro;
- relatórios;
- permissões.

### Recepção

Responsável principalmente por:

- pacientes;
- agenda;
- agendamentos;
- pagamentos;
- atividades administrativas.

### Fisioterapeuta

Responsável principalmente por:

- avaliações;
- prontuário;
- sessões;
- planos terapêuticos;
- evolução clínica;
- acompanhamento dos pacientes.

---

## Segurança

O projeto deverá considerar:

- autenticação segura;
- autorização baseada em perfis;


---

## Stack sugerida
React
Next.js
Tailwind CSS
shadcn
Prisma

### Banco de dados

```text
PostgreSQL
```

### Gerenciamento de dependências

```text
pnpm
```

### Testes

```text
Jest
```

### Infraestrutura

```text
Docker composer
```

---

## Execução local

Pré-requisitos: Node.js 20.9+ (testado com 24), pnpm 11 e Docker.

```bash
cp .env.example .env      # ajuste as variáveis (inclusive SEED_ADMIN_*)
pnpm install              # também gera o Prisma Client (postinstall)
pnpm db:up                # sobe o PostgreSQL via Docker Compose
pnpm db:migrate           # aplica as migrações do Prisma
pnpm db:seed              # cria o primeiro Administrador (idempotente)
pnpm dev                  # http://localhost:3000 → /login
```

Variáveis do `.env` (modelo em `.env.example`):

| Variável | Uso |
|---|---|
| `POSTGRES_*`, `DATABASE_URL` | Banco local via Docker Compose |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Primeiro Administrador criado por `pnpm db:seed`. Senha com no mínimo 8 caracteres. Se o e-mail já existir, o seed não altera nada. |

A autenticação não usa segredo de assinatura (`AUTH_SECRET`). A sessão é um token aleatório num cookie `httpOnly`, e o banco guarda só o hash dele. Detalhes em [`src/modules/auth/README.md`](src/modules/auth/README.md).

| Script | Função |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Desenvolvimento, build e servidor de produção |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Gera tipos de rotas do Next.js e roda `tsc --noEmit` |
| `pnpm test` | Jest + Testing Library |
| `pnpm db:up` / `pnpm db:down` | Sobe/derruba o PostgreSQL local |
| `pnpm db:migrate` / `pnpm db:generate` / `pnpm db:studio` | Migrações, geração do client e Prisma Studio |
| `pnpm db:seed` | Cria o primeiro Administrador a partir do `.env` |

---

## Deploy

Produção roda na **Vercel**, com banco **PostgreSQL gerenciado no Neon** (`sa-east-1`).

### Fluxo

Todo push na `main` dispara, em paralelo:

1. **Build e publicação na Vercel** — via integração nativa Vercel ↔ GitHub. Não há token da Vercel no repositório; a configuração fica em [`vercel.json`](vercel.json) (framework, `pnpm install --frozen-lockfile`, `pnpm build`). O Prisma Client é gerado pelo `postinstall`.
2. **Migrações do banco** — workflow [`deploy-migrations`](.github/workflows/deploy-migrations.yml), que roda `prisma migrate deploy` quando `prisma/schema.prisma` ou `prisma/migrations/**` mudam. Também pode ser disparado manualmente (`workflow_dispatch`).

Outras branches continuam gerando Preview Deployments na Vercel; produção sai apenas da `main`.

> **Migrações destrutivas exigem duas etapas.** O deploy e a migração disparam no mesmo push, sem ordem garantida entre si. Migrações aditivas são seguras. Para remover ou renomear coluna/tabela: primeiro um push com a migração aditiva e o código compatível com os dois formatos; depois outro push com a migração de remoção.

### Configuração exigida (uma vez)

| Onde | Variável | Valor |
|---|---|---|
| Vercel → Settings → Environment Variables (Production) | `DATABASE_URL` | Connection string **pooled** do Neon (host com `-pooler`, `sslmode=require`) |
| GitHub → Settings → Secrets and variables → Actions | `DATABASE_URL` | Connection string **direta** do Neon (sem `-pooler`) — o pooler não suporta os advisory locks do `prisma migrate deploy` |

Na Vercel, conecte o repositório e mantenha a *Production Branch* em `main`.

A `DATABASE_URL` precisa existir em Production **antes do primeiro deploy**: `src/lib/db.ts` lança erro na criação do Prisma Client sem ela, e o build falha na prerenderização.

Opcional, recomendado: criar o Environment `production` no GitHub com *required reviewers*, para aprovar cada migração antes de ela ser aplicada.

### Primeiro administrador

Há dois caminhos, e ambos são fechados assim que existir qualquer usuário no banco.

**1. Pela web (`/primeiro-acesso`)** — recomendado em produção. Enquanto não houver nenhum
usuário cadastrado, `/login` redireciona para essa tela; a conta criada nela é sempre
**Administrador** e o acesso já entra logado. Depois disso a rota responde 404.

> Enquanto o banco estiver vazio, quem acessar a URL vira Administrador. Faça o cadastro
> logo após o primeiro deploy. Detalhes e o motivo da decisão em
> [`src/modules/auth/README.md`](src/modules/auth/README.md).

**2. Por linha de comando (`pnpm db:seed`)** — útil em ambiente local e automação:

```bash
DATABASE_URL="<connection string direta do Neon>" \
SEED_ADMIN_NAME="..." SEED_ADMIN_EMAIL="..." SEED_ADMIN_PASSWORD="..." \
pnpm db:seed
```

O seed é idempotente: se o e-mail já existir, nada é alterado.

> O schema `neon_auth` presente no banco foi criado pelo Neon Auth e **não é usado** por esta aplicação, que tem autenticação própria. As migrações do Prisma operam apenas no schema `public`.

---

## Domínios principais

Uma possível divisão inicial dos módulos:

```text
Auth
│
├── Usuários
├── Perfis
└── Permissões

Pacientes
│
├── Cadastro
├── Histórico
├── Documentos
└── Dados clínicos

Agenda
│
├── Agendamentos
├── Disponibilidade
├── Cancelamentos
└── Presença

Clínico
│
├── Avaliações
├── Planos terapêuticos
├── Sessões
├── Evoluções

Profissionais
│
├── Cadastro
├── Especialidades
└── Agenda

Financeiro
│
├── Cobranças
├── Pagamentos
├── Pacotes
└── Relatórios

Auditoria
│
├── Eventos
├── Histórico
└── Logs
```

---

## Fluxo principal

```mermaid
flowchart TD
    A[Cadastro do paciente] --> B[Agendamento]
    B --> C[Avaliação inicial]
    C --> D[Plano terapêutico]
    D --> E[Sessão]
    E --> F[Evolução clínica]
    F --> G{Continuar tratamento?}
    G -->|Sim| E
    G -->|Reavaliar| H[Reavaliação]
    H --> D
    G -->|Não| I[Alta]
```

---

## Princípios do projeto

### Simplicidade

Evitar complexidade arquitetural sem necessidade real.

### Modularidade

Cada domínio deve possuir responsabilidades claras.


### Escalabilidade gradual

Começar simples e adicionar infraestrutura somente quando houver necessidade comprovada.

---

## Qualidade

Toda funcionalidade relevante deve considerar:

```text
Implementação
     ↓
Testes unitários
     ↓
Lint / TypeScript
     ↓
Build
```

Casos de teste devem contemplar, quando aplicável:

- fluxo principal;

---

## Roadmap inicial

### Fase 1 — Fundação

- [x] Estrutura inicial do projeto;
- [x] Banco de dados;
- [x] Autenticação;
- [x] Usuários;
- [x] Perfis e permissões;

### Fase 2 — Pacientes

- [x] Cadastro;
- [x] Consulta;
- [x] Edição;
- [ ] Histórico;
- [x] Anamnese subjetiva versionada;
- [x] Cadastro complementar da ficha (sexo, profissão e CREFITO do fisioterapeuta).
- [x] Documentos de impressão (termo, cartão de frequência e ficha de anamnese), gerados sem armazenamento.

### Fase 3 — Agenda

- [x] Agenda dos profissionais por período;
- [x] Agendamento;
- [x] Reagendamento;
- [x] Cancelamento;
- [x] Visões dia, semana e lista;
- [ ] Bloqueio de horários, horário de funcionamento, presença e visão mensal;

### Fase 4 — Prontuário

- [ ] Avaliação inicial;
- [ ] Plano terapêutico;
- [ ] Registro de sessões;
- [ ] Evoluções;
- [ ] Reavaliação;

### Fase 5 — Financeiro

- [ ] Cobranças;
- [ ] Pagamentos;
- [ ] Controle financeiro;
- [ ] Relatórios.

### Fase 6 — Evoluções futuras

- [ ] Notificações;
- [ ] Integração com WhatsApp;
- [ ] Assinatura digital;
- [ ] Portal do paciente;
- [ ] Aplicativo mobile;
- [ ] Teleatendimento;
- [ ] Dashboards avançados;
- [ ] Inteligência artificial para apoio operacional e documental.

---

## Status

```text
🚧 Em desenvolvimento — Fases 1 e 2 implementadas; primeira fatia da Fase 3 implementada; Fase 4 planejada.
```

O roadmap detalhado, separado por status e responsabilidade, está em [`docs/project/roadmap.md`](docs/project/roadmap.md). O briefing modular está em [`docs/PROJECT.md`](docs/PROJECT.md).

Os requisitos e a arquitetura poderão evoluir conforme necessidades reais da operação forem identificadas.

---

## Licença

A licença do projeto deverá ser definida antes da distribuição ou disponibilização pública do código.

---

# TechLab+  Fisio OrtoSport

**Gestão clínica organizada. Atendimento com continuidade. Evolução acompanhada.**
