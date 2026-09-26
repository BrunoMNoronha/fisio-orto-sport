# Responsabilidade: retenção, rastreabilidade e recuperação (DEC-02)

Registro de decisões da issue #41 (roadmap DEC-02, P1 antes de uso com dados
reais). Este documento **prepara** as decisões: estado verificado, perguntas e
tarefas técnicas derivadas. Não estabelece prazo legal, política clínica nem
aconselhamento jurídico, e não autoriza exclusão, anonimização ou operação em
dados reais.

Estado verificado em 26/09/2026 contra `prisma/schema.prisma`, `src/modules/`
e o projeto Neon de produção (leitura).

## Decisor

| Papel | Situação |
|---|---|
| Decisor das políticas (clínica) | **CONFIRMADO** — Bruno M Noronha (Bruno, 26/09/2026) |
| Orientação especializada (jurídica/LGPD e norma COFFITO) | **PENDENTE** — quem orienta e fonte consultada |
| Responsável técnico pela execução | Bruno M Noronha (mantenedor) — **SUPOSIÇÃO** até confirmação formal |

Fonte das decisões de 26/09/2026: respostas de Bruno na sessão de execução da
issue #41.

Cada decisão abaixo só passa a CONFIRMADO com decisor, data e fonte registrados
na própria linha.

## CONFIRMADO — estado atual do sistema

### Exclusão e retenção

- O aplicativo **não exclui** pacientes nem registros clínicos. Paciente só é
  inativado (`PatientStatus`: `ATIVO`/`INATIVO`); relações clínicas usam
  `onDelete: Restrict`.
- As únicas exclusões no código são de sessões de login (`Session`: logout,
  expiração, desativação do usuário e `db:admin`) e contadores de tentativa de
  login (`AuthRateLimit`).
- Não existe rotina de retenção, expurgo ou anonimização.
- Documentos de impressão são gerados na hora e não são armazenados.

### Autoria de escrita (quem gravou)

| Dado | Rastreamento atual |
|---|---|
| `Patient`, `Appointment` | `createdById`, `updatedById` e datas; **só a última alteração** (sem histórico de valores anteriores); cancelamento guarda autor |
| `Anamnesis` | Versionada; autor e nome snapshot (sem CREFITO, ver MEL-03) |
| `Assessment`, `TreatmentSession`, `Reassessment` | Autor com nome/CREFITO snapshot e tabelas `*Change` com editor, motivo e data de cada correção |
| `TherapyPlan` | Revisões imutáveis (`TherapyPlanRevision`) e mudanças de status (`TherapyPlanStatusChange`) com autor e motivo |
| `User` | Datas de criação/alteração; **sem autor** da alteração nem histórico de perfil, ativação ou senha |

### Auditoria de acesso (quem leu)

- **Não existe.** Nenhuma leitura de ficha, prontuário, documento de impressão
  ou lista de pacientes é registrada.
- Não há registro de login bem-sucedido, falha de login, logout ou negação de
  permissão, além do contador de limite de tentativas (sem histórico).
- O único log da aplicação é um `console.error` quando o armazenamento do
  limite de login falha (`auth/rate-limit.ts`), sem dado pessoal.

### Backup e recuperação

- Banco de produção: projeto Neon `fisio-orto-sport` (`falling-star-59523600`,
  `aws-sa-east-1`, PostgreSQL 18), ligado à Vercel só em Production.
- Janela de restauração point-in-time configurada: `history_retention_seconds =
  21600` (**6 horas**).
- **Nenhum snapshot** listado no projeto; agendamento de snapshots não consultado.
- Não há cópia fora do Neon, teste de restauração registrado, objetivo de
  recuperação (RPO/RTO) nem responsável formal.
- Procedimento vigente: criar ponto de restauração antes de cada migração
  ([12-ambiente](12-ambiente.md)); rollback por redeploy na Vercel e restauração
  no Neon ([13-stack-infraestrutura](13-stack-infraestrutura.md)).

**Risco:** com 6 horas de janela e sem snapshots, um erro percebido depois
desse prazo não é recuperável pelo Neon. **Risco aceito por Bruno em
26/09/2026** (B4/B5); recomenda-se reavaliar antes de volume relevante de dados
reais. O ponto de restauração antes de cada migração continua obrigatório.

## PENDENTE / TBD — decisões da clínica

Linhas sem decisão registrada seguem TBD. "Opções" são insumos para a decisão, não
recomendação jurídica.

### R — Retenção, exclusão e anonimização

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| R1 | Por quanto tempo o prontuário é guardado e a partir de quando conta (último atendimento, alta, maioridade do paciente)? | Depende de norma COFFITO/CFM aplicável e orientação jurídica; **não inventar prazo** | TBD |
| R2 | Dados cadastrais de quem nunca teve registro clínico (só agenda/cadastro) seguem o mesmo prazo? | Mesmo prazo, prazo menor ou decisão caso a caso | TBD |
| R3 | Ao fim do prazo: excluir, anonimizar ou revisar manualmente? | Anonimização mantém estatística; exclusão exige tratar FKs `Restrict` | TBD |
| R4 | Como atender pedido do titular (acesso, correção, eliminação) quando o prontuário deve ser mantido? | Fluxo manual registrado vs. funcionalidade no sistema | TBD |
| R5 | Quem pode aprovar e executar uma exclusão/anonimização, e com qual registro? | Ex.: ADMIN com dupla confirmação e trilha | TBD |
| R6 | Retenção de usuários desativados e de sessões/tentativas de login | Hoje sessões expiradas são apagadas; usuários nunca | TBD |

### A — Rastreabilidade e auditoria de acesso

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| A1 | Quais leituras devem ser auditadas? | Ficha clínica; prontuário completo; documentos de impressão; busca/listagem de pacientes; dados cadastrais | **CONFIRMADO (Bruno, 26/09/2026):** nenhuma leitura auditada por ora — leitura do prontuário e impressão de documentos **não** entram nesta etapa; reavaliar se a orientação especializada exigir |
| A2 | Quais eventos de segurança registrar? | Login com sucesso/falha, logout, acesso negado, criação/alteração/desativação de usuário, troca de perfil/senha, uso do `db:admin` | **CONFIRMADO (Bruno, 26/09/2026):** eventos de login (sucesso, falha, logout, acesso negado) e gestão de usuários (criar, alterar perfil, desativar/reativar, redefinir senha, uso do `db:admin`) |
| A3 | Histórico de valores anteriores para `Patient`, `Appointment` e `User`? | Hoje só guardam o último autor | TBD |
| A4 | Quem consulta os registros de auditoria e por qual meio? | Tela para ADMIN, consulta técnica sob pedido, exportação | **CONFIRMADO (Bruno, 26/09/2026):** somente ADMIN, em tela da aplicação |
| A5 | Por quanto tempo os registros de auditoria são guardados? | Relacionar ao prazo do prontuário (R1); não inventar prazo | TBD |
| A6 | Quais dados o registro pode conter? | Mínimo: usuário, perfil, ação, alvo (id), data, IP/origem; **sem conteúdo clínico** | TBD |
| A7 | Registro de auditoria imutável para a própria aplicação? | Só inserção pela aplicação, sem edição/exclusão pela interface | TBD |

### B — Backup e recuperação

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| B1 | Escopo do backup | Banco de produção completo; configuração (variáveis, sem expor valores no repositório); código já está no GitHub | TBD |
| B2 | Perda máxima aceitável (RPO) | Hoje: sem valor definido; PITR de 6 h | TBD |
| B3 | Tempo máximo para voltar a operar (RTO) | TBD | TBD |
| B4 | Janela de restauração e snapshots no Neon | Ampliar `history_retention_seconds` e/ou agendar snapshots, conforme plano contratado e custo | **CONFIRMADO (Bruno, 26/09/2026):** manter como está (PITR de 6 h, sem snapshots agendados) — **risco aceito**, ver abaixo |
| B5 | Cópia fora do Neon (ex.: `pg_dump` criptografado) | Onde guardar, quem acessa, por quanto tempo, criptografia | **CONFIRMADO (Bruno, 26/09/2026):** sem cópia externa por ora (mesma decisão de B4) |
| B6 | Responsáveis por executar, verificar e testar | Execução, conferência periódica, restauração | TBD |
| B7 | Evidência de restauração | Frequência do teste; restaurar em branch/banco isolado e registrar data, ponto restaurado, contagens e responsável, sem dados pessoais na evidência | TBD |

### O — Observabilidade

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| O1 | Quais erros/alertas monitorar e quem recebe? | Erros de servidor, falha de banco, falha do limite de login | TBD |
| O2 | Retenção e conteúdo dos logs da plataforma | Logs sem dados pessoais/clínicos; retenção conforme plano Vercel | TBD |

## Tarefas técnicas derivadas

Separadas por natureza: **autoria de escrita** (quem alterou o quê) é diferente
de **auditoria de acesso** (quem viu o quê). Nenhuma deve ser implementada antes
da decisão correspondente.

| Tarefa | Natureza | Depende de | Aceite mínimo |
|---|---|---|---|
| T1 — Tabela de auditoria de acesso e registro nas leituras escolhidas | Auditoria de acesso | A1 (decidido: nenhuma leitura por ora) | **Adiada.** Leitura auditada gera registro com usuário, ação, alvo e data; falha ao registrar tem política definida; sem conteúdo clínico no registro; testes por perfil |
| T2 — Eventos de segurança (login, logout, negação, gestão de usuários, `db:admin`) — **#56** | Auditoria de acesso | A2 ✓; A5, A6, A7 pendentes | Eventos definidos registrados sem senha/token; testes |
| T3 — Histórico de alterações de `Patient`, `Appointment` e `User` | Autoria de escrita | A3 | Cada alteração guarda autor, data e valores anteriores dos campos decididos; migração aditiva |
| T4 — Consulta da auditoria — **#56** | Auditoria de acesso | A4 ✓; T2 | Somente ADMIN consulta, em tela; filtros por usuário, evento e período |
| T5 — Expurgo dos registros de auditoria vencidos | Retenção | A5 | Rotina documentada e testada em banco descartável |
| T6 — Configurar retenção/snapshots no Neon e cópia externa | Backup | B4/B5 (decidido: manter) | **Adiada** por risco aceito. Configuração lida de volta e registrada; custo aprovado |
| T7 — Roteiro e primeiro teste de restauração | Backup | B3, B6, B7 | Restauração em branch isolado com evidência registrada; branch removido após conferência autorizada |
| T8 — Fluxo de retenção/anonimização do prontuário | Retenção | R1–R5 | Somente após decisão e autorização expressa; teste só com dados fictícios |
| T9 — Monitoramento de erros e alertas | Observabilidade | O1, O2 | Alertas definidos chegam ao responsável; logs sem dados pessoais |

## Fontes

- Código: `prisma/schema.prisma`, `src/modules/auth/`, `src/modules/clinico/`.
- Neon (leitura em 26/09/2026): `list_projects` e `list_snapshots` do projeto
  `falling-star-59523600`.
- Normativas a consultar antes de decidir R1, R5 e A5: Lei 13.709/2018 (LGPD) e
  resoluções COFFITO vigentes sobre prontuário — **não consultadas nesta
  preparação**; requerem orientação especializada.
