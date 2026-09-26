# Roadmap — Fisio OrtoSport

Atualizado em 2026-09-19 com base no código, documentação dos módulos, histórico Git e validação técnica local.

## Legenda de status

- **IMPLEMENTADO:** há código e documentação correspondente.
- **TESTADO:** há validação automatizada registrada.
- **EM ANDAMENTO:** parte da fase foi implementada, mas ainda há itens pendentes.
- **PLANEJADO:** permanece no escopo futuro do MVP, sem implementação verificada.
- **PENDENTE:** depende de decisão de negócio ou evidência adicional.
- **FORA DO MVP:** não pertence ao escopo atual.

## Fase 1 — Fundação

**Status: IMPLEMENTADO e TESTADO**

- [x] Estrutura inicial do projeto;
- [x] Banco de dados;
- [x] Autenticação;
- [x] Usuários;
- [x] Perfis e permissões.

## Fase 2 — Pacientes

**Status: EM ANDAMENTO**

- [x] Cadastro;
- [x] Consulta;
- [x] Edição;
- [ ] Histórico de atendimentos — aguarda Fases 3 e 4;
- [x] Anamnese subjetiva versionada;
- [x] Cadastro complementar da ficha: sexo, profissão e CREFITO;
- [x] Documentos de impressão: termo, cartão de frequência e ficha de anamnese, gerados sem armazenamento.

## Fase 3 — Agenda

**Status: EM ANDAMENTO — primeira fatia implementada e validada por testes técnicos**

- [x] Agenda por profissional e período;
- [x] Agendamento;
- [x] Reagendamento;
- [x] Cancelamento;
- [x] Visão dia, semana e lista;
- [x] Agendamentos na ficha do paciente;
- [ ] Bloqueio de horários;
- [ ] Horário de funcionamento;
- [ ] Controle de presença;
- [ ] Visão mensal;
- [ ] Recorrência, notificações e lembretes.

## Fase 4 — Prontuário

**Status: PLANEJADO**

- [x] Avaliação inicial (issue #24: criação, lista, detalhe e edição com histórico por campo; implementada e testada, publicação pendente);
- [x] Plano terapêutico (issue #25: criação a partir da avaliação, revisões imutáveis, encerrar e reabrir; implementado e testado, publicação pendente);
- [ ] Registro de sessões;
- [ ] Evoluções;
- [ ] Reavaliação.

## Fase 5 — Financeiro

**Status: PLANEJADO PARA FASE POSTERIOR**

- [ ] Cobranças;
- [ ] Pagamentos;
- [ ] Controle financeiro;
- [ ] Relatórios.

## Fase 6 — Evoluções futuras

**Status: FORA DO MVP**

- [ ] Notificações;
- [ ] Integração com WhatsApp;
- [ ] Assinatura digital;
- [ ] Portal do paciente;
- [ ] Aplicativo mobile;
- [ ] Teleatendimento;
- [ ] Dashboards avançados;
- [ ] Inteligência artificial para apoio operacional e documental.

## Evidências e limites

- Fontes principais: `README.md`, `src/modules/agenda/README.md`, `src/modules/pacientes/README.md`, `src/modules/clinico/README.md`, `prisma/schema.prisma` e `git log` até `13e63cc`.
- A atualização do roadmap não comprova homologação, produção, deploy ou validação manual.
- Integração PostgreSQL permanece pendente por exigir `INTEGRATION_DATABASE_URL`.
