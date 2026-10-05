# Issue #86 — FIN-01: cobranças manuais, histórico e permissões

## Gate de início

Antes de codificar, o gate da DEC-01 foi conferido no [briefing financeiro](../16-financeiro-integracoes.md#gate-de-início--critérios-do-mvp-e-evidências):
critérios 1–6 com a evidência histórica já registrada e critério 7 comprovado pela
[VAL-03](val-03-revalidacao-perfis.md) (04/10/2026, SHA publicado `20b3282`, três perfis, MEL-01/MEL-02,
build de produção local com as limitações da VAL-02). O registro da VAL-03 e a atualização do gate
entram nesta mesma entrega, em commit próprio.

## Contrato implementado

Conforme a issue e o briefing aprovado por Bruno em 04/10/2026; detalhes em
[`src/modules/financeiro/README.md`](../../../src/modules/financeiro/README.md).

- Domínio próprio `Charge`, ligado só a `Patient`: descrição administrativa, valor em centavos
  (inteiro), vencimento como data civil, situação `ATIVA`/`CANCELADA`.
- `financeiro:ler` e `financeiro:gerir` na matriz central para ADMIN, RECEPCAO e FISIOTERAPEUTA,
  com alcance igual; `requirePermission`/`assertPermission` reutilizados em páginas, queries e actions.
- Sem edição nem exclusão física (trigger no banco). Correção = substituição atômica: cancela a
  original com motivo e lança a substituta ligada a ela. Cancelamento com motivo, autor e data.
- Identificador estável da operação (`idempotencyKey` único): reenvio não duplica; chave com
  conteúdo incompatível é recusada sem alterar o original.
- Contrato para a FIN-02: cancelar/substituir só sem pagamento válido, checado na transação sob
  a trava da cobrança (`hasValidPayments`, hoje sempre falso porque não há pagamentos).
- Migração aditiva `20261005120000_financeiro_cobrancas`, FKs `Restrict`, CHECKs e índices.
  `Charge` entra no inventário de exclusão de usuários (categoria financeiro) e na reinicialização
  manual `pnpm db:reset`; sem expurgo financeiro automático.

### Decisões técnicas desta execução

- **Paciente inativo pode receber cobrança.** A issue pede "qualquer paciente" e "paciente
  existente", e o briefing diz que a inativação não impede regularizar lançamentos. A busca do
  formulário mostra ativos e inativos, com o rótulo "(inativo)". Nenhuma ação financeira reativa
  o cadastro.
- **Substituição numa só operação** (cancelar original + lançar substituta), para que não exista
  janela com a original cancelada e sem substituta. Cancelar sem substituir continua disponível.
- **Limites técnicos**, não regras de negócio: valor até R$ 999.999,99; vencimento entre 2000 e
  2100; descrição até 200 caracteres; motivo até 500.
- **Formato do valor:** vírgula para centavos e ponto só como separador de milhar; `150.50` é
  recusado em vez de interpretado.
- Sem eventos no `AuditLog`: o histórico financeiro fica na própria tabela, como pede a issue.

## Evidências

Validação local em 05/10/2026, branch `feat/fin-01-cobrancas-manuais` a partir de `3876d1a`.
PostgreSQL 17 em contêiner **descartável** próprio (`fisio-fin01-test`), com banco `fin01` para a
integração e `fin01_e2e` para a interface. Nenhum banco de desenvolvimento, Preview ou produção foi
migrado; só dados fictícios.

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | Aprovado (após remover `.next/dev` truncado pelo encerramento do `next dev`). |
| `pnpm lint` | Sem erros nem avisos. |
| `pnpm exec jest --runInBand` | 82 suítes e 975 testes aprovados. |
| `pnpm test:pipeline` | 9 testes aprovados. |
| `pnpm test:integration` | 28 suítes e 163 testes aprovados, zero pulados (execução sequencial). |
| `pnpm build` | Aprovado, Next.js 16.3.5/Turbopack. |
| Migrações | 26 aplicadas com `prisma migrate deploy` no banco descartável; `prisma migrate diff` sem diferença entre banco e schema. |

### Integração (PostgreSQL real)

`test/integration/financeiro.integration.ts` (13 casos) e `financeiro-migration.integration.ts`:

- três perfis lançam para paciente ativo e inativo, com autoria e valor exato; inativo segue inativo;
- banco recusa valor zero/negativo, descrição vazia, paciente inexistente, valor acima do INTEGER e
  cancelamento incoerente; `UPDATE` de conteúdo, reabertura, alteração do motivo e `DELETE` recusados
  pelo trigger; paciente com cobrança não pode ser apagado;
- substituta só aponta para cobrança cancelada;
- 8 reenvios simultâneos da mesma operação → 1 cobrança; chave reutilizada com outro paciente,
  descrição, valor ou vencimento → recusada; 4 envios simultâneos com conteúdos diferentes e mesma
  chave → 1 gravado, demais recusados, original intacto;
- 4 cancelamentos simultâneos → 1 efetivo; repetir não altera data, autor ou motivo;
- pagamento válido simulado impede cancelar e substituir, e a checagem roda com a linha travada
  (outra conexão recebe `55P03` em `FOR UPDATE NOWAIT`);
- substituição grava motivo/autor na original e liga a nova; reenvio devolve a mesma; falha no
  meio (paciente inexistente) desfaz o cancelamento; 4 substituições simultâneas → 1 substituta;
  5 reenvios simultâneos da mesma substituição → 1 substituta;
- usuário desativado com cobrança criada ou cancelada não é excluído ("lançamentos financeiros");
- catálogo de vínculos de usuário confere com as FKs do banco (suíte existente), e `db:reset` limpa
  `Charge` com cobrança cancelada e substituta (suíte existente, semeadura ampliada);
- migração aplicada sobre o schema anterior com usuário, paciente, agendamento, bloqueio,
  configurações e auditoria fictícios: todas as linhas idênticas antes e depois; tabela, triggers,
  CHECKs e FKs `Restrict` presentes.

Na primeira rodada completa, um caso existente de `agenda-bloqueios` falhou por
"Unable to start a transaction in the given time" enquanto o Jest rodava em paralelo na mesma
máquina; isolado, o arquivo passou (9/9). A rodada final, sequencial, está na tabela acima.

### Navegador autenticado (dados fictícios)

`next dev` na porta 3101 ligado só a `fin01_e2e`, com 3 usuários fictícios (senhas aleatórias
descartadas; entrada pelo acesso rápido de desenvolvimento, sem digitar senha), 25 pacientes
fictícios (um inativo) e 22 cobranças semeadas.

- **RECEPCAO:** menu com Início, Pacientes, Agenda e Financeiro. Lista com 20 por página e página 2;
  busca "fictício 01" sem acento. Nova cobrança para o paciente 25 (inativo, fora dos 20 primeiros
  resultados) escolhido pelo teclado no combobox; envio com descrição vazia, valor `10,999` e sem
  vencimento mostrou "Informe a descrição.", "Use no máximo dois dígitos para os centavos." e
  "Informe o vencimento." mantendo o paciente; `1234,5` virou `1.234,50` ao sair do campo e foi
  gravado. Substituiu por R$ 1.200,00 com motivo; a original ficou cancelada, com autor, data,
  motivo e link para a substituta, sem botões de ação. Cancelou outra cobrança pelo diálogo.
  Acesso direto a anamnese, sessões, configurações e usuários → `/acesso-negado`.
- **FISIOTERAPEUTA:** cancelou uma cobrança com motivo; lançou R$ 180,00 pela pré-seleção do filtro
  de paciente; substituiu uma cobrança (R$ 95,90 → R$ 90,00).
- **ADMIN:** substituiu trocando paciente e vencimento; cancelou a cobrança lançada pelo
  fisioterapeuta; lançou `95,9` → R$ 95,90.
- **Anônimo:** `/financeiro`, `/financeiro/novo`, detalhe e substituição → `/login`.
- Estado final do banco fictício: cobranças lançadas e canceladas pelos três perfis (2
  cancelamentos de cada), 3 substitutas, nenhuma linha em agenda ou prontuário.
- 375 px: lista filtrada por "Cancelada", detalhe, nova e substituição sem rolagem horizontal
  (`scrollWidth` = 375); a lista mostra o vencimento sob o nome.

## Entrega e limites

Validação local; publicação, migração em Preview/Production e homologação no ambiente publicado
não fazem parte desta entrega e seguem a [pipeline vigente](../pipeline-deploy.md). A migração
precisa ser aplicada pelo fluxo de release antes do uso em produção. Sem cobrança real, contratação
ou dado real. Fora do escopo: pagamentos/estornos (FIN-02), relatórios (FIN-03) e as demais
exclusões da issue. Nenhum prazo legal de retenção foi definido.
