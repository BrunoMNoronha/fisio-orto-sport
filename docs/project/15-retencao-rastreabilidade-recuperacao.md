# Responsabilidade: retenção, rastreabilidade e recuperação (DEC-02)

Registro de decisões da issue #41 (roadmap DEC-02, P1 antes de uso com dados
reais): estado verificado, decisões da clínica e tarefas técnicas derivadas.
Não estabelece prazo legal, política clínica nem aconselhamento jurídico, e não
autoriza exclusão, anonimização ou operação em dados reais.

Estado verificado em 26/09/2026 contra `prisma/schema.prisma`, `src/modules/`
e o projeto Neon de produção (leitura).

## Decisor

| Papel | Situação |
|---|---|
| Decisor das políticas (clínica) | **CONFIRMADO** — Bruno M Noronha (Bruno, 26/09/2026) |
| Orientação especializada (jurídica/LGPD e norma COFFITO) | **PENDENTE** — quem orienta e fonte consultada |
| Responsável técnico pela execução | Bruno M Noronha (mantenedor) — **SUPOSIÇÃO** até confirmação formal |
| Responsável por backup, conferência e teste de restauração | **CONFIRMADO** — Bruno M Noronha (Bruno, 26/09/2026; B6) |

Fonte das decisões de 26/09/2026: respostas de Bruno nas sessões de execução da
issue #41 (A1, A2, A4–A8, B4 e B5 na primeira; R1–R6, A3, B1–B3, B6, B7, O1 e
O2 na segunda).

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
| `Anamnesis` | Versionada; autor, nome e CREFITO snapshot (CREFITO desde a MEL-03; versões anteriores marcadas sem CREFITO) |
| `Assessment`, `TreatmentSession`, `Reassessment` | Autor com nome/CREFITO snapshot e tabelas `*Change` com editor, motivo e data de cada correção |
| `TherapyPlan` | Revisões imutáveis (`TherapyPlanRevision`) e mudanças de status (`TherapyPlanStatusChange`) com autor e motivo |
| `User` | Datas de criação/alteração; **sem autor** da alteração nem histórico de perfil, ativação ou senha |

### Auditoria de acesso (quem leu)

- **Não existe.** Nenhuma leitura de ficha, prontuário, documento de impressão
  ou lista de pacientes é registrada.
- Eventos de login, logout, acesso negado e gestão de usuários são registrados
  na tabela `AuditLog` desde a #56 (PR #58; migração
  `20260926193053_auditoria` aplicada no Neon de produção em 26/09/2026). Ver
  `src/modules/auditoria/README.md`.
- Logs da aplicação, sem dado pessoal: `console.error` quando o armazenamento
  do limite de login falha (`auth/rate-limit.ts`) e quando a gravação de
  auditoria de login/logout/negação ou o expurgo falham (`auditoria/record.ts`).

### Backup e recuperação

- Banco de produção: projeto Neon `fisio-orto-sport` (`falling-star-59523600`,
  `aws-sa-east-1`, PostgreSQL 18), ligado à Vercel só em Production.
- Janela de restauração point-in-time configurada: `history_retention_seconds =
  21600` (**6 horas**).
- **Nenhum snapshot** listado no projeto; agendamento de snapshots não consultado.
- Não há cópia fora do Neon nem teste de restauração registrado. Objetivos de
  recuperação e responsável: B2, B3 e B6 (abaixo).
- Procedimento vigente: criar ponto de restauração antes de cada migração
  ([12-ambiente](12-ambiente.md)); rollback por redeploy na Vercel e restauração
  no Neon ([13-stack-infraestrutura](13-stack-infraestrutura.md)).

**Risco:** com 6 horas de janela e sem snapshots, um erro percebido depois
desse prazo não é recuperável pelo Neon. **Risco aceito por Bruno em
26/09/2026** (B4/B5); recomenda-se reavaliar antes de volume relevante de dados
reais. O ponto de restauração antes de cada migração continua obrigatório.

## Decisões da clínica

Todas as perguntas têm decisão registrada por Bruno. Várias valem "por ora" e
devem ser revistas quando houver orientação especializada ou volume relevante
de dados reais. "Opções" foram insumos para a decisão, não recomendação
jurídica.

### R — Retenção, exclusão e anonimização

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| R1 | Por quanto tempo o prontuário é guardado e a partir de quando conta (último atendimento, alta, maioridade do paciente)? | Depende de norma COFFITO/CFM aplicável e orientação jurídica; **não inventar prazo** | **CONFIRMADO (Bruno, 26/09/2026):** sem prazo final por ora — todo o prontuário é guardado até haver orientação especializada; nenhum prazo legal foi definido ou inventado |
| R2 | Dados cadastrais de quem nunca teve registro clínico (só agenda/cadastro) seguem o mesmo prazo? | Mesmo prazo, prazo menor ou decisão caso a caso | **CONFIRMADO (Bruno, 26/09/2026):** manter como está — cadastros sem registro clínico também não são apagados |
| R3 | Ao fim do prazo: excluir, anonimizar ou revisar manualmente? | Anonimização mantém estatística; exclusão exige tratar FKs `Restrict` | **CONFIRMADO (Bruno, 26/09/2026):** nenhuma exclusão ou anonimização nesta etapa (decorre de R1); T8 adiada |
| R4 | Como atender pedido do titular (acesso, correção, eliminação) quando o prontuário deve ser mantido? | Fluxo manual registrado vs. funcionalidade no sistema | **CONFIRMADO (Bruno, 26/09/2026):** fluxo manual — o pedido é tratado e registrado fora do sistema; sem funcionalidade no aplicativo nesta etapa |
| R5 | Quem pode aprovar e executar uma exclusão/anonimização, e com qual registro? | Ex.: ADMIN com dupla confirmação e trilha | **CONFIRMADO (Bruno, 26/09/2026):** só o ADMIN (Bruno) aprova; nenhuma exclusão pelo aplicativo nesta etapa. Execução técnica futura exige autorização expressa e T8 |
| R6 | Retenção de usuários desativados e de sessões/tentativas de login | Hoje sessões expiradas são apagadas; usuários nunca | **CONFIRMADO (Bruno, 26/09/2026):** manter como está — usuários desativados nunca são apagados; sessões expiradas e contadores de tentativa continuam apagados automaticamente |

### A — Rastreabilidade e auditoria de acesso

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| A1 | Quais leituras devem ser auditadas? | Ficha clínica; prontuário completo; documentos de impressão; busca/listagem de pacientes; dados cadastrais | **CONFIRMADO (Bruno, 26/09/2026):** nenhuma leitura auditada por ora — leitura do prontuário e impressão de documentos **não** entram nesta etapa; reavaliar se a orientação especializada exigir |
| A2 | Quais eventos de segurança registrar? | Login com sucesso/falha, logout, acesso negado, criação/alteração/desativação de usuário, troca de perfil/senha, uso do `db:admin` | **CONFIRMADO (Bruno, 26/09/2026):** eventos de login (sucesso, falha, logout, acesso negado) e gestão de usuários (criar, alterar perfil, desativar/reativar, redefinir senha, uso do `db:admin`) |
| A3 | Histórico de valores anteriores para `Patient`, `Appointment` e `User`? | Hoje só guardam o último autor | **CONFIRMADO (Bruno, 26/09/2026):** não por ora — último autor e eventos de auditoria da gestão de usuários bastam nesta etapa; T3 adiada |
| A4 | Quem consulta os registros de auditoria e por qual meio? | Tela para ADMIN, consulta técnica sob pedido, exportação | **CONFIRMADO (Bruno, 26/09/2026):** somente ADMIN, em tela da aplicação |
| A5 | Por quanto tempo os registros de auditoria são guardados? | Relacionar ao prazo do prontuário (R1); não inventar prazo | **CONFIRMADO (Bruno, 26/09/2026):** 7 dias, como decisão operacional (não é prazo legal). Registros mais antigos são expurgados; eventos percebidos depois de 7 dias ficam sem trilha |
| A6 | Quais dados o registro pode conter? | Mínimo: usuário, perfil, ação, alvo (id), data, IP/origem; **sem conteúdo clínico** | **CONFIRMADO (Bruno, 26/09/2026):** ação, data, resultado, usuário, perfil, alvo (id) e IP. Sem senha, token, user-agent ou conteúdo clínico; na falha de login, o e-mail digitado só como hash, sem revelar se a conta existe |
| A7 | Registro de auditoria imutável para a própria aplicação? | Só inserção pela aplicação, sem edição/exclusão pela interface | **CONFIRMADO (Bruno, 26/09/2026):** imutável também no banco — a aplicação só insere e o PostgreSQL bloqueia UPDATE/DELETE, exceto o expurgo de registros vencidos (A5) |
| A8 | Se gravar o registro falhar, a ação segue? | Bloquear tudo, bloquear só gestão, não bloquear | **CONFIRMADO (Bruno, 26/09/2026):** gestão de usuários grava na mesma transação e falha junto; o login segue, e a falha vai para o log do servidor sem dado pessoal |

### B — Backup e recuperação

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| B1 | Escopo do backup | Banco de produção completo; configuração (variáveis, sem expor valores no repositório); código já está no GitHub | **CONFIRMADO (Bruno, 26/09/2026):** banco de produção no Neon + inventário dos **nomes** das variáveis de produção (seção abaixo), sem valores. O código está no GitHub |
| B2 | Perda máxima aceitável (RPO) | Hoje: sem valor definido; PITR de 6 h | **CONFIRMADO (Bruno, 26/09/2026):** qualquer ponto dentro da janela PITR de 6 h; problema percebido depois disso não é recuperável (risco aceito em B4) |
| B3 | Tempo máximo para voltar a operar (RTO) | Sem valor definido antes da decisão | **CONFIRMADO (Bruno, 26/09/2026):** voltar a operar em até 1 dia útil |
| B4 | Janela de restauração e snapshots no Neon | Ampliar `history_retention_seconds` e/ou agendar snapshots, conforme plano contratado e custo | **CONFIRMADO (Bruno, 26/09/2026):** manter como está (PITR de 6 h, sem snapshots agendados) — **risco aceito**, ver abaixo |
| B5 | Cópia fora do Neon (ex.: `pg_dump` criptografado) | Onde guardar, quem acessa, por quanto tempo, criptografia | **CONFIRMADO (Bruno, 26/09/2026):** sem cópia externa por ora (mesma decisão de B4) |
| B6 | Responsáveis por executar, verificar e testar | Execução, conferência periódica, restauração | **CONFIRMADO (Bruno, 26/09/2026):** Bruno executa, confere e testa |
| B7 | Evidência de restauração | Frequência do teste; restaurar em branch/banco isolado e registrar data, ponto restaurado, contagens e responsável, sem dados pessoais na evidência | **CONFIRMADO (Bruno, 26/09/2026):** um teste antes do uso com dados reais, restaurando em branch isolado do Neon; registrar data, ponto restaurado, contagens por tabela e responsável, sem dados pessoais; branch removido após conferência autorizada. Sem periodicidade definida depois disso |

### O — Observabilidade

| ID | Pergunta | Opções / observações | Decisão |
|---|---|---|---|
| O1 | Quais erros/alertas monitorar e quem recebe? | Erros de servidor, falha de banco, falha do limite de login | **CONFIRMADO (Bruno, 26/09/2026):** sem alertas por ora — Bruno consulta os logs nativos da Vercel sob demanda; T9 adiada |
| O2 | Retenção e conteúdo dos logs da plataforma | Logs sem dados pessoais/clínicos; retenção conforme plano Vercel | **CONFIRMADO (Bruno, 26/09/2026):** retenção conforme o plano Vercel; logs sem dados pessoais ou clínicos |

## Tarefas técnicas derivadas

Separadas por natureza: **autoria de escrita** (quem alterou o quê) é diferente
de **auditoria de acesso** (quem viu o quê). Tarefas adiadas só voltam com nova
decisão registrada acima.

| Tarefa | Natureza | Depende de | Aceite mínimo |
|---|---|---|---|
| T1 — Tabela de auditoria de acesso e registro nas leituras escolhidas | Auditoria de acesso | A1 (decidido: nenhuma leitura por ora) | **Adiada.** Leitura auditada gera registro com usuário, ação, alvo e data; falha ao registrar tem política definida; sem conteúdo clínico no registro; testes por perfil |
| T2 — Eventos de segurança (login, logout, negação, gestão de usuários, `db:admin`) — **#56** | Auditoria de acesso | A2, A5–A8 ✓ | Eventos definidos registrados sem senha/token; testes — **IMPLEMENTADO na #56** (PR #58; migração aplicada no Neon de produção em 26/09/2026) |
| T3 — Histórico de alterações de `Patient`, `Appointment` e `User` | Autoria de escrita | A3 (decidido: não por ora) | **Adiada.** Cada alteração guarda autor, data e valores anteriores dos campos decididos; migração aditiva |
| T4 — Consulta da auditoria — **#56** | Auditoria de acesso | A4 ✓; T2 | Somente ADMIN consulta, em tela; filtros por usuário, evento e período — **IMPLEMENTADO na #56** (PR #58; migração aplicada no Neon de produção em 26/09/2026) |
| T5 — Expurgo dos registros de auditoria vencidos — **incluído na #56** | Retenção | A5 ✓ (7 dias) | Rotina documentada e testada em banco descartável — **IMPLEMENTADO na #56** (PR #58; migração aplicada no Neon de produção em 26/09/2026) |
| T6 — Configurar retenção/snapshots no Neon e cópia externa | Backup | B4/B5 (decidido: manter) | **Adiada** por risco aceito. Configuração lida de volta e registrada; custo aprovado |
| T7 — Roteiro e primeiro teste de restauração — **#42 (VAL-02)** | Backup | B1–B3, B6, B7 ✓ | Antes do uso com dados reais: restauração em branch isolado do Neon, conferência das variáveis de produção pelo inventário (nomes, sem valores) e evidência registrada conforme B7; branch removido após conferência autorizada. Concluída em 27/09/2026 na #42: as 17 tabelas batem entre a restauração e o `main`, as variáveis foram conferidas e o branch e o snapshot foram removidos. Evidência em [evidencias/val-02-producao](evidencias/val-02-producao.md#7-restauração-em-destino-isolado--comprovado-b6-b7) |
| T8 — Fluxo de retenção/anonimização do prontuário | Retenção | R1–R5 (decidido: nada é excluído por ora) | **Adiada.** Somente após decisão e autorização expressa; teste só com dados fictícios |
| T9 — Monitoramento de erros e alertas | Observabilidade | O1, O2 (decidido: sem alertas por ora) | **Adiada.** Alertas definidos chegam ao responsável; logs sem dados pessoais |

## Inventário de variáveis de produção (B1)

Somente nomes; valores ficam na Vercel e nunca no repositório. Fonte: variáveis
lidas pelo código (`process.env`) e registro da integração Neon ↔ Vercel. A
lista no painel da Vercel deve ser conferida contra esta tabela no teste de
restauração (T7).

| Variável | Escopo | Origem | Uso |
|---|---|---|---|
| `DATABASE_URL` | Production | Integração Neon (Storage) | Conexão com pooling usada pela aplicação |
| `DATABASE_URL_UNPOOLED` e demais `DATABASE_*` | Production | Integração Neon (Storage) | URL direta e componentes; a aplicação não lê diretamente |
| `SETUP_TOKEN` | Production, só enquanto não há usuários | Manual | Libera o primeiro acesso pela web; remover após o primeiro cadastro |
| `VERCEL`, `NODE_ENV` | Automático | Plataforma | Proxy confiável para IP e modo de execução |

Recuperar a configuração: reconectar o banco pelo Storage da Vercel (regenera
`DATABASE_*`) e redeploy. `SEED_ADMIN_*`, `POSTGRES_*` e
`INTEGRATION_DATABASE_URL` são locais (`.env.example`) e não devem existir em
produção; `TRUST_PROXY` é dispensável na Vercel (`VERCEL` já cumpre o papel).

## Pendências

- Orientação especializada (LGPD e norma COFFITO sobre prontuário): quem orienta
  e fonte consultada. Ao chegar, revisar R1–R5, A1, A3 e A5.
- Decisões "por ora" (R1–R6, A1, A3, B4, B5, O1, O2): revisar antes de volume
  relevante de dados reais.

## Fontes

- Código: `prisma/schema.prisma`, `src/modules/auth/`, `src/modules/auditoria/`,
  `src/modules/clinico/`, `.env.example`.
- Neon (leitura em 26/09/2026): `list_projects` e `list_snapshots` do projeto
  `falling-star-59523600`.
- Normativas a consultar ao revisar R1–R5 e A5: Lei 13.709/2018 (LGPD) e
  resoluções COFFITO vigentes sobre prontuário — **não consultadas**; as
  decisões atuais não dependem de prazo legal e requerem orientação
  especializada para revisão.
