# Responsabilidade: escopo do MVP

## CONFIRMADO

O MVP corresponde às Fases 1 a 4: Fundação, Pacientes, Agenda e Prontuário.

Inclui, no escopo geral, cadastro/consulta/edição de pacientes, anamnese, agenda, agendamento, reagendamento, cancelamento, avaliação inicial, plano terapêutico, sessões, evoluções e reavaliação.

## IMPLEMENTADO

- Fase 1: fundação, banco, autenticação, usuários, perfis e permissões.
- Fase 2a: cadastro e consulta cadastral de pacientes.
- Fase 2b: anamnese subjetiva versionada.
- Fase 2c: sexo, profissão e CREFITO.
- Fase 2d: documentos de impressão gerados na hora, sem armazenamento.
- Fase 3, primeira fatia: agenda por profissional/período, criação, consulta, reagendamento, cancelamento e visões dia, semana e lista.
- Fase 4, núcleo: avaliação inicial com histórico, plano terapêutico com revisões imutáveis, sessões com evolução/correção/invalidação e reavaliação comparativa com revisão motivada do plano (issues #24–#27).
- Histórico clínico de sessões na ficha do paciente; agenda e sessões ainda sem vínculo.

Fontes: `src/modules/*/README.md`, `git log`, `docs/project/roadmap.md`.

## LIMITES VERIFICADOS EM 26/09/2026

Indicação de alta é documental; não encerra plano, inativa paciente ou altera agenda. O módulo próprio de profissionais ainda não foi implementado: profissionais são usuários fisioterapeutas. Publicação e funcionamento autenticado no ambiente publicado não foram verificados nesta revisão.

Correções, melhorias e critérios de aceite estão no [roadmap](roadmap.md), com prioridade de estabilização antes da próxima fatia funcional.

## PENDENTE / TBD

Bloqueios de horários, horário de funcionamento, controle de presença e visão mensal precisam ser decididos em relação ao MVP.
Decidir também a inclusão do vínculo agenda–sessão e da alta operacional. Financeiro, relatórios/indicadores e evoluções como notificações, WhatsApp, assinatura digital, portal do paciente e teleatendimento permanecem posteriores ao MVP.
