# agenda

Agenda por profissional e agendamentos (Fase 3, primeira fatia): listar por período e profissional, criar, consultar, reagendar e cancelar. **Somente dados administrativos**: nada clínico fica no agendamento.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schemas zod (mensagens em pt-BR), conversão data/hora ↔ instante no fuso da clínica, filtro da listagem e `overlaps()`. |
| `rules.ts` (`server-only`) | Regras executadas na transação: paciente ativo, profissional apto e ausência de conflito; detecção da violação da constraint do banco. |
| `queries.ts` (`server-only`) | `listAgenda()`, `getAppointment()`, `listProfessionals()` e `listPatientAppointments()` (próximos ou anteriores de um paciente, para a ficha) exigem `agenda:ler`; `getActivePatientOption()` (pré-seleção por `?patientId=`, só se ativo) exige `agenda:gerir`. `select` explícito; do paciente só `id` e `fullName`. |
| `actions.ts` | `createAppointment`, `rescheduleAppointment`, `cancelAppointment` e `searchActivePatients` (busca de paciente do formulário). Todas exigem `agenda:gerir` no servidor. **Não há exclusão física.** |
| `src/app/(app)/agenda/**` | Agenda (`/agenda`), detalhe (`/agenda/[id]`), novo (`/agenda/novo`) e reagendar (`/agenda/[id]/reagendar`). |

## Regras

- **Profissional** = usuário (`User`) **ativo** com perfil `FISIOTERAPEUTA`. Não há tabela própria de profissionais; o módulo `profissionais` segue sem implementação.
- **Paciente** deve existir e estar `ATIVO` para ser agendado.
- **Horário**: data, início e fim informados explicitamente (não há duração padrão). O fim deve ser posterior ao início, no mesmo dia, com no máximo 12 h (limite técnico contra erro de digitação, não regra de negócio). No banco há também `CHECK ("endsAt" > "startsAt")`.
- **Fuso**: o que se digita é horário de `America/Sao_Paulo`; o banco guarda `timestamptz`. A exibição usa o mesmo fuso.
- **Conflito**: um profissional não pode ter dois agendamentos `AGENDADO` sobrepostos. Intervalo semiaberto `[início, fim)`: 09:00–10:00 e 10:00–11:00 não conflitam. Checado na action (dentro de `$transaction`) e garantido no banco pela constraint de exclusão `Appointment_no_overlap` (extensão `btree_gist`, `WHERE status = 'AGENDADO'`), que barra corridas entre requisições simultâneas; a violação vira a mesma mensagem de conflito.
- **Reagendar** altera data, horário e/ou profissional do mesmo registro e repete as validações de profissional e conflito (ignorando o próprio agendamento). Agendamento cancelado não pode ser reagendado. O paciente não muda.
- **Cancelar** muda o status para `CANCELADO` e registra `cancelledAt`, `cancelledById` e motivo **opcional**. O registro continua consultável e deixa de ocupar o horário. Não há regra de antecedência. Como não pode ser desfeito, a tela pede confirmação num diálogo (onde vai o motivo).
- **Início no passado** é permitido (lançamento retroativo): o formulário só mostra um aviso, sem bloquear.
- **Visões** (`/agenda?view=dia|semana|lista&date=YYYY-MM-DD&professionalId=`; `parseAgendaView()`): **dia** (padrão, hoje) em grade com uma coluna por fisioterapeuta ativo, faixa 07:00–20:00 ampliada se houver agendamento fora dela e linha do horário atual; **semana** de segunda a domingo, cada dia leva à visão do dia; **lista** com período `from`/`to` (padrão: 7 dias a partir de hoje; máximo 31 dias). Todas incluem cancelados, marcados como tal. Na grade do dia, quem tem `agenda:gerir` clica num horário vazio para abrir `/agenda/novo` com data, profissional e início (`start=HH:MM`) preenchidos; o fim continua informado à mão.
- **Autoria**: `createdById`/`updatedById` (FK `Restrict`). Não é trilha de auditoria.
- **Escolha do paciente** (issue #38): não há lista fixa. O campo busca no servidor (`searchActivePatients`) pelo nome, sem diferenciar acentos nem maiúsculas (mesma `searchName` da lista de pacientes). Traz só pacientes `ATIVO`, só `id` e nome, em ordem `fullName, id` e com até 20 resultados por consulta; se houver mais, o formulário pede para refinar. No cliente (`patient-combobox.tsx`), o padrão ARIA combobox + listbox tem setas, Enter para escolher (sem enviar o formulário) e Escape para fechar. A busca espera 250 ms depois da digitação, e só a resposta da busca mais recente é aplicada. Há estados de carregamento, vazio e erro, e a contagem de resultados é anunciada numa região `polite`. O paciente escolhido fica num campo oculto, separado do texto digitado, então refinar a busca ou receber um erro de validação não o perde. A regra de paciente ativo continua sendo validada em `createAppointment`.

## Permissões

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver agenda e agendamentos (`agenda:ler`) | ✓ | ✓ | ✓ |
| Criar, reagendar e cancelar (`agenda:gerir`) | ✓ | ✓ | ✓ (desde a #31, para qualquer profissional apto) |

Quem opera (autor em `createdById`, `updatedById` e `cancelledById`) é o usuário logado, que pode ser diferente do **profissional atendente** (`professionalId`). O profissional precisa ser um fisioterapeuta ativo; isso é regra de elegibilidade (`rules.ts`), não de autorização do operador.

## Fora do escopo (por ora)

Conflito por paciente (o mesmo paciente em dois profissionais no mesmo horário não é barrado), bloqueio de horários e horário de funcionamento, controle de presença, visão mensal, recorrência, notificações e lembretes, busca de pacientes no formulário (substituir a lista quando o volume crescer).
