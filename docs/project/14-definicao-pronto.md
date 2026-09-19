# Responsabilidade: definição de pronto

## CONFIRMADO

Toda funcionalidade relevante deve ter testes unitários, lint/TypeScript, build e teste do fluxo principal.

Validação atual em 2026-09-19:

- `pnpm exec eslint . --no-cache` — passou.
- `pnpm typecheck` — passou.
- `pnpm test --runInBand` — 25 suítes e 311 testes passaram.
- `pnpm build` — passou.

## PENDENTE / TBD

`pnpm test:integration` não foi executado porque requer `INTEGRATION_DATABASE_URL`. Não há homologação manual registrada.
