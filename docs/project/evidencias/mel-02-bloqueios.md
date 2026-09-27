# MEL-02 (#45) — migração, recuperação e evidências

Bloqueios de horário por profissional e aviso de conflito do paciente. Regras
decididas por Bruno M Noronha em 27/09/2026, antes do schema: ver
[06-escopo-mvp](../06-escopo-mvp.md#regras-da-mel-02-45).

## Migração `20260927210000_agenda_bloqueios`

Aditiva: só uma tabela nova, sem backfill e sem tocar em linhas existentes.

| Objeto | Mudança |
|---|---|
| `ScheduleBlock` | Tabela nova: `professionalId`, `startsAt`/`endsAt` (`timestamptz`), `reason` opcional, `createdAt`/`createdById`, `removedAt`/`removedById` (remoção lógica). FKs para `User` com `Restrict`; índices `(professionalId, startsAt)`, `createdById` e `removedById` |
| `ScheduleBlock_ends_after_starts` | CHECK manual: fim depois do início |
| `ScheduleBlock_removal_consistent` | CHECK manual: `removedAt` e `removedById` vêm juntos |

Agendamentos existentes não mudam. A regra "não agendar sobre bloqueio" e a
recusa de bloqueio sobre agendamento ativo ficam na aplicação, sob o mesmo lock
transacional por profissional (`pg_advisory_xact_lock`). O PostgreSQL não tem
constraint de exclusão entre tabelas. Os CHECKs não aparecem no schema Prisma.
Conferido que `prisma migrate diff` do banco migrado para `schema.prisma` sai
vazio.

### Aplicação em produção

Aplicar em produção depende de autorização própria. Deve ser feito **antes do
merge**: sem a tabela, a agenda publicada falha ao listar bloqueios. O
procedimento é o das migrações anteriores:

1. Anotar o ponto de restauração no Neon.
2. Aplicar o SQL e registrar a linha em `_prisma_migrations` com o checksum
   sha256 do arquivo.
3. Conferir a estrutura contra o banco local.

## Recuperação

- **Antes de uso real (sem bloqueios gravados):** restaurar o snapshot ou
  reverter manualmente:

  ```sql
  DROP TABLE "ScheduleBlock";
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927210000_agenda_bloqueios';
  ```

  E voltar o código para a versão anterior (redeploy na Vercel).
- **Depois de uso real:** a reversão manual **descarta** os bloqueios. Prefira
  corrigir para a frente ou restaurar o snapshot dentro da janela do Neon.
- **Rollback só de código** (manter a tabela) é seguro: o código anterior não
  lê `ScheduleBlock`. Nesse caso os bloqueios deixam de valer até o novo deploy.

## Evidências (27/09/2026, ambiente local)

Banco PostgreSQL 17 descartável (`fisio_mel02_test`) no Docker local, migrado
com `prisma migrate deploy`.

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | ok |
| `pnpm lint` | ok |
| `pnpm exec jest --runInBand` | 64 suítes, 715 testes ok |
| `pnpm test:integration` | 15 suítes, 92 testes ok (9 novos em `agenda-bloqueios.integration.ts`) |
| `agenda-bloqueios.integration.ts` repetido 3 vezes | 9/9 ok em todas |
| `pnpm build` | ok |
| `prisma migrate diff` banco migrado → schema | vazio |

A integração nova cobre:

- agendar e reagendar sobre bloqueio (recusados);
- limites adjacentes nos dois lados;
- fuso `America/Sao_Paulo` (08:00–12:00 local é gravado como 11:00–15:00 UTC; 12:00 local é aceito e 11:59 é recusado);
- bloqueio sobre agendamento ativo (recusado com a lista, e o agendamento continua `AGENDADO`);
- agendamento cancelado e adjacente não impedem o bloqueio;
- remoção lógica libera o horário, e remover de novo ou um bloqueio inexistente é informado;
- concorrência bloqueio × agendamento e bloqueio × reagendamento, em várias rodadas: nunca ficam os dois ativos, e o perdedor recebe a mensagem de regra;
- aviso de conflito do paciente ao criar e reagendar, e a confirmação;
- os CHECKs do banco.

Na suíte existente `agenda.integration.ts`, os dois testes de independência
entre profissionais usam o mesmo paciente no mesmo horário. Eles passaram a
declarar o encaixe confirmado (`allowPatientConflict`), porque esse caso agora
gera aviso.

Fluxo técnico no `next dev` local (Administrador, dados fictícios de
desenvolvimento):

- criou um bloqueio 08:00–12:00, visto na grade do dia (hachurado) e na semana;
- agendar às 09:00 foi recusado com a mensagem de bloqueio;
- agendar às 12:00–13:00 (adjacente) foi aceito;
- bloquear 12:30–18:00 foi recusado, com o link do agendamento das 12:00, e os campos foram preservados;
- remover o bloqueio pela tela o tirou da lista;
- o agendamento de teste foi cancelado depois;
- sem erros no console.

O aviso de conflito do paciente na tela está coberto por teste de componente
(`appointment-form.test.tsx`): a base local tem um só fisioterapeuta ativo.
