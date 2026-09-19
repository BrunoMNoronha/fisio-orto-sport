# Responsabilidade: requisitos não funcionais

## CONFIRMADO

Autenticação própria com sessão no banco, autorização por permissões no servidor, senha com scrypt, cookie seguro em produção e checagem otimista no proxy.

## TESTADO

Em 2026-09-19 passaram: `pnpm exec eslint . --no-cache`, `pnpm typecheck`, `pnpm test --runInBand` (25 suítes, 311 testes) e `pnpm build`.

## RECOMENDAÇÃO

Usar WCAG 2.1 AA como referência e registrar auditoria de acesso a dados clínicos.

## PENDENTE / TBD

Metas de performance, disponibilidade, backup, observabilidade, homologação e produção ainda não foram definidas ou comprovadas.
