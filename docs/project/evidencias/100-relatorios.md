# ADM-04 — relatórios operacionais (#100)

Implementação local em 15/10/2026 sobre a produção administrativa da #99.
Integração/publicação e encerramento da issue ainda pendentes; nenhuma migração nova.

## Comportamento entregue

- Produção por execução, com profissional/operadora/contrato/procedimento e estado.
- Pendências abertas e ajustes após fechamento, com motivo e estado persistido.
- Autorizado, consumido líquido de devoluções e disponível por item de autorização.
  Vigência intersecta o filtro; saldo é atual, e saldo nominal não implica elegibilidade.
- Datas civis inclusivas em São Paulo; validação estrita compartilhada por tela/CSV/impressão.
- Tela em páginas de 20, totais de todo o filtro segregados por unidade/contexto/estado;
  cada leitura em RepeatableRead. Somente projeção administrativa, sem campos clínicos,
  carteira ou senha de autorização.
- CSV completo UTF-8/BOM com escape de aspas, delimitadores, quebras e fórmulas.
  Dinheiro em centavos inteiros, sem perda acima de MAX_SAFE_INTEGER. Códigos continuam
  texto no arquivo; configurar importação como texto para preservar zeros em planilhas.
- Teto integral pelo menor maxExportRows dos contratos filtrados. Excesso retorna erro
  422 no CSV e recusa a impressão, sem saída parcial. Downloads private/no-store.
- Impressão própria com filtros, geração, completude e totais; A4 paisagem, células
  com quebra, cabeçalho repetido. PDF pela impressão nativa. Sem XLSX.

## Verificação automatizada

- Jest completo: **110 suítes, 1.253 testes aprovados**.
- Integração completa PostgreSQL descartável: **230 testes aprovados**; após ampliar
  cenários da #100, os **4 testes específicos** também passaram (equivalente a 231 no total).
- Cenário com 25 itens em duas páginas compara totais com agregação independente;
  CSV contém todos os itens. Consumo 1:N e devolução reconciliam saldos sem multiplicação.
- Gravação entre count e agregação/itens confirma a mesma posição RepeatableRead.
- Teto de contrato recusa exportação sem afetar paginação. Valor de
  199999998000000000 centavos permanece exato em item, total e CSV.
- Permissões ADMIN/RECEPCAO/FISIOTERAPEUTA e bloqueio de usuário ausente/inativo/inválido
  antes do banco. Filtros inválidos não chamam o leitor; CSV usa nome fixo e no-store.
- Pipeline: **10 testes aprovados**; TypeScript e ESLint aprovados.
- Build de produção **webpack aprovado**. Turbopack local tem a limitação de subprocesso
  CSS do Windows já registrada na #99; execução padrão de CI depende de PR/publicação.

## Verificação no navegador

Recepção sintética em localhost: busca e seleção de paciente via ArrowDown/Enter,
aplicação/limpeza do filtro, download CSV completo com 9 itens e página de impressão
com os mesmos 9 itens. Autorizações verificadas a 390×844, sem alargamento da página;
tabelas possuem rolagem horizontal acessível por teclado. Impressão própria verificada
em tela; diálogo nativo e paginação física/PDF permanecem sujeitos ao navegador.

Capturas sintéticas em `100-impressao.png` e `100-mobile.png` (sem dados reais).
