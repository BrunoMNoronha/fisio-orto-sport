# Pipeline de desenvolvimento, Preview e Production

Decisão de Bruno em 04/10/2026. `main` é a branch principal de desenvolvimento;
`production` reúne os candidatos a release. A atualização de `production`
publica em Preview. O acionamento manual de Production é a liberação humana.

Implantação e homologação inicial registradas em
[evidencias/pipeline-preview-2026-10-04](evidencias/pipeline-preview-2026-10-04.md).

```text
main → PR manual para production → CI → migração Neon Preview → Vercel Preview
     → homologação → workflow manual → migração Neon Production
     → novo build do mesmo SHA → deployment Production sem domínios
     → verificação HTTP → atribuição dos domínios
```

## Workflows e controles

São três workflows em `.github/workflows/`:

| Workflow | Gatilho | Resultado |
|---|---|---|
| `CI` | Push em `main`, PR para `main`/`production` e chamada pelo Preview | Node 24, pnpm 11.25.0, PostgreSQL 18 descartável; instalação congelada, typecheck, lint, testes unitários, controles de release, integração e build |
| `Deploy Preview` | Push em `production`; acionamento manual para repetir uma execução | CI aprovado, conferência de ambiente, `prisma migrate deploy`, build com Preview, deploy Preview e manifesto |
| `Deploy Production (manual)` | Acionamento manual na branch `production`, com `preview_run_id` | Validação do candidato, recuperação registrada, migração produtiva, novo build Production, publicação sem domínios, verificação e promoção |

PR para `production` deve vir de `main` do próprio repositório. CI bloqueia
outras origens. A proteção da branch exige PR e o check `check`, sem exclusão
ou force push. Nenhum reviewer adicional é obrigatório: o disparo manual
do workflow produtivo é o ponto de liberação escolhido.

Os dois deploys compartilham o grupo de concorrência
`fisio-orto-sport-release`, sem cancelar execução em andamento. O workflow
recusa SHA que já não seja o atual de `production`. A fila do GitHub pode
substituir uma execução ainda pendente; nesse caso, execute o Preview atual.

Na Vercel: Next.js, Node 24, região `gru1`, Production Branch `production`.
`vercel.json` define `git.deploymentEnabled: false`. O projeto também ignora
builds disparados pela integração Git (`exit 0`), e a atribuição automática
de domínios está desligada. Os workflows usam Vercel CLI 62.2.0 com
autenticação por `VERCEL_TOKEN`, suportada nessa versão.

Migrações e seed ficam fora do build. `prisma.config.ts` prefere
`DATABASE_URL_UNPOOLED`; na ausência dela, usa `DATABASE_URL` para o ambiente
local. A aplicação continua lendo `DATABASE_URL` com pooling.

## Alvos e isolamento

Os identificadores públicos esperados estão em `scripts/pipeline/targets.json`.
O helper `release.mjs` exige que variables e URLs correspondam a eles antes
de migrar. Confere host, banco, role, pooling e TLS sem imprimir credenciais.

| Ambiente | Branch Neon | Endpoint | Banco / role |
|---|---|---|---|
| Production | `production` / `br-divine-pine-acip2yet` | `ep-plain-cherry-acntveqy.sa-east-1.aws.neon.tech` | `neondb` / `neondb_owner` |
| Preview | `preview` / `br-rough-block-ac7wwnvx` | `ep-blue-grass-ack24t6t.sa-east-1.aws.neon.tech` | `neondb` / `preview_owner` |

Projeto Neon: `falling-star-59523600`, PostgreSQL 18, `aws-sa-east-1`.
Production é a antiga branch `main`, renomeada sem trocar endpoint nem dados.
Preview é uma branch root persistente, sem expiração, criada com apenas o
schema. Não pode ser resetada a partir de Production.

O bootstrap comparou o schema e conferiu que as tabelas estavam vazias.
Somente o histórico técnico de `_prisma_migrations` foi inicializado, com
as 24 migrações existentes e os mesmos nomes/checksums. Não reaplicar as
migrações iniciais sobre esse schema. Execuções seguintes usam
`prisma migrate deploy`, idempotente para migrações já aplicadas.

Preview recebe administrador próprio pelo seed existente, executado uma vez
contra a conexão Preview, com credencial privada. Para novo bootstrap pela
web, configurar `SETUP_TOKEN` temporariamente e removê-lo após o cadastro.
Nenhum `SETUP_TOKEN` deve permanecer no ambiente durante uma release.
Homologação usa somente cadastros fictícios. Os recursos automáticos de
geração e limpeza seguem restritos ao desenvolvimento local.

## Variáveis e secrets

GitHub usa os ambientes **Preview** e **Production**, ambos limitados à
branch `production`. As conexões são cadastradas diretamente do Neon em
cada ambiente. O secret legado `DATABASE_URL_POOLE` é removido.

| Nome | GitHub | Vercel / uso |
|---|---|---|
| `DATABASE_URL` | Secret próprio por ambiente | Conexão com pooling própria em Preview/Production |
| `DATABASE_URL_UNPOOLED` | Secret próprio por ambiente | Conexão direta para migrações; nunca reutilizar entre ambientes |
| `VERCEL_TOKEN` | Secret por ambiente, com acesso ao projeto | Autenticação da CLI e verificações da API; não é variável da aplicação |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secret por ambiente | Apenas header das verificações HTTP protegidas; não é gravado nos manifests |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Variables por ambiente | Projeto Vercel existente, validado pelo helper |
| `NEON_PROJECT_ID`, `NEON_BRANCH_ID`, `NEON_HOST`, `NEON_DATABASE`, `NEON_ROLE` | Variables por ambiente | Alvo esperado, sem senha |
| `SETUP_TOKEN` | Ausente nos workflows | Somente bootstrap web temporário |
| `POSTGRES_*`, `SEED_ADMIN_*`, `DEMO_DATA_TARGET`, `DEV_RESET_TARGET`, `INTEGRATION_DATABASE_URL` | Ausentes nos ambientes de release | Docker local, bootstrap específico ou CI descartável |

As variáveis Production gerenciadas pela integração Neon ficam preservadas
nesse escopo. Preview possui configuração independente e credenciais
próprias. A autenticação da aplicação não usa `AUTH_SECRET`.

## Liberação de uma versão

1. Desenvolver em `main` e obter CI aprovado.
2. Abrir e mesclar manualmente o PR de `main` para `production`.
3. Aguardar `Deploy Preview`. Seu artefato `preview-release` contém SHA,
   ID da execução, ID do deployment, URL e digest das migrações, sem secrets.
4. No Preview, conferir login, navegação autenticada, persistência da sessão,
   acesso a `/configuracoes` e logout. Conferir que uma sessão encerrada não
   permite nova consulta da rota protegida. Usar dados fictícios.
5. Abrir Actions → `Deploy Production (manual)` → Run workflow. Selecionar
   **production** e informar o ID da execução de Preview bem-sucedida.
6. Aguardar a publicação e conferir deployment `READY`, domínio, login,
   sessão, rota protegida e logout em Production.

Production rejeita Preview malsucedido, artefato ausente, deployment de outro
projeto/ambiente, SHA divergente e migrações diferentes. Constrói novamente
o mesmo SHA usando as variáveis Production. Não promover o artefato Preview,
pois ele contém a configuração de Preview.

O deployment produtivo começa com `--prod --skip-domain`. Somente após
confirmar `READY`, SHA e os checks HTTP de login/rota protegida o workflow
executa `vercel promote`. Checks HTTP não substituem a homologação de sessão
autenticada. Falha de migração ou verificação anterior à promoção impede
a atribuição dos domínios e preserva o deployment anterior.

## Recuperação

Antes da migração produtiva, o workflow grava e publica o artefato
`production-recovery-<run_id>` com deployment anterior, SHA, branch Neon,
timestamp UTC e a janela PITR de seis horas. Esse registro é uma referência
para recuperação; não cria snapshot nem amplia a janela do Neon.

As migrações precisam ser compatíveis com a versão ainda publicada. SQL com
`DROP`, `TRUNCATE`, `DELETE FROM` ou alterações de tipo/NOT NULL é bloqueado
pelo helper para exigir procedimento específico. O filtro não comprova
compatibilidade semântica: revisar migrações e estratégias de expansão e
contração no PR antes da liberação manual.

Se a migração falhar, conferir `_prisma_migrations` e logs técnicos, corrigir
a causa e usar o procedimento Prisma apropriado. Não repetir SQL manual
nem marcar migração resolvida sem verificar seu estado real.

Rollback da aplicação: conferir o ID registrado, compatibilidade com o schema
atual e executar `pnpm dlx vercel@62.2.0 rollback <deployment-anterior>` com
as credenciais do projeto. Não altera o banco.

Recuperação do banco: Bruno escolhe o ponto UTC dentro das seis horas,
restaura em destino Neon isolado, confere schema e dados e define a troca de
conexões/retomada. Isso exige procedimento específico e avaliação das escritas
posteriores. Não há reversão automática do banco. Ver a política em
[15-retencao-rastreabilidade-recuperacao](15-retencao-rastreabilidade-recuperacao.md).

## Referências oficiais

- [Configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration).
- [Deploy sem atribuição automática de domínios](https://vercel.com/docs/cli/deploy#skip-domain).
- [Migrações Prisma no Neon](https://neon.com/docs/guides/prisma-migrations).
- [Transferência de propriedade entre roles Neon](https://neon.com/docs/manage/databases#transfer-database-table-ownership-between-roles).
