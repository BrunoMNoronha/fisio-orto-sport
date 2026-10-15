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
