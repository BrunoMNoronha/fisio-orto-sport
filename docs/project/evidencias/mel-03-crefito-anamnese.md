# MEL-03 (#46) — migração, recuperação e evidências

Snapshot de CREFITO na assinatura da anamnese. Decisões de Bruno M Noronha em
27/09/2026:

- **Sem backfill:** as versões antigas ficam sem CREFITO e mostram "CREFITO não
  registrado nesta versão". Isso substitui a parte de backfill da D1 (18/09).
- **Impressão:** usa só a assinatura gravada na versão, nunca o cadastro atual
  do autor.
- **Autor sem CREFITO:** mantém a política já vigente (D3). O Administrador
  assina só com o nome, e o CREFITO fica nulo.

## Migração `20260927230000_anamnese_crefito`

Aditiva, sem reescrever conteúdo clínico:

| Objeto | Mudança |
|---|---|
| `Anamnesis.authorCrefitoSnapshot` | `VARCHAR(20)` anulável |
| `Anamnesis.authorCrefitoRecorded` | `BOOLEAN NOT NULL`. As linhas existentes recebem `false`, porque a coluna é criada com `DEFAULT false`. Depois o padrão passa a `true` |
| `Anamnesis_legacy_without_crefito` | CHECK manual: versão com `authorCrefitoRecorded = false` nunca tem CREFITO |

Conferido que uma anamnese criada antes da migração ficou com `false` e
CREFITO nulo, e que `prisma migrate diff` do banco migrado para
`schema.prisma` sai vazio.

### Aplicação em produção

Depende de autorização própria e deve ser feita **antes do merge**: sem as
colunas, o código novo falha ao ler a anamnese. O procedimento é o das
migrações anteriores (ponto de restauração no Neon, SQL e registro em
`_prisma_migrations` com o checksum sha256, depois conferir a estrutura).

## Recuperação

- **Reverter o banco:**

  ```sql
  ALTER TABLE "Anamnesis" DROP CONSTRAINT "Anamnesis_legacy_without_crefito";
  ALTER TABLE "Anamnesis" DROP COLUMN "authorCrefitoRecorded", DROP COLUMN "authorCrefitoSnapshot";
  DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927230000_anamnese_crefito';
  ```

  Depois, voltar o código (redeploy na Vercel). Isso descarta os CREFITOs
  gravados nas versões novas. As versões em si e o conteúdo clínico não são
  afetados.
- **Rollback só de código** é seguro: o código anterior não lê as colunas
  novas, e as versões criadas por ele recebem o padrão `true` com CREFITO nulo.
  Nesse período, essas versões apareceriam como "autor sem CREFITO", não como
  legado. Isso deve ser registrado se ocorrer.

## Evidências (27/09/2026, ambiente local)

Banco PostgreSQL 17 descartável (`fisio_mel03_test`) no Docker local, migrado
com `prisma migrate deploy`.

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | ok |
| `pnpm lint` | ok |
| `pnpm exec jest --runInBand` | 65 suítes, 719 testes ok |
| `pnpm test:integration` | 95 testes ok, 3 novos em `anamnese.integration.ts` |
| `pnpm build` | ok |
| `prisma migrate diff` banco migrado → schema | vazio |

Os testes cobrem:

- **Autoria:** nome e CREFITO são lidos do cadastro na transação, não da
  sessão nem do formulário. Um formulário forjado com `authorCrefitoSnapshot`
  ou `authorCrefitoRecorded` é ignorado.
- **Mudança de cadastro:** uma alteração posterior não muda a versão gravada;
  a nova versão leva o cadastro novo.
- **Administrador:** CREFITO nulo, mas registrado.
- **Legado:** o CHECK recusa CREFITO em versão legada.
- **Exibição:** os três casos de assinatura (`signature.test.ts`).
- **Regras mantidas:** append-only e autorização (Recepção negada) seguem
  cobertos.

No `next dev` local, com dados fictícios, as versões anteriores mostram
"Administrador (CREFITO não registrado nesta versão)" no detalhe e no
histórico. A impressão mostra "Administrador · CREFITO não registrado nesta
versão". Não houve erros no console.
