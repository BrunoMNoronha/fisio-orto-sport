# Roadmap — Fisio OrtoSport

Revisado em **26/09/2026** com código, testes locais, histórico e evidências do GitHub. Esta revisão atualiza o planejamento; as correções funcionais abaixo ainda não foram executadas.

## Estado verificado

O núcleo das Fases 1 a 4 está implementado. A maior lacuna funcional é a continuidade entre agenda e atendimento: os dois registros ainda são independentes. Financeiro permanece posterior ao MVP. Não há base para atribuir um percentual de conclusão enquanto o escopo complementar da agenda estiver em decisão.

- Checkout analisado: `feat/fisio-acessos-recepcao`, HEAD `ae2b054901878f97f8f0c84223aa8e07463ec169`, com alterações locais preexistentes.
- As entregas clínicas #24–#27 estão integradas, pelas PRs #29, #30, #32 e #33. A [PR #34](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/34), de permissões do fisioterapeuta, foi confirmada como mesclada durante a revisão; issue #31 encerrada. `main` remota consultada: `01824c8ae478bb95e85e6a6c603ff4c6be9b2c63`.
- `prisma/admin.ts`, o script `db:admin` e suas instruções no README são trabalho local preexistente, ainda não uma entrega versionada neste HEAD. Sua revisão funcional permanece pendente.
- Publicação, migrações em produção e funcionamento autenticado no ambiente publicado **não foram verificados nesta revisão**. Não interpretar isso como ausência de produção.

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
| 2 — Pacientes | Parcial e testada | Cadastro, busca inclusive sem acento, consulta, edição, ativação/inativação, sexo/profissão, anamnese versionada e documentos de impressão sem armazenamento | Histórico clínico e agenda em abas separadas, sem vínculo agenda–sessão; CREFITO histórico da anamnese pendente |
| 3 — Agenda | Primeira fatia implementada e testada | Agenda por profissional/período, criar, consultar, reagendar, cancelar, visões dia/semana/lista e agenda na ficha do paciente | Bloqueios, funcionamento, presença, visão mensal e política de conflito por paciente dependem de decisão; seletor limitado a 500 pacientes |
| 4 — Prontuário | Núcleo implementado e testado | Avaliação inicial, plano com revisões imutáveis, sessões/evoluções, correções com histórico, invalidação e reavaliação comparativa com retorno ao plano | Alta apenas documentada; encerramento manual do plano não equivale a alta operacional; sem anexos, assinatura digital ou impressão dos novos registros |
| 5 — Financeiro | Posterior ao MVP | Nenhuma implementação verificada | Cobranças, pagamentos, contas a receber, controle financeiro e relatórios |
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
| VAL-02 — P1 | Entrega: falta evidência consultada do ambiente publicado para o SHA atual | Registrar SHA/ambiente, migrações, recuperação de backup e teste técnico autenticado do fluxo por perfil; comprovar negação clínica à recepção e ausência de acesso rápido de desenvolvimento em produção | Médio; acesso e autorização ao ambiente. CI verde não substitui essa evidência |
| COR-05 — P1 | Trabalho local: `prisma/admin.ts` e `db:admin` ainda não versionados | Revisar confirmação, credenciais, encerramento de sessões, alvo do banco e testes de criar/redefinir administrador antes de entregar; preservar as alterações atuais | Pequeno/médio; revisão específica da ferramenta, não executada aqui |
| MEL-01 — P2, próxima fatia funcional recomendada | Continuidade: `TreatmentSession` não tem relação com `Appointment`; presença/faltas não implementadas | Definir relação e estados; registrar sessão a partir de agendamento elegível sem duplicidade, separar dados administrativos de conteúdo clínico e preservar lançamento retroativo. Decidir efeitos de cancelar/inativar e política de faltas antes do schema | Grande; decisão da clínica, depois migração e integração |
| MEL-02 — P2 | Disponibilidade: sem bloqueios e horário de funcionamento; conflito por paciente não é barrado | Decidir se bloqueia ou avisa conflito do paciente e como tratar encaixes; respeitar disponibilidade do profissional com testes de limites e concorrência | Médio/grande; decisão sobre inclusão no MVP |
| MEL-03 — P2 | Consistência clínica: anamnese guarda nome do autor, mas não snapshot de CREFITO; demais registros clínicos usam assinatura com CREFITO | Decidir política de assinatura da anamnese; novas versões preservam os dados definidos e registros antigos mantêm ausência explícita, sem inventar informação histórica | Médio; decisão e eventual migração aditiva |
| MEL-04 — P2 | Experiência: fluxo clínico extenso e cinco abas clínicas, sem verificação visual nesta revisão | Verificar navegação completa, teclado, mensagens de conflito/erro, telas pequenas e impressão com dados fictícios; registrar defeitos reproduzíveis. Visão mensal somente após confirmar necessidade | Médio; validação técnica de interface; não há defeito visual confirmado |
| DEC-01 — P2, antes de fechar escopo | Produto: alta operacional, módulo próprio de profissionais e itens complementares da agenda permanecem indefinidos | Registrar o que fecha o MVP, responsável pela decisão e aceite. Não tratar encerramento do plano como alta nem cadastro de usuário como módulo de especialidades | Pequeno; decisão da clínica |
| DEC-02 — P1 antes de uso com dados reais | Operação: retenção/anonimização e auditoria de leitura permanecem pendentes no briefing | Definir responsáveis e requisitos de retenção, acesso, backup/restauração e rastreabilidade; derivar tarefas técnicas com aceite. Este roadmap não estabelece prazos legais nem política clínica | Médio; decisões da clínica e orientação especializada pertinente |
| FUT-01 — P3 | Expansão: financeiro e integrações ainda não implementados | Detalhar após estabilizar o núcleo e decidir o escopo; evitar acoplar sessão clínica a cobrança nesta rodada | Grande; briefing próprio |

Os itens acima são backlog recomendado, sem criação automática de issues ou autorização implícita para alterar dependências, banco ou produção. Os IDs são locais deste roadmap, não números de issues do GitHub.

## Ordem recomendada de execução

1. **Estabilização:** verificar a condição de COR-01; tratar COR-02/COR-03, COR-04 e VAL-01; concluir revisão de COR-05. DEC-02 deve anteceder uso com dados reais.
2. **Evidência da entrega:** executar VAL-02 no alvo autorizado e registrar o resultado técnico. Homologação manual não foi executada nem adicionada como bloqueio obrigatório, conforme governança atual.
3. **Fechamento do escopo:** decidir DEC-01, desenhar MEL-01 e MEL-02 com regras explícitas e aceite antes da implementação.
4. **Próxima fatia:** priorizar MEL-01 pela continuidade do atendimento; seguir com disponibilidade, assinatura da anamnese e experiência conforme decisões e defeitos encontrados.
5. **Expansão:** manter financeiro, notificações e demais evoluções fora da rodada de estabilização.

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

**Conclusão:** base técnica apta com ressalvas para evolução; encerramento do MVP e prontidão do ambiente publicado ainda não demonstrados. A revisão é direcionada ao andamento e ao backlog, não uma auditoria exaustiva de segurança ou conformidade.
