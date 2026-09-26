# Responsabilidade: definição de pronto

## CONFIRMADO

Toda funcionalidade relevante deve ter testes unitários, lint/TypeScript, build e teste do fluxo principal.

Validação local em 2026-09-26, checkout `feat/fisio-acessos-recepcao`, HEAD `ae2b054` com alterações locais preexistentes:

- `pnpm lint` — passou.
- `pnpm typecheck` — passou.
- `pnpm exec jest --runInBand` — 55 suítes e 548 testes passaram.
- `pnpm build` — passou.

Integração PostgreSQL confirmada pelos logs da [CI do mesmo HEAD](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/36251427500): 37 testes aprovados, 0 falhas e 0 ignorados, após migrações em banco descartável. Essa execução não inclui alterações locais não commitadas. A integração não foi repetida localmente nesta revisão.

`pnpm audit --prod --json` retornou código 1: 2 alertas altos e 1 moderado em dependências transitivas opcionais de Prisma. Remediação e análise de alcance estão em COR-02 do [roadmap](roadmap.md).

## PENDENTE / TBD

Publicação, migrações no ambiente publicado e fluxo autenticado nesse ambiente não foram verificados nesta revisão. Homologação manual não foi executada nem constitui bloqueio adicional sem solicitação, conforme `docs/PROJECT.md`. Resultado técnico: **APTO COM RESSALVAS para evolução**, sem declaração de prontidão de produção; pendências e aceite estão no roadmap.
