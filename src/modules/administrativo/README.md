# Administrativo

Recorte e matriz de acesso aprovados por Bruno em 14/10/2026 (#96). #97 implementada
localmente: operadoras, contratos, procedimentos, tarifas e identificação profissional. Operadora piloto,
manual/versão aceitos e volume continuam pendentes; nenhum perfil é homologado aqui.

## Fluxo implementado

ADMIN acessa **Configurações → Operadoras e contratos**, busca/lista operadoras
(20 por página), cria/edita/inativa e configura contratos (20 por página).
Registro ANS, código da clínica, CNES, versão TISS e referência do manual podem
ficar vazios; códigos são texto e preservam zeros. Campos desconhecidos aparecem
como pendentes. CNES é condicionado ao manual, não obrigatório universalmente.

`administrativo:ler` e `administrativo:preparar` pertencem aos três perfis;
`configurar`, `fechar` e `conciliar` somente ADMIN. A tela atual exige `configurar`
na página/DAL/action. Não há prontuário, pacientes ou informações clínicas nessas
consultas. Financeiro atual e relação Recepção ⊆ Fisioterapeuta preservados.

## Transações e preservação

- Validação Zod no servidor, autoria da sessão, motivo obrigatório em cada escrita.
- Versão otimista e trava transacional de configuração comum a criações, alterações
  e inativação. Escritas em READ COMMITTED; consultas paginadas em REPEATABLE READ.
- UUID estável por envio e fingerprint do conteúdo: replay retorna identidade
  original, mesmo após edição posterior; conteúdo divergente é recusado.
- Cadastro e snapshot entram juntos. Triggers recusam DELETE, alteração do histórico,
  mudança de identidade/vínculo, versão incorreta ou cadastro sem histórico coerente.
- Operadora inativa preserva contratos, mas não permite ativar/criar contrato ativo.
  Identidade da operadora de um contrato é imutável.
- `AdministrativeConfigChange` conserva versões com autor, motivo, dados e instante.
  A tela mostra as dez últimas; todas permanecem no banco, sem expurgo de AuditLog.
- Manutenção preserva as seis tabelas da #97 e ProcedureAuthorizationRule como configuração e verifica fingerprints;
  novas FKs de autoria entram em `USER_LINKS` e impedem excluir usuário vinculado.

## Migração e recuperação

Migração aditiva `20261014170000_administrativo_operadoras`, sem alteração em dados
anteriores, somente aplicada em PostgreSQL 18 descartável nesta execução. Recuperação
precisa incluir HealthOperator, OperatorContract, BillingProcedure, ProcedureTariff,
BillingProfessional e AdministrativeConfigChange, constraints, índices, funções/triggers e autores.
O catálogo usa a extensão PostgreSQL btree_gist. A migração ainda não publicada foi
consolidada para manter o gate aditivo do pipeline, sem remoção de constraint existente.
Triggers diferidas exigem carregar cada configuração com seu snapshot coerente na mesma
transação ao restaurar dados. Rollback da aplicação pode conservar as tabelas; não
remover histórico para reverter a interface. Nenhuma operação em Preview/Production.

## Validação

Unitários em `__tests__` cobrem entradas pendentes, zeros, filtros, autorização antes
de qualquer escrita/leitura, autoria, erro e redirecionamento. O formulário tem testes
de metadados de envio, feedback ligado ao campo e preservação dos valores no erro.
Integração real em `test/integration/administrativo-configuracoes.integration.ts`
cobre oito cenários de atomicidade, idempotência, concorrência, FKs e histórico;
reset e exclusão de usuário possuem regressões próprias. Evidência visual sintética:
[configuração de contrato](../../../docs/project/evidencias/97-contrato-configuracao.jpg).

## Catálogo e identificação profissional

- No detalhe do contrato, abrir **Catálogo de procedimentos e tarifas**. Busca por nome/código,
  paginação de 20, edição do nome e ativação/inativação. Contrato, tabela e código são
  imutáveis; correções desses identificadores exigem inativar e criar outro cadastro.
- Tarifa unitária em centavos inteiros: R$ 0,01 a R$ 999.999,99, mesma precisão/limite
  técnico da entrada monetária existente. Isso não é um limite de lote ou volume homologado.
  Datas civis de 2000 a 2100; ambas inclusivas; fim vazio significa prazo indeterminado.
  A exclusion GiST bloqueia períodos ativos sobrepostos inclusive sob SQL concorrente.
  Para substituir uma tarifa aberta, encerrar sua vigência no dia anterior à nova.
- A consulta por contrato/procedimento/data retorna exatamente uma tarifa ou pendência
  explícita. Operadora, contrato ou procedimento inativo impedem elegibilidade, mas seguem
  consultáveis pelo administrador. Não há fallback para zero ou para o preço mais recente.
- readTariffSnapshot retorna cópia com valor e versões de procedimento/tarifa. ADM-03/ADM-05
  devem persistir essa cópia no item conferido/fechado; ainda não existem esses itens na #97.
  Editar o cadastro preserva o histórico. O teste da cópia não substitui o teste de
  preservação do item final, a ser implementado nas issues consumidoras.
- **Configurações → Identificação profissional** cadastra solicitantes, executantes ou ambos.
  Usuário é opcional, exclusivo e precisa ser fisioterapeuta ativo em novo vínculo.
  Solicitantes externos não precisam de conta. Busca nominal limitada com aviso para refinar.
  Conselho (código/número), UF e CBO são informados expressamente; podem ficar pendentes.
  Não copiamos o CREFITO de User nem validamos homologação só pelo formato dos campos.
  Vínculos antigos com usuários inativos são preservados; elegibilidade futura deverá
  verificar também o estado/perfil do usuário, sem conceder acesso pelo cadastro faturável.
- Testes adicionais: administrativo-catalogo.integration.ts cobre vigências, centavos,
  contexto contratual, concorrência sem advisory lock, snapshots, versões, vínculos e inativação.
  db-reset.integration.ts semeia e compara as seis tabelas antes/depois da limpeza.

Evidências sintéticas: [catálogo e tarifa](../../../docs/project/evidencias/97-catalogo-tarifas.jpg)
e [identificação](../../../docs/project/evidencias/97-identificacao-profissional.jpg).
Ver [registro de entrega](../../../docs/project/evidencias/97-catalogo.md).

Na #97 não havia consumo de autorização. A #98 acrescenta o livro e suas primitivas
internas, descritos abaixo. Produção, guias, lotes, XML e relatórios administrativos
continuam nas próximas issues. Contratos em texto livre do paciente não são convertidos.

## Coberturas e autorizações (#98)

Os três perfis acessam **Administrativo → paciente**. Busca sem acentos e paginação de
20; cobertura tem beneficiário/carteirinha/plano, contrato explícito e vigência civil.
Paciente e contrato são imutáveis: nova carteira/contrato pode ser outra cobertura,
mantendo as anteriores. Não há inferência dos quatro campos legados do paciente.
Dados cadastrais e conteúdo clínico continuam separados.

Autorizações recebidas guardam número, senha opcional, emissão e período inclusivo.
Emissão/registro podem ocorrer depois da execução; a elegibilidade usa a data executada.
A vigência autorizada deve estar dentro da cobertura. Itens por procedimento do mesmo
contrato guardam unidades inteiras autorizadas; plano terapêutico não participa do saldo.
Cabeçalho com cobertura/contrato incompatíveis e item com procedimento de outro contrato
são recusados no serviço e por FKs compostas. Identidades e vínculos não mudam em correções.

No detalhe do procedimento, ADMIN configura **PENDENTE**, **EXIGIDA** ou **DISPENSADA**,
com referência e motivo. Ausência de regra equivale a pendência; dispensa nunca é presumida.
Cada alteração é uma versão imutável. Consulta da cobertura verifica exigência/dispensa;
consulta do item também verifica vigência da autorização e quantidade disponível.
Saldo aritmético é autorizado menos consumos/devoluções; cadastros inativos ou vencidos
na execução continuam consultáveis mas não são elegíveis. Nenhum fluxo clínico é bloqueado.

BeneficiaryChange conserva versões coerentes na mesma transação de cada gravação,
com autor, motivo e idempotência. Coverage e Authorization com consumo líquido vigente
não podem ser corrigidas/inativadas/canceladas. Quantidade do item pode ser aumentada ou
reduzida até o consumo líquido, nunca abaixo dele; não se inativa item com consumo.
A política conservadora evita invalidar silenciosamente os dados de produção já usados.

### Livro e integração com ADM-03

AuthorizationUse é append-only. Consumo positivo, devolução negativa integral vinculada
ao original e única. Triggers geram snapshot de carteira, beneficiário, cobertura,
autorização, procedimento e versões. Não existe action pública nem botão para lançar
consumo manual nesta entrega. Sessão/presença não disparam escrita administrativa.

Para #99, autorizar no servidor, abrir a transação e tomar lockBeneficiary antes de
ler elegibilidade/configuração. readEligibilityTx e consumeAuthorizationTx devem rodar
na mesma transação da conferência/produção, sem usar o wrapper que abre outra transação.
A autorização recebe FOR UPDATE; a guarda relê vigências, estados e saldo. A trava
comum serializa mudanças de configuração e consumo; o banco protege também SQL direto.
Leituras do contexto são sequenciais na mesma conexão pg, evitando ramos concorrentes
de include do Prisma. Há regressão específica para a compatibilidade observada no navegador.

returnAuthorizationTx exige motivo e registra devolução completa, com o mesmo snapshot.
ADM-03 deve verificar se a produção ainda permite devolução e alinhar sua ordem de travas
com as mutações clínicas. Após fechamento, a política de ajuste da guia/lote prevalece:
a primitiva isolada não autoriza devolver produção fechada.
Chave de origem única representa uma versão da produção; repetir a mesma chave/envio
não consome novamente. Payload divergente é recusado. Falha na escrita da produção
deve reverter o consumo junto; isso está coberto por integração.

O snapshot retornado/capturado preserva os dados usados. A persistência nos itens finais
e guias e seus testes completos dependem de ADM-03/ADM-05; não há guia faturada na #98.
Preço/tarifa continuam na #97 e precisam ser conferidos no mesmo contexto em ADM-03.
Volume/desempenho final permanecem pendentes; a trava comum não é benchmark de capacidade.

### Manutenção e recuperação

Migração aditiva 20261014190000_administrativo_coberturas. BeneficiaryCoverage,
BenefitAuthorization, AuthorizationItem, AuthorizationUse e BeneficiaryChange dependem
do paciente: entram juntos na reinicialização manual já existente; sem expurgo automático.
ProcedureAuthorizationRule é configuração histórica e permanece preservada.
Incluir as seis novas tabelas, autores, índices, FKs, funções e triggers na recuperação.
Os registros mutáveis e seus snapshots precisam da mesma transação na restauração.
Novos vínculos foram incluídos em USER_LINKS; usuário com autoria permanece desativável,
mas sua exclusão é recusada.

Evidência: [entrega da #98](../../../docs/project/evidencias/98-coberturas.md).

## Parâmetros por contrato (#96, 15/10/2026)

ADMIN edita canal de homologação, sessões estimadas/mês (1.000), intervalo de fechamento
(30 dias), guias/lote (100), itens/lote (1.000), bytes/XML (2 MiB) e linhas/exportação
(10.000). Novos contratos sugerem TISS 04.03.00; existentes mantêm versão informada.
Sem dados reais inventados ou homologação presumida. Persistência e histórico usam a
transação de configuração existente. Migração aditiva 20261015120000_administrativo_parametros.
Consumidores futuros devem aplicar os parâmetros; não há fechamento automático.

## Produção conferida (#99)

Administrativo → Produção e fila de pendências: os três perfis preparam, conferem,
devolvem e invalidam itens explicitamente. A consulta administrativa seleciona apenas
identidade da sessão/paciente, data, status, versão e nome do profissional; não carrega
prontuário, evolução, diagnóstico ou plano. Autoria vem da sessão autenticada.

ProductionItem possui PENDENTE, APTO e INVALIDADO. FECHADO/ENVIADO são estados reservados
às #101/#102, sem ação pública de fechamento nesta entrega. Uma sessão pode ter vários
procedimentos; cada procedimento tem um único item não invalidado por sessão, com a
quantidade agregada. Correções de identidade exigem invalidar o anterior e preparar outro.
Hora inicial/data derivam de occurredAt em America/Sao_Paulo; hora final real é opcional,
sem inferência da agenda. Tarifa/cobertura/regra/autorização e identificação profissional
ficam em snapshot; total bigint = quantidade × centavos inteiros.

saveProduction trava paciente → configuração administrativa → sessão, valida versão e
chave de envio e executa conferência/consumo/histórico na mesma transação. Uma pendência
persiste com motivo; não consome. Devolver/invalidar faz devolução integral e motivada.
ProductionChange é append-only e obrigatório por versão no banco. A devolução isolada
pelo livro de autorização não pode deixar um item apto/fechado apontando para consumo
revertido. Configuração/tarifa usa a trava comum da #97; não se abre outra transação.

Trigger diferida de TreatmentSession vê a autoria gravada pela action clínica. Correção
ou invalidação devolve consumo e coloca itens abertos em pendência atomicamente. Se há
produção, SQL direto de correção também precisa registrar TreatmentSessionChange com
editor; não se atribui silenciosamente a edição ao autor original. Em FECHADO/ENVIADO,
conserva snapshot/valor/consumo e marca adjustmentPending, com histórico administrativo.

revalidateProductionTx é o ponto para futuros seletores de guia/lote: trava e relê a
sessão/produção, vigência, regra e saldo, creditando somente o consumo original ao testar
o próprio item. Não consome novamente nem recalcula o preço histórico. Para vários itens,
o consumidor deve ordenar pacientes/sessões antes de obter as travas e fechar na mesma
transação. Não confundir FECHADO com recebível: faturamento nasce no envio (#96).

Migração aditiva 20261015140000_administrativo_producao. Recuperação inclui ProductionItem,
ProductionChange, FKs, índices, funções/triggers e autores, com história na mesma transação.
Ambas entram na limpeza manual dependente de paciente; sem expurgo automático. Usuários
com ProductionChange não podem ser excluídos. Ver evidencias/99-producao.md.

## Relatórios operacionais (#100)

Administrativo → Relatórios oferece produção por execução, pendências com motivo e
saldo por item autorizado. Todos exigem `administrativo:ler` (os três perfis), inclusive
CSV e impressão. O mesmo parser estrito rejeita filtros desconhecidos, repetidos,
incompatíveis, datas inválidas e períodos invertidos antes de consultar o banco.
Busca por nomes via Server Action; URLs guardam apenas IDs, datas, estado e página.

`readAdministrativeReport` usa uma transação PostgreSQL RepeatableRead para contagem,
totais, rótulos e itens. Produção considera `executionOn` civil inclusiva em São Paulo;
autorização considera interseção da vigência, com saldo **atual de todos os movimentos**,
sem corte histórico. Uma soma lateral por item agrega consumo e devoluções antes dos
joins. Valores somam em numeric do PostgreSQL, retornam texto e viram bigint no JS.
Unidades/totais ficam separados por contrato, procedimento, profissional e estado.
PENDENTE/INVALIDADO não contribuem com valor histórico residual. APTO/FECHADO/ENVIADO
mantêm valor conferido do snapshot; pendências atuais aparecem separadamente. Isto não
substitui a revalidação transacional ao fechar guia, nem representa receita recebida.

A tela pagina 20 itens e totaliza o filtro completo. CSV e impressão leem tudo em uma
nova posição consistente, sem herdar a página. Alterações entre solicitações podem
mudar o resultado, por isso cada saída declara seu horário de geração. `maxExportRows`
é aplicado ao total integral usando o menor limite entre os contratos participantes
(padrão 10.000 se vazio). Excesso recusa explicitamente, sem exportar parte dos dados.
CSV usa UTF-8/BOM, ponto e vírgula, CRLF, aspas/escape e neutralização de fórmulas em
texto. Centavos são inteiros explícitos; importe códigos como texto na planilha para
preservar zeros. Downloads autenticados usam private/no-store e nome fixo sem paciente.

Impressão própria traz eixo, filtros, horário, completude, totais e itens; CSS A4
paisagem, cabeçalho de tabela repetido, quebra de texto e linhas preservadas. PDF é a
função nativa do navegador, sem biblioteca/XLSX. Saldo disponível é aritmético:
autorização vencida/inativa não permite consumo, mesmo com saldo nominal positivo.
Nenhuma migração é necessária. Evidências: `docs/project/evidencias/100-relatorios.md`.

## Guias SP/SADT (#101)

Administrativo → Guias permite montagem explícita, rascunho, conferência, devolução e
cancelamento. Grupo imutável: cobertura/beneficiário + contrato + autorização (ou dispensa)
+ mês civil de execução em São Paulo. Não existe seleção automática de produção,
solicitação eletrônica, lote ou XML nesta entrega. Não há nova cobrança ou consumo de saldo.

`BillingGuideItem` referencia a produção original; não é uma segunda produção editável.
Índice parcial reserva cada produção em uma única guia ativa. Remover/cancelar libera a
associação, preservando o vínculo anterior inativo. Quantidade/preço vêm do snapshot da
#99, fator 1 nesta V1, e total é bigint em centavos. Sem fatores/ajustes adicionais inferidos.
`GuideSequence` gera número por contrato atomicamente no PostgreSQL; cancelamento não
reutiliza número. Perfil/contador sobrevivem à reinicialização manual de pacientes.

ADMIN configura perfil versionado em Configurações → contrato → Perfil de campos da guia:
CNES, hora final real, indicação clínica, múltiplos itens/sessões e listas explícitas de
códigos de caráter/tipo/regime/acidente. Sem códigos ou perfil, a conferência informa
pendência por campo; não preenche ND nem presume código da operadora. Campos estruturais
inválidos são recusados antes da transação; dados faltantes persistem como pendências no
rascunho. Aptidão administrativa não declara homologação de manual/XSD (#103/#106).

Leitura usa administrativo:ler; montagem/conferência/devolução/cancelamento, preparar.
Perfil é exclusivo de configurar (ADMIN). Indicação clínica mínima é digitada e confirmada
somente sob clinico:gerir (ADMIN/Fisioterapeuta); não deriva do prontuário. Recepção não
recebe o campo nem histórico clínico. Snapshot administrativo contém somente o hash; a projeção do formulário cliente exclui
snapshots e hashes individuais. O texto original fica na guia e no histórico próprio de versões, com acesso clínico explícito.

Ordem: paciente → trava administrativa comum → sessões ordenadas → guia. Conferência
reutiliza revalidateProductionTx, creditando apenas o consumo já existente. `sourceDigest`
registra versões/valores administrativos e profissionais. `revalidateGuideTx` é o ponto de
integração para #102: precisa rodar na mesma transação do fechamento, sob essas travas.
Em lote, pré-travar todos os pacientes em ordem antes de chamar o helper para cada guia.
A aptidão antiga não autoriza fechar: mudanças nas fontes ou pendências recusam o helper.
Fonte alterada não reescreve snapshot: a tela apresenta pendências atuais e exige devolução
para correção. Guia EM_LOTE é preservada; não há ação pública para entrar/sair de lote aqui.

`GuideChange` guarda autoria, motivo, idempotência e snapshot de guia + todos os vínculos
na mesma transação. O banco exige o histórico diferido, impede edição/remoção do histórico,
mudança de grupo, associação incompatível, aptidão sem dados/totais e alteração de guia em
lote. A preparação da versão dentro da transação pode terminar na mesma versão ainda sem
histórico; uma versão já registrada nunca é sobrescrita. Erros desfazem tudo, inclusive
reservas e contador. Os históricos não usam a retenção de sete dias do AuditLog.

Listas paginam 20 guias; seleção de opções limita 100 com aviso explícito. Candidatos são
filtrados pelo mês da montagem. Novas inclusões podem ser feitas em rascunho após salvar;
cada ação aceita até 1.000 itens e respeita também maxItems do contrato, sem truncar.
Após mais de 20 alterações, a UI mostra as últimas 20; todas permanecem no banco.

Migração aditiva `20261015150000_administrativo_guias`: BillingGuide, BillingGuideItem,
GuideChange, GuideProfile e GuideSequence, com FKs/índices/guards/histórico. As três primeiras
entram na limpeza manual; as duas últimas são preservadas. Exclusão de usuário respeita
GuideChange/GuideProfile. Evidências em docs/project/evidencias/101-guias.md.
## Conciliação de operadoras — ADM-08 (#104)

`/administrativo/conciliacao` lê somente obrigações constituídas no primeiro envio manual.
O PostgreSQL cria `OperatorReceivable` por produção congelada, com lote, guia, contrato,
envio original, valor e data civil. A migração também preenche obrigações de envios
anteriores. Correção de envio, regeneração de XML e reenvio não duplicam a obrigação.

`OperatorSettlement` e `OperatorSettlementLine` são a razão própria, append-only,
com autor autenticado, demonstrativo/protocolo, motivo, data efetiva, instante técnico,
requestId/fingerprint e deltas em centavos bigint. Não criam nem alteram Charge/Payment.
Recebimento exige 100% de alocação explícita em um contrato, admitindo vários lotes.
Sem crédito não alocado/excedente. Limite por registro: menor entre maxItems do contrato
e 1.000 alocações novas; dividir é explícito, sem truncamento. Substituição pode ainda
incluir as inversões correspondentes ao recebimento original.

Cada centavo pertence a uma classe: `faturado original + ajustes = recebido válido +
aberto + glosa em análise + baixa definitiva`. Glosa tem linha original/código do
demonstrativo; revisões apontam para essa origem. Receber da glosa reduz análise e
acrescenta recebido na mesma transação. Baixa exige decisão/motivo; reabrir transfere
baixa para análise; liberar transfere análise para aberto. O estado exibido é derivado:
EM_ANALISE se ainda houver análise, DEFINITIVA se restar só baixa e REVERTIDA se nenhuma
das duas parcelas restar. Parciais mostram os dois valores além do estado.

Estorno integral inverte somente as alocações novas do recebimento referenciado,
restaurando inclusive a origem de glosa quando aplicável. Substituição grava inversão
e novas alocações atomicamente, preservando originais; estornar o substituto não reativa
o anterior. Revisões posteriores incompatíveis precisam ser revistas antes de estornar.
Data efetiva não é futura nem anterior ao envio/origem; estorno/substituição não antecede
o recebimento original. A posição é atual, não uma reconstrução histórica de corte.

Ajuste explícito altera somente faturado líquido e exige referência/motivo. Não altera
lote, snapshot, XML ou envio, nem representa pagamento ou nova cobrança de paciente.
Redução não pode consumir valores já classificados; acréscimo fica aberto. Sem integração
bancária, devolução bancária, importação de demonstrativo ou recurso eletrônico.

Operações serializam por contrato (unidade que contém os saldos de recebimento/item/glosa).
Triggers validam formas, origens, inversões exatas, integralidade e saldos no commit,
inclusive em SQL direto. Linhas entram somente na transação do cabeçalho; nenhuma linha
posterior pode reescrever um evento confirmado. O gate diferido executa uma vez por evento.
Leitura exige administrativo:ler; somente ADMIN com administrativo:conciliar escreve.
Consultas projetam identificação operacional e valores, sem prontuário/indicação clínica.
Itens, glosas e histórico têm páginas próprias; totais usam todos os itens do filtro.
O histórico abrange o contrato e explica essa abrangência quando há filtro por lote.
## Relatórios financeiros de operadoras — ADM-09 (#105)

Os cinco relatórios administrativos compartilham navegação e saídas: produção,
pendências, autorizações (#100), faturamento e acompanhamento financeiro (#105).
`/administrativo/relatorios/faturamento` tem uma linha por lote inteiro fechado/enviado;
`/administrativo/relatorios/conciliacao` tem uma linha por obrigação de item enviado,
com vínculos para lote, guia, produção e conciliação. Agregados são por operadora/contrato.
Não existe nova tabela de saldo, migração ou escrita financeira nesta entrega.

Faturamento admite fechamento civil em São Paulo ou primeiro envio. Fechado é preparado:
valor original do lote não é faturado; somente obrigações da #104 entram no faturado.
O valor do lote e o faturado são medidas distintas, nunca somadas entre si. Correções
de envio não mudam a competência imutável da obrigação original.

Acompanhamento admite execução, fechamento, envio, recebimento válido ou glosa original.
Datas inicial/final são inclusivas. Os três primeiros eixos selecionam pela data do
item/lote. Recebimento seleciona itens com alguma alocação atualmente válida no período
(original estornado/substituído não seleciona); glosa seleciona pela data efetiva do
registro original, inclusive quando paga/liberada/baixada depois. Primeira/última data
mostram as ocorrências que selecionaram o item; não são datas de corte do saldo.

Todos os saldos mostram a posição atual completa **do mesmo conjunto de itens**, com
movimentos de todas as datas. No eixo recebimento, a coluna adicional de recebimentos
válidos no período é separada do recebido atual dos itens. No eixo glosa, a coluna de
glosa original no período é medida de origem, não saldo. Nenhuma é somada às classes
da equação `faturado original + ajustes = recebido + aberto + análise + baixa definitiva`.
Exemplo: um item de R$100 com recebimentos de R$30 em fevereiro/R$30 em março e glosa
de R$20 em abril aparece no recorte de recebimento de fevereiro com período R$30,
recebido atual R$60, análise R$20 e aberto R$20, reconciliando os mesmos R$100.

Movimentos são agregados por obrigação antes de juntar lote/guia. Uma remessa com
várias alocações contribui somente por suas parcelas; cabeçalho não multiplica valores.
RepeatableRead reúne contagem, totais, linhas e rótulos no mesmo snapshot. Tela tem
páginas de 20; CSV UTF-8/BOM e impressão/PDF nativo representam todas as linhas do filtro,
sob o menor maxExportRows dos contratos participantes. Excesso recusa integralmente,
sem truncar. Campos textuais reutilizam proteção contra fórmulas da #100.

Páginas, seletores, CSV e impressão exigem administrativo:ler antes de consultar.
ADMIN, RECEPCAO e FISIOTERAPEUTA leem conforme matriz ratificada da #96. Não há indicação
clínica/prontuário/senha/carteira nas projeções. CSV tem private/no-store/nosniff; impressão
é dinâmica. Filtros inválidos têm erro explícito; vazio tem cabeçalho/metadados sem
inventar obrigações; cadastros inativos permanecem no histórico. Cada saída é nova
consulta com horário próprio, não posição histórica congelada, contabilidade ou caixa
consolidado com pacientes. XLSX, DRE e painéis preditivos seguem fora do escopo.
