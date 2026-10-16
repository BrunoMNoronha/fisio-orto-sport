# Capacidade administrativa — ADM-11 (#131)

Complementa os contratos da #96 e a validação #106. Homologação externa permanece
pendente; não há transmissão à operadora nem liberação de Production neste ensaio.
Os limites continuam parametrizados por contrato: 100 guias, 1.000 itens, XML de
2.097.152 bytes e 10.000 linhas por CSV/impressão. Quantidade executada é diferente
de número de itens: cada item da massa executa duas unidades de R$50.

## Reproduzir

Pré-requisitos locais iguais à #106: Node/pnpm do projeto, dependências congeladas,
Docker com PostgreSQL 18 no container `fisio-adm99-test`, usuário `fisio`, porta 55499
e POSTGRES_PASSWORD configurada internamente. Os executores forçam DATABASE_URL e
DATABASE_URL_UNPOOLED para o banco local novo, sobrepondo URLs herdadas ou de .env;
não aceitam banco remoto. Não imprimem a senha; evidências são exclusivamente sintéticas.

```powershell
# Um lote de 100 guias / 1.000 itens para medição rápida
node scripts/administrativo/capacity-local.mjs 1

# Matriz completa: dez lotes, cada um de contrato independente, 10.000 itens enviados
node scripts/administrativo/capacity-local.mjs 10

# Usar a pasta exibida pelo comando anterior
node scripts/administrativo/capacity-verify-local.mjs release/131-<timestamp>

# Fronteiras de lote: 101 guias e 1.001 itens, mantendo fontes aptas após recusa
node scripts/administrativo/capacity-verify-local.mjs release/131-<timestamp> boundaries
```

Cada execução cria banco novo `fisio_adm131_<timestamp>`; não sobrescreve nem limpa
banco anterior. A migração aplica o histórico existente apenas nesse banco local.
Não há nova migração/schema nesta entrega. Autorização para migrações em Preview foi
registrada pelo solicitante; qualquer publicação segue o fluxo de release com checks.

A fixture #106 agora aceita quantidade de itens por guia (1–10), mantendo o padrão
anterior de um item. Toda a massa percorre serviços reais: consumo de autorização,
produção, guia, fechamento, XML/XSD, registro simulado de envio e conciliação.
Não desabilita trigger, FK, histórico, autorização ou transação para acelerar a massa.
O modo PRODUCAO do perfil é fictício e exclusivo desse banco descartável.

O verificador exige os 10.000 itens antes de começar. Confere produção ENVIADO e
acompanhamento financeiro, CSV completo, totais integrais e última página. Essa é a
mesma fonte `mode=all` usada pela impressão; não demonstra paginação física de PDF.
Faturamento tem grão de lote: são dez linhas representando os mesmos 10.000 itens,
não 10.000 linhas de lote. A conferência de lote também lê os 1.000 itens congelados.

Depois da exportação completa, cria mais um item/guia/lote por serviços reais para
conferir a recusa de **10.001 itens**, sem saída parcial e mantendo paginação de tela.
Resultados individuais são gravados antes das etapas seguintes; não repetir esse
verificador num banco já alterado por ele. Em falha, preservar evidências e investigar
o estágio antes de iniciar outro ensaio em banco novo.

O modo `boundaries` prepara fontes reais aptas para 101 guias e, separadamente, 100
guias/1.001 itens. A configuração mantém seus defaults. A montagem é recusada antes
de criar lote/histórico/arquivo/envio/obrigação; todas as guias e produções da tentativa
permanecem aptas. Essas fontes não são marcadas como enviadas para compor a exportação.

## XML no teto

Fixture separada em memória monta 100 guias/1.000 itens com campos dentro dos comprimentos
do XSD. Caracteres CR escapados aumentam os bytes sem aumentar indevidamente o número
de caracteres decodificados. Uma busca encontra XML entre 99% e 100% de 2 MiB; os bytes
aceitos passam no validador XSD real. Um incremento é recusado pelo serializador.

O cenário PostgreSQL reduz o limite atual do contrato para um byte abaixo do artefato
real de um lote já enviado. Uma nova geração deve falhar antes de persistir; contagens
de artefatos/envios e bytes originais permanecem iguais. O limite é restaurado pela
operação de configuração versionada. Isso separa o teste de bytes/XSD no teto técnico
do teste de atomicidade/preservação na persistência real, sem alterar snapshot fechado.

## Otimização e invariantes

O baseline completo de 1.000 itens revelou muitas consultas repetidas durante fechamento.
`lockBatchContext` agora bloqueia IDs de cada entidade em uma consulta ordenada por
`COLLATE C`, mantendo paciente → configuração → sessão → guia → produção → lote.
Nenhuma entidade selecionada deixa de ser bloqueada.

A fase exclusivamente de leitura da revalidação usa memoização por modelo, método e
argumentos exatos para cadastros, cobertura, regra e saldo de autorização já protegidos
pelas travas. O escopo termina antes de gravar estados/snapshots; cada chamada cria um
cache novo, limitado a 10.000 chaves, inclusive em erro. Escritas nos delegates cacheados
são recusadas dentro dessa fase. Consultas brutas/travas e leituras de produção/guia
continuam chegando ao banco. Não há cache entre requisições/transações e nenhum saldo
é reaproveitado durante consumo, devolução ou escrita de conciliação.

Mesma revalidação, mesmos snapshots/digests, mesmos históricos e centavos; timeout de
fechamento permanece 60 s. As regressões incluem alteração clínica/cadastral concorrente,
fechamento concorrente, replay e falha intermediária com rollback integral.

## Limites da evidência

Ambiente local e massa fictícia, sem SLA ou extrapolação para Vercel/Neon/Production.
Registrar carga concorrente, SHA, árvore modificada, parâmetros, consultas, tempos e
hashes dos CSV/XML. O preparo de 10.000 itens é um ensaio longo e explícito, separado
do CI normal. O CI exercita os mesmos verificadores com massa pequena, além do XML
grande real e da regressão completa. Não se muda a política de PITR/cópia externa,
não se declara homologação de operadora e não se encerra esse gate da #106/#95.
