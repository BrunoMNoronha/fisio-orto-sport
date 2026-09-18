# agenda

Agenda por profissional e agendamentos (Fase 3, primeira fatia): listar por período e profissional, criar, consultar, reagendar e cancelar. **Somente dados administrativos**: nada clínico fica no agendamento.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schemas zod (mensagens em pt-BR), conversão data/hora ↔ instante no fuso da clínica, filtro da listagem e `overlaps()`. |
| `rules.ts` (`server-only`) | Regras executadas na transação: paciente ativo, profissional apto e ausência de conflito; detecção da violação da constraint do banco. |
| `queries.ts` (`server-only`) | `listAgenda()`, `getAppointment()` e `listProfessionals()` exigem `agenda:ler`; `listActivePatientOptions()` exige `agenda:gerir`. `select` explícito; do paciente só `id` e `fullName`. |
| `actions.ts` | `createAppointment`, `rescheduleAppointment` e `cancelAppointment`. Todas exigem `agenda:gerir` no servidor. **Não há exclusão física.** |
| `src/app/(app)/agenda/**` | Agenda (`/agenda`), detalhe (`/agenda/[id]`), novo (`/agenda/novo`) e reagendar (`/agenda/[id]/reagendar`). |

## Regras

- **Profissional** = usuário (`User`) **ativo** com perfil `FISIOTERAPEUTA`. Não há tabela própria de profissionais; o módulo `profissionais` segue sem implementação.
- **Paciente** deve existir e estar `ATIVO` para ser agendado.
- **Horário**: data, início e fim informados explicitamente (não há duração padrão). O fim deve ser posterior ao início, no mesmo dia, com no máximo 12 h (limite técnico contra erro de digitação, não regra de negócio). No banco há também `CHECK ("endsAt" > "startsAt")`.
- **Fuso**: o que se digita é horário de `America/Sao_Paulo`; o banco guarda `timestamptz`. A exibição usa o mesmo fuso.
- **Conflito**: um profissional não pode ter dois agendamentos `AGENDADO` sobrepostos. Intervalo semiaberto `[início, fim)`: 09:00–10:00 e 10:00–11:00 não conflitam. Checado na action (dentro de `$transaction`) e garantido no banco pela constraint de exclusão `Appointment_no_overlap` (extensão `btree_gist`, `WHERE status = 'AGENDADO'`), que barra corridas entre requisições simultâneas; a violação vira a mesma mensagem de conflito.
- **Reagendar** altera data, horário e/ou profissional do mesmo registro e repete as validações de profissional e conflito (ignorando o próprio agendamento). Agendamento cancelado não pode ser reagendado. O paciente não muda.
- **Cancelar** muda o status para `CANCELADO` e registra `cancelledAt`, `cancelledById` e motivo **opcional**. O registro continua consultável e deixa de ocupar o horário. Não há regra de antecedência.
- **Listagem**: filtro por profissional (opcional) e período `de`/`até` (padrão: 7 dias a partir de hoje; máximo 31 dias). Inclui cancelados, marcados como tal.
- **Autoria**: `createdById`/`updatedById` (FK `Restrict`). Não é trilha de auditoria.
- A lista de pacientes no formulário traz até 500 pacientes ativos, por nome.

## Permissões (matriz vigente, sem alteração)

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver agenda e agendamentos (`agenda:ler`) | ✓ | ✓ | ✓ |
| Criar, reagendar e cancelar (`agenda:gerir`) | ✓ | ✓ | — |

## Fora do escopo (por ora)

Conflito por paciente (o mesmo paciente em dois profissionais no mesmo horário não é barrado), bloqueio de horários e horário de funcionamento, controle de presença, visão mensal/calendário, recorrência, notificações e lembretes, busca de pacientes no formulário (substituir a lista quando o volume crescer).
