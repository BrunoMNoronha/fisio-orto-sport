# #62 — Reinicialização dos dados preservando os usuários (ambiente local)

Execução da ferramenta `pnpm db:reset` (PR #74), conforme o procedimento de
`src/modules/manutencao/README.md`.

Esta página não contém dados pessoais, conteúdo clínico, credenciais nem hashes. Só há contagens e o
resultado das comparações.

## Alvo e autorização

- **Ambiente:** local, com o banco `fisio_orto_sport` no PostgreSQL 17 do Docker de desenvolvimento
  (`localhost`). Produção (Neon) **não** foi tocada.
- **Autorização:** Bruno M Noronha, no chat, em 27/09/2026. Primeiro autorizou "concluir a issue 62".
  Depois escolheu o ambiente local e decidiu **preservar a auditoria**, sem a exceção A5/A7: nenhum
  evento de auditoria foi apagado.
- **Natureza dos dados apagados:** dados fictícios de desenvolvimento e testes.

## Recuperação

- **Ponto de recuperação:** `pg_dump -Fc` completo antes da operação, guardado fora do repositório.
- **Ensaio:** restaurado num banco isolado (`fisio_restore_check`). As contagens das 19 tabelas e as
  impressões digitais de `User` e `ClinicSettings` saíram idênticas às do original. O banco do
  ensaio foi descartado depois.

## Execução (27/09/2026, marco 22:43:57 UTC)

1. **Janela sem escritas:** servidor de desenvolvimento parado e nenhuma outra conexão ativa no
   banco.
2. **Simulação** (`pnpm db:reset`): escopo e contagens iguais ao contrato.
3. **Execução** (`pnpm db:reset --executar`): nome do banco e `LIMPAR` confirmados; código de
   saída 0.

| Tabela | Antes | Depois |
|---|---:|---:|
| Session | 2 | 0 |
| AuthRateLimit | 0 | 0 |
| Patient | 27 | 0 |
| Appointment | 11 | 0 |
| ScheduleBlock | 1 | 0 |
| Anamnesis | 13 | 0 |
| Assessment | 2 | 0 |
| AssessmentChange | 1 | 0 |
| TherapyPlan | 2 | 0 |
| TherapyPlanRevision | 4 | 0 |
| TherapyPlanStatusChange | 2 | 0 |
| TreatmentSession | 3 | 0 |
| TreatmentSessionChange | 1 | 0 |
| Reassessment | 2 | 0 |
| ReassessmentChange | 0 | 0 |
| **Preservadas:** User | 7 | 7 |
| ClinicSettings | 1 | 1 |
| _prisma_migrations | 19 | 19 |
| AuditLog | 52 | 52 |

## Conferência independente (fora da ferramenta)

- **Usuários:** a impressão digital de todas as linhas e colunas de `User` é **idêntica** antes e
  depois (7 usuários: 4 ativos e 3 inativos). A de `ClinicSettings` também.
- **Triggers da auditoria:** `AuditLog_immutable_row` e `AuditLog_no_truncate` continuam ligadas.
- **Estrutura:** 45 FKs, igual ao banco restaurado, e 19 migrações.

## Homologação técnica (navegador, `next dev` local)

- A sessão anterior do navegador foi revogada: `/pacientes` redirecionou para `/login`.
- O login com a conta de Administrador existente funcionou, sem redefinir a senha.
- Pacientes: "Nenhum paciente cadastrado". A agenda (Lista) e os bloqueios aparecem vazios.
- Usuários listados e configurações preservadas (versão e autoria mantidas).
- Registros técnicos novos, **posteriores ao marco**: 1 evento `LOGIN/SUCESSO` e 1 sessão. Os 52
  eventos anteriores ao marco foram preservados.
- **Não verificado nesta rodada:**
  - login dos demais perfis e bloqueio dos inativos, porque as senhas dessas contas não estão
    disponíveis ao agente;
  - comportamento de autenticação sem alteração nesta entrega, já coberto pelos testes existentes.

## Pendências

- **Produção (Neon):** não executada. Exige uma nova autorização específica, seguindo os mesmos
  passos 1–7.
- **Homologação manual por perfil:** a critério da clínica.
