# Operação e validação do administrativo — ADM-10 (#106)

## Estado da entrega

| Estado | O que comprova | Situação |
|---|---|---|
| Código implementado | Contratos #96 e funcionalidades #97–#105 | Integrados em main e Preview até a #105 |
| Validado localmente | Massa fictícia, XSD, quantidades, dinheiro, acesso, concorrência e restore | Evidências da #106 em `evidencias/106-ciclo.md` |
| Publicado | SHA e workflow da implantação | #105: `17f9c47`, Preview run `38814245719`; #106 ainda local |
| Homologado na operadora | Piloto/manual/versão, protocolo e aceite externo verificável | **PENDENTE**, sem canal e sem autorização de envio |

Bruno determinou em 15/10/2026 manter a homologação externa pendente e validar com
dados sintéticos locais. Essa decisão não transforma teste XSD em aceite da operadora.
A #106 e o épico #95 não devem ser encerrados como homologados enquanto o gate externo
estiver pendente. Nenhum teste usa o anexo real como massa.

## Rotina por perfil

1. **ADMIN:** em Configurações, cadastre operadora/contrato, identificação do prestador,
   procedimentos/tarifas por vigência, solicitantes/executantes e perfil de guia/TISS.
   Confirme os limites do contrato. Defaults técnicos servem ao planejamento; não
   confirmam ANS/CNES, versão aceita, manual ou homologação. Evite alterar fontes após
   conferir guias; o fechamento revalida as fontes atuais.
2. **Recepção, Fisioterapeuta ou ADMIN:** no paciente, registre cobertura e autorização
   recebida, validade e quantidades por procedimento. A elegibilidade usa a execução
   civil em São Paulo. Não confunda saldo disponível com total originalmente autorizado.
3. **Fisioterapeuta ou ADMIN:** registre a sessão clínica. Presença e sessão não criam
   cobrança automática de paciente. Recepção prepara o administrativo sem receber
   evolução/prontuário ou poder informar indicação clínica para faturamento.
4. **Todos os três perfis:** prepare a produção, confira cobertura/autorização e tarifa.
   A conferência apta reserva quantidade. Monte a guia do mesmo grupo/competência,
   resolva pendências e confira. Indicação clínica, quando exigida, depende de perfil
   clínico e confirmação explícita; nunca copie prontuário inteiro.
5. **Todos:** monte o lote com guias aptas compatíveis. **Somente ADMIN** fecha o lote.
   Revise o relatório integral antes de fechar. O fechamento preserva fontes e valores;
   ainda não constitui obrigação de operadora.
6. **ADMIN:** gere XML a partir do lote fechado. Baixe o artefato preservado; uma nova
   geração cria outra versão, sem substituir os bytes anteriores. XML de HOMOLOGACAO
   não permite registrar envio de produção. XSD aprovado não significa arquivo aceito.
7. **ADMIN:** depois de uma transmissão manual efetivamente realizada e autorizada,
   registre artefato, data civil, canal e protocolo. O sistema não transmite o XML.
   O primeiro registro de envio constitui a obrigação por item. Não registre um envio
   fictício em Preview/Production para simular faturamento real.
8. **ADMIN:** registre o demonstrativo com recebimento 100% alocado em itens do mesmo
   contrato. Separe recebido, aberto, glosa em análise e baixa definitiva. Os três
   perfis podem consultar relatórios e CSV; somente ADMIN concilia ou baixa glosa.

## Correções sem sobrescrever o histórico

- **Antes de fechar:** devolva guia apta ao rascunho; se a produção precisar mudar,
  retire seu vínculo ativo e devolva-a à preparação. Corrija as fontes e confira
  novamente produção e guia. Corrigir autorização/tarifa não atualiza snapshot antigo.
  O benchmark de 100 guias exercita devolução/reconferência após ampliar a autorização.
- **Lote fechado ainda não enviado:** preserve os XMLs existentes. Use a transição
  CANCELAR com motivo; as guias retornam a aptas e a produção a apta, com histórico.
  Devolva e confira as guias/fontes que precisarem de correção, monte outro lote e
  gere o artefato do novo lote. O lote cancelado e seus XMLs permanecem preservados.
- **Lote enviado:** não reabra nem reescreva conteúdo congelado. Corrija somente os
  metadados de envio pela operação própria, com referência/motivo. Isso não cria outra
  obrigação nem muda sua competência original. Ajustes financeiros explícitos são
  feitos na conciliação; não alteram lote/XML nem a cobrança de pacientes.
- **Recebimento incorreto:** estorne integralmente ou substitua, indicando o original.
  Uma substituição é inversão + novas alocações na mesma transação. Estornar o substituto
  não reativa o original. Resolva atos dependentes incompatíveis antes do estorno.
- **Glosa:** registre origem e código do demonstrativo. Liberar volta análise para
  aberto; receber da origem transfere análise para recebido; definir baixa exige
  decisão justificada; reabrir baixa devolve à análise. Não some a origem histórica
  de glosa ao saldo atual nem classifique baixa como recebimento.
- **Erro ou envio repetido:** conserve o requestId ao repetir a mesma solicitação.
  Não use replay com conteúdo diferente. Recarregue a versão atual em conflito; nunca
  force UPDATE/DELETE no banco para contornar uma recusa de domínio.

## Conferência de quantidades e dinheiro

Autorização: `disponível = autorizado − soma dos usos e devoluções`.
No cenário de uma guia: 10 autorizados, 2 executados/reservados, 8 disponíveis.
Duas unidades do mesmo procedimento a R$50 resultam em R$100 na produção, guia, lote e obrigação.
Com R$60 recebidos e R$20 de glosa: `100 = 60 + 20 abertos + 20 análise + 0 baixa`.
Charge/Payment de paciente continuam separados e não são criados por esse ciclo.

Relatórios são posição atual do conjunto selecionado. Declare o eixo: execução,
fechamento, primeiro envio, recebimento ou glosa. Datas inclusivas selecionam o conjunto;
não reconstruem saldo histórico. Confira horário e filtros de tela/CSV/impressão:
cada saída consulta uma nova posição. CSV/impressão recusam excesso sem truncar.

## Reproduzir o ensaio local

Pré-requisitos: dependências com `pnpm install --frozen-lockfile`, Node compatível,
Docker com o container PostgreSQL 18 de testes `fisio-adm99-test`, usuário `fisio`,
porta local 55499 e senha configurada internamente em POSTGRES_PASSWORD. O executor
não lê `.env`, não aceita host remoto e não usa dados do aplicativo.

```powershell
node scripts/administrativo/validate-local.mjs 1
node scripts/administrativo/validate-local.mjs 100
```

Cada execução cria **dois bancos novos** `fisio_adm106_<timestamp>` e `_restore`.
Colisões abortam; não existe DROP, limpeza nem sobrescrita. Aplica todas as migrações,
cria usuários/cadastro/clínico fictícios, exercita os serviços reais até o XML/XSD e
os relatórios, grava um envio simulado local, recebimento parcial e glosa. O perfil
`PRODUCAO` da fixture é apenas uma condição técnica fictícia para alcançar a conciliação
no banco descartável; não documenta confirmação real de versão/operadora.

Salva SHA, indicação de árvore modificada, parâmetros, IDs sintéticos, tempos, totais,
digest XSD e hashes em `release/106-<timestamp>/`. Um `pg_dump -Fc` é restaurado em
transação única com `--exit-on-error`. Compara todas as linhas de todas as tabelas,
bytes/digest/vínculos/autoria dos XMLs, sequências, triggers e constraints. CHECKs
são comparados por identidade/tipo/colunas/validação: PostgreSQL pode reescrever casts
equivalentes durante restore; não há alegação de identidade textual dessas expressões.
Os arquivos originais nunca são regenerados para a comparação. Bancos e dump ficam
preservados para inspeção local. A massa contém identificadores fictícios e conteúdo
clínico sentinela, não devendo ser carregada em ambientes com dados reais.

Os três testes integrados adicionais entram em `pnpm test:integration`: ciclo completo,
disputa pelos últimos R$20 e rollback de recebimento após criar cabeçalho. As regressões
#98/#102/#104 cobrem também saldo de autorização e fechamento concorrentes. A matriz
negativa #106 chama diretamente todas as actions administrativas e downloads/impressão,
com anônimo, papel desconhecido e cada papel inativo, antes de validar entrada/banco.
Esses testes não substituem autenticação real no navegador nem homologação externa.

## Recuperação e liberação

Esta entrega não adiciona migração nem modifica saldo/schema. A criação dos bancos de
ensaio aplica o histórico completo existente até `20261015190000_administrativo_conciliacao`.
Na publicação autorizada, usar o gate/auditoria da pipeline e não reaplicar SQL manualmente.
Reverter apenas os scripts/documentação de validação não exige rollback de banco; não
remover as tabelas ou migrações administrativas integradas nas entregas anteriores.

O ensaio local não mede PITR Neon, recuperação de incidente real, RPO/RTO ou cópia externa.
A política aprovada em `15-retencao-rastreabilidade-recuperacao.md` continua vigente.
Em incidente: suspenda novas escritas, registre ambiente/SHA/deployment/instante e alcance,
preserve evidências, identifique o ponto de recuperação disponível e restaure em alvo
isolado. Confira migrações, hashes/bytes, vínculos, autoria, quantidades e saldos antes
de considerar a troca do alvo. Não regenere XML para substituir original ausente.
Troca de banco/deployment e envio externo exigem autorização do responsável.

Fluxo de release inalterado: PR em main com checks → PR main/production com checks →
Preview auditado → homologação externa documentada → liberação **manual** de Production.
Não executar o workflow manual de Production como parte da validação da #106.

Para o gate externo, registrar posteriormente: operador/contrato piloto configurado,
versão/manual, SHA/ambiente e ID/hash do artefato, autorização específica de envio,
canal, protocolo/data, resposta da operadora, exigências/rejeições e reteste. Se o canal
não aceitar dados fictícios, manter a pendência e solicitar autorização específica
para a massa real; nunca aproveitar dados do anexo de referência.
