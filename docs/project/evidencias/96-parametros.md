# ADM-00 (#96) — encerramento em 15/10/2026

Solicitação: parametrizar dados em Configurações e adotar defaults para concluir #96.

Implementado em Configurações → Operadoras e contratos → contrato: canal de homologação,
estimativa mensal, intervalo de fechamento e limites de guias, itens, XML e exportação.
Defaults: 1.000 sessões/mês, 30 dias, 100 guias, 1.000 itens, 2 MiB, 10.000 linhas.
Novos contratos sugerem 04.03.00; os existentes preservam versão. Identificadores reais
não recebem valores fictícios. Defaults não atestam homologação ou capacidade medida.
Persistência por contrato com autorização ADMIN, motivo, versão, idempotência e histórico.
A escolha de bytes PostgreSQL e recuperação permanece no contrato ratificado.

Validação desta rodada:
- Prisma Client gerado; Next typegen e TypeScript sem erros.
- ESLint nos arquivos alterados sem erros.
- Jest: três suítes, 14 testes aprovados (validação, actions e formulário).
- git diff --check aprovado com CRLF reconhecido.
- Cobertura PostgreSQL acrescentada para defaults, edição/canal e snapshots; não executada:
  Docker indisponível e sem banco descartável configurado. Migração aditiva criada,
  não aplicada em ambiente local, Preview ou Production nesta rodada.
- Sem teste visual de navegador nesta rodada.

Recorte atualizado por Bruno: perfil real, XSD/homologação, capacidade e restauração do
artefato são gates de #103/#106. Não bloqueiam conclusão do contrato parametrizável #96.
#97/#98 já possuem implementação local; próxima entrega funcional #99 (ADM-03).
