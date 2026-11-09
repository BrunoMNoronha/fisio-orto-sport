# Página inicial — indicadores financeiros e tour de primeiro acesso

Verificação local em 08/11/2026, na branch `feat/home-kpis-financeiro-tour`. Esta página não contém
dados pessoais reais nem conteúdo clínico: só valores agregados e contagens.

## Ambientes

- **Local**: `pnpm dev` (Next 16.3.5, Turbopack) e `pnpm build`, com o PostgreSQL 18 do Docker de
  desenvolvimento (serviço `db`), que é a cópia de produção de 06/11/2026.
- **Intocados**: a produção (Neon) e a landing pública. Nada apontou para o Neon.
- **Navegador**: painel do Claude Code (Chromium), em 1280 px e 375 px.
- Nenhum dado pessoal foi exportado, impresso em log ou incluído em teste.

## O que mudou

- **Indicadores financeiros do mês na página inicial** (`src/app/(app)/finance-kpis.tsx`): quatro
  cards — cobrado no mês (por vencimento), recebido no mês (por data do recebimento), a receber
  (saldo em aberto das cobranças ativas) e vencido (saldo com vencimento anterior a hoje). Cobrado e
  recebido trazem a variação em relação ao mês anterior. Valores em BRL (`formatBRL`), em centavos
  inteiros de ponta a ponta; nenhum `bigint` cruza para o cliente. Leitura numa única consulta
  (`src/modules/financeiro/kpi-read.ts`), em Server Component sob `Suspense` com esqueleto. A seção
  só aparece para quem tem `financeiro:ler`; sem permissão retorna `null`, sem redirecionar nem
  auditar.
- **Tour de primeiro acesso** (`src/app/(app)/home-tour.tsx`, carregado com `next/dynamic`
  `ssr:false`): diálogo de quatro passos apresentando os recursos do financeiro, mostrado uma vez por
  usuário. Persistência em `User.financeTourSeenAt` (migração `20261108120000_onboarding_tour_financeiro`),
  então não repete em outro dispositivo. Pular, Concluir, Esc e clique no fundo valem igual.
- Documentação: `src/modules/onboarding/README.md` (novo) e seção "Indicadores da página inicial" em
  `src/modules/financeiro/README.md`.

## Migração

`20261108120000_onboarding_tour_financeiro`: `ALTER TABLE "User" ADD COLUMN "financeTourSeenAt"
TIMESTAMP(3)` (nula). Aditiva, nenhuma linha muda de valor. Aplicada com `prisma migrate deploy` no
Postgres local; `prisma migrate diff` do banco contra o schema não mostrou diferença na tabela
`User` (as diferenças de chave estrangeira em `ProductionItem`/`ProductionChange` já existiam na
cópia de produção, sem relação com esta migração). Coluna confirmada como `timestamp(3)`, nullable.

## Testes automatizados

Suíte Jest com `pnpm exec jest --runInBand`.

Novas suítes desta entrega:

- `src/modules/financeiro/__tests__/kpi-math.test.ts`: janelas de mês (virada de ano, fevereiro
  bissexto), variação em pontos-base inteiros em bigint (zero/zero, divisão por zero, truncamento,
  valores acima de 2^53, teto ±999%), formatação pt-BR.
- `src/modules/financeiro/__tests__/kpi-read.test.ts`: conversão exata para bigint, consulta única,
  SQL só sobre cobranças ativas e pagamentos sem estorno, sem alcançar dados clínicos; datas civis
  corretas nos dois lados da meia-noite de São Paulo.
- `src/modules/financeiro/__tests__/kpi-queries.test.ts`: três perfis recebem os totais; sem sessão
  ou sem permissão devolve `null` sem tocar o banco.
- `src/modules/onboarding/__tests__/queries.test.ts` e `actions.test.ts`: leitura mínima, negação sem
  sessão antes do banco, autoria da sessão, gravação idempotente, revalidação de `/`.
- `src/app/(app)/__tests__/finance-kpis.test.tsx`: quatro cards em BRL, variação, links filtrados,
  destaque do vencido, esqueleto acessível; sem permissão não renderiza.
- `src/app/(app)/__tests__/home-tour.test.tsx`: diálogo acessível, avanço dos passos, Concluir, Pular
  e Esc gravam e fecham.
- `src/app/(app)/__tests__/page.test.tsx` (estendida): tour na primeira visita, ausente para quem já
  viu e para quem não lê o financeiro.

## Verificação no navegador

- Login pelo acesso rápido de desenvolvimento (sem senha; só em `NODE_ENV=development`).
- **Administrador**: os quatro cards apareceram com valores reais do banco local; o esqueleto surgiu
  no streaming. O tour abriu no passo 1, com foco no botão primário, `aria-modal`, `aria-labelledby`
  e `aria-describedby` corretos. Avançou até "Passo 4 de 4", onde só restou "Concluir". Após
  concluir, recarregar a página não trouxe o tour de volta, e o chunk do tour deixou de ser baixado.
- **Segundo usuário**: tour apareceu novamente; "Pular" fechou e, ao recarregar, não voltou.
- Banco: `financeTourSeenAt` preenchido para os dois usuários que viram o tour.
- Sem erros de console nem de servidor. Em 375 px, sem rolagem horizontal; os cards empilham.

## Checks

- `pnpm typecheck`: sem erros.
- `pnpm lint`: sem erros (fora de `release/`, que é ignorado).
- `pnpm exec jest --runInBand`: sem falhas.
- `pnpm build`: concluído com sucesso.

A integração (`test:integration`) não foi executada aqui por depender de banco PostgreSQL descartável
dedicado; nada nesta entrega altera as leituras ou escritas financeiras existentes cobertas por ela.
