# Validação — issues #137 e #138

Data: 16/10/2026. Implementação local, sem publicação ou alterações em bancos existentes.

## Entrega

- Labels com explicações explícitas e indicador de ajuda separado do controle.
- Botões, ações em diálogos, Sair e links apresentados como botões com explicação do efeito real.
- Configurações → Interface: switch global `actionTooltipsEnabled`, inicialmente desligado.
- Salvamento conjunto, autorização administrativa, versionamento, auditoria e descarte preservados.
- Preferência compartilhada como um booleano pelos layouts autenticado e de impressão.
- Ajuda das labels independente do switch; ajuda e indicadores ocultos na impressão.
- Matriz com 375 pontos de composição em `137-138-cobertura.md`; campos dinâmicos usam o catálogo explícito `src/lib/field-help.ts`.

## Verificações automatizadas

- Prisma Client gerado com sucesso.
- Todas as 39 migrações, incluindo a coluna nova, aplicadas com sucesso a PostgreSQL 17 descartável, exclusivo desta validação.
- Integração de configurações: 10 testes aprovados, incluindo persistência, valor padrão, auditoria, recusa de versão antiga, concorrência e rollback.
- Suíte completa Jest: 126 suítes, 1.416 testes aprovados.
- Verificações direcionadas: 47 testes de ajuda/configurações aprovados; 25 testes de pacientes, agenda, cancelamento em diálogo e recebimento aprovados.
- TypeScript, ESLint e `git diff --check` sem erros.
- Build de produção com `next build --webpack` aprovado, incluindo geração das rotas.

O executável `pnpm` tentou obter metadados do registro e não conseguiu resolver o host. Foram utilizados os executáveis já instalados em `node_modules`, sem instalar dependências. A tentativa com Turbopack encontrou falha interna ao iniciar o processo de transformação CSS; o build com a alternativa oficial Webpack concluiu. A primeira compilação também apontou duas diretivas `use client` deslocadas, corrigidas antes do build aprovado.

## Navegador

Aplicação real executada em `http://127.0.0.1:3138`, usando exclusivamente o banco descartável e administrador fictício. Verificado:

- Switch desligado por padrão, alteração pendente sem aplicação antecipada e descarte para o último valor salvo.
- Salvamento ligado/desligado, atualização imediata da ajuda das ações e persistência após recarregar/navegar.
- Ativação do switch por Espaço; foco por Tab abre a ajuda; Escape fecha.
- Clique no indicador abre a explicação sem enviar formulário, cadastrar paciente, navegar ou executar a ação descrita.
- Ajuda de ação desabilitada pode ser consultada separadamente.
- Labels continuam com ajuda quando os tooltips de ação estão desligados.
- Formulário de paciente preserva labels, nomes acessíveis e explicações dos campos dinâmicos.
- Temas claro e escuro e viewport móvel de 390 × 844; tooltip dentro da área visível, sem overflow horizontal da página.
- Zero botões aninhados no DOM verificado. A ajuda usa `role="tooltip"` e associação por `aria-describedby`.

Evidências: `137-138-switch-tooltip.png`, `137-138-mobile-label.png` e `137-138-light-label.png`.

A consulta por clique e o viewport móvel cobrem o fluxo previsto para toque; não foi usado um dispositivo físico de toque. A semântica foi inspecionada na árvore de acessibilidade; não houve teste com leitor de tela externo. Posicionamento e interações do popup foram verificados no navegador, pois jsdom não oferece layout real.

## Ajustes identificados na validação

- Papel acessível explícito no popup e associação explícita ao trigger controlado do Base UI.
- `closeOnClick=false` no indicador para permitir consulta por clique/toque.
- Pequeno intervalo de fechamento para permitir mover o ponteiro até o conteúdo.
- Switch implementado como botão com `role="switch"`, `aria-checked` e valor oculto submetido. Isso evita que o reset automático de formulários do React desalinhe a aparência do switch e o estado salvo/pendente.
- Foco inicial de diálogos prioriza os campos do formulário, preservando a consulta da ajuda por teclado.

A migração adicionada precisa ser aplicada ao banco de cada ambiente antes da execução desta versão.

Após a validação, o servidor da porta 3138 foi encerrado e o contêiner descartável exclusivo dos testes foi removido. As evidências permanecem no repositório.
