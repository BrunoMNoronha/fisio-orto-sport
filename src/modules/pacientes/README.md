# pacientes

Cadastro e consulta cadastral de pacientes (Fase 2a; sexo e profissão na Fase 2c). **Somente dados cadastrais e de contato.** Anamnese, avaliações e demais dados clínicos não ficam aqui: terão entidades próprias protegidas por `clinico:*`.

## Peças

| Arquivo | Papel |
|---|---|
| `validation.ts` | Schemas zod (mensagens em pt-BR), validação de CPF (dígitos verificadores), telefone, data de nascimento, regra do responsável legal e parâmetros da listagem. |
| `queries.ts` (`server-only`) | `listPatients()` (busca por nome sem diferenciar acentos nem maiúsculas, filtro por situação, 20 por página, ordem por nome) e `getPatient()`. Ambas exigem `pacientes:ler` e usam `select` explícito, sem `include`. |
| `actions.ts` | `createPatient`, `updatePatient` e `setPatientStatus` (inativar/reativar). Todas exigem `pacientes:gerir` no servidor. **Não há exclusão física.** |
| `documents.ts` (`server-only`) | `getAttendingPhysio()` (quem atendeu: profissional do último agendamento não cancelado já iniciado; senão, autor da anamnese vigente, só com `clinico:ler`), `getAnamnesisAuthor()` (`clinico:ler`) e o texto do termo (`TERMO_SECTIONS`). |
| `src/app/(app)/pacientes/**` | Listagem, ficha, criação (`/pacientes/novo`) e edição (`/pacientes/[id]/editar`). A ficha tem cabeçalho-resumo e abas em `[id]/layout.tsx`: **Resumo** (dados cadastrais, próximos atendimentos e, só com `clinico:ler`, resumo da anamnese vigente), **Anamnese** (`clinico:ler`), **Agendamentos** (`agenda:ler`) e **Documentos** (`pacientes:ler`). `getPatient()` usa `cache()` do React para o layout e a página não repetirem a consulta. |

## Regras

- **CPF**: opcional; gravado só com os 11 dígitos; validado pelos dígitos verificadores; único quando informado (índice único, o Postgres aceita vários `NULL`). Duplicidade responde "Já existe um paciente com este CPF." sem ecoar o valor. O CPF nunca vai para a URL: a busca é só por nome.
- **Telefone**: obrigatório, só dígitos, 10 ou 11 (DDD + número).
- **Sexo** (Fase 2c): enum `Sex` com as opções definidas pela clínica, `FEMININO`, `MASCULINO` e `NAO_INFORMADO` (rótulos em `SEX_LABELS`). **Obrigatório no formulário**, na criação e na edição. No banco a coluna é anulável só para preservar cadastros anteriores à 2c: editar um deles exige escolher o sexo.
- **Profissão** (Fase 2c): opcional, texto livre aparado, até 120 caracteres (`VarChar(120)`); vazio vira `null`.
- Sexo e profissão são dados **cadastrais** (`pacientes:*`), substituem o valor anterior e sem histórico, e aparecem só na ficha, não na listagem.
- **Data de nascimento**: obrigatória, a partir de 1900 e não futura. Guardada como data civil (`@db.Date`); a idade é calculada em UTC.
- **Responsável legal**: para menores de 18 anos, nome e telefone são obrigatórios e o parentesco é opcional. Para adultos, os dados do responsável são descartados (gravados como `null`).
- **Situação**: `ATIVO` ou `INATIVO`. Inativos continuam consultáveis e podem ser reativados. Inativar pede confirmação num diálogo; reativar é direto.
- **Busca por nome**: compara com `Patient.searchName` (nome sem acentos, em minúsculas), mantido no banco pelo trigger `Patient_search_name` (migração `busca_sem_acento`) em toda gravação do nome; a aplicação nunca grava essa coluna. `normalizeSearch()` normaliza o termo do mesmo jeito (um teste confere a tabela de acentos da função SQL).
- **Máscaras**: CPF (`000.000.000-00`) e telefones (`(00) 0000-0000` / `(00) 00000-0000`) são mascarados ao digitar e ao abrir a edição; o servidor continua gravando só os dígitos.
- **Autoria**: `createdById` e `updatedById` apontam para `User` com `onDelete: Restrict`. Não é trilha de auditoria.
- **Observações** são administrativas. A tela avisa para não registrar informação clínica.

## Documentos para impressão

A aba **Documentos** (`[id]/documentos`) lista os documentos e abre cada um em nova aba em `/impressao/pacientes/[id]/...`, fora do shell do app. As páginas são geradas na hora a partir do cadastro (**nada é gravado no servidor**) e o botão "Imprimir / Salvar em PDF" usa a impressão do navegador. A folha é A4, sempre clara (classe `.documento` em `globals.css`), e `@page` não tem margem, o que suprime o cabeçalho e o rodapé do navegador.

| Documento | Rota | Permissão | Conteúdo |
|---|---|---|---|
| Termo de consentimento | `termo-consentimento` | `pacientes:ler` | Texto do termo em uso na clínica, com nome, nascimento, CPF, telefone, e-mail, responsável, fisioterapeuta e CREFITO (quem atendeu) e a data de hoje. Campos vazios saem em branco para preencher à mão. |
| Cartão de frequência | `cartao-frequencia` | `pacientes:ler` | 4 cartões por folha (2×2), com o nome preenchido, convênio em branco (não há o campo) e 20 sessões. |
| Ficha de anamnese | `anamnese` | `clinico:ler` | Anamnese vigente, com assinatura do autor e o CREFITO dele. Sem anamnese, dá 404 e o card da aba aparece como indisponível. |

## Permissões

| Ação | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| Listar e consultar (`pacientes:ler`) | ✓ | ✓ | ✓ |
| Criar, editar, inativar e reativar (`pacientes:gerir`) | ✓ | ✓ | ✓ (desde a #31) |

O autor gravado (`createdById`, `updatedById`) é sempre o usuário logado, qualquer que seja o perfil.

## Fora do escopo (por ora)

Anamnese e dados clínicos, histórico de atendimentos (Fases 3 e 4), upload de anexos, trilha de auditoria, exclusão física e anonimização. Futuras relações com `Patient` devem usar `onDelete: Restrict`.
