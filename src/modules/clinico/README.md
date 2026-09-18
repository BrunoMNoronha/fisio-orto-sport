# clinico

Registros clínicos do paciente. **Dados pessoais sensíveis (LGPD art. 11)**: toda leitura exige `clinico:ler` e toda escrita exige `clinico:gerir`, checados no servidor.

Implementado até agora: **anamnese subjetiva** (Fase 2b). Avaliação inicial com exame físico, plano terapêutico, sessões, evolução e reavaliação ficam para a Fase 4.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schema zod da anamnese (mensagens em pt-BR), limites por campo (`LIMITS`, iguais aos `@db.VarChar`), leitura do `FormData` (`painTypes` via `getAll`) e `isPlausibleId()`. |
| `rules.ts` (`server-only`) | `assertPatientCanReceiveAnamnesis()`: paciente existe e está `ATIVO`. Roda dentro da transação da action. |
| `queries.ts` (`server-only`) | `getCurrentAnamnesis()`, `getAnamnesisVersion()` e `listAnamnesisVersions()`, todas com `requirePermission("clinico:ler")` e `select` explícito. O histórico traz só metadados (data, autor), sem conteúdo clínico. |
| `actions.ts` | `createAnamnesisVersion(patientId, …)` (usada com `.bind`). Exige `clinico:gerir` e **só cria** registros. |
| `src/app/(app)/pacientes/[id]/anamnese/**` | Versão vigente (`/anamnese`), nova versão (`/nova`), histórico (`/historico`) e versão específica (`/historico/[versaoId]`). |

## Modelo `Anamnesis`

- **Campos:** queixa principal (obrigatória), HDA, antecedentes pessoais e patológicos, cirurgias, medicamentos, hábitos e atividade física, dor relatada (EVA 0–10, localização e tipos `PONTADA`/`QUEIMACAO`/`PESO`/`IRRADIADA` com múltipla seleção), limitações funcionais relatadas, objetivos do paciente e observações.
- **`assessmentDate`** (`date`): data clínica da avaliação, informada pelo profissional. Não pode ser futura. **`createdAt`**: momento técnico em que a versão foi salva. Registrar depois uma avaliação feita antes é permitido.
- **`authorNameSnapshot`**: nome do autor copiado do usuário autenticado no momento da criação, nunca do formulário. A assinatura exibida continua histórica mesmo se o usuário mudar de nome. `authorId` mantém a autoria técnica (FK `Restrict`).
- **FKs** `patientId` e `authorId` com `onDelete: Restrict`. Não há exclusão física.
- **CHECKs manuais** na migração `clinico_anamnese`, que **não aparecem no schema Prisma**: `Anamnesis_painIntensity_range` (EVA nula ou entre 0 e 10), `Anamnesis_chiefComplaint_not_blank` e `Anamnesis_authorNameSnapshot_not_blank`. Se o modelo mudar, recrie-os na nova migração.

## Regras

- **Versionamento append-only** (suposição técnica reversível; ver `docs/PROJECT.md`): cada salvamento cria uma nova versão imutável. Não há update nem delete. A **versão vigente** é a de maior `createdAt`, com desempate pelo maior `id`. `assessmentDate` não define a vigente. A nova versão parte do texto da vigente, pré-preenchido no formulário.
- **Paciente inativo:** continua consultável, inclusive a anamnese existente, mas **não recebe nova versão** até ser reativado. A action recusa com mensagem em pt-BR, e a tela esconde a ação e mostra um aviso.
- **Paciente inexistente**, id implausível ou versão de outro paciente resultam em `notFound()` nas páginas e em estado controlado na action. Toda consulta filtra por `patientId`, então não é possível ler a versão de um paciente pela URL de outro.

## Privacidade

- Nenhum dado clínico em URL, metadata de página (títulos genéricos), logs ou mensagens de erro. As mensagens nunca ecoam o conteúdo enviado.
- Consultas cadastrais de `pacientes` usam `select` explícito sem campos nem relações clínicas (coberto por teste).
- Testes, seeds e screenshots só com dados fictícios.

## Permissões (matriz vigente, sem alteração)

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Ver anamnese, histórico e atalho na ficha (`clinico:ler`) | ✓ | — | ✓ |
| Registrar nova versão (`clinico:gerir`) | ✓ | — | ✓ |

A Recepção não vê o atalho na ficha do paciente, é redirecionada para `/acesso-negado` por URL direta e recebe "Acesso negado." ao chamar a action diretamente. Usuário inativo perde a sessão e não acessa nada.

## Fora do escopo (por ora)

Exame físico, objetivos terapêuticos, conduta/plano, sessões, evolução e reavaliação (Fase 4); sexo, profissão e CREFITO (Fase 2c, decisão pendente); trilha de auditoria de leitura; anexos; retenção/anonimização; edição ou exclusão de versões.
