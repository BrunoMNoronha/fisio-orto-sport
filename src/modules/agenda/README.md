# agenda

Agenda por profissional e agendamentos (Fase 3, primeira fatia): listar por período e profissional, criar, consultar, reagendar e cancelar; presença e vínculo com o atendimento (MEL-01, #44). **Somente dados administrativos**: nada clínico fica no agendamento.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schemas zod (mensagens em pt-BR), conversão data/hora ↔ instante no fuso da clínica, filtro da listagem e `overlaps()`. |
| `rules.ts` (`server-only`) | Regras executadas na transação: paciente ativo, profissional apto e ausência de conflito; detecção da violação da constraint do banco. |
| `queries.ts` (`server-only`) | `listAgenda()`, `getAppointment()`, `listProfessionals()` e `listPatientAppointments()` (próximos ou anteriores de um paciente, para a ficha) exigem `agenda:ler`; `getActivePatientOption()` (pré-seleção por `?patientId=`, só se ativo) exige `agenda:gerir`. `select` explícito; do paciente só `id` e `fullName`. |
| `service.ts` (`server-only`) | Transações de criar (`insertAppointment`), reagendar (`moveAppointment`), cancelar (`cancelAppointmentRecord`) e marcar presença (`setAttendanceRecord`), a trava da linha (`lockAppointment`), `hasValidSession()` e `ruleFailure()` (erro → resposta do formulário). Recebem o cliente Prisma; as actions só autorizam, validam, revalidam e redirecionam. |
| `actions.ts` | `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `setAttendance` e `searchActivePatients` (busca de paciente do formulário). Todas exigem `agenda:gerir` no servidor. **Não há exclusão física.** |
| `src/app/(app)/agenda/**` | Agenda (`/agenda`), detalhe (`/agenda/[id]`), novo (`/agenda/novo`) e reagendar (`/agenda/[id]/reagendar`). |

## Regras

- **Profissional** = usuário (`User`) **ativo** com perfil `FISIOTERAPEUTA`. Não há tabela própria de profissionais; o módulo `profissionais` segue sem implementação.
- **Paciente** deve existir e estar `ATIVO` para ser agendado.
- **Horário**: data, início e fim informados explicitamente (não há duração padrão). O fim deve ser posterior ao início, no mesmo dia, com no máximo 12 h (limite técnico contra erro de digitação, não regra de negócio). No banco há também `CHECK ("endsAt" > "startsAt")`.
- **Fuso**: o que se digita é horário de `America/Sao_Paulo`; o banco guarda `timestamptz`. A exibição usa o mesmo fuso.
- **Conflito**: um profissional não pode ter dois agendamentos `AGENDADO` sobrepostos. Intervalo semiaberto `[início, fim)`: 09:00–10:00 e 10:00–11:00 não conflitam. Checado na transação e garantido no banco pela constraint de exclusão `Appointment_no_overlap` (extensão `btree_gist`, `WHERE status = 'AGENDADO'`); a violação vira a mesma mensagem de conflito. **Concorrência** (issue #39): criar e reagendar tomam antes um lock transacional por profissional (`pg_advisory_xact_lock`, em ordem fixa quando o reagendamento envolve dois). Assim, operações simultâneas no mesmo profissional entram em fila e a checagem vê o que já foi confirmado. Sem o lock, duas inserções sobrepostas podiam terminar em deadlock (P2034, erro 500) em vez da mensagem de conflito. Um P2034 residual vira "tente novamente". Coberto em `test/integration/agenda.integration.ts` (constraint, adjacência, corrida real contra a constraint, criações e reagendamentos simultâneos de várias instâncias, cancelamento e profissionais distintos). A suíte roda na CI e falha, em vez de ser pulada, se `INTEGRATION_DATABASE_URL` faltar.
- **Reagendar** altera data, horário e/ou profissional do mesmo registro e repete as validações de profissional e conflito (ignorando o próprio agendamento). Agendamento cancelado não pode ser reagendado. O paciente não muda.
- **Cancelar** (sem atendimento válido nem presença marcada) muda o status para `CANCELADO` e registra `cancelledAt`, `cancelledById` e motivo **opcional**. O registro continua consultável e deixa de ocupar o horário. Não há regra de antecedência. Como não pode ser desfeito, a tela pede confirmação num diálogo (onde vai o motivo).
- **Presença (MEL-01; decisões de Bruno em 27/09/2026):** campo próprio `attendance`, separado do status: `COMPARECEU`, `FALTA_AVISADA` ou `FALTA_NAO_AVISADA` (vazio = não marcada), com `attendanceMarkedAt` e `attendanceMarkedById` (só a última marcação). **Só registro**: sem cobrança, multa, limite de faltas ou bloqueio. Marca-se no detalhe do agendamento, a partir do início do horário e só em agendamento `AGENDADO`. Recepção, Fisioterapeuta e Administrador (`agenda:gerir`) marcam, corrigem ou removem. A falta **não libera o horário** (só cancelar libera). No banco, `Appointment_attendance_consistent` exige os três campos juntos e só com status `AGENDADO`.
- **Atendimento vinculado** (ver `clinico/README.md`): gerar o atendimento a partir do agendamento marca `COMPARECEU`. Enquanto houver atendimento válido vinculado, a presença fica travada e o agendamento **não é cancelado nem reagendado**; para desfazer, invalida-se o atendimento (fluxo clínico). Com presença marcada (mesmo sem atendimento), cancelar e reagendar também são recusados até remover a marcação. O detalhe mostra "Atendimento: Registrado/Não registrado"; o link para o atendimento aparece só para quem tem `clinico:ler`. A consulta da agenda traz só o `id` do atendimento, nunca o conteúdo clínico.
- **Trava por agendamento:** cancelar, reagendar, marcar presença e gerar atendimento travam a linha do agendamento (`SELECT ... FOR UPDATE`) e releem o estado; operações simultâneas no mesmo agendamento entram em fila. Reagendar toma antes os locks por profissional e depois a linha. Coberto em `test/integration/agenda-sessao.integration.ts`.
- **Inativar o paciente** não mexe na agenda: agendamentos continuam, a presença pode ser marcada, mas não se gera atendimento (regra clínica de paciente inativo).
- **Início no passado** é permitido (lançamento retroativo): o formulário só mostra um aviso, sem bloquear.
- **Visões** (`/agenda?view=dia|semana|lista&date=YYYY-MM-DD&professionalId=`; `parseAgendaView()`): **dia** (padrão, hoje) em grade com uma coluna por fisioterapeuta ativo, faixa 07:00–20:00 ampliada se houver agendamento fora dela e linha do horário atual; **semana** de segunda a domingo, cada dia leva à visão do dia; **lista** com período `from`/`to` (padrão: 7 dias a partir de hoje; máximo 31 dias). Todas incluem cancelados, marcados como tal. Na grade do dia, quem tem `agenda:gerir` clica num horário vazio para abrir `/agenda/novo` com data, profissional e início (`start=HH:MM`) preenchidos; o fim continua informado à mão.
- **Autoria**: `createdById`/`updatedById` (FK `Restrict`). Não é trilha de auditoria.
- **Escolha do paciente** (issue #38): não há lista fixa. O campo busca no servidor (`searchActivePatients`) pelo nome, sem diferenciar acentos nem maiúsculas (mesma `searchName` da lista de pacientes). Traz só pacientes `ATIVO`, só `id` e nome, em ordem `fullName, id` e com até 20 resultados por consulta; se houver mais, o formulário pede para refinar. No cliente (`patient-combobox.tsx`), o padrão ARIA combobox + listbox tem setas, Enter para escolher (sem enviar o formulário) e Escape para fechar. A busca espera 250 ms depois da digitação, e só a resposta da busca mais recente é aplicada. Há estados de carregamento, vazio e erro, e a contagem de resultados é anunciada numa região `polite`. O paciente escolhido fica num campo oculto, separado do texto digitado, então refinar a busca ou receber um erro de validação não o perde. A regra de paciente ativo continua sendo validada em `createAppointment`.

## Permissões

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver agenda e agendamentos (`agenda:ler`) | ✓ | ✓ | ✓ |
| Criar, reagendar e cancelar (`agenda:gerir`) | ✓ | ✓ | ✓ (desde a #31, para qualquer profissional apto) |
| Marcar, corrigir e remover presença (`agenda:gerir`) | ✓ | ✓ | ✓ |
| Registrar atendimento a partir do agendamento (`clinico:gerir`) | ✓ | — | ✓ (só dos próprios agendamentos) |

Quem opera (autor em `createdById`, `updatedById` e `cancelledById`) é o usuário logado, que pode ser diferente do **profissional atendente** (`professionalId`). O profissional precisa ser um fisioterapeuta ativo; isso é regra de elegibilidade (`rules.ts`), não de autorização do operador.

## Fora do escopo (por ora)

**Ainda não implementados, mas incluídos no MVP pela DEC-01 (#43):** aviso de conflito por paciente (hoje o mesmo paciente em dois profissionais no mesmo horário não é barrado nem avisado) e bloqueio de horários por profissional (MEL-02 do roadmap). Presença e vínculo com o atendimento foram entregues na MEL-01 (#44).

**Posteriores ao MVP:** horário de funcionamento e visão mensal.

**Também fora do escopo:** recorrência, notificações e lembretes, busca de pacientes no formulário (substituir a lista quando o volume crescer).
