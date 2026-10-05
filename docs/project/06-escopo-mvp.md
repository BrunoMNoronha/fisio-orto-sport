# Responsabilidade: escopo do MVP

## CONFIRMADO

O MVP corresponde às Fases 1 a 4: Fundação, Pacientes, Agenda e Prontuário.

No escopo geral, inclui:

- cadastro, consulta e edição de pacientes;
- anamnese;
- agenda, com agendamento, reagendamento e cancelamento;
- avaliação inicial, plano terapêutico, sessões, evoluções e reavaliação.

Os complementos decididos na DEC-01 estão abaixo.

## IMPLEMENTADO

- Fase 1: fundação, banco, autenticação, usuários, perfis e permissões.
- Fase 2a: cadastro e consulta cadastral de pacientes.
- Fase 2b: anamnese subjetiva versionada.
- Fase 2c: sexo, profissão e CREFITO.
- Fase 2d: documentos de impressão gerados na hora, sem armazenamento.
- Fase 3, primeira fatia:
  - agenda por profissional e período;
  - criação, consulta, reagendamento e cancelamento;
  - visões dia, semana e lista.
- Fase 4, núcleo (issues #24–#27):
  - avaliação inicial com histórico;
  - plano terapêutico com revisões imutáveis;
  - sessões com evolução, correção e invalidação;
  - reavaliação comparativa, com revisão motivada do plano.
- Histórico clínico de sessões na ficha do paciente.
- MEL-01 (#44): vínculo agenda–sessão e registro de presença e faltas
  (decisões abaixo).
- Publicação e fluxo autenticado verificados na VAL-02 (#42, 27/09/2026), com as
  limitações registradas em [evidencias/val-02-producao](evidencias/val-02-producao.md).

Fontes: `src/modules/*/README.md`, `git log`, `docs/project/roadmap.md`.

## Decisões de escopo (DEC-01, #43)

Decisor: Bruno M Noronha, em 27/09/2026, respondendo no chat às opções
preparadas a partir do estado do código. O aceite de cada item incluído é o
critério descrito na tabela; os itens posteriores não têm aceite no MVP.

| Item | Decisão | Justificativa | Aceite / condição |
|---|---|---|---|
| Vínculo agenda–sessão | **Incluído no MVP** (MEL-01) | Dá continuidade ao atendimento, que hoje é lançado à mão sem relação com o horário marcado | O atendimento pode ser registrado a partir de um agendamento elegível, sem duplicar o registro. O lançamento retroativo sem agendamento continua possível. Dados administrativos do agendamento e conteúdo clínico continuam separados. Os efeitos de cancelar um agendamento ou inativar um paciente são definidos antes do schema |
| Presença e faltas | **Incluído no MVP, só registro** (junto da MEL-01) | A clínica precisa saber quem compareceu, e a agenda hoje só tem `AGENDADO` e `CANCELADO` | O agendamento registra comparecimento ou falta, incluindo se a falta foi avisada ou não. Recepção e Fisioterapeuta marcam, dentro das permissões atuais de `agenda:gerir`. **Sem** cobrança, multa, limite de faltas ou bloqueio automático |
| Disponibilidade | **Incluído no MVP: bloqueios + aviso** (MEL-02). **Horário de funcionamento: posterior** | Férias e ausências impedem o uso real da agenda. O conflito do paciente precisa ser visível, mas encaixes legítimos não devem ser barrados | Um profissional pode ter horários bloqueados, e não se agenda sobre um bloqueio (com testes de limites e concorrência). Agendar um paciente que já tem outro horário sobreposto mostra aviso e permite prosseguir. O conflito por profissional continua barrado como hoje |
| Visão mensal da agenda | **Posterior ao MVP** | A lista de até 31 dias já cobre a consulta do mês | Rever se o uso mostrar necessidade (MEL-04) |
| Alta operacional | **Posterior ao MVP** | Alta documental e encerramento manual do plano cobrem o fluxo atual, sem efeitos automáticos | Ver a seção abaixo |
| Módulo próprio de profissionais | **Posterior ao MVP** | O profissional é o usuário `FISIOTERAPEUTA` com CREFITO, gerido em `/usuarios`, e isso atende o MVP | Especialidades, carga horária e outros dados profissionais ficam para depois. `src/modules/profissionais` continua reservado e sem implementação |

### Encerramento de plano × alta

- **Encerramento do plano** (implementado): é uma ação manual do
  profissional, com motivo e assinatura (`TherapyPlanStatusChange`), e pode ser
  revertida. Encerra só aquele plano. Não é alta, não inativa o paciente e não
  mexe na agenda.
- **Indicação de alta** (implementada): é uma conclusão possível da
  reavaliação (`INDICACAO_ALTA`). Só documenta: não encerra plano, não inativa
  paciente e não altera a agenda.
- **Alta operacional** (posterior ao MVP): seria uma ação única com efeitos
  (por exemplo, encerrar planos, tratar agendamentos futuros ou inativar o
  paciente). Nenhum desses efeitos está decidido. Eles precisam ser definidos
  numa decisão própria antes de qualquer implementação.

### O que continua valendo

- Matriz de perfis vigente (`src/modules/auth/permissions.ts`): Recepção com
  cadastro e agenda, sem dados clínicos; Fisioterapeuta com cadastro, agenda e
  clínico (#31), nunca `usuarios:*`; Administrador com tudo. Presença e
  bloqueios usam as permissões de agenda existentes, sem criar perfil nem
  permissão nova.
- Decisões clínicas das issues #24–#27: autoria, CREFITO em snapshot, paciente
  inativo só para consulta, revisões imutáveis e alta documental.
- Financeiro, relatórios e indicadores, notificações e lembretes, WhatsApp,
  assinatura digital, portal do paciente e teleatendimento: **posteriores ao
  MVP** (FUT-01). Nenhum item incluído acopla atendimento a cobrança.

## Critérios de conclusão do MVP

O MVP está concluído quando **todos** os itens abaixo tiverem evidência
registrada (issue ou PR com aceite verificado):

1. Fases 1 a 4 conforme "Implementado" acima (já atendido).
2. MEL-01 entregue: vínculo agenda–sessão e registro de presença e faltas, com
   o aceite da tabela.
3. MEL-02 entregue: bloqueios de horário por profissional e aviso de conflito
   do paciente, com o aceite da tabela.
4. Itens P1 de estabilização do [roadmap](roadmap.md) concluídos ou com exceção
   técnica registrada.
5. Tarefas da DEC-02 exigidas "antes do uso com dados reais"
   ([15-retencao-rastreabilidade-recuperacao](15-retencao-rastreabilidade-recuperacao.md))
   concluídas.
6. Cada fatia nova atende a [definição de pronto](14-definicao-pronto.md): testes
   unitários, lint, TypeScript, build, integração na CI e fluxo principal
   testado.
7. Fluxo por perfil revalidado depois de publicar MEL-01 e MEL-02, no mesmo
   formato da VAL-02.

**Fechamento registrado em 04/10/2026.** O critério 7 foi comprovado pela
[VAL-03](evidencias/val-03-revalidacao-perfis.md) no SHA publicado `20b3282`.
Os critérios 1–6, com seus limites históricos, estão resumidos no
[gate do briefing financeiro](16-financeiro-integracoes.md#gate-de-início--critérios-do-mvp-e-evidências).

MEL-03 (CREFITO na anamnese) e MEL-04 (verificação de experiência) não foram
decididos na DEC-01. Se a clínica os incluir, passam a somar-se a esta lista.
A MEL-03 foi implementada na #46 (27/09/2026): snapshot de CREFITO nas versões
novas da anamnese, sem backfill das antigas, e impressão só com a assinatura
gravada.

## Regras da MEL-01 (#44)

Decisor: Bruno M Noronha, em 27/09/2026, respondendo no chat às opções
preparadas a partir do código, antes do schema. Detalhes técnicos em
`src/modules/agenda/README.md` e `src/modules/clinico/README.md`; migração e
recuperação em [evidencias/mel-01-agenda-sessao](evidencias/mel-01-agenda-sessao.md).

- **Estados de presença:** campo próprio no agendamento, separado do status
  (`AGENDADO`/`CANCELADO` continuam): compareceu, faltou (avisou) e faltou (sem
  aviso), ou não marcada. Marca-se a partir do início do horário. A falta não
  libera o horário; só cancelar libera.
- **Quem corrige:** Recepção, Fisioterapeuta e Administrador (`agenda:gerir`)
  marcam, corrigem ou removem. Guarda-se a última marcação (quem e quando).
- **Relação:** o atendimento aponta, opcionalmente, para o agendamento do mesmo
  paciente. Um atendimento válido por agendamento; invalidar libera para novo
  registro. Elegível: agendado, horário já iniciado, sem falta marcada, paciente
  e plano ativos. O profissional do atendimento é o do agendamento. Gerar o
  atendimento marca "compareceu".
- **Cancelar ou reagendar agendamento vinculado:** bloqueado enquanto houver
  atendimento válido; para desfazer, invalida-se o atendimento. Com presença
  marcada, também é preciso remover a marcação antes (decisão técnica derivada:
  presença só existe em agendamento ativo).
- **Inativar o paciente:** sem efeito automático na agenda; não se gera
  atendimento enquanto inativo (regra clínica existente).
- **Atendimento sem vínculo:** continua permitido (retroativo). Registros
  anteriores à MEL-01 ficam sem vínculo, sem backfill.

## Regras da MEL-02 (#45)

Decisor: Bruno M Noronha, em 27/09/2026, respondendo no chat às opções
preparadas a partir do código, antes do schema. Detalhes técnicos em
`src/modules/agenda/README.md`; migração e recuperação em
[evidencias/mel-02-bloqueios](evidencias/mel-02-bloqueios.md).

- **Bloqueio sobre agendamento existente:** é recusado. A tela lista os
  agendamentos ativos do período para reagendar ou cancelar antes. Nenhum
  agendamento é cancelado ou alterado automaticamente.
- **Encaixe:** sem regra extra. Como não há horário de funcionamento nem
  duração padrão no MVP, qualquer horário válido é aceito; só barram o conflito
  do profissional e o bloqueio. O conflito do paciente só avisa.
- **Gestão do bloqueio:** criar (intervalo `[início, fim)`, pode durar vários
  dias, motivo opcional) e remover (remoção lógica com autor e data). Sem
  edição: remove-se e cria-se outro.
- **Quem gere:** `agenda:gerir` (Recepção, Fisioterapeuta e Administrador),
  para qualquer fisioterapeuta ativo, sem permissão nova.
- **Conflito do paciente (DEC-01):** aviso com a lista dos horários
  sobrepostos; a pessoa confirma e o agendamento segue. Vale para criar e
  reagendar. O conflito por profissional continua barrado.

## PENDENTE / TBD

Nenhuma regra da MEL-01 ou da MEL-02 pendente. Horário de funcionamento e
visão mensal continuam posteriores ao MVP.
