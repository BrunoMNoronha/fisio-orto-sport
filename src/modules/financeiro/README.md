# financeiro

Cobranças manuais por paciente (FIN-01, [#86](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/86)): lançar, consultar, cancelar e substituir, com histórico e permissões próprias. Contrato no [briefing financeiro](../../../docs/project/16-financeiro-integracoes.md). **Domínio próprio**, ligado só ao cadastro do paciente: nada clínico, sem geração automática por agenda, presença ou atendimento. Pagamentos, saldo real e estornos são da FIN-02 (#87); contas a receber e recebimentos, da FIN-03 (#88).

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Conversão do valor digitado para centavos inteiros (`parseAmount`, só operações de string) e de volta (`formatBRL`, `formatAmountInput`); schemas zod com mensagens em pt-BR; filtro da listagem; rótulo do paciente inativo. Sem dependência de servidor. |
| `service.ts` | Transações `createCharge`, `cancelCharge` e `replaceCharge` e o contrato `hasValidPayments` para a FIN-02. Sem `server-only`: a integração exercita exatamente estas transações. Recebem o cliente Prisma e o id do autor (da sessão). |
| `queries.ts` (`server-only`) | `listCharges()` (20 por página, filtros por nome do paciente sem acento, situação e paciente), `getCharge()` (detalhe com histórico e vínculos de substituição) e `getChargePatientFilter()` exigem `financeiro:ler`; `getChargePatientOption()` (pré-seleção por `?patientId=`) exige `financeiro:gerir`. Do paciente só `id`, `fullName` e `status`. |
| `actions.ts` | `createChargeAction`, `cancelChargeAction`, `replaceChargeAction` e `searchChargePatients` (busca do formulário). Todas exigem `financeiro:gerir` no servidor; só autorizam, validam, chamam o serviço, revalidam e redirecionam. |
| `src/app/(app)/financeiro/**` | Lista (`/financeiro`), nova (`/financeiro/novo`), detalhe com histórico (`/financeiro/[id]`) e substituição (`/financeiro/[id]/substituir`). |

## Regras

- **Campos:** paciente cadastrado (ativo **ou inativo**: a inativação não impede regularizar), descrição administrativa (obrigatória, até 200 caracteres, sem conteúdo clínico), valor positivo e vencimento como data civil (`@db.Date`).
- **Valor exato em centavos:** a coluna é `amountCents` (inteiro). O texto aceita `150`, `150,5`, `1.234,56` e `R$ 80,00`; vírgula separa os centavos e ponto só agrupa milhares. Mais de dois dígitos de centavos, valor zero/negativo, formato ambíguo (`150.50`) e acima de R$ 999.999,99 (teto técnico contra digitação) são recusados. Nenhum cálculo monetário usa ponto flutuante.
- **Vencimento:** data existente entre 2000 e 2100 (faixa técnica). Passado é aceito (lançamento retroativo). Vencida/aberta é assunto da FIN-03.
- **Saldo:** até a FIN-02, o saldo de uma cobrança ativa é o valor original; cancelada não tem saldo.
- **Imutável:** não há edição nem exclusão física. Corrigir valor, paciente, descrição ou vencimento é **substituir**: na mesma transação, a original é cancelada com motivo e a substituta nasce com `replacesChargeId` apontando para ela (uma substituta por original). Ambas continuam consultáveis, com links nos dois sentidos.
- **Cancelar** exige motivo e grava `cancelledAt`, `cancelledById` e `cancelReason`. A linha é travada (`FOR UPDATE`) e o estado relido na transação; repetir o cancelamento (duplo clique, outra aba, chamadas simultâneas) responde que já estava cancelada e **não altera** data, autor nem motivo. Cancelada não volta a ativa.
- **Pagamentos (contrato para a FIN-02):** cancelar e substituir só acontecem sem pagamento válido. A checagem `hasValidPayments(tx, chargeId)` roda dentro da transação, sob a trava da cobrança; nesta fatia sempre responde `false`, e a FIN-02 troca o corpo pela consulta dos pagamentos não estornados. A integração simula um pagamento válido e prova que a operação é recusada sem efeito colateral e com a linha travada.
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
| Lançar, cancelar e substituir para qualquer paciente (`financeiro:gerir`) | ✓ | ✓ | ✓ |

Decisão de Bruno em 04/10/2026: alcance igual nos três perfis. Anônimo é redirecionado ao login nas páginas e recebe "Acesso negado." nas actions; usuário inativo perde a sessão no primeiro acesso (DAL). `financeiro:*` não dá acesso a dados clínicos, usuários ou configurações.

## Testes

- Unitários: `__tests__/validation.test.ts` (centavos, formatos, limites, vencimento), `__tests__/actions.test.ts` (negação sem sessão antes do banco, três perfis, autoria da sessão, mapeamento das regras), `__tests__/queries.test.ts` (permissão, seleção sem dado clínico, paginação, filtros) e `src/app/(app)/financeiro/__tests__/charge-form.test.tsx`.
- Integração (PostgreSQL descartável): `test/integration/financeiro.integration.ts` (constraints e triggers, idempotência e concorrência, cancelamento repetido, substituição atômica e concorrente, contrato de pagamentos, exclusão de usuário com vínculo) e `test/integration/financeiro-migration.integration.ts` (migração sobre o schema anterior com dados preservados).

## Fora do escopo

Pagamentos e estornos (FIN-02), relatórios e contas a receber (FIN-03), despesas, repasses, pacotes, convênios, descontos, juros, créditos, emissão fiscal, cobrança bancária, gateways e integrações.
