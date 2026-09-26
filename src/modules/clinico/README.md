# clinico

Registros clínicos do paciente. **Dados pessoais sensíveis (LGPD art. 11)**: toda leitura exige `clinico:ler` e toda escrita exige `clinico:gerir`, checados no servidor.

Implementado até agora: **anamnese subjetiva** (Fase 2b) e **avaliação fisioterapêutica inicial** (Fase 4, issue #24). Plano terapêutico, sessões, evolução e reavaliação continuam para depois.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schema zod da anamnese (mensagens em pt-BR), limites por campo (`LIMITS`, iguais aos `@db.VarChar`), leitura do `FormData` (`painTypes` via `getAll`) e `isPlausibleId()`. |
| `rules.ts` (`server-only`) | `assertPatientCanReceiveAnamnesis()`: paciente existe e está `ATIVO`. Roda dentro da transação da action. |
| `queries.ts` (`server-only`) | `getCurrentAnamnesis()`, `getAnamnesisVersion()` e `listAnamnesisVersions()`, todas com `requirePermission("clinico:ler")` e `select` explícito. O histórico traz só metadados (data, autor), sem conteúdo clínico. |
| `actions.ts` | `createAnamnesisVersion(patientId, …)` (usada com `.bind`). Exige `clinico:gerir` e **só cria** registros. |
| `assessment-validation.ts` | Schemas zod da avaliação (criação com `anamnesisId`; edição com `version`), limites (`ASSESSMENT_LIMITS`, iguais aos `@db.VarChar`), rótulos por campo e `diffAssessment()` (campos alterados, datas em AAAA-MM-DD). |
| `assessment-queries.ts` (`server-only`) | `listAssessments()` (10 por página), `getAssessment()` e `listAssessmentChanges()`, com `clinico:ler` e filtro pelo paciente. A listagem traz só metadados. |
| `assessment-actions.ts` | `createAssessment(patientId, …)` e `updateAssessment(patientId, assessmentId, …)`, ambas com `clinico:gerir`. |
| `src/app/(app)/pacientes/[id]/avaliacoes/**` | Lista (`/avaliacoes?pagina=N`), nova (`/nova`), detalhe (`/[avaliacaoId]`) e edição (`/[avaliacaoId]/editar`). |
| `src/app/(app)/pacientes/[id]/anamnese/**` | Versão vigente (`/anamnese`), nova versão (`/nova`), histórico (`/historico`) e versão específica (`/historico/[versaoId]`). |

## Modelo `Anamnesis`

- **Campos:** queixa principal (obrigatória), HDA, antecedentes pessoais e patológicos, cirurgias, medicamentos, hábitos e atividade física, dor relatada (EVA 0–10, localização e tipos `PONTADA`/`QUEIMACAO`/`PESO`/`IRRADIADA` com múltipla seleção), limitações funcionais relatadas, objetivos do paciente e observações.
- **`assessmentDate`** (`date`): data clínica da avaliação, informada pelo profissional. Não pode ser futura. **`createdAt`**: momento técnico em que a versão foi salva. Registrar depois uma avaliação feita antes é permitido.
- **`authorNameSnapshot`**: nome do autor copiado do usuário autenticado no momento da criação, nunca do formulário. A assinatura exibida continua histórica mesmo se o usuário mudar de nome. `authorId` mantém a autoria técnica (FK `Restrict`).
- **FKs** `patientId` e `authorId` com `onDelete: Restrict`. Não há exclusão física.
- **`painTypes`** é `NOT NULL` com default `{}` (migração `clinico_anamnese_paintypes_not_null`): "nenhum tipo marcado" é sempre lista vazia, nunca `NULL`. A migração converteu `NULL` existentes em `{}`, o único backfill feito em versões gravadas, sem mudança de significado.
- **CHECKs manuais** na migração `clinico_anamnese`, que **não aparecem no schema Prisma**: `Anamnesis_painIntensity_range` (EVA nula ou entre 0 e 10), `Anamnesis_chiefComplaint_not_blank` e `Anamnesis_authorNameSnapshot_not_blank`. Se o modelo mudar, recrie-os na nova migração.

## Regras

- **Versionamento append-only** (suposição técnica reversível; ver `docs/PROJECT.md`): cada salvamento cria uma nova versão imutável. Não há update nem delete. A **versão vigente** é a de maior `createdAt`, com desempate pelo maior `id`. `assessmentDate` não define a vigente. A nova versão parte do texto da vigente, pré-preenchido no formulário.
- **Paciente inativo:** continua consultável, inclusive a anamnese existente, mas **não recebe nova versão** até ser reativado. A action recusa com mensagem em pt-BR, e a tela esconde a ação e mostra um aviso.
- **Concorrência com a inativação:** dentro da transação, `assertPatientCanReceiveAnamnesis` lê o status com `SELECT ... FOR UPDATE`, que trava a linha do paciente até o commit. Sem esse lock, a FK do INSERT pega só `FOR KEY SHARE`, que não conflita com o UPDATE de status. Com ele, em READ COMMITTED: se a inativação vier antes, a criação espera, relê `INATIVO` e é recusada; se a criação vier antes, a inativação espera o commit da versão. `setPatientStatus` usa um único `UPDATE`, que também trava a linha. Qualquer nova escrita de status precisa usar UPDATE direto ou `FOR UPDATE`.
- **Teste de integração** (`test/integration/anamnese.integration.ts`, `node:test` via tsx, fora do Jest porque o runtime ESM do Prisma 7 não carrega nele): cobre o `NOT NULL` e as duas ordens da concorrência. Roda só contra um banco **descartável** já migrado: `INTEGRATION_DATABASE_URL=<url> pnpm test:integration`. Sem a variável, a suíte é pulada.
- **Paciente inexistente**, id implausível ou versão de outro paciente resultam em `notFound()` nas páginas e em estado controlado na action. Toda consulta filtra por `patientId`, então não é possível ler a versão de um paciente pela URL de outro.

## Avaliação inicial (`Assessment`)

Decisões de Bruno (D1–D3 de 18/09 e respostas às pendências da #24, em 26/09):

- **Campos:** data clínica, anamnese de referência e diagnóstico fisioterapêutico são **obrigatórios**. Inspeção e postura, palpação, avaliação funcional e marcha, ADM, força muscular, testes especiais, objetivos terapêuticos e observações são texto livre opcional. Em branco significa **"não informado"**, nunca resultado normal. ADM e força são texto com orientação de contexto (segmento, lado, movimento, unidade; grupo, lado e graduação MRC), sem validação numérica. Os objetivos terapêuticos são do profissional e ficam distintos dos objetivos relatados pelo paciente na anamnese.
- **Anamnese de referência é obrigatória:** sem anamnese, a lista mostra o atalho "Registrar anamnese". A vigente vem pré-selecionada, e dá para escolher outra versão do mesmo paciente. A referência é fixada na criação e não muda na edição. A **FK composta** `(anamnesisId, patientId) → Anamnesis(id, patientId)` garante no banco que ela é do mesmo paciente. A action também confere isso e responde no campo, sem revelar se o id existe em outro paciente. Como as versões da anamnese são imutáveis, uma nova versão não altera o contexto de uma avaliação já registrada.
- **Várias avaliações iniciais por paciente** são permitidas (novas demandas), sem modelar episódios de tratamento. Não há vínculo com a agenda.
- **Datas:** `assessmentDate` não pode ser futura no calendário de `America/Sao_Paulo`, e o lançamento retroativo é permitido. `createdAt` e `updatedAt` são técnicos. A lista ordena por data clínica, depois `createdAt` e depois `id`, todos decrescentes.
- **Autoria (D1/D3):** `authorNameSnapshot` e `authorCrefitoSnapshot` são lidos do usuário autenticado dentro da transação, nunca do formulário. O CREFITO é anulável, porque o Administrador pode registrar sem CREFITO. Nenhuma credencial é atribuída a ele. Mudanças posteriores de nome ou CREFITO não alteram a assinatura gravada.
- **Edição com histórico por campo (D2):** a avaliação é editável. Cada edição grava em `AssessmentChange` uma linha por campo alterado, com valor anterior, valor novo, `version` resultante e assinatura (nome e CREFITO) de quem editou, tudo na mesma transação da alteração. Sem mudanças, nada é gravado. O histórico aparece em acordeão (`<details>`) no detalhe e na edição. Não há exclusão, e as FKs usam `Restrict`. Essa edição vale **só para a avaliação**: a anamnese continua append-only.
- **Edições concorrentes:** checagem otimista. O formulário envia a `version` carregada, e o `UPDATE ... WHERE version = <carregada>` só grava se ninguém salvou antes. Caso contrário, nada é gravado e a mensagem pede para recarregar a página.
- **Paciente inativo:** as avaliações continuam consultáveis, mas o paciente não recebe nova avaliação nem edição. Usa o mesmo `SELECT ... FOR UPDATE` do paciente da anamnese (`assertPatientCanReceiveAssessment`), então a concorrência com a inativação segue a mesma regra.
- **CHECKs manuais** (migração `avaliacao_inicial`, fora do schema Prisma): `Assessment_diagnosis_not_blank`, `Assessment_authorNameSnapshot_not_blank`, `Assessment_version_positive`, `AssessmentChange_version_after_first` e `AssessmentChange_editorNameSnapshot_not_blank`. A migração também cria o índice único `Anamnesis(id, patientId)`, alvo da FK composta. É uma mudança só aditiva.
- **Integração** (`test/integration/avaliacao.integration.ts`): cobre a FK composta, os CHECKs, a preservação de contexto e autoria, o `Restrict`, a inativação concorrente, a edição concorrente com a mesma versão e a unicidade do histórico.
- **Fora do escopo:** plano terapêutico, sessões, evolução, reavaliação, impressão e PDF da avaliação, anexos, assinatura digital e backfill de CREFITO nas anamneses antigas (D1 prevê isso, mas esta entrega não mexe na anamnese).

## Privacidade

- Nenhum dado clínico em URL, metadata de página (títulos genéricos), logs ou mensagens de erro. As mensagens nunca ecoam o conteúdo enviado.
- Consultas cadastrais de `pacientes` usam `select` explícito sem campos nem relações clínicas (coberto por teste).
- Testes, seeds e screenshots só com dados fictícios.

## Permissões (matriz vigente, sem alteração)

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver anamnese, histórico e atalho na ficha (`clinico:ler`) | ✓ | — | ✓ |
| Registrar nova versão (`clinico:gerir`) | ✓ | — | ✓ |
| Ver avaliações, detalhe e histórico (`clinico:ler`) | ✓ | — | ✓ |
| Criar e editar avaliação (`clinico:gerir`) | ✓ | — | ✓ |

A Recepção não vê as abas Anamnese e Avaliações nem os atalhos clínicos na ficha, é redirecionada para `/acesso-negado` por URL direta e recebe "Acesso negado." ao chamar a action diretamente. Usuário inativo perde a sessão e não acessa nada.

## Fora do escopo (por ora)

Conduta/plano, sessões, evolução e reavaliação (Fase 4); CREFITO na assinatura da anamnese (a Fase 2c guardou o CREFITO só em `User.crefito`; sexo e profissão ficaram em `Patient`); trilha de auditoria de leitura; anexos; retenção/anonimização; edição ou exclusão de versões.
