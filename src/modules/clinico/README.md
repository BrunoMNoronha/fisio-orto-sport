# clinico

Registros clínicos do paciente. **Dados pessoais sensíveis (LGPD art. 11)**: toda leitura exige `clinico:ler` e toda escrita exige `clinico:gerir`, checados no servidor.

Implementado até agora: **anamnese subjetiva** (Fase 2b), **avaliação fisioterapêutica inicial** (Fase 4, issue #24) e **plano terapêutico** com revisões (Fase 4, issue #25). Sessões, evolução, reavaliação e alta continuam para depois.

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
| `plan-validation.ts` | Schemas do plano (criação com `assessmentId`; revisão com `kind`, `reason` e `baseRevision`; encerramento e reabertura), limites (`PLAN_LIMITS`), rótulos e `samePlanContent()`. |
| `plan-queries.ts` (`server-only`) | `listPlans()` (10 por página, só metadados), `getPlan()` (origem e revisão vigente), `getPlanRevision()`, `listPlanRevisions()`, `listPlanStatusChanges()` e `listPlanOriginOptions()`. Todas filtram pelo paciente. |
| `plan-actions.ts` | `createPlan`, `revisePlan` e `changePlanStatus`, todas com `clinico:gerir`. |
| `src/app/(app)/pacientes/[id]/planos/**` | Lista, novo (`/novo?avaliacao=<id>`), detalhe (`/[planoId]`), nova revisão (`/[planoId]/revisar`) e revisão específica (`/[planoId]/revisoes/[numero]`). |
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

## Plano terapêutico (`TherapyPlan`)

Decisões de Bruno para a #25, em 26/09 (as de autoria, CREFITO e paciente inativo seguem a #24):

- **Origem:** todo plano decorre de uma avaliação inicial do mesmo paciente. A FK composta `(assessmentId, patientId) → Assessment(id, patientId)` garante isso no banco, e a action também confere e responde no campo. O plano guarda `assessmentVersion`, a versão exata da avaliação usada. Edições posteriores da avaliação não mudam o plano, e o detalhe avisa quando a avaliação ficou mais nova. Criar ou revisar o plano **nunca** altera a avaliação. Os objetivos da avaliação só entram no plano quando o profissional clica em "Usar estes objetivos no plano", e nada é sincronizado depois.
- **Campos:** data clínica do plano, objetivos terapêuticos e conduta são **obrigatórios**. Técnicas, exercícios, quantidade prevista de sessões (inteiro de 1 a 100), frequência, critério ou previsão de reavaliação e observações são opcionais. Frequência e reavaliação são **texto livre**, sem automação.
- **Datas:** a data clínica não pode ser futura (`America/Sao_Paulo`) nem anterior à data da avaliação de origem. Lançamento retroativo é permitido. `createdAt` é técnico.
- **Quantidade prevista** é só informativa: não é saldo, pacote nem autorização de convênio. Não bloqueia atendimento nem encerra o plano. Salvar um plano não agenda, não cobra e não dá alta.
- **Revisões imutáveis:** o conteúdo fica em `TherapyPlanRevision`. A revisão 1 é `INICIAL`, sem motivo. Cada correção cria a revisão seguinte, com tipo `CORRECAO` (erro de registro) ou `MUDANCA_CLINICA` (mudança do planejamento) e motivo obrigatório. Nenhuma revisão é alterada ou apagada. A **vigente** é a de número `TherapyPlan.currentRevision`, sempre a maior. Revisão idêntica à vigente é recusada. Sessões futuras devem apontar para a revisão efetivamente usada, que tem id estável e `(planId, number)` único. Uma reavaliação futura vai originar uma nova revisão; nesta entrega, o primeiro plano não exige reavaliação.
- **Concorrência de revisões:** o formulário envia a `baseRevision` carregada. O `UPDATE TherapyPlan ... WHERE currentRevision = base AND status = 'ATIVO'` só avança se ninguém revisou nem encerrou antes, e a unicidade `(planId, number)` é a segunda barreira. Se perder a corrida, nada é gravado e a mensagem pede para recarregar a página.
- **Vários planos por paciente** (um por demanda), com estado `ATIVO` ou `ENCERRADO`. Encerrar e reabrir exigem motivo e ficam em `TherapyPlanStatusChange`, com assinatura. **Encerrar não é alta clínica.** Plano encerrado não recebe revisão até ser reaberto. Admin e Fisioterapeuta podem fazer as duas coisas.
- **Paciente inativo:** consulta liberada, mas nada de criar, revisar, encerrar ou reabrir. Usa o mesmo `FOR UPDATE` do paciente (`assertPatientCanReceivePlan`).
- **Autoria:** nome e CREFITO (anulável) do usuário autenticado, gravados no plano, em cada revisão e em cada mudança de estado. Vêm de `signature()` em `rules.ts`, dentro da transação.
- **CHECKs manuais** (migração `plano_terapeutico`): `TherapyPlan_assessmentVersion_positive`, `TherapyPlan_currentRevision_positive`, `TherapyPlanRevision_kind_matches_number` (INICIAL só na 1ª e sem motivo; as demais com motivo), objetivos e conduta não vazios, `TherapyPlanRevision_plannedSessions_range` (1–100), `TherapyPlanStatusChange_changes_status`, motivo e nomes não vazios. A migração também cria o índice único `Assessment(id, patientId)`, alvo da FK composta. É uma mudança só aditiva.
- **Integração** (`test/integration/plano.integration.ts`): cobre a FK composta, os CHECKs, o `Restrict`, a origem preservada após editar a avaliação, revisões concorrentes, encerramento concorrente com revisão e inativação concorrente.

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
| Ver planos, revisões e histórico de estado (`clinico:ler`) | ✓ | — | ✓ |
| Criar, revisar, encerrar e reabrir plano (`clinico:gerir`) | ✓ | — | ✓ |

A Recepção não vê as abas Anamnese, Avaliações e Planos nem os atalhos clínicos na ficha, é redirecionada para `/acesso-negado` por URL direta e recebe "Acesso negado." ao chamar a action diretamente. Usuário inativo perde a sessão e não acessa nada.

## Fora do escopo (por ora)

Sessões, evolução, reavaliação e alta (Fase 4); CREFITO na assinatura da anamnese (a Fase 2c guardou o CREFITO só em `User.crefito`; sexo e profissão ficaram em `Patient`); trilha de auditoria de leitura; anexos; retenção/anonimização; edição ou exclusão de versões.
