# Planejamento posterior ao MVP — financeiro e integrações (FUT-01, #48)

## Estado e decisões confirmadas

Briefing aprovado por Bruno M Noronha no chat em **04/10/2026**. A rodada original
antecipou documentação e backlog, sem iniciar a implementação financeira nem ampliar
o MVP da [DEC-01](06-escopo-mvp.md). A demanda priorizada é controlar recebimentos da clínica:
cobranças manuais por paciente, pagamentos e contas a receber. Integrações ficam posteriores.

Baseline histórico do planejamento: `main` em `a8ae070cd24e7c3d4cabc09bfb40e02216f210f0`.
Nesse baseline, o schema não continha entidades financeiras e a matriz de permissões
não continha `financeiro:*`; as interfaces deste briefing ainda eram planejadas. O domínio
clínico já distingue quantidade prevista de sessões de saldo, pacote ou cobrança.

**Atualização em 07/10/2026:** FIN-01 integrada à `main` pela
[PR #92](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/92). A FIN-02 foi
integrada pela [PR #93](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/93),
no SHA `056517079ce778fed98645b8c545edd941cc2eb7`, com pagamentos, estornos,
saldo derivado e correções vinculadas. A FIN-03 está implementada e validada localmente
no candidato isolado da #88, com contas a receber, recebimentos, filtros e totais
conciliáveis; integração à `main` e CI desse candidato ainda pendentes.
Os resultados e limites estão nas
[evidências da FIN-02](evidencias/87-fin-02-pagamentos.md) e
[da FIN-03](evidencias/88-fin-03-relatorios.md). Esse
estado do código não comprova publicação nem aplicação da migração em Preview/Production.
O [módulo financeiro](../../src/modules/financeiro/README.md) descreve os contratos implementados.

| Decisão | Contrato aprovado |
|---|---|
| Escopo inicial | Somente recebimentos da clínica, vinculados ao cadastro do paciente |
| Origem | Cobrança lançada manualmente; agenda e sessão não geram cobrança |
| Pagamento | Registro manual, parcial ou integral, vinculado a uma cobrança e limitado ao saldo |
| Acesso | ADMIN, RECEPCAO e FISIOTERAPEUTA consultam e operam todos os pacientes, com alcance igual |
| Correção | Estorno de pagamento ou cancelamento de cobrança, seguido de novo lançamento; motivo e autoria preservados |
| Prioridade | Financeiro antes das integrações; implementação somente após conclusão documentada do MVP |

Fonte da autorização: decisões expressas de Bruno na rodada de planejamento da #48 e aprovação
do plano de briefing e três issues. A execução da FIN-02 foi autorizada em 05/10/2026,
com as decisões de datas e destino da correção incorporadas abaixo. A FIN-03 foi
autorizada pela execução da #88 em 07/10/2026, após confirmar suas dependências.
Não se trata de
autorização para cobrar pacientes, contratar serviços ou alterar dados reais.

## Escopo e contratos da primeira versão

### Cobranças e saldo

- Campos mínimos: paciente existente, descrição administrativa, valor positivo em BRL e
  vencimento como data civil. Consultas exibem cobrança, pagamentos válidos e saldo.
- Valores são exatos em centavos, sem aritmética monetária em ponto flutuante. Saldo é
  o valor da cobrança menos a soma dos pagamentos não estornados; nunca pode ser negativo.
- Não gerar cobranças por atendimento, presença, falta ou revisão de plano. Uma dívida
  não bloqueia agenda nem atendimento. Não inferir valores de registros clínicos.
- Cobrança cancelada fica no histórico, não recebe pagamentos e não integra contas a
  receber. Só se cancela quando não há pagamento válido; estornar antes, se necessário.
- Não editar nem excluir lançamentos para corrigir valores, paciente ou vencimento:
  cancelar/estornar com motivo e registrar a substituição, mantendo o vínculo histórico.

### Pagamentos e correções

- Cada pagamento registra cobrança, valor positivo, data efetiva do recebimento e autor
  autenticado; data efetiva e instante técnico do registro são campos distintos.
- A data civil do recebimento aceita retroatividade, inclusive antes da criação da
  cobrança, e não pode superar hoje em `America/Sao_Paulo`. A faixa técnica é 2000–2100.
- Aceitar pagamento parcial ou integral até o saldo restante, sem crédito excedente.
  Dois recebimentos concorrentes não podem ultrapassar o valor da cobrança.
- Estorno é uma correção do registro interno, com motivo, autoria e data; não executa
  devolução bancária. Preserva o pagamento original e recompõe o saldo.
- A data civil informada do estorno fica entre a data do recebimento original e hoje,
  inclusive. Seu instante técnico de gravação permanece separado. Estornar um pagamento
  de cobrança quitada reabre o saldo, sem criar cobrança automaticamente.
- Estornar novamente o mesmo pagamento não produz efeito financeiro adicional.
- Corrigir um pagamento válido grava seu estorno e o substituto atomicamente na mesma
  cobrança; uma falha desfaz ambos. Há um substituto por original, com vínculo explícito.
  Para original já estornado, registrar o substituto preserva o estorno existente. Um
  recebimento comum após estorno não cria esse vínculo automaticamente. A data do novo
  recebimento pode ser anterior ao recebimento original ou ao estorno, respeitado o limite de hoje.
- Criação de cobrança, pagamento, estorno e cancelamento precisam de proteção contra
  envio duplicado. Escritas e histórico são atômicos, com validação do estado na transação.
- Nos pagamentos/estornos da FIN-02, o formulário conserva `requestId`; as chaves têm
  namespaces `RECEBIMENTO`, `ESTORNO` e `CORRECAO`. O fingerprint versionado inclui tipo,
  alvo, valor, datas, motivo e vínculo aplicáveis. Reenvio compatível devolve o registro
  original mesmo após estorno/cancelamento posterior; conteúdo incompatível é recusado.
  A correção composta usa a mesma chave/fingerprint nos dois registros, sem alterar a autoria original.
- Serializar pagamentos, estornos e cancelamentos da mesma cobrança. Para uma disputa,
  reler o estado confirmado e aceitar só a operação compatível, com mensagem clara em pt-BR.
- A FIN-02 integrada usa a trava da cobrança em `READ COMMITTED` e consulta o saldo em
  comando posterior à trava. Constraints e guards de inserção também protegem as invariantes
  no banco; `Payment`/`PaymentReversal` são imutáveis e não herdam o expurgo de `AuditLog`.

### Relatórios

- Contas a receber: cobranças não canceladas com saldo positivo, agrupando abertas e
  vencidas pelo vencimento; vencida significa vencimento anterior ao dia atual em
  `America/Sao_Paulo`. Vencer hoje não significa estar vencida.
- Recebimentos: pagamentos não estornados, pelo dia efetivo informado, com filtros por
  paciente e período inclusivo. Estorno remove o original dos totais correntes daquele
  período, preservando sua consulta histórica; não representa uma saída de caixa.
- Exibir valor cobrado, recebido válido e saldo; uma cobrança parcialmente paga
  contribui somente com o saldo em contas a receber. Não duplicar cobranças por joins.
- Totais abrangem todo o filtro, independentemente da página exibida. Listas paginadas,
  estados vazios e filtros inválidos têm comportamento explícito e mensagens em pt-BR.
- Implementação FIN-03: `/financeiro/relatorios/contas-a-receber` e
  `/financeiro/relatorios/recebimentos`, com GET `patientId`, `start`, `end` e `page`.
  Datas civis são inclusivas entre 2000 e 2100; uma extremidade vazia deixa somente
  aquele lado sem limite. Paciente é selecionado pela busca administrativa, incluindo
  inativos, sem CPF em URL/filtro. Parâmetros inválidos ou repetidos e paciente inexistente
  recusam a consulta sem remover silenciosamente o filtro. A página é normalizada e limitada.
- Paginação de 20 itens, ordenação estável e links para o histórico da cobrança; totais
  de contas exibem cobrado, recebido válido, saldo e saldo vencido. Somente o saldo
  positivo integra contas a receber. Vazio exibe totais zero.
- Agregação por cobrança evita duplicação por pagamentos; somas PostgreSQL e DTOs usam
  `bigint`, com formatação BRL exata. Totais e itens compartilham snapshot
  `REPEATABLE READ`, inclusive diante de pagamentos/estornos concorrentes. Não é
  persistido saldo nem criada segunda fonte de lançamentos.
- Migração aditiva `20261007010000_financeiro_relatorios` cria o índice de
  `Payment(receivedOn DESC, createdAt DESC, id DESC)` para a consulta global por
  data efetiva; nenhum dado existente é modificado. Leituras autenticadas exigem
  `financeiro:ler` antes de validar/consultar e selecionam apenas dados administrativos.
- Não incluir exportação, impressão, indicadores clínicos ou análises contábeis nesta versão.

### Autorização, separação e preservação

- Reutilizar `financeiro:ler` e `financeiro:gerir`, implementadas na FIN-01 para os três perfis,
  com `requirePermission`/`assertPermission` no servidor, inclusive em chamada
  direta de actions. Sem sessão ou com usuário inativo, negar acesso antes de consultar dados.
- Usuários, configurações e dados clínicos conservam suas permissões atuais. A Recepção
  não ganha acesso a anamnese, avaliação, plano, evolução ou reavaliação por consultar financeiro.
- Domínio próprio, com relação ao cadastro do paciente; não acoplar às tabelas clínicas.
  Não colocar conteúdo clínico nas descrições, selects, relatórios ou logs financeiros.
- Preservar lançamentos, correções e autores por relações que impeçam exclusão física
  de histórico. Autoria usa o usuário da sessão; identificadores de autor não vêm do formulário.
- Inativação cadastral não apaga a dívida nem impede consultar e regularizar lançamentos
  existentes. Nenhuma ação financeira reativa paciente ou libera escrita clínica.
- Não aplicar aos lançamentos a retenção de sete dias de `AuditLog`: histórico financeiro
  precisa de persistência própria. Não estabelecer prazo legal de retenção nesta rodada.

## Fatias e dependências

| Fatia | Resultado | Dependência | Esforço relativo |
|---|---|---|---|
| [FIN-01 #86](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/86) | Cobranças manuais, consulta, cancelamento, histórico e permissões — **implementada em 05/10/2026** ([evidências](evidencias/86-fin-01-cobrancas.md); publicação pendente) | Gate de conclusão do MVP abaixo | Médio |
| [FIN-02 #87](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/87) | Pagamentos parciais/integral, saldo derivado, estornos, correção vinculada, idempotência e concorrência — **integrada à main pela PR #93, SHA `0565170`** ([evidências](evidencias/87-fin-02-pagamentos.md)) | FIN-01 integrada e gate do MVP satisfeito; publicação/migrações do release ainda não comprovadas | Grande |
| [FIN-03 #88](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/88) | Contas a receber e recebimentos com filtros e totais conciliáveis — **implementada e validada localmente em 07/10/2026**, com integração e CI própria pendentes ([evidências](evidencias/88-fin-03-relatorios.md)) | FIN-02 integrada (`0565170`) e gate do MVP comprovados antes do início; publicação/migração do release não comprovadas | Médio |

As três issues foram publicadas como backlog P3, com aceite e validação próprios.
Esforço relativo não é prazo, orçamento ou compromisso de entrega. A expansão
financeira não é um bloqueio do MVP.

## Gate de início — critérios do MVP e evidências

Leitura em 04/10/2026; fontes históricas têm limites preservados. Issue encerrada,
CI aprovado e deployment READY isoladamente não comprovam fluxo por perfil publicado.

| Critério de [conclusão do MVP](06-escopo-mvp.md#critérios-de-conclusão-do-mvp) | Evidência consultada | Situação para o gate |
|---|---|---|
| 1. Fases 1–4 | Schema, documentação dos módulos, entregas #24–#27 e fluxo clínico na [VAL-02](evidencias/val-02-producao.md) | Evidência técnica existente; fluxo da VAL-02 em build de produção local |
| 2. MEL-01 | Relação `TreatmentSession`–`Appointment`, #44 e [evidência](evidencias/mel-01-agenda-sessao.md) | Implementação e testes documentados; fluxo autenticado documentado em desenvolvimento local |
| 3. MEL-02 | #45, módulo da agenda e [evidência](evidencias/mel-02-bloqueios.md) | Implementação, integração e fluxo local documentados |
| 4. Estabilização P1 | PRs #49–#54, auditoria #56, CI do baseline e [exceção da COR-02](../AUDITORIA-DEPENDENCIAS.md) | Tratamento técnico documentado; audit não é declarado limpo e exceção é preservada |
| 5. DEC-02 antes de dados reais | [DEC-02](15-retencao-rastreabilidade-recuperacao.md): T2/T4/T5 na #56 e T7 na #42 | Evidência histórica registrada; restauração isolada demonstrada, com riscos aceitos e limitações originais |
| 6. Definição de pronto por fatia | [CI do baseline](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/37241608368), com typecheck, lint, testes, integração e build aprovados; [MEL-04](evidencias/mel-04-verificacao-fluxo.md) | Evidência automatizada do baseline e fluxo técnico local; não equivale ao critério 7 |
| 7. Revalidação por perfil após publicar MEL-01/MEL-02 | VAL-02 antecede essas entregas; MEL-04 é local; [Preview de 04/10](evidencias/pipeline-preview-2026-10-04.md) cobre login/configurações/logout somente de ADMIN | **COMPROVADO em 04/10/2026:** [VAL-03](evidencias/val-03-revalidacao-perfis.md) no SHA publicado `20b3282`, com os três perfis, MEL-01/MEL-02 e fluxo clínico fictício em build de produção local, mantidas as limitações da VAL-02 |

**Gate satisfeito em 04/10/2026.** Os sete critérios estão registrados, com SHA,
ambiente, fontes e limites. O critério 7 foi fechado pela
[VAL-03](evidencias/val-03-revalidacao-perfis.md), que reutilizou o aceite vigente
da DEC-01/VAL-02, sem exigência adicional de homologação manual e sem gravar
dados fictícios em produção. Esse gate permitiu a FIN-01, já integrada à `main`.
FIN-02 e FIN-03 herdam esse fechamento histórico, além de suas dependências funcionais;
a FIN-02 tem validação local própria, sem inferir equivalência com produção. A pipeline
produtiva permanece manual; atualização documental não aciona release.

## Riscos, custos e decisões posteriores

| Tema | Tratamento / estado |
|---|---|
| Exposição financeira | Acesso amplo confirmado aos três perfis; selects mínimos, autorização no servidor e testes de negação sem sessão/inativo. Sem ampliação de permissão clínica |
| Histórico e recuperação | Novos vínculos de paciente/autor devem entrar no inventário de exclusão de usuários e rotinas de manutenção/backup; migrations aditivas e ensaio com dados fictícios |
| Integridade | Duplicidade, disputa pelo saldo e correções exigem transações e testes reais em PostgreSQL descartável |
| Crescimento de dados | Histórico persistente aumenta armazenamento; listas paginadas e consultas indexadas, sem estimativa fictícia de volume |
| Infraestrutura | Reutilizar stack atual como proposta técnica; nenhuma contratação ou credencial externa necessária para o registro manual |
| Custos e prazo | Orçamento, prazo, capacidade da equipe e eventual custo adicional de hospedagem/armazenamento **TBD**; nenhum valor ou responsável de implementação atribuído |
| Integrações | Demanda concreta, fornecedor, custos, credenciais, contratos e aceite **TBD**; produzir decisão e issues próprias se a clínica retomar |

Posteriores: despesas, contas a pagar, repasses, pacotes, convênios, descontos, juros,
crédito excedente, emissão fiscal, cobrança bancária, gateways, WhatsApp, assinatura
digital, portal e demais integrações. O briefing não define obrigações fiscais,
contábeis ou prazo legal de guarda.

## Aceite e validação

- Briefing e três issues coerentes com as decisões confirmadas, sem alterar o MVP.
- Cada issue contém baseline, contratos, exclusões, dependências, aceite e validação;
  o gate do MVP foi satisfeito antes da implementação financeira. Financeiro não se
  torna requisito de conclusão do MVP.
- Para aceitar a FIN-02: validar pagamentos parciais/integral, centavos exatos, saldo
  excedido, datas, estorno repetido, correção/substituição, cancelamento com/sem pagamento,
  duplicidade e concorrência real no PostgreSQL descartável, com histórico atômico.
- Relatórios reconciliam centavos, pagamentos estornados, cancelamentos, vencimento,
  limites de período, vazio, paginação e acesso direto de cada perfil.
- Confirmar que financeiro não fornece conteúdo clínico à Recepção nem altera agenda
  ou prontuário; negar anônimo e usuário inativo nas leituras e escritas.
- A FIN-02 está implementada e validada localmente: lint, tipos, 88 suítes/1.068 testes
  Jest, nove testes da pipeline e fluxo dos três perfis com dados fictícios. Foram
  conferidos anônimo/inativo, negação clínica à Recepção e tela de 375 px sem overflow.
  Os resultados completos, incluindo a suíte PostgreSQL e o build finais, estão nas
  [evidências](evidencias/87-fin-02-pagamentos.md). A PR #93 integrou a FIN-02 no SHA
  `0565170`, com CI da `main` aprovada; essa entrega não comprova publicação ou
  operação autenticada em produção.
- FIN-03 no fonte final: lint, tipos, 92 suítes/1.139 testes Jest, nove testes da
  pipeline e build aprovados. Integração completa em PostgreSQL 18 descartável:
  31 suítes/188 testes, zero falhas/ignorados; 28 migrações aplicadas e comparação
  Prisma sem diferença. Os 11 testes focados incluem quatro corridas com controles
  `READ COMMITTED`. Chromium headless no build de produção local comprovou os três
  perfis autenticados, negação de anônimo/inativo e do acesso clínico da Recepção,
  filtros por teclado, paginação e conciliação do histórico de correções/estornos.
  Viewport de 375 px sem rolagem horizontal; zero erros JavaScript de página.
  Resultados e limites nas [evidências](evidencias/88-fin-03-relatorios.md).
  Merge, CI própria e publicação da FIN-03 permanecem pendentes.
- A atualização documental confere contratos e links locais; não executa operações em
  dados reais, contratação nem publicação em Production.

Issue de origem: [#48](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/48).
O planejamento foi antecipado por autorização expressa. Com o fechamento do MVP
comprovado em 04/10/2026 ([VAL-03](evidencias/val-03-revalidacao-perfis.md)), a fase
financeira está aberta: FIN-01 e FIN-02 integradas; FIN-03 implementada e validada
localmente no candidato isolado após confirmar as dependências da #88, com integração
e CI própria pendentes.
Permanecem as exclusões de
escopo, as permissões atuais e a liberação manual da pipeline produtiva.
