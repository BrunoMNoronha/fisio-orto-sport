# Módulo administrativo — contratos, permissões e decisões (ADM-00, #96)

## Estado e fontes

**Levantamento documental de 14/10/2026, com pendências catalogadas.** Issue:
[#96](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/96), filha do épico
[#95](https://github.com/BrunoMNoronha/fisio-orto-sport/issues/95). Este documento não
cria migração, código, permissão ou integração. Nenhuma decisão de negócio foi tomada
nesta rodada: Bruno informou em 14/10/2026 que **ainda não há decisões** a registrar
como confirmadas. Por isso, tudo o que depende da clínica ou da operadora aparece como
**DECISÃO PENDENTE** ou **RECOMENDAÇÃO**, nunca como valor padrão.

Baseline: `main` em `4f35fdb` (FIN-03 integrada pela
[PR #94](https://github.com/BrunoMNoronha/fisio-orto-sport/pull/94)); #85–#88 encerradas
no GitHub. Isso não comprova publicação nem migrações em Production. Fontes lidas:
`prisma/schema.prisma`, `src/modules/auth/permissions.ts`,
[módulo financeiro](../../src/modules/financeiro/README.md),
[financeiro e integrações](16-financeiro-integracoes.md),
[fluxo e permissões](05-fluxo-permissoes.md),
[retenção e recuperação](15-retencao-rastreabilidade-recuperacao.md),
[stack](13-stack-infraestrutura.md), [pipeline](pipeline-deploy.md),
[evidência da #85](evidencias/85-plano-saude.md) e o
[backlog administrativo](administrativo-backlog.json).

O XML anexado ao pedido é apenas referência de formato. Nenhum identificador, nome,
código, valor ou hash dele foi copiado para este documento ou para as fixtures.

## Inventário do baseline relevante

| Área | O que existe em `4f35fdb` | Consequência para o administrativo |
|---|---|---|
| Plano de saúde do paciente | `Patient.healthInsuranceProvider`, `healthInsurancePlan`, `healthInsuranceCard` e `healthInsuranceValidUntil`: texto livre/data opcional, **sem histórico** nem catálogo (#85) | Não serve como cobertura faturável. ADM-02 cria cobertura histórica própria; o legado não é convertido automaticamente |
| Sessão clínica | `TreatmentSession` com `occurredAt` (instante), profissional, snapshots de nome/CREFITO, `VALIDO`/`INVALIDADO`, vínculo opcional à agenda | Origem da produção (ADM-03). Contém evolução clínica: a projeção administrativa seleciona só campos não clínicos |
| Agenda | `Appointment.attendance` (`COMPARECEU`, faltas) | Presença **não** é produção nem gera cobrança |
| Plano terapêutico | `TherapyPlan`/revisões com quantidade prevista | Quantidade prevista **não** é autorização nem saldo |
| Profissional | `User.name`, `User.crefito` (sem UF do conselho, sem CBO) | Cadastro faturável do executante é decisão D-03; CREFITO atual não basta por suposição |
| Clínica | `ClinicSettings.legalName`, `cnpj`; **sem CNES** nem código na operadora | Identificação do contratado depende de D-01/D-03 |
| Financeiro do paciente | `Charge`, `Payment`, `PaymentReversal`: centavos inteiros, saldo derivado, imutáveis, idempotência `requestId`/fingerprint, trava `FOR UPDATE` | Padrão a reutilizar; **não** reutilizar `Charge` para operadora |
| Permissões | `financeiro:*` igual nos três perfis; `clinico:*` sem Recepção; teste RECEPCAO ⊆ FISIOTERAPEUTA | Novo domínio precisa de permissões próprias (D-10) |
| Auditoria | `AuditLog` com expurgo de sete dias | Não serve como histórico administrativo |
| Armazenamento | Somente PostgreSQL no Neon (PITR 6 h, sem snapshots, sem cópia externa — risco aceito B4/B5) e Vercel; nenhum object storage | Persistência do XML é decisão D-11 |
| Exportação | Não há CSV nem impressão de relatórios financeiros | ADM-04 cria a infraestrutura comum |

## Matriz de decisões pendentes

Responsável por todas: **Bruno M Noronha** (decisor de escopo e políticas de dados,
ver [responsáveis](04-responsaveis.md)). Registradas em 14/10/2026; **data de decisão TBD**,
sem prazo prometido. "Bloqueia" indica o primeiro ponto em que a issue não pode avançar
sem a decisão; trabalho independente da decisão pode seguir.

| ID | Decisão | Impacto | Bloqueia | Recomendação técnica |
|---|---|---|---|---|
| D-01 | Operadora(s) piloto: registro ANS, código do prestador na operadora, contrato, canal de envio | Cadastro real, identificação do contratado, homologação | Carga real em #97; homologação em #103/#106 (M2/M4) | Começar com **uma** operadora piloto; modelo genérico multioperadora desde #97 |
| D-02 | Versão TISS aceita pela operadora piloto, manual próprio e canal de homologação | Estrutura do XML, campos condicionais, hash | #103 inteira; campos condicionais de #101 | Obter XSD oficial da ANS e manual da operadora, registrando data/origem. **Não** adotar a versão do anexo por padrão |
| D-03 | Identificação faturável: CNES (se exigido), dados do executante (conselho, número, UF, CBO) e do solicitante | Cadastros e snapshots da guia | #97 passo 5; #101 | Cadastro faturável separado do usuário, com snapshot na guia |
| D-04 | Autorização: quais procedimentos exigem; registrar pedidos pendentes/negados?; validade pela data de execução; consumo por unidade; senha/número da operadora | Estados, saldo, alertas | #98; consumo em #99 | Registrar só autorizações recebidas na V1 (sem pedido eletrônico); validade avaliada na data civil de execução; consumo por unidade do procedimento |
| D-05 | Procedimentos: tabela (TUSS ou própria da operadora), códigos, unidade de quantidade por sessão, vários procedimentos por sessão | Catálogo e item de produção | #97 (catálogo); #99 | Código como texto; quantidade inteira positiva por item; vários itens por sessão permitidos se a operadora aceitar |
| D-06 | Agrupamento e numeração: guia por beneficiário/autorização/período; numeração de guia e lote; limite de guias por lote | Montagem de guia e lote | #101; #102 | Uma guia por autorização (ou por beneficiário quando não houver), numeração sequencial por contrato gerada no banco |
| D-07 | Preços: valores por procedimento e vigência; precisão (2 ou mais casas); regra de arredondamento | Valores de item, guia e lote | #97 (tarifas); #99 | Centavos inteiros se a tabela da operadora usar 2 casas; se usar mais, inteiro em escala fixa e arredondamento por item definido no manual |
| D-08 | Competências: produção pela execução, faturamento pelo fechamento/envio, recebimento pela data efetiva | Filtros e totais de relatórios | #100; #105 | Três eixos separados, sempre rotulados (ver contratos abaixo) |
| D-09 | Glosas: motivos (tabela da operadora/TISS), quando a glosa é definitiva, reapresentação manual na V1 | Classificação e relatórios | #104; #105 | Glosa nasce em análise; definitiva exige motivo e ato explícito. Recurso eletrônico fora da V1 |
| D-10 | Matriz de acesso `administrativo:*` e manutenção ou quebra de RECEPCAO ⊆ FISIOTERAPEUTA | Toda leitura/escrita do módulo | **Qualquer escrita** a partir de #97 (M1) | Proposta abaixo; `permissions.ts` só muda após ratificação |
| D-11 | Persistência dos bytes do XML, backup e restauração | Arquitetura de #103 e recuperação | #103; ensaio de #106 | Opção A abaixo (PostgreSQL), após estimar volume (D-12) |
| D-12 | Volumes esperados: atendimentos por convênio/mês, guias por lote, tamanho de exportações | Limites, índices, custo de armazenamento | Dimensionamento de #100, #103 | Medir com a operadora piloto; até lá, tetos técnicos explícitos e configuráveis |
| D-13 | Correções após fechamento e após envio: cancelar lote antes do envio; após envio, apenas glosa/novo lote? | Transições de lote e guia | #102; #104 | Lote fechado e não enviado pode ser cancelado com motivo; enviado nunca é alterado nem cancelado |
| D-14 | Participação do paciente (coparticipação/particular) no mesmo atendimento | Separação de pagadores | #104 | Operadora é a única pagadora do item administrativo; parte do paciente segue como cobrança manual do financeiro atual |

Sem D-01 e D-02 é possível modelar, testar com fixtures e gerar XML de teste, mas
**não** é possível declarar XML homologado nem concluir #103/#106.

## Fluxo e estados propostos

Fluxo: `cobertura → autorização → sessão clínica válida → item de produção conferido →
guia → lote fechado → arquivo XML validado → envio manual registrado → recebimento/glosa`.
Cada seta é um ato explícito de um usuário autorizado; nenhuma etapa nasce sozinha de
agenda, presença, plano terapêutico ou sessão.

Estados persistidos são separados de situações derivadas (calculadas na leitura, como o
saldo financeiro atual). Toda transição grava autor da sessão, instante técnico e motivo
quando for correção; registros fechados não são editados nem excluídos.

| Entidade (issue) | Estados persistidos | Transições permitidas | Derivados |
|---|---|---|---|
| Cobertura do beneficiário (#98) | `ATIVA`, `ENCERRADA` | `ATIVA → ENCERRADA` com data e motivo; correção = encerrar e criar nova, com vínculo | Vigente na data X (pelo intervalo de vigência) |
| Autorização (#98) | `AUTORIZADA`, `CANCELADA` (+ `PENDENTE`/`NEGADA` só se D-04 aprovar) | `AUTORIZADA → CANCELADA` só sem consumo válido; correção por substituição vinculada | Vencida (pela validade e data de execução); saldo = autorizado − consumos válidos |
| Item de produção (#99) | `PENDENTE`, `APTO`, `INVALIDADO`, `FATURADO` | `PENDENTE ⇄ APTO` (conferência/devolução); `PENDENTE/APTO → INVALIDADO` com motivo; `APTO → FATURADO` só no fechamento do lote | Motivos de pendência; consumo da autorização vale enquanto `APTO`/`FATURADO` |
| Guia SP/SADT (#101) | `RASCUNHO`, `APTA`, `EM_LOTE`, `CANCELADA` | `RASCUNHO ⇄ APTA`; `RASCUNHO/APTA → CANCELADA` libera itens; `APTA → EM_LOTE` no fechamento; `EM_LOTE → APTA` só por cancelamento do lote não enviado | Pendências por campo |
| Lote (#102) | `ABERTO`, `FECHADO`, `ENVIADO`, `CANCELADO` | `ABERTO → FECHADO` atômico com revalidação; `FECHADO → ENVIADO` por registro manual com data e protocolo; `ABERTO/FECHADO → CANCELADO` com motivo (D-13) | Arquivo gerado (existe artefato válido); totais |
| Arquivo XML (#103) | Artefato imutável `VALIDADO` | Só nasce após XSD e regras aprovados; regeneração cria nova versão ligada ao mesmo snapshot, marcando a anterior como substituída | Vigente = última versão não substituída |
| Envio (#102) | Evento imutável (data civil, protocolo, canal, autor) | Correção de registro = evento de correção vinculado | Lote enviado |
| Recebimento de operadora (#104) | Registro imutável + alocações por item; estorno imutável | Estorno recompõe só as alocações daquele recebimento; correção = estorno + substituto vinculado | Recebido válido por item |
| Glosa (#104) | `EM_ANALISE`, `DEFINITIVA`, `REVERTIDA` | `EM_ANALISE → DEFINITIVA` com motivo; `EM_ANALISE → REVERTIDA` (pagamento posterior ou erro); definitiva só muda por evento de revisão vinculado | Glosa em análise e baixa definitiva por item |

Recurso eletrônico de glosa, envio e autorização automáticos e importação de retorno
ficam fora da V1. Reapresentação manual depende de D-09/D-13.

## Invariantes monetárias e quantitativas

1. **Exatidão:** valores em inteiros (centavos ou escala fixa de D-07), somas em `bigint`,
   nenhuma aritmética monetária em ponto flutuante; formatação só na borda.
2. **Item faturado uma vez:** um item de produção pertence a no máximo uma guia não
   cancelada e uma guia a no máximo um lote não cancelado. Garantido por unicidade
   parcial no banco, não só no serviço.
3. **Consumo único:** consumos válidos de uma autorização nunca excedem a quantidade
   autorizada por procedimento; o mesmo item não consome duas vezes.
4. **Conciliação por item:**
   `faturado líquido = recebido válido + aberto + glosa em análise + baixa definitiva`,
   com `aberto ≥ 0` e cada centavo em exatamente uma classificação.
5. **Excedente recusado:** recebimento ou glosa acima do aberto do item é recusado; valor
   recebido sem item correspondente fica como saldo não alocado explícito, nunca como
   crédito do paciente (tratamento final em #104).
6. **Snapshot:** preço, cobertura, autorização, beneficiário e profissional usados na guia
   ficam copiados no fechamento; edições cadastrais posteriores não mudam histórico.
7. **Pagadores separados:** nada do administrativo cria `Charge`, `Payment` ou saldo do
   paciente, e o financeiro do paciente não entra nos totais da operadora (D-14).
8. **Datas:** data civil (`@db.Date`, `America/Sao_Paulo`) separada do instante técnico.
   A data de execução do item deriva de `TreatmentSession.occurredAt` convertido para
   `America/Sao_Paulo`, e fica gravada no item.

### Exemplos sintéticos

Cenário S1 (todos os dados fictícios): autorização `AUT-SINT-0001` com 10 unidades do
procedimento `PROC-SINT-01`, tarifa sintética de R$ 52,37 por unidade (centavos
ímpares de propósito).

| Passo | Operação | Resultado esperado |
|---|---|---|
| 1 | 10 sessões válidas conferidas como 10 itens `APTO` | Consumo 10/10; produção 10 × 5.237 = **52.370 centavos** |
| 2 | 11ª sessão válida do mesmo procedimento | Sessão clínica registrada normalmente; item fica `PENDENTE` por "autorização sem saldo" |
| 3 | Guia `RASCUNHO → APTA` e lote fechado | Itens `FATURADO`; total do lote R$ 523,70 |
| 4 | **Parcial:** operadora paga R$ 418,96 alocados aos itens 1–8 | Recebido 418,96; aberto 104,74 |
| 5 | Glosa em análise do item 9 (52,37) e definitiva do item 10 (52,37, com motivo) | 523,70 = 418,96 + 0,00 + 52,37 + 52,37 |
| 6 | Pagamento posterior de R$ 40,00 no item 9 e glosa revisada para 12,37 definitiva | Item 9: 40,00 + 12,37 = 52,37; glosa em análise zera |
| 7 | **Correção:** o recebimento do passo 4 foi lançado errado; estorno + substituto de R$ 418,95 | Estorno recompõe 418,96 em aberto nos itens 1–8; substituto aloca 418,95; aberto 0,01 permanece visível |
| 8 | Sessão do item 3 invalidada clinicamente após o fechamento | Item continua `FATURADO`; abre pendência de ajuste; nada é alterado no lote enviado |

### Concorrência

| Disputa | Resultado esperado | Barreira |
|---|---|---|
| Dois usuários conferem itens que consomem a última unidade da autorização | Um conclui; o outro recebe mensagem e o item fica `PENDENTE` | Trava da autorização na transação + guard SQL de saldo |
| Mesmo item incluído em duas guias abertas | Uma inclusão; a outra é recusada | Unicidade parcial do vínculo item–guia ativa |
| Fechamento do lote enquanto um item é invalidado | O fechamento revalida sob trava; se algum item deixou de ser válido, é recusado por inteiro com a lista de pendências | Ordem única de travas definida em #99, reutilizada em #102 pela invalidação clínica e pelo fechamento, com corrida real testada |
| Geração de XML duplicada (duplo clique ou duas abas) | Um artefato por versão do snapshot | Trava do lote + unicidade (lote, versão) + idempotência |
| Dois recebimentos alocam o mesmo aberto | Soma nunca supera o aberto; o segundo é recusado se exceder | Trava do item/guia + guard de saldo no banco |
| Reenvio do mesmo formulário | Devolve o registro original; conteúdo divergente é recusado | `requestId` + fingerprint, como na FIN-02 |

## Proposta de matriz de acesso (não ratificada)

**DECISÃO PENDENTE D-10.** `permissions.ts` não muda nesta issue. Proposta a partir das
etapas da #96:

| Permissão proposta | Uso | ADMIN | RECEPCAO | FISIOTERAPEUTA |
|---|---|:-:|:-:|:-:|
| `administrativo:ler` | Consultar cobertura, autorizações, produção, guias, lotes e relatórios operacionais | ✓ | ✓ | ✓ |
| `administrativo:preparar` | Registrar cobertura/autorização, conferir produção, montar guias | ✓ | ✓ | ? |
| `administrativo:configurar` | Operadoras, contratos, procedimentos e preços | ✓ | — | — |
| `administrativo:fechar` | Fechar/cancelar lote, gerar e baixar XML, registrar envio | ✓ | — | — |
| `administrativo:conciliar` | Recebimentos de operadora, glosas e seus relatórios/exportações | ✓ | — | — |

Pontos a ratificar:

- **"Fisioterapeuta confirma execução":** a sessão clínica válida já é a confirmação de
  execução. Se o Fisioterapeuta não receber `administrativo:preparar`, a relação testada
  RECEPCAO ⊆ FISIOTERAPEUTA (#31) deixa de valer e o teste precisa mudar por decisão
  explícita. Opções: (a) Fisioterapeuta também recebe `preparar` (mantém o contrato);
  (b) quebrar a relação apenas para `administrativo:*`. Recomendação técnica: (a).
- **Exportação:** CSV/impressão seguem a permissão de leitura do relatório; relatórios
  de recebimento/glosa por operadora exigem `conciliar`.
- **Separação clínica:** nenhuma permissão `administrativo:*` concede `clinico:*`. A
  projeção de sessões para produção traz só data/hora, profissional, paciente, plano
  terapêutico (identificador) e situação; nunca evolução, técnicas, exercícios,
  observações, diagnóstico ou anamnese.
- Usuários, configurações, auditoria e `financeiro:*` conservam o contrato atual.

## Persistência do XML (D-11)

| Opção | Como funciona | Backup/recuperação | Custo/risco |
|---|---|---|---|
| **A — PostgreSQL (recomendada)** | Tabela de artefato imutável com bytes (`bytea`), tamanho, tipo, SHA-256 de integridade, versão TISS, snapshot do lote, autor e instante | Coberta pelo escopo B1 já decidido (banco completo no Neon) e pela restauração existente; transação única entre estado e bytes | Armazenamento no Neon; exige teto de tamanho por arquivo (D-12) e leitura só no download |
| B — Vercel Blob privado | Bytes no blob, metadados e checksum no banco | **Fora** do escopo B1; exige nova credencial, inventário e procedimento de restauração sincronizado | Consistência entre banco e blob, novo fornecedor/custo |
| C — Regenerar sob demanda | Guardar só snapshot e regenerar | Não preserva os bytes exatos enviados | **Rejeitada:** contraria o requisito de arquivo idêntico |

Em todas: download autenticado por permissão, `Content-Disposition` com nome definido,
`Cache-Control: private, no-store`, sem dados pessoais na URL ou em logs, e checksum
conferido no download e na restauração. O hash exigido pelo TISS é distinto do checksum
de integridade e segue a especificação da versão de D-02.

**Risco a decidir:** com PITR de 6 h e sem snapshots/cópia externa (B4/B5, risco aceito
em 26/09/2026), um arquivo enviado e corrompido ou perdido após seis horas não é
recuperável pelo Neon. Recomenda-se reavaliar B4/B5 antes de enviar lotes reais; esta
issue **não** altera essa decisão. Novas tabelas entram no inventário de exclusão de
usuários, no `db:reset` e na documentação de recuperação; nada herda o expurgo de sete
dias do `AuditLog`. Prazo legal de guarda continua fora do escopo.

## Dicionário de campos

Nomes de elementos XML **não** são fixados aqui: a coluna TISS descreve o conceito, e o
elemento exato vem do XSD da versão D-02. "Novo" indica dado sem origem no baseline.

| Conceito | Origem atual | Entidade proposta (issue) | Uso TISS (conceito) | Relatório | Situação |
|---|---|---|---|---|---|
| Registro ANS da operadora | Novo (o texto livre do paciente não serve) | Operadora (#97) | Cabeçalho e guia | #105 | D-01 |
| Código do prestador na operadora | Novo | Contrato do prestador (#97) | Identificação do contratado | — | D-01 |
| CNPJ e razão social da clínica | `ClinicSettings.cnpj`, `legalName` | Snapshot no lote/guia (#101/#102) | Contratado, conforme perfil | Cabeçalho de impressão | Existe; uso depende de D-01 |
| CNES | Novo | Identificação faturável (#97) | Contratado executante | — | D-03 |
| Executante: nome, conselho, número, UF, CBO | `User.name`, `User.crefito`; snapshots da sessão (sem UF/CBO) | Cadastro faturável do profissional (#97) + snapshot na guia | Profissional executante | Produção por profissional (#100) | D-03 |
| Solicitante | Novo | Guia (#101) | Dados do solicitante | — | D-03 |
| Carteira do beneficiário e validade | `Patient.healthInsuranceCard`/`ValidUntil` (sem histórico) | Cobertura (#98), sem conversão automática | Dados do beneficiário | — | Legado só como referência na tela |
| Nome do beneficiário | `Patient.fullName` | Snapshot na guia (#101) | Dados do beneficiário | Pendências (#100) | Existe |
| Plano/produto do beneficiário | `Patient.healthInsurancePlan` (texto) | Cobertura vinculada ao contrato (#98) | Conforme perfil | — | D-01 |
| Número/senha/datas da autorização | Novo | Autorização (#98) | Dados da autorização | Autorizações (#100) | D-04 |
| Procedimento: tabela, código, descrição | Novo | Catálogo (#97) | Procedimento executado | #100/#105 | D-05 |
| Data de execução | `TreatmentSession.occurredAt` (instante) | Item de produção, data civil + instante (#99) | Data de execução | Eixo de produção | Conversão `America/Sao_Paulo` |
| Quantidade executada | Novo (sessão ≠ unidade) | Item de produção (#99) | Quantidade | #100 | D-05 |
| Valor unitário e total | Novo | Tarifa por vigência + snapshot no item (#97/#99) | Valores do item e da guia | #100/#105 | D-07 |
| Número da guia no prestador | Novo | Guia (#101) | Identificação da guia | #105 | D-06 |
| Número do lote | Novo | Lote (#102) | Cabeçalho do lote | #105 | D-06 |
| Hash da mensagem | Novo | Artefato XML (#103) | Epílogo/hash conforme versão | — | D-02 |
| Data e protocolo de envio | Novo | Evento de envio (#102) | — (envio manual) | Eixo de faturamento | Manual |
| Valor pago, glosa e motivo | Novo | Recebimento, alocação e glosa (#104) | — (retorno não importado na V1) | Eixo de recebimento (#105) | D-09 |

## Contratos de relatórios e exportação

- Três eixos temporais nunca misturados no mesmo total: **produção** (data de execução),
  **faturamento** (fechamento/envio do lote) e **recebimento/glosa** (data efetiva do
  registro). Cada relatório declara o eixo usado. Produção não é receita, e recebido de
  operadora não é receita contábil.
- Totais de todo o filtro, lidos no mesmo snapshot `REPEATABLE READ` dos itens,
  como na FIN-03. Unidades de procedimentos diferentes não são somadas.
- CSV UTF-8 do filtro inteiro, com escaping e neutralização de fórmulas; teto explícito com
  recusa clara em vez de truncamento silencioso (teto em D-12). Impressão pelo
  navegador com filtros, data de geração e totais; sem gerador PDF no servidor.

## Fixtures sintéticas

Regras para testes, seed e evidências de todas as filhas:

- Identificadores com prefixo `SINT`/`TESTE` e formatos que não colidam com registros
  reais (ex.: operadora `OPERADORA SINTÉTICA A`, carteira `SINT-0000001`, procedimento
  `PROC-SINT-01`, guia `G-SINT-0001`). Nenhum código TUSS, registro ANS ou CNES real é
  usado como dado de teste, salvo exemplos publicados no material oficial da ANS e
  identificados como tal.
- CPF ausente ou gerado como inválido; nomes de pacientes e profissionais fictícios.
- Valores com centavos ímpares e totais acima de `Int32` para provar exatidão.
- O anexo real e qualquer retorno real de operadora nunca entram em issue, fixture,
  commit, log ou evidência.

## Compatibilidade com o baseline

| Contrato existente | Como o administrativo o preserva |
|---|---|
| Sessões e presença não geram cobrança (#85–#88) | Item de produção nasce só por conferência explícita |
| Financeiro do paciente (`financeiro:*`, `Charge`/`Payment`) | Domínio próprio para operadora; sem escrita nas tabelas financeiras atuais |
| Imutabilidade, idempotência e travas da FIN-02 | Mesmos padrões: triggers de imutabilidade, `requestId` + fingerprint, `FOR UPDATE` em `READ COMMITTED` para escritas e `REPEATABLE READ` para leituras |
| Recepção sem conteúdo clínico | Projeção administrativa mínima e testes de negação |
| Inativação do paciente não apaga histórico | Coberturas, guias e recebimentos continuam consultáveis com paciente inativo |
| Migrações aditivas e FKs `Restrict` | Novas tabelas sem alterar dados existentes; autores entram na exclusão de usuários |
| Pipeline `main` → PR `production` → Preview → liberação manual | Inalterada; homologação de XML não substitui a liberação manual |
| Next.js da versão instalada | Código das filhas só após ler `node_modules/next/dist/docs/` (ausente nesta rodada documental) |

## Critérios de início por issue

| Issue | Pode começar quando |
|---|---|
| #97 ADM-01 | D-10 ratificada (escrita); D-05/D-07 para carga real. Modelagem e migração podem usar fixtures |
| #98 ADM-02 | #97 integrada; D-04 |
| #99 ADM-03 | #98 integrada; D-04, D-05 e a ordem de travas desta seção |
| #100 ADM-04 | #99 integrada; D-08; teto provisório de exportação |
| #101 ADM-05 | #99 integrada; D-03, D-06 e campos condicionais de D-02 |
| #102 ADM-06 | #101 integrada; D-06, D-13 |
| #103 ADM-07 | #102 integrada; **D-02 e D-11 decididas** |
| #104 ADM-08 | #102 e #103 integradas; D-09, D-14 |
| #105 ADM-09 | #100 e #104 integradas; D-08 |
| #106 ADM-10 | Todas as anteriores; D-01 e canal de homologação disponível |

Cada PR filha cita no corpo as decisões que usou e confirma que estão registradas aqui.

## Aceite da #96 nesta rodada

| Critério | Situação |
|---|---|
| Decisões pendentes com responsável, impacto e marco bloqueado; ao menos um perfil de operadora antes da homologação | **Parcial:** matriz D-01–D-14 completa; **nenhum perfil de operadora definido** |
| Matriz de acesso ratificada antes de escrita; Recepção sem clínico | **Pendente:** proposta registrada, ratificação de Bruno pendente (D-10) |
| Fluxo e invariantes com exemplos de parcial, correção e concorrência | **Atendido** neste documento (revisão de mesa do cenário S1) |
| Persistência e recuperação do arquivo registradas; sem segredos/anexo no GitHub | **Parcial:** opções e recomendação registradas; decisão D-11 pendente; nenhum dado do anexo publicado |

A #96 permanece aberta até D-01, D-10 e D-11 serem decididas e registradas aqui.
Revisão de mesa: o cenário S1 foi percorrido contra os estados e invariantes acima,
conferindo a soma de cada passo; comparação com schema, guards, financeiro, auditoria
e pipeline está na seção de compatibilidade. Nenhum teste automatizado se aplica a esta
entrega documental.
