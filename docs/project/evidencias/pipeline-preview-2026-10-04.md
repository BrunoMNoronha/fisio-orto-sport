# Evidência da implantação da pipeline — 04/10/2026

Escopo aprovado por Bruno: dois ambientes persistentes, desenvolvimento em
`main`, candidato em `production`, Preview automático e Production manual.
Procedimento vigente em [pipeline-deploy](../pipeline-deploy.md).

## Código e CI

- Implementação: commit `5eb3eb33ac13735e04ed0cf774c78a1a2851d116` em `main`.
- [PR #84](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/84), de `main`
  para `production`, mesclado após CI aprovado. Candidato:
  `8552f1b01bab4ae988e0584a69d5ac9dccbe24e9`.
- [CI do PR](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/37240675900)
  aprovado: Node 24, pnpm 11.25.0, instalação congelada, typecheck, lint,
  856 testes unitários, 9 testes dos controles de release, 147 testes de
  integração em PostgreSQL 18 descartável e build.
- Instalação congelada, typecheck, lint, testes unitários/controles e build
  também passaram localmente. Integração comprovada no CI.

## Configuração conferida

- GitHub: apenas `main` e `production`, com `main` como principal.
  `production` exige PR/check `check`, aplica proteção também ao administrador
  e bloqueia exclusão/force push. PR de release exige origem `main` do mesmo
  repositório. Os dois ambientes GitHub aceitam apenas `production`, sem
  reviewer adicional obrigatório.
- Os dois commits exclusivos da antiga branch Claude foram preservados em
  `arquivo/claude-tender-meitner-p22a4m-2026-10-04`, apontando para
  `c18a78c068644ea934fe23cff75ec609aa07171f`. A branch foi removida após
  conferir a tag remota. `feat/auth-perfis` foi removida após confirmar que
  estava incorporada em `main`.
- Três workflows ativos: CI, Deploy Preview e Deploy Production (manual).
- Vercel: mesmo projeto `prj_EXTtYsk845lwKW8pbRhIr0oDLI3H`, Next.js, Node 24,
  região `gru1`. Production Branch alterada por Bruno para `production` e
  verificada pelo preflight. Git deploy desabilitado no código, ignored build
  step `exit 0` no projeto e atribuição automática de domínios desabilitada.
- `DATABASE_URL` e `DATABASE_URL_UNPOOLED` canônicas nos secrets de cada
  ambiente GitHub. `DATABASE_URL_POOLE` removido. IDs e alvos Neon em variables.
  Token cadastrado por Bruno nos dois ambientes; acesso confirmado na execução
  Preview. Production valida seu token antes de migrar.
- Vercel Preview tem URLs próprias da role `preview_owner`, sem variáveis
  produtivas. Variáveis gerenciadas pela integração Neon permanecem somente
  em Production. `SETUP_TOKEN` e recursos de geração/limpeza local ausentes.
- O bypass HTTP está habilitado e guardado nos secrets GitHub. A Vercel exige
  manter um bypass também como variável automática de deployments; o código
  da aplicação não o utiliza. Não aparece nos manifests.

## Neon

- Projeto `falling-star-59523600`, PostgreSQL 18, `aws-sa-east-1`.
- A antiga branch `main` passou a `production`, preservando ID, endpoint e
  credencial produtiva. Conferência posterior em leitura: 24 migrações,
  zero pendências e checksums compatíveis com o repositório.
- Preview é root persistente, sem expiração, com apenas schema. O bootstrap
  conferiu tabelas vazias e inicializou somente o histórico técnico Prisma
  de 24 migrações. Nenhum registro clínico ou usuário produtivo copiado.
- A role `preview_owner` possui as 19 tabelas públicas, com permissões de
  criação/alteração verificadas em transação revertida. A credencial herdada
  de `neondb_owner` foi rotacionada somente no Preview.
- Duas execuções consecutivas de `prisma migrate deploy` no Preview
  confirmaram ausência de pendências. O workflow repetiu a conferência.
- Administrador fictício `admin.preview@example.test` criado pelo seed
  existente, com senha própria. Não foi necessário configurar `SETUP_TOKEN`.
- Janela PITR confirmada: 21600 segundos, seis horas. Não ampliada.

## Preview publicado e homologado

| Campo | Evidência |
|---|---|
| Execução | [37240884423](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/37240884423), concluída com sucesso |
| SHA | `8552f1b01bab4ae988e0584a69d5ac9dccbe24e9` |
| Deployment | `dpl_HUQUaXakGee4kJtMFKRW33Gwh6Fb`, `READY`, alvo Preview |
| URL | [Preview](https://fisio-orto-sport-ar9z7qqlt-bruno-m-noronha.vercel.app) |
| Framework / região | Next.js / `gru1` |
| Build Vercel | 21 segundos; migração anterior ao build/deploy |
| Manifesto | Artefato `preview-release`, com SHA, execução, URL, ID e digest das migrações; sem secrets |

Verificação real pelo navegador `agent-browser`, com conta fictícia e bypass
HTTP: login aceito; administrador identificado; `/configuracoes` acessível;
sessão preservada após navegação e recarga; logout redirecionou para `/login`;
novo acesso à rota protegida voltou ao login. A aba Desenvolvimento não é
exibida nesse ambiente. Nenhum dado clínico foi criado nessa homologação.

O candidato real foi conferido com `assertCandidate` contra a execução GitHub,
SHA atual de `production` e digest local: válido para liberação manual. Isso
não executou o workflow produtivo.

## Production permanece pendente da liberação manual

Production não foi migrada nem publicada nessa implantação da pipeline.
Deployment anterior preservado: `dpl_DLGwiETe1d5GcMiTarwCWctxgKkK`, commit
`20b32826fc3b219606bfffe254f8df119ec0f941`.

Para liberar: Actions → `Deploy Production (manual)` → selecionar
`production` → informar `preview_run_id = 37240884423`. O workflow confere
novamente o candidato, registra recuperação, migra, constrói com variáveis
Production e verifica o deployment antes de atribuir domínios. Após a
publicação, verificar domínio, login, sessão, rota protegida e logout no alvo
produtivo. Essa validação produtiva permanece pendente.

Arquivos locais pendentes, `.env` e as configurações de desenvolvimento foram
preservados. Credenciais do administrador Preview ficam em arquivo local
ignorado; nenhum valor sensível foi versionado.
