# financeiro

Cobranças manuais por paciente (FIN-01, [#86](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/86)), pagamentos/estornos com saldo real (FIN-02, [#87](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/87)) e relatórios de contas a receber/recebimentos (FIN-03, [#88](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/88)). Contrato no [briefing financeiro](../../../docs/project/16-financeiro-integracoes.md). **Domínio próprio**, ligado só ao cadastro do paciente: nada clínico, sem geração automática por agenda, presença ou atendimento. FIN-01/FIN-02 integradas à `main` (FIN-02 pela PR #93, SHA `0565170`); FIN-03 implementada e validada localmente em 07/10/2026, ainda com integração, CI própria e publicação pendentes.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Conversão do valor digitado para centavos inteiros (`parseAmount`, só operações de string) e de volta (`formatBRL`, `formatAmountInput`); schemas zod com mensagens em pt-BR; filtro da listagem; rótulo do paciente inativo. Sem dependência de servidor. |
| `service.ts` | Transações `createCharge`, `cancelCharge` e `replaceCharge` e o contrato `hasValidPayments` para a FIN-02. Sem `server-only`: a integração exercita exatamente estas transações. Recebem o cliente Prisma e o id do autor (da sessão). |
| `queries.ts` (`server-only`) | `listCharges()` (20 por página, filtros por nome do paciente sem acento, situação e paciente), `getCharge()` (detalhe com histórico e vínculos de substituição) e `getChargePatientFilter()` exigem `financeiro:ler`; `getChargePatientOption()` (pré-seleção por `?patientId=`) exige `financeiro:gerir`. Do paciente só `id`, `fullName` e `status`. |
| `actions.ts` | `createChargeAction`, `cancelChargeAction`, `replaceChargeAction` e `searchChargePatients` (busca do formulário). Todas exigem `financeiro:gerir` no servidor; só autorizam, validam, chamam o serviço, revalidam e redirecionam. |
| `src/app/(app)/financeiro/**` | Lista (`/financeiro`), nova (`/financeiro/novo`), detalhe com histórico (`/financeiro/[id]`), substituição (`/financeiro/[id]/substituir`) e os relatórios descritos na FIN-03 abaixo. |
| `report-validation.ts` | Filtros GET `patientId`, `start`, `end` e `page`, com período civil inclusivo, negação de parâmetro inválido/repetido e normalização da página. Sem dependência de servidor. |
| `report-queries.ts` (`server-only`) | `getReceivablesReport()` e `getReceiptsReport()` exigem `financeiro:ler` antes de validar ou ler o banco; recusam filtro inválido sem ampliar o resultado. |
| `report-read.ts` | Agregações PostgreSQL, totais globais e paginação no mesmo snapshot `REPEATABLE READ`; compartilhado com a integração real. Valores monetários em `bigint`, paciente apenas com `id`, `fullName` e `status`. |

## Regras

- **Campos:** paciente cadastrado (ativo **ou inativo**: a inativação não impede regularizar), descrição administrativa (obrigatória, até 200 caracteres, sem conteúdo clínico), valor positivo e vencimento como data civil (`@db.Date`).
- **Valor exato em centavos:** a coluna é `amountCents` (inteiro). O texto aceita `150`, `150,5`, `1.234,56` e `R$ 80,00`; vírgula separa os centavos e ponto só agrupa milhares. Mais de dois dígitos de centavos, valor zero/negativo, formato ambíguo (`150.50`) e acima de R$ 999.999,99 (teto técnico contra digitação) são recusados. Nenhum cálculo monetário usa ponto flutuante.
- **Vencimento:** data existente entre 2000 e 2100 (faixa técnica). Passado é aceito (lançamento retroativo). A FIN-03 marca vencida somente antes do dia atual em `America/Sao_Paulo`; vencer hoje é exibido separadamente.
- **Saldo:** valor original menos a soma dos pagamentos sem estorno. Calculado, nunca persistido; cancelada não tem saldo a receber. Aberta/parcial/quitada são situações derivadas, separadas de ATIVA/CANCELADA.
- **Imutável:** não há edição nem exclusão física. Corrigir valor, paciente, descrição ou vencimento é **substituir**: na mesma transação, a original é cancelada com motivo e a substituta nasce com `replacesChargeId` apontando para ela (uma substituta por original). Ambas continuam consultáveis, com links nos dois sentidos.
- **Cancelar** exige motivo e grava `cancelledAt`, `cancelledById` e `cancelReason`. A linha é travada (`FOR UPDATE`) e o estado relido na transação; repetir o cancelamento (duplo clique, outra aba, chamadas simultâneas) responde que já estava cancelada e **não altera** data, autor nem motivo. Cancelada não volta a ativa.
- **Pagamentos:** cancelar e substituir só acontecem sem pagamento válido. `hasValidPayments(tx, chargeId)` consulta pagamentos sem estorno dentro da transação, após a trava da cobrança. O banco também recusa cancelamento com pagamento válido.
- **Envio duplicado:** o formulário gera um identificador estável da operação (`requestId` → `idempotencyKey`, único no banco). Reenvio com o mesmo conteúdo devolve a cobrança já criada; com conteúdo diferente (paciente, descrição, valor, vencimento ou original substituída) é recusado e o registro original fica intacto. Reenvios simultâneos produzem uma cobrança só.
- **Concorrência na substituição:** a original é travada antes de qualquer checagem; duas substituições simultâneas da mesma original resultam em uma só substituta, e a outra recebe "Esta cobrança já está cancelada…". A unicidade de `replacesChargeId` é a última barreira.
- **Autoria** vem sempre da sessão; ids de autor enviados no formulário são ignorados.
- **Separação:** financeiro não lê nem grava agenda ou prontuário e não bloqueia atendimento por dívida. Nenhuma ação financeira reativa paciente.

## Banco

Migração `20261005120000_financeiro_cobrancas` (aditiva: só cria o enum `ChargeStatus`, a tabela `Charge`, índices e proteções; nenhuma linha existente é alterada).

- FKs `Restrict` para `Patient`, `User` (autor e quem cancelou) e para a própria `Charge` (substituída). Paciente e usuário com cobrança não podem ser apagados.
- CHECKs: `Charge_amount_positive`, `Charge_description_not_blank`, `Charge_cancellation_consistent` (data, autor e motivo juntos, só em CANCELADA) e `Charge_not_self_replacement`.
- Trigger `Charge_immutable`: recusa `DELETE` e qualquer `UPDATE` que não seja ATIVA → CANCELADA preenchendo o cancelamento. Trigger `Charge_replacement_cancelled`: a substituta só aponta para cobrança já cancelada.
- Índices para a lista por vencimento (geral, por paciente e por situação) e para os autores.
- **Retenção:** histórico financeiro próprio, sem expurgo automático e fora da retenção de sete dias do `AuditLog`. Nenhum prazo legal de guarda foi definido.
- **Manutenção:** `Charge` entra na exclusão de usuários (categoria "lançamentos financeiros") e na reinicialização manual `pnpm db:reset`, porque depende de `Patient` (ver `manutencao/README.md`). Essa é a única remoção prevista, com as confirmações e a autorização registrada daquela ferramenta.
- **Recuperação:** a migração não tem passo destrutivo. Reverter a aplicação para uma versão anterior deixa a tabela sem uso, sem afetar as demais. Remover a tabela exigiria migração própria e decisão sobre os lançamentos existentes; não há rollback automático. Restauração segue o procedimento do Neon (`restore_snapshot` sem target, `finalize: false`). Uma carga só de dados (`pg_dump --data-only`) precisa respeitar a ordem das FKs ou usar `--disable-triggers`, como as demais tabelas com triggers.

## Permissões

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Listar e consultar cobranças de qualquer paciente (`financeiro:ler`) | ✓ | ✓ | ✓ |
| Consultar contas a receber e recebimentos de qualquer paciente (`financeiro:ler`) | ✓ | ✓ | ✓ |
| Lançar, cancelar e substituir para qualquer paciente (`financeiro:gerir`) | ✓ | ✓ | ✓ |

Decisão de Bruno em 04/10/2026: alcance igual nos três perfis. Anônimo é redirecionado ao login nas páginas e recebe "Acesso negado." nas actions; usuário inativo perde a sessão no primeiro acesso (DAL). `financeiro:*` não dá acesso a dados clínicos, usuários ou configurações.

## Testes

- Unitários: `__tests__/validation.test.ts` (centavos, formatos, limites, vencimento), `__tests__/actions.test.ts` (negação sem sessão antes do banco, três perfis, autoria da sessão, mapeamento das regras), `__tests__/queries.test.ts` (permissão, seleção sem dado clínico, paginação, filtros) e `src/app/(app)/financeiro/__tests__/charge-form.test.tsx`.
- Integração (PostgreSQL descartável): `test/integration/financeiro.integration.ts` (constraints e triggers, idempotência e concorrência, cancelamento repetido, substituição atômica e concorrente, contrato de pagamentos, exclusão de usuário com vínculo) e `test/integration/financeiro-migration.integration.ts` (migração sobre o schema anterior com dados preservados).

## Pagamentos e estornos — FIN-02

- `payment-validation.ts` valida campos, datas civis e centavos; `payment-service.ts` concentra receber, estornar e corrigir. `payment-actions.ts` autoriza no servidor e usa autoria da sessão; `payment-queries.ts` lê resumo e histórico no mesmo snapshot.
- `Payment` e `PaymentReversal` são imutáveis. Um pagamento admite um estorno e um substituto; originais, motivos, datas, autoria e vínculos ficam consultáveis. As FKs de autores entram no inventário de exclusão de usuários.
- Data do recebimento entre 2000 e 2100 e até hoje em `America/Sao_Paulo`; aceita retroativo anterior à criação da cobrança. Data do estorno entre a data do recebimento original e hoje. `createdAt` é o instante técnico separado.
- Receber admite valor positivo até o saldo. Estorno interno recompõe saldo sem devolver dinheiro em banco e sem gerar cobrança. Repetir com outra chave responde que já foi estornado, preservando o primeiro registro.
- Corrigir pagamento válido grava estorno e substituto na mesma transação, na mesma cobrança. Qualquer falha desfaz ambos. Se já estornado, "Registrar substituto" cria o vínculo explícito; pagamento comum após estorno não cria vínculo automaticamente. A data do substituto pode anteceder o estorno.
- Todas as escritas usam READ COMMITTED e a mesma trava `Charge FOR UPDATE`. O saldo é consultado em comando posterior à obtenção da trava. Guards SQL protegem estado, saldo, datas e vínculo de substituição inclusive em INSERT direto; não há retries automáticos.
- `requestId` estável por formulário gera chaves `RECEBIMENTO:`, `ESTORNO:` ou `CORRECAO:`. Fingerprint `v1:<SHA-256>` do conteúdo canônico inclui tipo, alvo, valor, datas, motivo e vínculo aplicáveis, sem autoria/relógio/saldo. Correção usa a mesma chave/fingerprint nas duas tabelas. Reenvio compatível retorna o original mesmo após estorno/cancelamento posterior; incompatível é recusado. A autoria original nunca muda.
- Histórico do detalhe paginado (20 pagamentos), com totais de todos os pagamentos válidos. Leituras usam REPEATABLE READ; escritas usam READ COMMITTED. Recepção recebe apenas dados administrativos.
- Migração aditiva `20261006010000_financeiro_pagamentos`; não modifica registros existentes. Novas tabelas participam do reset manual autorizado, sem expurgo automático nem retenção de sete dias do AuditLog.
- Recuperação: restaurar estrutura com funções/triggers e todas as relações; verificar somas válidas, estornos, substituições e autores. Uma restauração só de dados precisa considerar ordem das FKs e guards de inserção, utilizando o procedimento administrativo de recuperação já aprovado. Reverter a aplicação conserva as novas tabelas; remover histórico exige decisão própria.

Evidências e limites em [87-fin-02-pagamentos.md](../../../docs/project/evidencias/87-fin-02-pagamentos.md).

## Contas a receber e recebimentos — FIN-03

- `/financeiro/relatorios` redireciona para `/financeiro/relatorios/contas-a-receber`; a outra consulta está em `/financeiro/relatorios/recebimentos`. Ambas exigem `financeiro:ler` na página e na DAL, com o mesmo alcance para os três perfis. Sem sessão/inativo, a autorização falha antes das leituras.
- O formulário GET admite paciente opcional (ativo ou inativo, buscado pelo nome), `start`/`end` civis inclusivos entre 2000 e 2100 e `page`. Uma data vazia deixa só aquele lado sem limite. Paginação e troca entre relatórios preservam paciente/período; limpar filtros remove os parâmetros. Não há CPF em URL/filtro.
- Parâmetros desconhecidos, repetidos, datas inexistentes, período invertido e paciente inválido/inexistente mostram erro sem ampliar a consulta. Página inválida volta à primeira; página além da última é limitada. O formulário conserva os valores singulares disponíveis para correção.
- **Contas a receber:** somente cobranças ATIVAS com saldo positivo. Saldo = cobrado menos pagamentos sem estorno; os pagamentos são agregados por cobrança antes de calcular itens/totais, sem multiplicar o cobrado por joins. Parcial entra pelo saldo; quitada/cancelada não entra. O período filtra vencimento. Totais: cobrado, recebido válido, saldo a receber e saldo vencido em todo o filtro. Vencida = vencimento anterior a hoje em `America/Sao_Paulo`.
- **Recebimentos:** somente pagamentos sem estorno, filtrados por data efetiva `receivedOn`, separados do instante técnico. O estorno retira o original dos totais correntes do período original e recompõe o saldo; não gera valor negativo nem saída de caixa no dia do estorno. Substituto usa sua própria data efetiva e tem vínculo identificado; detalhe conserva originais, correções e autores.
- **Exatidão e consistência:** totais em SQL convertidos para `bigint` e DTOs monetários em `bigint`, com `formatBRL` exato. Não se convertem somas monetárias para `Number`. Cada relatório lê paciente, agregado e itens em uma transação `REPEATABLE READ`; pagamento/estorno concorrente não mistura estados entre total e lista. Saldo continua derivado, sem nova tabela ou atualização financeira.
- **Paginação e apresentação:** 20 itens por página, totais globais e vazio com zero. Contas ordenadas por vencimento/instante técnico/id; recebimentos por data efetiva/instante técnico/id decrescentes. Cards, filtros rotulados, navegação por links e acesso ao histórico da cobrança; nenhum select clínico.
- **Banco:** migração aditiva `20261007010000_financeiro_relatorios` cria somente `Payment_receivedOn_createdAt_id_idx` (`receivedOn DESC, createdAt DESC, id DESC`), com correspondente índice no schema Prisma. Não altera dados, permissões, retenção, inventário de exclusão ou reset. Rollback da aplicação pode conservar o índice.
- **Verificação:** unitários `__tests__/report-validation.test.ts`, `report-queries.test.ts`, `report-read.test.ts` e `src/app/(app)/financeiro/relatorios/__tests__/report-pages.test.tsx`; integração real `test/integration/financeiro-relatorios.integration.ts`. Integração focada com 11 testes aprovada em PostgreSQL 18 descartável: saldos, datas/fuso, estornos/correções, totais acima de Int32, paginação de 47 cobranças/94 pagamentos e quatro corridas, cada uma com controle `READ COMMITTED` que demonstra a inconsistência evitada pelo snapshot.
- **Checks finais:** lint, TypeScript, 92 suítes/1.139 testes Jest, nove testes da pipeline e build aprovados. Integração completa: 31 suítes/188 testes, sem falhas nem ignorados; 28 migrações aplicadas no PostgreSQL 18 descartável e comparação Prisma sem diferença. Chromium headless no build de produção local passou com ADMIN, RECEPCAO e FISIOTERAPEUTA, anônimo/inativo negados e Recepção sem acesso clínico; filtros por teclado, paginação e histórico de correções/estornos conferidos. Viewport de 375 px sem rolagem horizontal e zero erros JavaScript de página; somente dados fictícios.

Evidências, checks finais e limites em [88-fin-03-relatorios.md](../../../docs/project/evidencias/88-fin-03-relatorios.md). O candidato ainda não foi integrado ou publicado; validação local não comprova migração nem funcionamento em Preview/Production.

## Fora do escopo

Exportação, PDF/impressão de relatórios, indicadores clínicos, relatórios contábeis/fiscais, meios de pagamento, despesas, repasses, pacotes, convênios, descontos, juros, créditos, emissão fiscal, cobrança bancária, gateways e integrações.
