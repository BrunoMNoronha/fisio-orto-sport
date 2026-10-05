# Issue #85 — informações cadastrais do plano de saúde

## Contrato da implementação

Proposta recomendada da issue confirmada pelo usuário nesta execução:
quatro campos opcionais; operadora e plano em texto livre com até 120 caracteres,
carteirinha textual com até 60 caracteres e validade como data civil opcional.
Não se exige operadora para aceitar informações parciais. Não há titular/dependente,
catálogo, múltiplos planos ou histórico nesta entrega. Essas ampliações precisam de escopo próprio.

Um conjunto atual é mantido no paciente, seguindo os dados cadastrais existentes.
Textos são aparados e vazio vira null; carteirinha preserva zeros, letras e pontuação.
Validade passada ou futura é aceita se a data existir (anos 0001 a 9999); exibe-se a data,
sem estado de elegibilidade, alerta automático ou bloqueio. Ausência significa Não informado.
Os pacientes existentes permanecem sem dados de plano na migração aditiva.

Permissões pacientes:ler/gerir e autoria da sessão seguem o cadastro vigente.
Não altera impressão, listagem, agenda, dados clínicos, cobrança ou autorização de sessões.

## Evidências

Validação local concluída em 04/10/2026, na branch `codex/issue-85-plano-saude`,
worktree isolado a partir de `a8ae070`; alterações da #48 no checkout original preservadas.

| Verificação | Resultado |
|---|---|
| `pnpm lint` | Sem erros; avisos de variáveis dos novos testes corrigidos e verificados. |
| `pnpm typecheck` | Aprovado. |
| `pnpm test --runInBand` | 78 suítes e 883 testes aprovados. |
| `pnpm build` | Aprovado, Next.js 16.3.5/Turbopack. |
| `pnpm test:integration` | 26 suítes e 149 testes aprovados, zero pulados. |
| Migrações | 25 aplicadas com `prisma migrate deploy` somente em PostgreSQL descartável. |
| Migração #85 com legado | Teste executa o SQL sobre tabela anterior em schema transacional; preserva paciente e verifica quatro colunas nulas. |
| React | Revisão de autorização no servidor, hooks, labels/erros, campos controlados e seleção mínima de dados concluída. |

Integração usa o contêiner exclusivo `fisio-85-it`, com banco de integração
`fisio85_test` e banco separado `fisio85_browser` para a interface, ambos descartáveis.
Nenhum banco de desenvolvimento compartilhado ou produção foi migrado.

## Navegador autenticado

App local na porta 3085, ligado somente à base descartável. Verificação com `agent-browser`
e usuários fictícios dos três perfis. Sessões próprias `fisio85`, `fisio85-recepcao`
e `fisio85-fisioterapeuta`; não utilizam credenciais reais.

- Administrador: criação com operadora/plano, carteirinha `000Ab-12/3` e validade `2024-02-29`;
  ficha apresenta `29/02/2024`, edição recarrega os valores, alteração para `000CD-99` persiste,
  limpeza dos quatro campos apresenta **Não informado**.
- Recepção e Fisioterapeuta: criação → ficha → recarregar → edição → alterar carteirinha
  para `000EDIT-85` → recarregar → limpar → recarregar. Valores e limpeza persistiram.
- Recepção sem links para anamnese; Fisioterapeuta mantém seus links clínicos.
- Formulário após erro de nascimento: carteirinha e demais textos preenchidos permaneceram;
  captura móvel foi inspecionada visualmente, com label e erro associados ao nascimento.
- Viewports de 1280 e 390 px: `scrollWidth` igual ao viewport, sem rolagem horizontal.
  Ficha sem overlay de erro; consultas de erros do navegador sem resultados.
- Datas foram preenchidas pelo controle HTML nativo via eventos após o comando de preenchimento
  do agent-browser não aplicar valores em inputs de data. O salvamento passou pela Server Action
  real e pelo banco, sem mocks.

## Entrega e limites

Implementação e validação locais. Issue permanece aberta até a entrega integrada; sem publicação,
merge, migração remota ou deploy nesta execução. O contrato cadastral não comprova cobertura
ou autorização de atendimento. Impressão e demais exclusões da issue permanecem fora do escopo.
