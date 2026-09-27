# #76 — Exclusão de usuário desativado pelo Administrador

A regra é a proposta na issue: só se exclui uma conta **desativada**, que não seja a do executor e
que não tenha **nenhum vínculo de negócio**. Uma conta com vínculo continua desativada, e a tela
explica o motivo por categoria. O funcionamento técnico está em `src/modules/auth/README.md`
(seção "Exclusão de usuário").

## Migração `20260928010000_auditoria_usuario_excluido`

É aditiva: só acrescenta `USUARIO_EXCLUIDO` ao enum `AuditAction`. A retenção e a imutabilidade da
auditoria não mudam.

Em produção, a migração deve ser aplicada **antes do merge**, com autorização própria. Sem ela, só
a exclusão falharia (o evento não seria gravado e a transação seria desfeita); o resto do app
continua funcionando.

Remover um valor de enum no PostgreSQL exige recriar o tipo. Por isso, **se algum evento
`USUARIO_EXCLUIDO` já tiver sido gravado, não há reversão simples**. Nesse caso, o melhor é manter
o valor e só reverter o código, que é seguro: o código anterior apenas não oferece a exclusão.

## Evidências técnicas (27/09/2026, local)

| Verificação | Resultado |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | ok |
| `pnpm exec jest --runInBand` | 66 suítes, 737 testes ok, 10 novos em `users-delete-action.test.ts` |
| `pnpm test:integration` | 115 testes ok, 9 novos em `excluir-usuario.integration.ts` |

Os testes cobrem:

- **Autorização:** quem não tem sessão, a Recepção e o Fisioterapeuta são negados antes do banco.
- **Recusas sem efeito:** conta ativa (inclusive reativada depois de abrir o diálogo),
  autoexclusão e conta inexistente ou já excluída.
- **Vínculos:** cada categoria bloqueia a exclusão (pacientes, agenda, bloqueios e prontuário), e o
  vínculo fica intacto. A categoria de configurações está no catálogo e é protegida pela FK, mas
  não foi exercitada na integração, porque a linha única é disputada pela suíte paralela.
- **Catálogo:** `USER_LINKS` foi comparado com todas as FKs reais para `User`.
- **Exclusão permitida:** as sessões são removidas, a auditoria anterior fica e o evento
  `USUARIO_EXCLUIDO` é gravado.
- **Atomicidade:** uma falha na auditoria desfaz a exclusão e a remoção das sessões.
- **Concorrência:**
  - duas exclusões simultâneas dão um sucesso e um evento só;
  - uma reativação em curso faz a exclusão esperar e recusar;
  - um vínculo novo em curso faz a exclusão esperar e recusar;
  - uma exclusão em curso faz a reativação esperar e não encontrar a conta.

Ao rodar a integração completa com a máquina carregada, dois testes de concorrência de **outras**
suítes (agenda com bloqueios e agenda com sessão) falharam uma vez. Depois passaram em 3 rodadas
completas e 6 rodadas isoladas. Não tocam esta entrega; ficou uma tarefa separada para investigar.

## Homologação técnica (navegador, `next dev` local, Administrador)

Foi usada uma conta descartável, criada para o teste. Nenhuma conta existente foi alterada.

1. Conta ativa: sem o botão "Excluir". O botão também não aparece na própria conta do
   Administrador.
2. Desativada pelo teclado (Enter no botão), o "Excluir" apareceu.
3. O diálogo "Excluir usuário?" identifica a conta (nome e e-mail), avisa que a exclusão é
   definitiva e abre com o foco em "Cancelar". Cancelar pelo teclado fechou o diálogo e manteve a
   conta.
4. "Excluir definitivamente" removeu a conta da lista.
5. A auditoria mostra "Usuário excluído". Os eventos anteriores dessa conta (criação e desativação)
   continuam listados, com "Usuário excluído (id…)".
6. Sem erros no console.

O caso de conta com vínculo não foi exercitado no navegador (o banco local foi reinicializado na
#62). Ele está coberto pela integração.
