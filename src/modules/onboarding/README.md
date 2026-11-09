# onboarding

Apresentações de primeiro acesso por usuário. Hoje há uma: o tour do financeiro na página inicial
(`/`), mostrado uma única vez a cada usuário que pode ler o financeiro e persistido no banco, para
não repetir em outro navegador ou dispositivo. Não usa `localStorage`.

## Peças

| Arquivo | Papel |
|---|---|
| `queries.ts` (`server-only`) | `hasSeenFinanceTour(userId)`: lê só `User.financeTourSeenAt` do usuário da sessão. Erro de leitura propaga; não vira "ainda não viu". |
| `actions.ts` (`"use server"`) | `markFinanceTourSeenAction()`: grava o instante em `User.financeTourSeenAt` do usuário da sessão (`updateMany` condicionado a `null`, idempotente) e revalida `/`. Sem sessão responde "Acesso negado." sem tocar o banco. |
| `src/app/(app)/home-tour-loader.tsx` | Client Component que recebe `showTour` decidido no servidor e só então carrega o tour com `next/dynamic` (`ssr: false`). Quem já viu não baixa o código do tour. |
| `src/app/(app)/home-tour.tsx` | O diálogo: quatro passos curtos sobre os indicadores financeiros, botões Pular / Próximo / Concluir, contador "Passo N de 4" com `aria-live`. Usa o `Dialog` do Base UI (foco preso, Esc, `aria-labelledby` e `aria-describedby` automáticos). |

## Regras

- **Primeira visita** é por usuário, não por dispositivo: a decisão vem do banco no mesmo render da
  página (fora do `Suspense`), então o tour não aparece e some na hidratação.
- **Pular, Concluir, Esc e clique no fundo** valem igual: o diálogo fecha na hora e a gravação segue
  em segundo plano (`useTransition`). Se a gravação falhar, o tour volta na próxima visita; não há
  aviso ao usuário.
- **Idempotente:** a primeira data não é sobrescrita por cliques repetidos ou por outra aba.
- **Só quem pode ler o financeiro** (`financeiro:ler`) consulta e vê o tour; para os demais a
  consulta nem acontece.
- **Nova versão do tour** (texto ou passos que mereçam nova apresentação) é uma migração que zera a
  coluna; não há chave de versão no cliente.

## Banco

Migração `20261108120000_onboarding_tour_financeiro`: `ALTER TABLE "User" ADD COLUMN
"financeTourSeenAt" TIMESTAMP(3)` (nula). Aditiva: nenhuma linha muda de valor; usuários existentes
veem o tour uma vez. Sem tabela nova, nada muda no inventário de exclusão de usuários
(`auth/users/delete.ts`) nem no reset manual (`manutencao/reset.ts`). Reverter a aplicação deixa a
coluna sem uso.

## Permissões

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver o tour do financeiro uma vez e marcá-lo como visto (sessão própria) | ✓ | ✓ | ✓ |

A ação exige só autenticação: é preferência do próprio usuário, sem permissão de módulo e sem
auditoria. Anônimo recebe "Acesso negado.".

## Testes

- `__tests__/queries.test.ts`: select mínimo, nulo/ausente = não viu, erro propaga.
- `__tests__/actions.test.ts`: negação sem sessão antes do banco, autoria da sessão, condição
  `financeTourSeenAt: null`, revalidação de `/`, idempotência.
- `src/app/(app)/__tests__/home-tour.test.tsx`: diálogo acessível, avanço dos passos, Concluir,
  Pular e Esc gravam e fecham.
- `src/app/(app)/__tests__/page.test.tsx`: tour na primeira visita, ausente para quem já viu e para
  quem não lê o financeiro.
