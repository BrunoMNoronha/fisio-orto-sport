# Roadmap — Fisio OrtoSport

Revisão base em **26/09/2026** com código, testes locais, histórico e evidências do GitHub;
os limites e SHAs dessa revisão são históricos. Atualização financeira em **07/10/2026**:
FIN-01 e FIN-02 integradas à `main`; FIN-03 implementada e validada localmente no
candidato isolado da #88, ainda sem integração ou publicação desse candidato.

## Estado verificado na revisão base de 26/09/2026

Na revisão base, o núcleo das Fases 1 a 4 estava implementado, e a maior lacuna funcional
era a continuidade entre agenda e atendimento. As entregas posteriores MEL-01/MEL-02 e o
fechamento do gate do MVP pela VAL-03 estão registrados abaixo. Financeiro permanece
posterior ao escopo do MVP; sua expansão não altera aqueles critérios.

- Checkout analisado: `feat/fisio-acessos-recepcao`, HEAD `ae2b054901878f97f8f0c84223aa8e07463ec169`, com alterações locais preexistentes.
- As entregas clínicas #24–#27 estão integradas, pelas PRs #29, #30, #32 e #33. A [PR #34](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/34), de permissões do fisioterapeuta, foi confirmada como mesclada durante a revisão; issue #31 encerrada. `main` remota consultada: `01824c8ae478bb95e85e6a6c603ff4c6be9b2c63`.
- `prisma/admin.ts`, o script `db:admin` e suas instruções no README são trabalho local preexistente, ainda não uma entrega versionada neste HEAD. Sua revisão funcional permanece pendente.
- Publicação, migrações em produção e funcionamento autenticado no ambiente publicado **não foram verificados nesta revisão**. Não interpretar isso como ausência de produção.

## Cadastro de plano de saúde — #85

Implementação validada: quatro campos opcionais no cadastro, edição e ficha;
migração aditiva e permissões cadastrais preservadas. 883 testes unitários, 149 de integração,
tipos, lint, build e fluxo autenticado nos três perfis verificados. Sem integração com operadoras
ou financeiro. Publicação e migração em Preview/Production ainda pendentes. Ver [contrato e evidências](evidencias/85-plano-saude.md).

## Cobranças manuais — FIN-01 #86

Implementação validada após o gate do MVP (VAL-03): lançar, consultar, cancelar e substituir
cobranças de qualquer paciente, com valor em centavos, histórico imutável, proteção contra envio
duplicado e `financeiro:*` para os três perfis. A fatia FIN-01 não incluía pagamentos nem
relatórios; pagamentos foram integrados na FIN-02 e relatórios estão no candidato FIN-03 abaixo.
Publicação e migração em Preview/Production pendentes. Ver
[evidências](evidencias/86-fin-01-cobrancas.md).

## Pagamentos parciais e estornos — FIN-02 #87

**Implementada e validada localmente em 05/10/2026**, na branch `codex/fin-02-pagamentos-estornos`,
após a integração da FIN-01 e o gate do MVP. Integrada pela
[PR #93](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/93), no SHA `056517079ce778fed98645b8c545edd941cc2eb7`;
não representa release publicado nem migração aplicada em Preview/Production.

A entrega registra recebimentos parciais/integral até o saldo, estorno interno e correção
vinculada na mesma cobrança, com originais imutáveis e autoria da sessão. Recebimento aceita
retroatividade anterior à cobrança e até hoje em `America/Sao_Paulo`; estorno usa data civil
entre o recebimento original e hoje. Corrigir um pagamento válido grava estorno e substituto
atomicamente; original já estornado permite um substituto explícito, sem vincular automaticamente
um recebimento comum. O saldo é derivado dos pagamentos válidos; estorno de quitação reabre o saldo.

Identificador estável e fingerprint completo preservam o primeiro resultado nos reenvios,
inclusive após estorno/cancelamento, e recusam conteúdo incompatível. As operações da mesma
cobrança são serializadas, com guards no banco e migração aditiva; novos vínculos integram
exclusão de usuários e manutenção. ADMIN, RECEPCAO e FISIOTERAPEUTA mantêm o mesmo alcance
financeiro, sem conteúdo clínico para Recepção e sem bloquear atendimento por dívida.

Lint, tipos, 88 suítes/1.068 testes Jest, nove testes da pipeline e fluxo autenticado
dos três perfis aprovados localmente; anônimo/inativo negados, Recepção sem acesso clínico
e tela de 375 px sem overflow. Resultados e limites, incluindo PostgreSQL e build finais,
nas [evidências da FIN-02](evidencias/87-fin-02-pagamentos.md). Teste de integração no banco
é validação local; a CI da `main` também passou no SHA integrado
([execução 37399715480](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/37399715480)).

Contratos no [briefing financeiro](16-financeiro-integracoes.md) e no
[módulo financeiro](../../src/modules/financeiro/README.md). Relatórios, contas a receber,
meios de pagamento, devolução bancária e integrações permanecem fora da #87. A FIN-03
herda esta entrega; prazo, orçamento, volume e responsável seguem TBD.

## Contas a receber e recebimentos — FIN-03 #88

**Implementada e validada localmente em 07/10/2026**, sobre a `main` `0565170`, depois
de confirmar a FIN-02 integrada pela PR #93 e o gate da VAL-03. Ainda sem merge,
CI do candidato ou release publicado. Evidências e limites em
[88-fin-03-relatorios.md](evidencias/88-fin-03-relatorios.md).

As rotas `/financeiro/relatorios/contas-a-receber` e
`/financeiro/relatorios/recebimentos` oferecem filtros GET opcionais por paciente e
período inclusivo, paginação de 20 itens e totais de todo o filtro. Contas usam o
vencimento, excluem canceladas/quitadas e exibem cobrado, recebido válido, saldo e
saldo vencido; vence hoje não é atraso em `America/Sao_Paulo`. Recebimentos usam a
data efetiva do pagamento. Estorno remove o original daquele período, recompõe o
saldo e conserva o histórico da cobrança, sem lançamento negativo no dia do estorno.

As somas e a apresentação usam centavos exatos com `bigint`; pagamentos são
agregados antes da cobrança, sem duplicação por joins. Totais, paciente e itens são
lidos no mesmo snapshot `REPEATABLE READ`. Filtros inválidos, duplicados ou com
paciente inexistente retornam erro sem ampliar a consulta. Autorização
`financeiro:ler` antecede qualquer leitura; os três perfis mantêm alcance igual,
sem CPF no filtro e sem conteúdo clínico. Uma migração aditiva cria somente o índice
de recebimentos por data efetiva, instante técnico e id, sem nova fonte de saldo.

Checks do fonte final aprovados: lint, TypeScript, 92 suítes/1.139 testes Jest,
nove testes da pipeline e build. Integração completa em PostgreSQL 18 descartável:
31 suítes/188 testes, sem falhas nem ignorados; 28 migrações aplicadas e comparação
Prisma sem diferença. Os 11 testes específicos da #88 incluem quatro corridas com
pagamento/estorno entre total e itens, cada uma com controle `READ COMMITTED` que
reproduz a inconsistência.

Chromium headless no build de produção local aprovou os três perfis autenticados,
negações de anônimo/inativo e do acesso clínico da Recepção. Filtros por teclado,
paginação, erro de período e conciliação de originais, estornos e correções verificados.
Viewport de 375 px sem rolagem horizontal e zero erros JavaScript de página. O roteiro
usou somente dados fictícios; evidência local não equivale a ambiente publicado.

Integração à `main`, CI e publicação/migrações em Preview/Production pendentes.
Exportação, impressão, contabilidade, meios de pagamento e integrações ficam posteriores.

## Legenda

- **IMPLEMENTADO:** verificado no código; não implica publicação ou homologação.
- **TESTADO:** há execução automatizada identificada na seção de evidências.
- **PARCIAL:** existe uma entrega utilizável, com lacunas explicitadas.
- **PLANEJADO / DECISÃO PENDENTE:** não implementado; recomendação ainda não equivale a escopo aprovado.
- **POSTERIOR AO MVP:** não deve bloquear a entrega do núcleo atual.

## Andamento por fase

| Fase | Estado | Entregas verificadas | Pendências e limites |
|---|---|---|---|
| 1 — Fundação | Implementada e testada; endurecimento pendente | PostgreSQL/Prisma, autenticação por sessão, usuários, perfis, permissões no servidor; fisioterapeuta com acesso cadastral e de agenda da recepção | Primeiro administrador público em banco vazio; limite de login em memória; revisar entrega local de administração por terminal |
| 2 — Pacientes | Parcial e testada | Cadastro, busca inclusive sem acento, consulta, edição, ativação/inativação, sexo/profissão, anamnese versionada e documentos de impressão sem armazenamento | Histórico clínico e agenda em abas separadas (vínculo agenda–sessão desde a MEL-01); CREFITO na anamnese desde a MEL-03, sem backfill das versões antigas |
| 3 — Agenda | Primeira fatia implementada e testada | Agenda por profissional/período, criar, consultar, reagendar, cancelar, visões dia/semana/lista e agenda na ficha do paciente | Presença (MEL-01, #44), bloqueios por profissional e aviso de conflito do paciente (MEL-02, #45) implementados; horário de funcionamento e visão mensal posteriores ao MVP |
| 4 — Prontuário | Núcleo implementado e testado | Avaliação inicial, plano com revisões imutáveis, sessões/evoluções, correções com histórico, invalidação e reavaliação comparativa com retorno ao plano | Alta apenas documentada; encerramento manual do plano não equivale a alta operacional; sem anexos, assinatura digital ou impressão dos novos registros |
| 5 — Financeiro | FIN-01 e FIN-02 integradas; FIN-03 implementada e validada localmente no candidato | Cobranças manuais, pagamentos parciais/integral, saldo derivado, estornos/correções vinculadas, histórico e permissões; contas a receber e recebimentos com filtros, paginação e totais globais no candidato FIN-03 | Integração e CI da FIN-03; publicação e migrações em Preview/Production pendentes |
| 6 — Evoluções | Posteriores ao MVP | Nenhuma implementação verificada | Notificações/lembretes, WhatsApp, portal, aplicativo mobile, teleatendimento, assinatura digital, dashboards avançados e IA |

Profissionais são usuários ativos com perfil `FISIOTERAPEUTA` e CREFITO cadastral; não existe módulo próprio de profissionais/especialidades implementado. Recepção continua sem acesso clínico. Evolução existe por sessão; indicação de alta não encerra plano, inativa paciente ou cancela agenda.

## Correções e melhorias priorizadas

Prioridade por risco de acesso indevido/perda de dados, impedimento do fluxo, alcance e dependências. **P0**: tratar antes de expor um ambiente novo nas condições indicadas. **P1**: próxima rodada de estabilização. **P2**: melhoria após estabilização e decisão de escopo. **P3**: posterior ao MVP. Esforços relativos: pequeno, médio e grande; não são estimativas de prazo.

| ID / prioridade | Tipo e evidência | Resultado esperado / aceite | Esforço e dependência |
|---|---|---|---|
| COR-01 — P0 condicional | Segurança: `setupFirstAdmin` aceita cadastro público quando não há usuários; serialização impede dois primeiros cadastros, mas não identifica o responsável autorizado (`auth/actions.ts`) | Proteger o bootstrap por autorização explícita ou provisionamento controlado antes de exposição. Visitante arbitrário não consegue se tornar administrador em banco vazio; depois do bootstrap, novas tentativas são negadas; cobrir concorrência | Médio; definir mecanismo. Urgente se existir ambiente público com banco vazio; exposição real não confirmada |
| COR-02 — P1 | Dependências: auditoria atual confirmou 2 alertas altos e 1 moderado em dependências transitivas opcionais de Prisma | Avaliar alcance no build/runtime PostgreSQL; corrigir por versões compatíveis ou registrar exceção técnica fundamentada. Validar lockfile, geração Prisma, testes, integração e build; evitar atualização forçada sem análise | Médio; compatibilidade de Prisma. Alertas não comprovam exploração no aplicativo |
| COR-03 — P1 | Segurança: `auth/rate-limit.ts` mantém contadores apenas em um `Map` por processo | Limite efetivo entre instâncias e reinicializações, com política de falha definida; verificar origem confiável do IP; testar tentativas distribuídas sem revelar contas | Médio; escolher armazenamento compartilhado ou proteção equivalente de infraestrutura |
| COR-04 — P1 | Funcional: `listActivePatientOptions()` usa `take: 500`; pacientes fora do recorte não aparecem no seletor de agendamento | Busca no servidor com paginação/limite por consulta; encontrar e agendar paciente fora dos primeiros 500; manter restrição a ativos, autorização e estados de carregamento/vazio | Médio; nenhuma mudança de regra clínica |
| VAL-01 — P1 | Cobertura: CI tem 37 testes PostgreSQL, mas não há arquivo de integração da agenda em `test/integration` | Testar a constraint real `Appointment_no_overlap`, horários adjacentes, criação/reagendamento concorrente, liberação após cancelar e isolamento por profissional no PostgreSQL descartável da CI | Médio; complementa os testes unitários existentes |
| VAL-02 — P1 | Entrega: falta evidência consultada do ambiente publicado para o SHA atual | Registrar SHA/ambiente, migrações, recuperação de backup e teste técnico autenticado do fluxo por perfil; comprovar negação clínica à recepção e ausência de acesso rápido de desenvolvimento em produção | Médio; acesso e autorização ao ambiente. CI verde não substitui essa evidência. **Concluída em 27/09/2026 (#42)**; evidência e limitações em [evidencias/val-02-producao](evidencias/val-02-producao.md) |
| COR-05 — P1 | Trabalho local: `prisma/admin.ts` e `db:admin` ainda não versionados | Revisar confirmação, credenciais, encerramento de sessões, alvo do banco e testes de criar/redefinir administrador antes de entregar; preservar as alterações atuais | Pequeno/médio; revisão específica da ferramenta, não executada aqui |
| MEL-01 — P2, próxima fatia funcional recomendada | Continuidade: `TreatmentSession` não tem relação com `Appointment`; presença/faltas não implementadas | Definir relação e estados; registrar sessão a partir de agendamento elegível sem duplicidade, separar dados administrativos de conteúdo clínico e preservar lançamento retroativo. Decidir efeitos de cancelar/inativar antes do schema. **No MVP (DEC-01, #43):** vínculo e presença/faltas só como registro, sem cobrança, multa ou bloqueio por faltas | Grande. **Regras decididas em 27/09/2026 e implementadas na #44** (migração `agenda_sessao_presenca`, aplicada em produção antes do merge da PR #68); ver [06-escopo-mvp](06-escopo-mvp.md#regras-da-mel-01-44) |
| MEL-02 — P2 | Disponibilidade: sem bloqueios e horário de funcionamento; conflito por paciente não é barrado | **No MVP (DEC-01, #43):** bloqueio de horários por profissional (não se agenda sobre bloqueio) e **aviso**, sem impedir, para o conflito do paciente; testes de limites e concorrência. Horário de funcionamento fica posterior ao MVP | Médio/grande. **Regras decididas em 27/09/2026 e implementadas na #45** (migração `agenda_bloqueios`); ver [06-escopo-mvp](06-escopo-mvp.md#regras-da-mel-02-45) |
| MEL-03 — P2 | Consistência clínica: anamnese guarda nome do autor, mas não snapshot de CREFITO; demais registros clínicos usam assinatura com CREFITO | Decidir política de assinatura da anamnese; novas versões preservam os dados definidos e registros antigos mantêm ausência explícita, sem inventar informação histórica | Médio. **Decidida e implementada em 27/09/2026 (#46)**: snapshot nas versões novas, sem backfill; migração aditiva `anamnese_crefito` |
| MEL-04 — P2 | Experiência: fluxo clínico extenso e cinco abas clínicas, sem verificação visual nesta revisão | Verificar navegação completa, teclado, mensagens de conflito/erro, telas pequenas e impressão com dados fictícios; registrar defeitos reproduzíveis. Visão mensal posterior ao MVP (DEC-01), revista só se o uso mostrar necessidade | Médio; validação técnica de interface; não há defeito visual confirmado |
| DEC-01 — P2, antes de fechar escopo | Produto: alta operacional, módulo próprio de profissionais e itens complementares da agenda permanecem indefinidos | Registrar o que fecha o MVP, responsável pela decisão e aceite. Não tratar encerramento do plano como alta nem cadastro de usuário como módulo de especialidades. **Decidida em 27/09/2026 (#43):** decisões, distinção entre encerramento e alta e critérios de conclusão em [06-escopo-mvp](06-escopo-mvp.md) | Pequeno; decisor Bruno M Noronha |
| DEC-02 — P1 antes de uso com dados reais | Operação: retenção/anonimização e auditoria de leitura permanecem pendentes no briefing | Definir responsáveis e requisitos de retenção, acesso, backup/restauração e rastreabilidade; derivar tarefas técnicas com aceite. Este roadmap não estabelece prazos legais nem política clínica. Decisões registradas em 26/09/2026 em [15-retencao-rastreabilidade-recuperacao](15-retencao-rastreabilidade-recuperacao.md); auditoria de login/usuários na #56; teste de restauração concluído na #42; orientação especializada pendente | Médio; decisões da clínica e orientação especializada pertinente |
| FUT-01 — P3 | Expansão financeira autorizada após o MVP: FIN-01 e FIN-02 integradas; FIN-03 implementada e validada localmente | [Briefing próprio](16-financeiro-integracoes.md): cobranças manuais, pagamentos e estornos com saldo exato; operação igual para ADMIN, Recepção e Fisioterapeuta; histórico por estorno/cancelamento. Relatórios conciliáveis na FIN-03; integrações posteriores, sem acoplar atendimento a cobrança | [FIN-01 #86](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/86) (médio) → [FIN-02 #87](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/87) (grande; integrada pela PR #93, SHA `0565170`) → [FIN-03 #88](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/88) (médio; integração e CI própria pendentes). Gate do MVP satisfeito em 04/10/2026 ([VAL-03](evidencias/val-03-revalidacao-perfis.md)), com limites históricos preservados |

Os itens acima são backlog recomendado, sem criação automática de issues ou autorização implícita para alterar dependências, banco ou produção. Os IDs são locais deste roadmap, não números de issues do GitHub.

## Ordem recomendada de execução

1. **Estabilização:** verificar a condição de COR-01; tratar COR-02/COR-03, COR-04 e VAL-01; concluir revisão de COR-05. DEC-02 deve anteceder uso com dados reais.
2. **Evidência da entrega:** VAL-02 foi concluída em 27/09/2026 (#42), com o resultado técnico registrado. Homologação manual não foi executada nem adicionada como bloqueio obrigatório, conforme governança atual.
3. **Fechamento do escopo:** a DEC-01 foi decidida em 27/09/2026 (#43), com os critérios de conclusão do MVP em [06-escopo-mvp](06-escopo-mvp.md). As regras da MEL-01 e da MEL-02 foram decididas em 27/09/2026 e estão na mesma página.
4. **Fechamento do MVP:** MEL-01 (vínculo e presença, #44) e MEL-02 (bloqueios e aviso, #45) implementadas; a revalidação dos três perfis foi registrada na [VAL-03](evidencias/val-03-revalidacao-perfis.md), em 04/10/2026, com os limites aceitos na VAL-02. Assinatura da anamnese e experiência seguem suas decisões e evidências próprias.
5. **Expansão:** FIN-02 integrada e gate do MVP comprovado permitiram implementar e validar localmente a FIN-03 (#88); integrar o candidato e concluir sua CI antes de publicar. Publicação/migrações seguem a pipeline vigente, com Production manual. Notificações, visão mensal, horário de funcionamento, alta operacional e módulo de profissionais continuam posteriores ao MVP (DEC-01).

## Evidências e limites da revisão

| Verificação | Resultado em 26/09/2026 |
|---|---|
| `pnpm lint` | Passou localmente |
| `pnpm typecheck` | Passou localmente |
| `pnpm exec jest --runInBand` | Passou localmente: 55 suítes e 548 testes |
| `pnpm build` | Passou localmente, incluindo geração Prisma, compilação e geração das páginas |
| [CI do HEAD analisado](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/36251427500) | Sucesso; 55 suítes / 548 testes Jest; 37 testes de integração PostgreSQL, 37 aprovados, 0 falhas e 0 ignorados; migrações e build aprovados |
| `pnpm audit --prod --json` | Falhou com código 1: 2 altas e 1 moderada; 0 críticas |
| Integração local | Não executada nesta revisão; usada evidência dos logs da CI com banco descartável, não apenas o status do job |
| Publicação e interface autenticada | Não verificadas nesta revisão |

Alertas da auditoria: [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [mysql2 — autenticação](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) e [mysql2 — descompressão](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3). Os caminhos passam por `@prisma/client > prisma`; avaliar exposição efetiva antes de escolher a remediação.

Fontes locais: [schema](../../prisma/schema.prisma), [CI](../../.github/workflows/ci.yml), [auth](../../src/modules/auth/README.md), [agenda](../../src/modules/agenda/README.md), [clínico](../../src/modules/clinico/README.md), [profissionais](../../src/modules/profissionais/README.md), [escopo](06-escopo-mvp.md), [permissões](05-fluxo-permissoes.md) e [privacidade](08-dados-privacidade.md).

**Conclusão da revisão base de 26/09/2026:** base técnica apta com ressalvas para evolução;
o encerramento do MVP e a prontidão do ambiente publicado ainda não tinham sido demonstrados
naquela revisão. O fechamento posterior do gate está na VAL-03; os estados das fatias
financeiras acima distinguem código, validação e entrega. Este roadmap não é uma auditoria
exaustiva de segurança ou conformidade.
