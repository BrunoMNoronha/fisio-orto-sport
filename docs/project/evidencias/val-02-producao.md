# VAL-02 — Evidências técnicas da produção (#42)

Coleta de 27/09/2026. Somente leitura: nenhum deploy, migração, seed, usuário ou
dado foi criado ou alterado. Sem valores de variáveis nem dados pessoais.

Legenda: **COMPROVADO** (evidência coletada), **PENDENTE — Bruno** (exige
acesso ou ação que Claude não executa), **LIMITAÇÃO**.

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

## 4. Variáveis de produção — PENDENTE — Bruno

O conector da Vercel responde 403 nesse escopo e a extensão do Chrome não
estava conectada, então os nomes não puderam ser lidos. Conferir no painel
(Settings → Environment Variables, sem revelar valores) contra o inventário de
[15-retencao-rastreabilidade-recuperacao](../15-retencao-rastreabilidade-recuperacao.md#inventário-de-variáveis-de-produção-b1):

- [ ] `DATABASE_URL` e `DATABASE_*` só em Production.
- [ ] `SETUP_TOKEN` **ausente** — já existem usuários, então o inventário
      manda removê-lo.
- [ ] Nenhuma `SEED_ADMIN_*`, `POSTGRES_*` ou `INTEGRATION_DATABASE_URL`.
- [ ] Nenhuma variável em Preview.

## 5. Roteiro autenticado por perfil — PENDENTE — Bruno

Claude não digita senha em produção. Produção só tem `ADMIN`; testar
`RECEPCAO` e `FISIOTERAPEUTA` exige criar usuários, o que a issue não autoriza
por si só. Com autorização, usar contas de teste identificáveis (ex.:
`teste-recepcao@…`) e desativá-las no fim.

- [ ] ADMIN: login, `/pacientes`, `/agenda`, `/usuarios`, logout; após logout,
      `/pacientes` volta a redirecionar.
- [ ] RECEPCAO: agenda e cadastro abrem; ficha clínica, avaliação, plano,
      sessões e reavaliação levam a `/acesso-negado`; `/usuarios` negado.
- [ ] FISIOTERAPEUTA: fluxo clínico abre; `/usuarios` negado.
- [ ] Senha errada mostra mensagem genérica; tentativas repetidas acionam o
      limite.
- [ ] `/usuarios` → auditoria mostra os logins e o logout acima.

## 6. Fluxo clínico com dados fictícios — PENDENTE — Bruno

Há 1 paciente cadastrado; não foi aberto nem classificado. Usar um paciente
fictício novo (nome claramente de teste), nunca um existente:
anamnese → avaliação → plano → sessão → reavaliação → impressão. Registrar
só o resultado (ok/erro), sem conteúdo clínico.

**Não há exclusão pelo aplicativo** (R3/R5): o paciente fictício fica no
banco. Se isso não for aceitável, fazer o fluxo clínico no branch de
restauração do item 7, apontando uma execução local para ele, em vez de
produção.

## 7. Restauração em destino isolado — PENDENTE — Bruno (B6, B7)

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

| Campo | Valor |
|---|---|
| Data do teste | |
| Ponto restaurado (UTC / LSN) | |
| Branch criado | |
| Contagens `main` × restauração | (colar a tabela, sem dados pessoais) |
| Tempo até o branch ficar consultável | |
| Variáveis conferidas | |
| Branch removido em | |
| Responsável | Bruno M Noronha |

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

Outros logs de runtime: não lidos (403 no conector, Chrome desconectado).
**PENDENTE — Bruno:** filtrar erros das últimas 24 h no painel da Vercel e
anotar se há algo além do aviso SSL.

## 9. Limitações

- READY e CI verdes não equivalem a teste funcional: itens 5 e 6 seguem sem
  comprovação.
- Restauração ainda não demonstrada (item 7); é pré-requisito para dados reais.
- Variáveis e logs de runtime não conferidos por falta de acesso ao painel.
