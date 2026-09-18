# Prompt executor — Fase 2b: Anamnese do paciente

## Contexto

Repositório `C:\Development\Projects\fisio-orto-sport`, branch `main` limpa. Stack e decisões estão em `docs/PROJECT.md`. Este é um Next.js 16.3.5 com mudanças incompatíveis: antes de escrever código, leia o guia relevante em `node_modules/next/dist/docs/`, conforme `AGENTS.md`.

Já existem:

- Fase 1: autenticação com sessão no banco, DAL `server-only` e matriz em `src/modules/auth/permissions.ts`. `clinico:ler/gerir` pertence a ADMIN e FISIOTERAPEUTA, não à RECEPCAO.
- Fase 2a: `Patient` somente com dados cadastrais (`src/modules/pacientes/README.md`).
- Fase 3, primeira fatia: `Appointment` (`src/modules/agenda/README.md`).
- `src/modules/clinico/` existe, mas ainda não tem implementação.

## Objetivo

Implementar a anamnese como primeiro registro clínico, no módulo `clinico`. O fisioterapeuta ou administrador registra e consulta a anamnese a partir da ficha do paciente. A Recepção não vê nem acessa dados clínicos.

## Escopo

1. Criar o modelo Prisma `Anamnesis` e a migração aditiva `clinico_anamnese`.
   - Relação `patient` com `Patient`, usando `onDelete: Restrict`.
   - Relação `author` com `User`, usando `onDelete: Restrict`.
   - Identificação: `id`, `patientId` e `authorId`.
   - Datas:
     - `assessmentDate` (`@db.Date`): data clínica da avaliação, informada pelo profissional. É obrigatória e não pode ser futura.
     - `createdAt`: momento técnico em que a versão foi salva.
   - Anamnese:
     - `chiefComplaint`: queixa principal, obrigatória.
     - `currentIllnessHistory`: HDA.
     - `personalPathologicalHistory` e `surgeries`: histórico clínico e cirúrgico.
     - `currentMedications` e `habitsPhysicalActivity`.
   - Dor relatada:
     - `painIntensity`: inteiro opcional de 0 a 10 (EVA).
     - `painLocation`: texto opcional.
     - `painTypes`: lista de enum `PainType` (`PONTADA`, `QUEIMACAO`, `PESO`, `IRRADIADA`), com múltipla seleção, sem duplicatas. Pode ficar vazia.
   - `functionalLimitations`: limitações funcionais relatadas.
   - `patientGoals`: objetivos relatados pelo paciente.
   - `clinicalNotes`: observações.
   - `authorNameSnapshot`: nome do autor copiado do usuário autenticado no momento da criação. A assinatura exibida permanece histórica mesmo que o usuário mude de nome.
   - Usar limites de tamanho coerentes com a validação de entrada.
   - Criar CHECKs manuais no SQL da migração: EVA entre 0 e 10 e queixa não vazia. Documentá-los no README do módulo, porque não aparecem no schema Prisma.
   - Criar índices para `patientId` e para a ordenação por paciente/data.
   - Não adicionar update ou delete físico.

2. Usar versionamento append-only como decisão técnica provisória:
   - Cada salvamento cria um novo registro imutável.
   - A versão vigente é a de maior `createdAt`; usar o maior `id` como desempate determinístico. `assessmentDate` não define a versão vigente.
   - A ficha mostra a versão vigente e o histórico de versões com data e autor.
   - Registrar em `docs/PROJECT.md` como `SUPOSIÇÃO TÉCNICA REVERSÍVEL`, deixando explícito que a clínica ainda precisa validar a escolha entre edição, adendo e versionamento antes da Fase 4.

3. Regras de paciente:
   - Paciente `INATIVO` continua consultável, inclusive sua anamnese existente.
   - Paciente `INATIVO` não pode receber nova versão de anamnese até ser reativado.
   - Documentar essa regra no README do módulo e no `docs/PROJECT.md`.

4. Implementar:
   - `src/modules/clinico/validation.ts`: schemas Zod, mensagens em pt-BR e limites de tamanho por campo.
   - `src/modules/clinico/queries.ts`: `server-only`, exige `clinico:ler`, usa `select` explícito e não retorna dados além do necessário.
   - `src/modules/clinico/actions.ts`: exige `clinico:gerir` no servidor e cria somente novos registros.
   - Telas em `src/app/(app)/pacientes/[id]/anamnese/**`: visualização, nova versão e histórico.
   - Link ou seção na ficha do paciente, visível somente para quem tem `clinico:ler`.

5. Privacidade:
   - Nenhum dado clínico pode aparecer em URL, logs, exceções, metadata de página, mensagens de commit, fixtures, seeds ou screenshots.
   - Testes e screenshots devem usar somente dados fictícios.
   - Consultas cadastrais de pacientes não podem retornar campos clínicos.

6. Documentação:
   - Atualizar `src/modules/clinico/README.md` com peças, regras, permissões, versionamento e comportamento de pacientes inativos.
   - Marcar anamnese como concluída no roadmap do `README.md` somente se a entrega estiver realmente validada.
   - Alterar apenas as linhas necessárias de `docs/PROJECT.md`.

## Mapeamento da ficha em papel

A clínica usa a "Ficha de Avaliação Fisioterapêutica". Cada campo da ficha tem uma fase de destino:

| Ficha | Destino |
|---|---|
| Paciente, data de nascimento/idade, telefone, endereço | `Patient` (já existe) |
| Data da avaliação | 2b: `assessmentDate` |
| 1. Queixa principal | 2b: `chiefComplaint` |
| 2. HDA / anamnese | 2b: `currentIllnessHistory` |
| 3. Histórico clínico/cirúrgico | 2b: `personalPathologicalHistory`, `surgeries` |
| 5. Dor: EVA 0–10, localização e tipo | 2b: `painIntensity`, `painLocation`, `painTypes` |
| 6. Limitações funcionais | 2b: `functionalLimitations` (relatadas) |
| Assinatura: nome do fisioterapeuta | 2b: `authorNameSnapshot` |
| Sexo, profissão, CREFITO | 2c (cadastro complementar): decisão pendente, com as opções de sexo ainda a definir |
| 4. Exame físico: inspeção/postura, palpação, ADM, força muscular MRC, testes especiais, marcha | Fase 4: avaliação inicial |
| 7. Objetivos da fisioterapia | Fase 4: plano terapêutico |
| 8. Conduta / plano de tratamento | Fase 4: plano terapêutico |
| 9. Evolução / reavaliação | Fase 4: evolução e reavaliação |

## Fora do escopo

Cadastro complementar: sexo, profissão e CREFITO (Fase 2c). Exame físico, objetivos terapêuticos, conduta, plano, sessões, evolução e reavaliação (Fase 4); histórico de atendimentos; trilha de auditoria de leitura; anexos; retenção/anonimização; mudanças na matriz de permissões; alterações na agenda; novas dependências; edição ou exclusão de versões existentes.

O histórico desta fase é exclusivamente o histórico de versões da anamnese. O histórico de atendimentos permanece fora do escopo.

## Restrições e autorização

- Usar exclusivamente `pnpm`; preservar `pnpm-lock.yaml` e não usar `npm` ou `npx`.
- Não alterar a matriz de permissões nem reabrir decisões registradas.
- A autorização deve ser verificada no servidor em páginas, queries e actions, nunca somente na UI.
- RECEPCAO deve receber 403 ou `/acesso-negado` por URL direta, chamada direta de query e chamada direta de action.
- Usuário autenticado, mas inativo, não pode consultar nem registrar dados clínicos.
- Seguir os padrões de `pacientes` e `agenda`: módulos, testes, componentes shadcn e tema claro/escuro.

## Aceite

- ADMIN e FISIOTERAPEUTA criam a primeira anamnese e novas versões.
- ADMIN e FISIOTERAPEUTA consultam a versão vigente e o histórico ordenado.
- Nova versão não altera nenhum registro anterior.
- A versão vigente permanece determinística após múltiplas versões.
- RECEPCAO não vê o link, é bloqueada na URL direta e falha ao chamar query ou action diretamente.
- Paciente sem anamnese mostra estado vazio com ação de registrar quando permitido.
- Paciente inexistente e anamnese inexistente produzem estados controlados, sem vazamento de dados.
- Paciente inativo permite consulta, mas rejeita nova versão com mensagem em pt-BR.
- Queixa principal vazia ou campo acima do limite gera erro de validação em pt-BR, sem gravar.
- EVA fora de 0–10 ou não inteira gera erro de validação em pt-BR, sem gravar.
- Tipos de dor aceitam múltipla seleção e rejeitam valores fora do enum.
- A visualização mostra a data da avaliação, todas as seções da anamnese e a assinatura histórica (`authorNameSnapshot`).
- Data da avaliação futura ou inválida gera erro de validação em pt-BR.
- Dados clínicos não aparecem em listagens cadastrais, URLs, logs, erros ou metadata.
- Migração aditiva aplica em banco limpo e em banco local atual sem perda de dados.

## Validações obrigatórias

Executar:

```text
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

Gerar a migração com `prisma migrate dev --create-only`, aplicar com `pnpm exec prisma migrate deploy` e conferir com `pnpm exec prisma migrate status`. Verificar a migração em banco descartável limpo e em uma cópia ou banco local atual. Não executar reset destrutivo no banco de trabalho. Confirmar o estado com Prisma e registrar o resultado.

Os testes devem cobrir:

- validação de campos obrigatórios e limites, incluindo data da avaliação, EVA 0–10 e enum de tipos de dor;
- snapshot do autor vindo do usuário autenticado, nunca do formulário;
- queries e actions por perfil;
- chamada direta sem permissão;
- usuário inativo;
- paciente inexistente;
- paciente inativo;
- versionamento, imutabilidade e critério determinístico da versão vigente;
- ausência de campos clínicos em consultas cadastrais;
- ausência de dados sensíveis em mensagens de erro e logs produzidos pelos testes.

No preview, verificar com dados fictícios:

- login como fisioterapeuta e fluxo completo;
- login como administrador e fluxo completo;
- login como recepção e bloqueio por UI, URL, query e action.

Como a entrega trata dados sensíveis, realizar revisão manual de segurança, registrando os achados no relatório, focada em autorização, enumeração de `patientId` e vazamento de dados antes do merge.

## Git e publicação

- Criar a branch `feat/clinico-anamnese` a partir do commit confirmado da `main`, depois de conferir `git status`, a inexistência da branch e o commit-base. Preservar arquivos não versionados, sem reset, stash ou clean.
- Fazer commits pequenos e em português.
- Fazer push e abrir PR com resumo, decisões, riscos e evidências.
- Mesclar somente após todas as validações e checks passarem. No relatório, usar os nomes reais dos checks exibidos pela PR.
- Não publicar deploy: o alvo permanece `TBD`.
- O relatório deve informar branch, commits, PR, estado dos checks e confirmação efetiva do merge.

## Relatório obrigatório

Informar:

- status: concluído, parcial ou bloqueado;
- resultado e arquivos alterados;
- decisões e suposições, incluindo versionamento e paciente inativo;
- validações, comandos, resultados, migrações e screenshots;
- evidência de autorização no servidor e ausência de vazamento;
- branch, commits, PR, merge e deploy não realizado;
- pendências, riscos e itens fora do escopo;
- próxima ação, somente se necessária.
