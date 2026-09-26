# Responsabilidade: dados, privacidade e retenção

## CONFIRMADO

O sistema trata dados pessoais e dados de saúde, classificados como dados pessoais sensíveis. CPF é opcional e único quando informado; telefone é obrigatório; menores usam responsável legal. Documentos de impressão são gerados na hora e não são armazenados.

Fontes: `README.md`, `src/modules/pacientes/README.md`, Lei 13.709/2018.

## RECOMENDAÇÃO

Aplicar mínimo necessário, controle de acesso por perfil, criptografia em trânsito e trilha de auditoria para ações sobre dados clínicos.

## PENDENTE / TBD

Prazo de retenção do prontuário: nenhum definido. Decisão de Bruno (26/09/2026): guardar tudo, sem exclusão nem anonimização, até haver orientação especializada (LGPD e norma COFFITO), que segue pendente. Pedidos do titular seguem fluxo manual aprovado pelo ADMIN. Leituras não são auditadas por decisão; login e gestão de usuários são (#56). Decisões e tarefas derivadas em [15-retencao-rastreabilidade-recuperacao](15-retencao-rastreabilidade-recuperacao.md) (issue #41).
