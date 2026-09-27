# VAL-02 — Evidências técnicas da produção (#42)

Coleta de 27/09/2026. Em produção, tudo foi feito só com leitura: nenhum
deploy manual, migração, seed, usuário ou dado foi criado ou alterado. As exceções
autorizadas foram a restauração isolada (item 7) e os deploys automáticos dos
merges de documentação. Não há valores de variáveis nem dados pessoais neste
documento.

Legenda: **COMPROVADO** (evidência coletada), **LIMITAÇÃO** (o que a evidência
não cobre).

**Situação final:** todos os critérios da #42 têm evidência. As limitações estão
reunidas no item 9.

## 1. Alvo publicado — COMPROVADO

| Item | Valor |
|---|---|
| SHA em produção | `e39ae21508f88030324cbdff0b24d9f82466fff1` (= `main` em 27/09/2026) |
| Deployment GitHub | 6685135513, ambiente Production, status `success` (26/09/2026 22:37 UTC) |
| URL do deployment | https://fisio-orto-sport-p7aooftww-bruno-m-noronha.vercel.app |
| URL de produção | https://fisio-orto-sport.vercel.app (região `gru1`) |
| CI | run 36276837020, `success`: 61 suítes / 628 testes Jest; 65 testes de integração, 0 falhas |

O alvo mudou desde o registro original da issue (09dc016 → e39ae21), por isso
foi revalidado. Se `main` mudar, repetir esta seção.

**Revalidação de 27/09/2026, ~14:00 UTC.** O alvo mudou para
`7c4d4c798e483c8f0ff989d27e5df2184613ef4d` (merge da PR #60). Desde `e39ae21`, a
diferença é só de documentação (`docs/project/`), sem código nem migração.

| Item | Valor |
|---|---|
| Deployment GitHub | 6693027901, Production, `success` (27/09/2026 13:49 UTC) |
| URL do deployment | https://fisio-orto-sport-hzni5fp6b-bruno-m-noronha.vercel.app |
| CI | run 36323725948, `success`: 61 suítes / 628 testes Jest; 65 de integração, 0 falhas |
| Rotas sem sessão | `/login` 200; `/`, `/pacientes`, `/agenda` → 307 para `/login` (tabela do item 2 continua válida) |

**Revalidação final de 27/09/2026, ~14:40 UTC.** O alvo mudou para
`19decfa95f0bf91bfebbab495a21e054d16c525a` (merge da PR #61). Desde `e39ae21`,
continua só documentação.

| Item | Valor |
|---|---|
| Deployment GitHub | 6693533421, Production, `success` (27/09/2026 14:36 UTC) |
| URL do deployment | https://fisio-orto-sport-llubi6j1n-bruno-m-noronha.vercel.app |
| CI | run 36326508196, `success`: 628 testes Jest; 65 de integração, 0 falhas |
| Rotas sem sessão | `/login` 200 depois do deploy |

O merge da PR que registra este fechamento também só altera documentação. Por
isso, não muda o código publicado nem as evidências abaixo.

## 2. Acesso sem sessão — COMPROVADO

| Rota | Resposta |
|---|---|
| `/login` | 200 |
| `/` | 307 → `/login` |
| `/pacientes` | 307 → `/login?next=%2Fpacientes` |
| `/agenda` | 307 → `/login?next=%2Fagenda` |

`Strict-Transport-Security` presente. O HTML de `/login` não contém a lista de
acesso rápido; no código ela só existe com `NODE_ENV=development`
(`src/modules/auth/dev-login.ts`) e a action responde 404 fora dele.

## 3. Migrações — COMPROVADO (leitura no Neon)

Projeto Neon `falling-star-59523600` (Postgres 18, `aws-sa-east-1`), branch
`main` (única).

- `_prisma_migrations`: 14 linhas, 14 concluídas, 0 revertidas; última
  `20260926220000_auth_rate_limit`.
- Os 14 checksums registrados são idênticos ao sha256 de cada
  `prisma/migrations/*/migration.sql` do SHA publicado. Não há migração pendente.
- Usuários por perfil: 3 `ADMIN`, nenhum `RECEPCAO` ou `FISIOTERAPEUTA`.

## 4. Variáveis de produção — COMPROVADO

Conferido em 27/09/2026 no painel da Vercel (Settings → Environment Variables),
só pelos nomes, sem abrir valores. A lista foi comparada com o inventário de
[15-retencao-rastreabilidade-recuperacao](../15-retencao-rastreabilidade-recuperacao.md#inventário-de-variáveis-de-produção-b1).

- [x] Há 18 variáveis, todas `DATABASE_*` da integração Neon, entre elas
      `DATABASE_URL` e `DATABASE_URL_UNPOOLED`. Todas estão só em Production.
- [x] `SETUP_TOKEN` está **ausente**, como o inventário exige quando já há
      usuários.
- [x] Não existem `SEED_ADMIN_*`, `POSTGRES_*` (sem o prefixo `DATABASE_`),
      `INTEGRATION_DATABASE_URL` nem `TRUST_PROXY`.
- [x] Nenhuma variável está em Preview ou Development.

## 5. Roteiro autenticado por perfil — COMPROVADO (build de produção local) — LIMITAÇÃO

Claude não digita senhas em produção. Além disso, a produção só tem `ADMIN` e
criar contas reais de teste lá não foi autorizado. Por isso, o roteiro rodou
com o **mesmo código publicado**: `next build` + `next start`
(`NODE_ENV=production`) em `localhost:3100`, contra o banco local com as mesmas
14 migrações. Foram usadas contas descartáveis `teste-*-val02@example.test`,
criadas para o teste e **desativadas no fim**, com as sessões apagadas.

- [x] Na build de produção, a tela de login não mostra o acesso rápido de
      desenvolvimento.
- [x] Senha errada mostra a mensagem genérica "E-mail ou senha inválidos."
      Na 6ª tentativa com o mesmo e-mail, a resposta passa a ser "Muitas
      tentativas de acesso…" (limite de 5 por e-mail).
- [x] ADMIN: login ok. `/`, `/pacientes`, `/agenda`, `/usuarios` e
      `/usuarios/auditoria` respondem 200. Criou os usuários RECEPCAO e
      FISIOTERAPEUTA pela tela. Depois do logout, `/pacientes`, `/agenda` e
      `/usuarios` redirecionam para `/login`.
- [x] RECEPCAO: `/pacientes`, `/agenda`, `/pacientes/novo`, `/agenda/novo`,
      ficha, edição, agendamentos, documentos, cartão de frequência e termo
      abrem. Anamnese, avaliações, planos, sessões e reavaliações (listas e
      "novo") levam a `/acesso-negado`, assim como a impressão da anamnese,
      `/usuarios` e `/usuarios/auditoria`. Logout ok.
- [x] FISIOTERAPEUTA: todas as telas clínicas abrem. `/usuarios` e
      `/usuarios/auditoria` levam a `/acesso-negado`.
- [x] A auditoria (`/usuarios/auditoria`) registrou cada login, logout, falha,
      bloqueio, usuário criado e acesso negado acima.

Evidência complementar em produção: os logs da Vercel de 26/09 mostram o ADMIN
real autenticado, com respostas 200 em `/`, `/pacientes`, `/agenda` e
`/usuarios`.

## 6. Fluxo clínico com dados fictícios — COMPROVADO (build de produção local)

Feito no mesmo ambiente do item 5, como FISIOTERAPEUTA, com o paciente fictício
novo "Paciente Teste VAL-02" (cadastrado pela RECEPCAO). Nenhum prontuário real
foi aberto ou alterado, e nada foi gravado em produção.

anamnese ok → avaliação ok → plano ok → sessão ok → reavaliação ok (conclusão
"continuidade") → impressões da anamnese, do cartão de frequência e do termo de
consentimento ok (200, com o paciente fictício).

## 7. Restauração em destino isolado — COMPROVADO (B6, B7)

Requisitos: DEC-02 B1–B3, B6, B7. RPO = ponto dentro da janela PITR de 6 h
(`history_retention_seconds = 21600`, conferido); RTO = 1 dia útil.

1. Anotar o ponto: horário UTC atual (dentro das últimas 6 h) e, se quiser,
   `SELECT now(), pg_current_wal_lsn();` no `main`.
2. Neon → projeto `fisio-orto-sport` → Branches → **Create branch** a partir de
   `main`, opção *Past data* no horário anotado. Nome: `restore-test-AAAAMMDD`.
   O plano gratuito permite 10 branches; há 1.
3. No branch novo, rodar a mesma consulta nos dois lados (`main` e
   restauração) e comparar:

   ```sql
   SELECT 'User' t, count(*) FROM "User" UNION ALL
   SELECT 'Session', count(*) FROM "Session" UNION ALL
   SELECT 'Patient', count(*) FROM "Patient" UNION ALL
   SELECT 'Appointment', count(*) FROM "Appointment" UNION ALL
   SELECT 'Anamnesis', count(*) FROM "Anamnesis" UNION ALL
   SELECT 'Assessment', count(*) FROM "Assessment" UNION ALL
   SELECT 'AssessmentChange', count(*) FROM "AssessmentChange" UNION ALL
   SELECT 'TherapyPlan', count(*) FROM "TherapyPlan" UNION ALL
   SELECT 'TherapyPlanRevision', count(*) FROM "TherapyPlanRevision" UNION ALL
   SELECT 'TherapyPlanStatusChange', count(*) FROM "TherapyPlanStatusChange" UNION ALL
   SELECT 'TreatmentSession', count(*) FROM "TreatmentSession" UNION ALL
   SELECT 'TreatmentSessionChange', count(*) FROM "TreatmentSessionChange" UNION ALL
   SELECT 'Reassessment', count(*) FROM "Reassessment" UNION ALL
   SELECT 'ReassessmentChange', count(*) FROM "ReassessmentChange" UNION ALL
   SELECT 'AuthRateLimit', count(*) FROM "AuthRateLimit" UNION ALL
   SELECT 'AuditLog', count(*) FROM "AuditLog" UNION ALL
   SELECT '_prisma_migrations', count(*) FROM "_prisma_migrations";
   ```

   Diferenças só são esperadas em tabelas com escrita depois do ponto
   restaurado (`Session`, `AuthRateLimit`, `AuditLog`).
4. Conferir as variáveis (item 4). Numa recuperação real, trocar o branch
   primário ou reconectar pelo Storage da Vercel e fazer redeploy.
5. Preencher a evidência abaixo e, após conferência, **excluir o branch**.

Pelo conector MCP do Neon, o `create_branch` só copia o estado atual. Para um
ponto passado: `create_snapshot` do `main` com `timestamp` e depois
`restore_snapshot` **sem** `target_branch_id` e com `finalize: false`. No padrão
(`true`), o compute de produção passaria para o branch restaurado.

### Execução de 27/09/2026 (autorizada por Bruno no chat)

| Campo | Valor |
|---|---|
| Data do teste | 27/09/2026, 13:43–13:45 UTC |
| Ponto pedido | 2026-09-27T12:43:00Z (1 h antes, dentro da janela de 6 h) |
| Ponto efetivo | LSN `0/20EDCE0`, última escrita em 2026-09-26T21:10:32Z (nenhuma escrita depois disso até o ponto pedido) |
| Snapshot | `snap-snowy-leaf-acggldg8` (`restore-test-20260927`), excluído após o teste |
| Branch criado | `br-restless-recipe-acfsn25f` (`restore-test-20260927`), não primário, não finalizado |
| Tempo até o branch ficar consultável | ~15 s depois do snapshot; RTO de 1 dia útil atendido com folga |
| `main` depois da restauração | Continua primário/default; `/login` em produção responde 200 |
| Responsável | Bruno M Noronha (autorização); execução técnica pelo Claude |

Contagens no branch restaurado (nenhum dado pessoal lido):

| Tabela | Restauração | `main` (27/09/2026, ~14:40 UTC) |
|---|---|---|
| `User` | 3 | 3 (todos ADMIN) |
| `Session` | 1 | 1 |
| `Patient` | 1 | 1 |
| `AuthRateLimit`, `AuditLog` | 0 | 0 |
| Demais 11 tabelas clínicas e de agenda | 0 | 0 |
| `_prisma_migrations` | 14 | 14 |

As 17 tabelas batem. Nenhuma escrita aconteceu depois do ponto restaurado.

- [x] Consulta do passo 3 rodada no `main` (leitura autorizada por Bruno no
      chat em 27/09/2026).
- [x] Variáveis conferidas (item 4).
- [x] Branch `restore-test-20260927` excluído em 2026-09-27T13:45Z, com
      autorização de Bruno no chat. Só o `main` permanece; `/login` respondeu
      200 depois. Snapshot `snap-snowy-leaf-acggldg8` excluído em
      2026-09-27T13:46Z, também com autorização de Bruno; o projeto ficou sem
      snapshots.

## 8. Aviso SSL nos logs — CLASSIFICADO, sem correção agora

Origem: `pg-connection-string` (dependência de `pg` 8.23.0, usada por
`@prisma/adapter-pg`) emite `SECURITY WARNING: The SSL modes 'prefer',
'require', and 'verify-ca' are treated as aliases for 'verify-full'` quando a
URL traz `sslmode=require`, como a gerada pela integração Neon.

- **Efeito hoje:** nenhum risco. Em `pg` 8, `require` já se comporta como
  `verify-full` (certificado e host verificados), o modo mais forte.
- **Risco futuro:** em `pg` 9, `require` passará à semântica da libpq
  (criptografa sem verificar certificado).
- **Classificação:** informativo. Não abrir correção nem mexer na conexão
  agora. Antes de atualizar `pg` para 9, ou quando quiser silenciar o aviso,
  trocar `sslmode=require` por `sslmode=verify-full` em `DATABASE_URL` (ação
  no painel, por Bruno) e validar o login.

Outros logs de runtime: conferidos em 27/09/2026 no painel da Vercel (última
semana, filtros `level:error,fatal` e `status:500`). Houve 16 respostas 500, todas
antigas e já resolvidas:

- 21/09 e 25/09 até 17:28 (horário do painel): `P2021 — The table public.User
  does not exist`. Foi antes de as migrações serem aplicadas no Neon (hoje há
  14/14, item 3).
- 25/09, 17:38–17:41: `TypeError: c.useRef is not a function` em `/pacientes`.
  Foi corrigido pela PR #23 (`7fd43c6`, NativeSelect como Client Component),
  com merge às 17:46.

Não há 500, erro nem `fatal` depois disso. Fora esses casos, os registros de
nível `error` são só o aviso SSL acima. **Não é preciso abrir correção.**

## 9. Limitações

- READY e CI verdes não equivalem a teste funcional. Por isso, os itens 5 e 6
  foram executados de fato.
- Os itens 5 e 6 rodaram na build de produção **local**, com o mesmo código
  publicado, e não no domínio de produção. Motivos: Claude não digita senha em
  produção, a produção só tem ADMIN e não foi autorizado gravar dados fictícios
  no banco real (não há exclusão pelo app, R3/R5). Em produção, a sessão do
  ADMIN aparece nos logs de 26/09.
- A restauração foi demonstrada num ponto sem escrita posterior. Por isso, a
  comparação prova a integridade do conteúdo, mas não mede perda dentro da janela.
- O aviso SSL continua nos logs até alguém trocar `sslmode=require` por
  `verify-full` (recomendado antes do `pg` 9).
