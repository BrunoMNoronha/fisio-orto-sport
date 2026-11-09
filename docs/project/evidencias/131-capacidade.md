# ADM-11 (#131) — capacidade nos limites contratuais

Execução em 15/10/2026, branch `codex/adm11-capacidade`, baseada em `1307d87`
(main com #106). Implementação final medida no SHA
`4363ff1c0c3247f376677e72bfd2a0d6fe82e12b`, com árvore limpa no início do ensaio final.
Ambiente: Windows, Node 24.20.0, PostgreSQL 18 local no container de testes.
Issue: https://github.com/BrunoMNoronha/fisio-orto-sport/issues/131.

## Resultado

| Cenário | Resultado comprovado |
|---|---|
| 100 guias / 1.000 itens | Dez lotes completos pelos serviços reais; mais um lote final no SHA acima |
| Fontes e dinheiro | Produção, guias, lote, XML e obrigações reconciliados; sem Charge/Payment de paciente |
| 10.000 itens enviados | CSV de produção e conciliação completos; última página e totais integrais iguais |
| Fonte de impressão | `mode=all`, o mesmo leitor usado pela impressão, retorna todos os 10.000 itens |
| Faturamento por lote | Dez linhas de lote representando os mesmos 10.000 itens e valores |
| 10.001 itens | Recusa integral em CSV/fonte de impressão, sem truncamento; tela conserva página de 20 |
| 101 guias | Default de 100 preservado; recusa antes de criar lote, histórico, arquivo, envio ou obrigação |
| 1.001 itens / 100 guias | Default de 1.000 preservado; mesma recusa, fontes permanecem aptas |
| XML próximo a 2 MiB | **2.096.737 bytes**, 415 bytes abaixo do teto, aprovado no XSD real |
| Incremento acima do teto | Serialização recusada; limite atual também exercitado na persistência real |
| Preservação após recusa de XML | Mesmo artefato original, mesmos bytes, um arquivo e um envio; nenhuma versão parcial |

O corpus contém 1.000 guias, 10.000 itens e 20.000 unidades, em dez contratos sintéticos.
Cada item vale 10.000 centavos. Faturado total **100.000.000 centavos (R$1.000.000)**:
60.000 recebidos + 20.000 em análise + 99.920.000 abertos, sem baixa/ajuste.
O item adicional de recusa é criado pelos mesmos serviços, não por inserção de saldo
ou alteração artificial de contagem. Excedentes de lote usam fontes efetivamente aptas.

## Otimização medida

O baseline de 1.000 itens fechou em **52,40 s**, com **105.817 consultas no ciclo**.
A medição final isolada fechou em **27,42 s**, com **71.653 consultas no ciclo**
(redução de cerca de 48% no fechamento observado e 32% nas consultas).
O ciclo final inteiro levou 108,09 s, incluindo preparo, replays, XML, envio simulado,
recebimento/glosa e relatórios. O timeout transacional de fechamento continua **60 s**.

Os dez lotes do corpus fecharam entre 27,53 e 51,74 s, mediana 31,10 s; a geração
completa desse corpus levou cerca de 26 minutos. Parte ocorreu junto de Jest, lint e
regressão PostgreSQL no mesmo host/container. Não se usa o melhor caso como promessa
de SLA. O ensaio isolado final começou após os demais checks e sobre árvore limpa.

Mudanças: bloqueio ordenado dos IDs de cada entidade em conjunto; memoização somente
na fase de revalidação protegida por travas, antes das gravações. Não se pula revalidação,
não se reutiliza saldo entre transações e não se cacheiam consultas brutas/travas nem
leituras mutáveis de produção. Cache limitado e descartado também em erro; escritas nos
delegates cacheados são recusadas nessa fase. Detalhes no roteiro operacional.

## Saídas e bytes

- CSV de produção: **10.000 linhas de item / 2.112.707 bytes**, leitura/CSV em 0,54 s.
- CSV de conciliação: **10.000 linhas de item / 4.073.085 bytes**, leitura/CSV em 1,13 s.
- Verificação integral dos dois leitores, última página e conferência de lote: 2,28 s.
- XML no teto usa 100 guias/1.000 itens e campos dentro dos comprimentos do XSD.
  CR escapado amplia bytes sem inflar o número de caracteres decodificados.
- Teste de persistência usa o artefato real de 778.537 bytes do primeiro lote: reduzir
  o limite atual para 778.536 recusa nova geração e preserva os bytes/contagens anteriores.
  A configuração é restaurada por operação versionada; snapshot fechado não é alterado.

Hashes SHA-256, digest XSD, parâmetros, contagens e tempos em
[manifesto resumido](131-capacidade.json). CSVs e XML sintéticos efetivamente conferidos
ficam em `release/131-1792112983342/` (ignorados pelo Git), junto dos manifestos completos.
O baseline está em `release/131-1792112752969/`; a confirmação final limpa,
em `release/131-1792114821844/`.

O corpus grande e o baseline foram criados durante a implementação: os manifestos
originais registram SHA base e `modified: true`. Eles não são apresentados como execução
de árvore limpa. Exportações e fronteiras de lote registram SHA `4363ff1`; a confirmação
final de 1.000 itens registra esse mesmo SHA e `modified: false`.

## Checks

- **124 suítes / 1.358 testes Jest aprovados**: inclui XML grande/XSD e isolamento do cache.
- **45 suítes / 293 testes PostgreSQL aprovados**: inclui verificadores de exportação,
  recusa sem registros parciais, fonte alterada, concorrência e rollback, mais regressões
  de agenda, clínico e financeiro.
- **10 testes de pipeline aprovados**; Next typegen, TypeScript e ESLint aprovados.
- Build Next.js 16.3.5 de produção com Webpack aprovado no Windows; runtime físico TISS,
  schemas e validação isolada aprovados após o build.
- Ambos DATABASE_URL/DATABASE_URL_UNPOOLED foram forçados ao banco local. A medição final
  foi iniciada com URLs externas fictícias herdadas, e o log Prisma confirmou migração
  exclusivamente em `fisio_adm131_1792114821844`, localhost:55499. Não se usou .env como alvo.

## Estado e limites

Sem mudança de schema ou nova migração. O solicitante autorizou migrações necessárias
em Preview; esta entrega aplica somente o histórico existente nos bancos locais novos.
Implementação e validação locais concluídas; PR, CI remoto e publicação ainda são etapas
separadas. Homologação externa permanece pendente na #106/#95, sem envio real e sem
liberação manual de Production.

Massa inteiramente fictícia, sem dados do anexo. Envio registrado é simulação local.
Não mede rede/Vercel/Neon, SLA remoto, 10.000 lotes, impressão física/PDF de 10.000 linhas,
PITR ou capacidade para qualquer distribuição de tamanho de texto. A impressão foi
verificada pela fonte integral, sem alegar geração de PDF. Nenhuma tela foi modificada;
os controles de acesso das saídas continuam nos handlers/actions existentes.

Reprodução: [capacidade administrativa](../19-administrativo-capacidade.md).
