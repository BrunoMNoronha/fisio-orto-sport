# MEL-01 (#44) — migração, recuperação e evidências

Vínculo agenda–sessão e registro de presença. Regras decididas por Bruno M
Noronha em 27/09/2026, antes do schema: ver
[06-escopo-mvp](../06-escopo-mvp.md#regras-da-mel-01-44).

## Migração `20260927180000_agenda_sessao_presenca`

Aditiva, sem backfill e sem reescrita de linhas existentes:

| Objeto | Mudança |
|---|---|
| `AppointmentAttendance` | Enum novo: `COMPARECEU`, `FALTA_AVISADA`, `FALTA_NAO_AVISADA` |
| `Appointment` | Colunas anuláveis `attendance`, `attendanceMarkedAt`, `attendanceMarkedById` (FK `User`, `Restrict`); índice único `(id, patientId)`, alvo da FK composta |
| `Appointment_attendance_consistent` | CHECK manual: os três campos de presença vêm juntos e só com status `AGENDADO` |
| `TreatmentSession` | Coluna anulável `appointmentId`; FK composta `(appointmentId, patientId) → Appointment(id, patientId)` (`Restrict`) |
| `TreatmentSession_appointmentId_valid_key` | Índice único parcial manual: um atendimento `VALIDO` por agendamento |

Estado depois de aplicar: agendamentos existentes ficam sem presença marcada
(elegíveis para marcação); atendimentos existentes ficam sem vínculo, como
lançamentos sem agendamento. Nenhuma linha existente viola o CHECK (todas com
presença nula).

O CHECK e o índice parcial não aparecem no schema Prisma. Conferido que
`prisma migrate diff` do banco migrado para `schema.prisma` sai vazio, então
uma próxima `migrate dev` não tenta removê-los.

### Aplicação em produção (não feita nesta entrega)

Aplicar em produção depende de autorização própria. Procedimento vigente
([12-ambiente](../12-ambiente.md), [15-retencao-rastreabilidade-recuperacao](../15-retencao-rastreabilidade-recuperacao.md)):

1. Criar ponto de restauração (snapshot) do banco de produção no Neon.
2. `pnpm exec prisma migrate deploy` com a URL de produção.
3. Conferir `prisma migrate status` e o fluxo por perfil (mesmo formato da
   VAL-02, critério 7 do MVP).

## Recuperação

- **Antes de uso real (sem presença nem vínculos gravados):** restaurar o
  snapshot, ou reverter manualmente:

  ```sql
  DROP INDEX "TreatmentSession_appointmentId_valid_key";
  ALTER TABLE "TreatmentSession" DROP CONSTRAINT "TreatmentSession_appointmentId_patientId_fkey";
  DROP INDEX "TreatmentSession_appointmentId_patientId_idx";
  ALTER TABLE "TreatmentSession" DROP COLUMN "appointmentId";
  ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_attendance_consistent";
  ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_attendanceMarkedById_fkey";
  DROP INDEX "Appointment_attendanceMarkedById_idx";
  DROP INDEX "Appointment_id_patientId_key";
  ALTER TABLE "Appointment" DROP COLUMN "attendance", DROP COLUMN "attendanceMarkedAt", DROP COLUMN "attendanceMarkedById";
  DROP TYPE "AppointmentAttendance";
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927180000_agenda_sessao_presenca';
  ```

  E voltar o código para a versão anterior (redeploy na Vercel).
- **Depois de uso real:** a reversão manual **descarta** presenças e vínculos
  registrados. Prefira corrigir para a frente (nova migração) ou restaurar o
  snapshot dentro da janela do Neon, avaliando o que foi gravado depois dele.
- **Rollback só de código** (manter o banco migrado) é seguro: as colunas são
  anuláveis e o código anterior não as lê. Enquanto isso, porém, o código
  anterior cancela e reagenda sem conferir vínculo ou presença, e o CHECK
  recusa cancelar agendamento com presença marcada (erro em vez de mensagem).

## Evidências (27/09/2026, ambiente local)

Banco PostgreSQL 17 descartável (`fisio_mel01_test`) no Docker local, migrado
com `prisma migrate deploy`.

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | ok |
| `pnpm lint` | ok |
| `pnpm exec jest --runInBand` | 64 suítes, 690 testes ok |
| `pnpm test:integration` | 14 suítes, 83 testes ok (11 novos em `agenda-sessao.integration.ts`) |
| `pnpm build` | ok |
| `prisma migrate diff` banco migrado → schema | vazio |

Integração nova cobre: FK composta, índice parcial (e liberação após
invalidar), atendimentos sem vínculo ilimitados, `Restrict`, CHECK de
presença, travas de cancelar/reagendar/presença, falta impedindo atendimento,
presença antes do horário, e concorrência (dois registros simultâneos, reenvio
simultâneo com a mesma chave, gerar × cancelar nas duas ordens, gerar × marcar
falta).

Fluxo técnico por perfil no `next dev` local, com dados fictícios:

- **Recepção:** vê presença e "Atendimento: Registrado/Não registrado", sem
  link nem conteúdo clínico e sem o botão "Registrar atendimento"; marcou
  "Faltou (avisou)" (autor e data exibidos), e cancelar/reagendar sumiram.
- **Fisioterapeuta:** com falta marcada, o botão não aparece e a URL direta
  mostra o bloqueio; removeu a marcação, registrou o atendimento pelo
  agendamento (data, hora e profissional pré-preenchidos) e a agenda passou a
  "Compareceu" e "Registrado — ver atendimento", com cancelar e reagendar
  bloqueados.
