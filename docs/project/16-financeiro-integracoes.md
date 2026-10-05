# Planejamento posterior ao MVP — financeiro e integrações (FUT-01, #48)

## Estado e decisões confirmadas

Briefing aprovado por Bruno M Noronha no chat em **04/10/2026**. Esta rodada antecipa
documentação e backlog; não inicia a implementação financeira nem amplia o MVP da
[DEC-01](06-escopo-mvp.md). A demanda priorizada é controlar recebimentos da clínica:
cobranças manuais por paciente, pagamentos e contas a receber. Integrações ficam posteriores.

Baseline: `main` em `a8ae070cd24e7c3d4cabc09bfb40e02216f210f0`. O schema não contém
entidades financeiras e a matriz de permissões não contém `financeiro:*`. O domínio
clínico já distingue quantidade prevista de sessões de saldo, pacote ou cobrança.
Não há módulo financeiro implementado. Todas as interfaces abaixo são **planejadas**.

| Decisão | Contrato aprovado |
|---|---|
| Escopo inicial | Somente recebimentos da clínica, vinculados ao cadastro do paciente |
| Origem | Cobrança lançada manualmente; agenda e sessão não geram cobrança |
| Pagamento | Registro manual, parcial ou integral, vinculado a uma cobrança e limitado ao saldo |
| Acesso | ADMIN, RECEPCAO e FISIOTERAPEUTA consultam e operam todos os pacientes, com alcance igual |
| Correção | Estorno de pagamento ou cancelamento de cobrança, seguido de novo lançamento; motivo e autoria preservados |
| Prioridade | Financeiro antes das integrações; implementação somente após conclusão documentada do MVP |

Fonte da autorização: decisões expressas de Bruno nesta execução da #48 e aprovação
do plano de briefing e três issues. Não se trata de autorização para cobrar pacientes,
contratar serviços ou alterar dados reais.

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
- Aceitar pagamento parcial ou integral até o saldo restante, sem crédito excedente.
  Dois recebimentos concorrentes não podem ultrapassar o valor da cobrança.
- Estorno é uma correção do registro interno, com motivo, autoria e data; não executa
  devolução bancária. Preserva o pagamento original e recompõe o saldo.
- Estornar novamente o mesmo pagamento não produz efeito financeiro adicional.
- Criação de cobrança, pagamento, estorno e cancelamento precisam de proteção contra
  envio duplicado. Escritas e histórico são atômicos, com validação do estado na transação.
- Serializar pagamentos, estornos e cancelamentos da mesma cobrança. Para uma disputa,
  reler o estado confirmado e aceitar só a operação compatível, com mensagem clara em pt-BR.

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
- Não incluir exportação, impressão, indicadores clínicos ou análises contábeis nesta versão.

### Autorização, separação e preservação

- Planejar `financeiro:ler` e `financeiro:gerir` na matriz central, para os três perfis,
  reutilizando `requirePermission`/`assertPermission` no servidor, inclusive em chamada
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
| [FIN-01 #86](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/86) | Cobranças manuais, consulta, cancelamento, histórico e permissões | Gate de conclusão do MVP abaixo | Médio |
| [FIN-02 #87](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/87) | Pagamentos parciais/integral, saldo, estornos, idempotência e concorrência | FIN-01 entregue e gate do MVP | Grande |
| [FIN-03 #88](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/88) | Contas a receber e recebimentos com filtros e totais conciliáveis | FIN-02 entregue e gate do MVP | Médio |

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
| 7. Revalidação por perfil após publicar MEL-01/MEL-02 | VAL-02 antecede essas entregas; MEL-04 é local; [Preview de 04/10](evidencias/pipeline-preview-2026-10-04.md) cobre login/configurações/logout somente de ADMIN | **COMPROVADO em 04/10/2026:** [VAL-03](evidencias/val-03-revalidacao-perfis.md) no SHA publicado `20b3282`, três perfis, MEL-01/MEL-02 e fluxo clínico fictício em build de produção local, com as limitações da VAL-02 |

**Gate satisfeito em 04/10/2026 pela [VAL-03](evidencias/val-03-revalidacao-perfis.md); texto original a seguir.** Antes de iniciar FIN-01, registrar o fechamento
dos sete critérios, com SHA, ambiente, fontes e limites do fluxo por perfil. Reutilizar
o aceite vigente da DEC-01/VAL-02, sem criar exigência adicional de homologação manual
nem autorização implícita para gravar dados fictícios em produção. FIN-02 e FIN-03
herdam esse gate, além de suas dependências funcionais. A pipeline produtiva permanece
manual; esta entrega documental não aciona release.

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
  implementação bloqueada pelo gate, nunca pelo financeiro como requisito do MVP.
- Nas entregas futuras: pagamentos parciais/integral, saldo excedido, estorno repetido,
  cancelamento com/sem pagamento, duplicidade e concorrência no PostgreSQL descartável.
- Relatórios reconciliam centavos, pagamentos estornados, cancelamentos, vencimento,
  limites de período, vazio, paginação e acesso direto de cada perfil.
- Confirmar que financeiro não fornece conteúdo clínico à Recepção nem altera agenda
  ou prontuário; negar anônimo e usuário inativo nas leituras e escritas.
- Nesta rodada: revisão documental, links locais e `git diff --check`. Sem código,
  migrations, dados reais, dependências, contratação ou publicação em Production.

Issue de origem: [#48](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/48).
O planejamento foi antecipado por autorização expressa; a fase permanece não iniciada.
Manter #48 aberta enquanto faltar comprovar o fechamento do MVP e registrar a abertura
da fase, conforme sua sequência original. As issues derivadas podem permanecer no backlog.
