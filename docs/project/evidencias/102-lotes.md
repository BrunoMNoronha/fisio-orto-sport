# ADM-06 — lotes e envio manual (#102)

Implementada localmente em 15/10/2026 na branch codex/issue-102-lotes, sobre main com
#99, #100 e #101 integradas. A #101 foi publicada em Preview pelos PRs #114/#115;
a #102 ainda não foi publicada. Migração aplicada somente em PostgreSQL 18 descartável.

## Entrega e contratos

- Preparação por operadora/contrato/versão TISS e perfil de campos compatível. Guias
  aptas selecionadas explicitamente; composição precisa ser salva antes do fechamento.
- Numeração sequencial por contrato, preservada após cancelamento/reset. Associação
  ativa única por guia, protegida por índice parcial e transações serializadas.
- ABERTO → FECHADO → ENVIADO; ABERTO/FECHADO → CANCELADO. Lote cancelado não reabre.
  Um novo lote recebe novo número. Enviado não cancela nem altera conteúdo.
- Fechamento revalida todas as guias e produções da #101/#99 na mesma transação.
  Trava pacientes ordenados antes da configuração comum, sessões, guias, produções e lote.
  Congela conteúdo versão 1, SHA-256, identificação, itens originais e preços em bigint;
  guia passa a EM_LOTE e produção a FECHADO, sem consumir autorização novamente.
- Cancelamento preserva conteúdo, arquivos e consumo, devolve guia a APTA/produção a APTO
  e libera vínculos. Versões das fontes mudam: nova conferência é obrigatória para fechar
  outro lote. Não recalcula silenciosamente o preço congelado.
- Todos preparam/leem; somente ADMIN fecha, cancela e registra/corrige envio. Autorização
  precede validação e consultas. Autoria vem da sessão, nunca do formulário.
- Histórico próprio append-only com autor, versão, data, motivo e replay idempotente.
- Registro manual exige arquivo validado deste conteúdo, data civil de São Paulo compatível
  com fechamento/arquivo e não futura, protocolo, canal e motivo. Marca produção ENVIADO.
  Este evento constitui faturamento administrativo; não lança Charge/Payment nem recebimento.
- Correção acrescenta evento ligado ao último envio e ao arquivo correspondente, sem duplicar
  total/consumo/faturamento. O registro anterior permanece imutável.
- Geração de XML e validação XSD pertencem à #103. A #102 oferece apenas a porta interna
  registerValidatedBatchArtifactTx, sem Server Action de upload/registro. Deve ser chamada
  pela #103 somente após validação real. Bytes originais ficam em tabela própria, com hash,
  limite mínimo atual/congelado, versão sequencial e vínculo ao conteúdo. Regenerar não envia
  nem altera o snapshot. Fixtures de testes são explicitamente sintéticas, sem homologação.
- Lista/detalhe paginam; CSV e impressão exportam o lote inteiro, com contexto, completude,
  guias, itens, quantidades por procedimento/unidade compatível e totais reconciliados.
  O menor maxExportRows atual/congelado recusa integralmente o excesso. Fator 1, sem float.
- Projeção operacional explícita não entrega indicação clínica, carteira, senha ou bytes.
  A indicação confirmada fica no conteúdo restrito do lote para futuro gerador autorizado.
  CSV reaproveita proteção contra fórmulas e delimitação da #100.

## Validação

- 113 suítes / 1.284 testes Jest aprovados, incluindo matriz de acesso, autoria autenticada,
  usuário inativo, campos duplicados, IDs repetidos, filtros desconhecidos e datas inválidas.
- Suíte final completa PostgreSQL: 250 testes aprovados em banco novo com a migração
  definitiva, incluindo todas as tabelas no reset, preservação dos contadores/configuração
  e proteção dos novos autores na exclusão. Doze cenários específicos de lote cobrem
  concorrência, replay, numeração, rollback após primeira guia, cancelamento, snapshots
  imutáveis, arquivo/regeneração, envio/correção, corridas contra alteração clínica,
  devolução da guia e invalidação da produção, paginação de 25 itens/exportação integral,
  limites e datas civis após meia-noite UTC (colunas timestamptz, fuso São Paulo).
- Migrações completas aplicadas desde zero em banco descartável; gate aditivo #102 passa.
  Dez testes de pipeline, TypeScript, ESLint e build webpack de produção aprovados.
- Navegador local com dados sintéticos: ADMIN fecha lote e vê envio bloqueado sem arquivo;
  CSV autenticado baixa com valores reconciliados, impressão integral conferida; Recepção lê sem ações ADMIN e prepara outro lote.

Capturas: [lote fechado como Recepção](102-lote-recepcao.jpg) e
[conferência integral](102-impressao.jpg). Sem dados ou envios reais.

## Integração seguinte

#103 usa exclusivamente o snapshot congelado (contentVersion/contentDigest), valida os
bytes contra XSD/manual efetivos e chama registerValidatedBatchArtifactTx dentro da sua
transação. Falha na geração/validação não cria artefato nem evento de envio. Regeneração
acrescenta versão de arquivo mantendo o conteúdo. Envio manual sempre aponta para arquivo
existente e validado, e correção enviada acrescenta referência; não há webservice,
transmissão, polling ou retorno automático nesta entrega.
