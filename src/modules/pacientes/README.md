# pacientes

Cadastro e consulta cadastral de pacientes (Fase 2a). **Somente dados cadastrais e de contato.** Anamnese, avaliações e demais dados clínicos não ficam aqui: terão entidades próprias protegidas por `clinico:*`.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schemas zod (mensagens em pt-BR), validação de CPF (dígitos verificadores), telefone, data de nascimento, regra do responsável legal e parâmetros da listagem. |
| `queries.ts` (`server-only`) | `listPatients()` (busca por nome, filtro por situação, 20 por página, ordem por nome) e `getPatient()`. Ambas exigem `pacientes:ler` e usam `select` explícito, sem `include`. |
| `actions.ts` | `createPatient`, `updatePatient` e `setPatientStatus` (inativar/reativar). Todas exigem `pacientes:gerir` no servidor. **Não há exclusão física.** |
| `src/app/(app)/pacientes/**` | Listagem, ficha (`/pacientes/[id]`), criação (`/pacientes/novo`) e edição (`/pacientes/[id]/editar`). |

## Regras

- **CPF**: opcional; gravado só com os 11 dígitos; validado pelos dígitos verificadores; único quando informado (índice único, o Postgres aceita vários `NULL`). Duplicidade responde "Já existe um paciente com este CPF." sem ecoar o valor. O CPF nunca vai para a URL: a busca é só por nome.
- **Telefone**: obrigatório, só dígitos, 10 ou 11 (DDD + número).
- **Data de nascimento**: obrigatória, a partir de 1900 e não futura. Guardada como data civil (`@db.Date`); a idade é calculada em UTC.
- **Responsável legal**: para menores de 18 anos, nome e telefone são obrigatórios e o parentesco é opcional. Para adultos, os dados do responsável são descartados (gravados como `null`).
- **Situação**: `ATIVO` ou `INATIVO`. Inativos continuam consultáveis e podem ser reativados.
- **Autoria**: `createdById` e `updatedById` apontam para `User` com `onDelete: Restrict`. Não é trilha de auditoria.
- **Observações** são administrativas. A tela avisa para não registrar informação clínica.

## Permissões (matriz vigente, sem alteração)

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Listar e consultar (`pacientes:ler`) | ✓ | ✓ | ✓ |
| Criar, editar, inativar e reativar (`pacientes:gerir`) | ✓ | ✓ | — |

## Fora do escopo (por ora)

Anamnese e dados clínicos, histórico de atendimentos (Fases 3 e 4), documentos e anexos, trilha de auditoria, exclusão física e anonimização. Futuras relações com `Patient` devem usar `onDelete: Restrict`.
