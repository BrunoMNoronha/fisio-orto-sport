# ADM-05 — guias SP/SADT (#101)

Implementação local em 15/10/2026, seguindo #96 e reutilizando produção (#99) e contratos
de acesso/projeção operacional da #100. A #100 já foi integrada pelos PRs #112/#113 e
publicada em Preview. A #101 ainda não foi integrada/publicada; migração apenas local.

## Entrega

- Guias RASCUNHO/APTA/CANCELADA; EM_LOTE reservado ao fechamento futuro da #102.
- Agrupamento fixo por cobertura, contrato, autorização/dispensa e mês de execução;
  numeração atômica por contrato e associação parcial única por produção ativa.
- Conferência explícita, pendências por campo, motivo/autoria e reenvio idempotente.
- Snapshots versionados de beneficiário, contrato, autorização, solicitante, executantes,
  clínica, códigos e itens originais. Quantidade × centavos × fator 1, com bigint.
- Alterar fonte não altera o snapshot. Revalidação do fechamento detecta mudança de fontes
  ou pendência. Correção exige devolução; cancelamento libera associação sem devolver o
  consumo da produção, que continua sob as regras da #99.
- Perfil condicional e códigos editáveis por ADMIN no contrato; nenhum código TISS/ND
  inventado. Perfil genérico e aptidão administrativa não são homologação de XML.
- Indicação clínica para faturamento separada e explícita: somente ADMIN/Fisioterapeuta
  lê/edita/confirma. Recepção mantém preparo administrativo sem prontuário/indicação.
- Migração aditiva 20261015150000_administrativo_guias. Novos vínculos cobertos pela
  reinicialização manual, exclusão de usuários e documentação de recuperação.

## Validação

- **111 suítes / 1.264 testes Jest aprovados**; dois testes adicionais de projeção
  cliente confirmam ausência de indicação, snapshots e hashes para a Recepção;
  validação adicional recusa booleanos inválidos em confirmação/perfil.
- **238 testes PostgreSQL aprovados**, sete específicos de guias: incompletude e replay;
  múltiplas sessões/itens e totais sem novo consumo; corrida na associação e não reuso de
  número cancelado; troca indevida de beneficiário/competência; campos condicionais e
  restrição clínica; snapshot de guia em lote após mudança cadastral; correção clínica
  após aptidão e devolução.
- Após ajustar o registro de pendência de produção corrigida, os sete cenários de guia
  foram repetidos e aprovados em outro banco criado com a migração final desde zero.
- SQL direto sem histórico e tentativa de editar guia em lote/histórico são recusados.
- Limpeza manual com dados em todas as novas tabelas remove guias e preserva configuração,
  contador, usuários e eventos conforme contrato, com rollback em falha.
- Migrações aplicadas desde zero em banco PostgreSQL 18 descartável, sem banco remoto.
- Pipeline: **10 testes aprovados**, incluindo gate aditivo explícito da migração #101.
- ESLint e TypeScript aprovados. Build de produção webpack aprovado. O build padrão
  Turbopack permanece para CI; há limitação local Windows já registrada nas #99/#100.
- Navegador como Recepção sintética: lista, detalhe multi-item, aviso de fontes alteradas,
  devolução com autoria/versão, nova conferência incompleta que permanece rascunho e nega
  acesso ao perfil exclusivo de ADMIN. ADMIN salva nova versão do perfil em tela.
  Sem indicação clínica entregue à Recepção.

Capturas sintéticas: [guia e pendências](101-guia-recepcao.png) e
[perfil ADMIN](101-perfil-admin.png).

## Integração seguinte

#102 chama revalidateGuideTx na transação do fechamento (pacientes em ordem, configuração,
sessões, guia), confere retorno OK e preserva snapshots. Não consome autorização novamente.
Entrada/saída de lote e estado fechado da produção são responsabilidade dessa próxima issue.
Nenhum XML, lote, cobrança ou envio real foi criado por esta entrega.
