# PR #147: implementação do mockup da visão Dia

Verificação local em 19/10/2026, branch `codex/agenda-dia-mockup`, banco de desenvolvimento local, dia 16/10/2026 (os mesmos dados dos prints da revisão). Referência visual: `docs/project/design/agenda-dia-mockup.png`. Sem migração, sem alteração de consultas e sem publicação.

## Base

Cherry-pick de `a8adf58`, o refinamento da visão Dia que tinha ficado só na branch local da #145. Ele traz:
- faixas por grupo de sobreposição;
- Agendada neutra;
- legenda em `<details>` no mobile;
- Bloqueios com ícone.

## O que mudou

1. **Cascata em coluna estreita** (`agenda-day-grid.tsx`): o card recebe `--lane` e `--lanes`.
   - Abaixo de 22rem de coluna (container query `@container/col`), o card sobreposto recua 1.5rem por faixa, fica elevado (`ring-2 ring-card`, `shadow-md`, z-index maior) e ocupa o resto da largura.
   - A partir de 22rem, as faixas ficam lado a lado como antes.
   - A coluna tem largura mínima fixa de 11rem.
2. **Filtrar neutro** (`agenda-toolbar.tsx`): `variant="outline"`, porque o `secondary` do tema é verde e competia com "Compareceu".
3. **Falta avisada listrada** (`appointment-status-badge.tsx`): novo tom `red-notice`, com fundo listrado nos cards e badge tracejado na lista. A legenda ganhou "Faltou, avisou".
4. **Meia hora e agora**: linha pontilhada no meio de cada slot; linha do agora com marcador circular e a hora na calha.
5. **Micro-resumo no cabeçalho**: `summarizeDay` conta agendadas, comparecimentos, faltas e reagendadas, sem canceladas e sem zeros. A forma curta aparece abaixo de 24rem.

## Testes automatizados

```text
pnpm exec jest --runInBand "src/app/(app)/agenda"  → 10 suítes, 80 testes, 0 falhas
pnpm exec eslint "src/app/(app)/agenda"            → sem erros
pnpm typecheck                                     → sem erros
```

`simultaneous-views.test.tsx` passou a conferir `--lane` em vez de `style.left`, já que o posicionamento agora vem por classe.

## Verificação no navegador

| Cenário | Resultado medido |
| --- | --- |
| Desktop 1440, coluna de 1063px | Faixas lado a lado (523px cada) só no grupo 02:06–05:00; os demais cards têm 1054px; sem rolagem lateral |
| Mobile 375, coluna de 285px | Card das 03:00 recuado 24px, 252px de largura, z-index 3, sombra e anel; nenhum texto truncado; sem rolagem lateral |
| Resumo no mobile | "1 agend. · 2 comp. · 2 faltas · 1 reag.", sem corte |
| Meia hora | `::after` pontilhado de 1px a 31.5px do topo do slot de 64px |
| Agora (hoje) | Rótulo centrado na linha, marcador de 10px circular |
| Escuro (`.dark`) | Listras `red-950` e `red-900/60` com texto `red-200` |
| Semana | O card "Faltou (avisou)" herda o listrado |
| Console | Sem erros |

Captura: `147-dia-mobile-cascata.png` (mobile 375, recorte da área útil).
