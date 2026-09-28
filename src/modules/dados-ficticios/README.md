# dados-ficticios

Geração de dados fictícios **só em desenvolvimento**, usando apenas os usuários já cadastrados
(issue #73). Em Configurações → **Desenvolvimento** → **Popular com dados fictícios**, exclusivo do
Administrador.

| Arquivo | Papel |
|---|---|
| `catalog.ts` | Conjunto `demo-v1`: pacientes, datas relativas, textos, quantidades e conferência de consistência. Puro |
| `guard.ts` | Habilitação técnica do ambiente e do alvo. Pura (recebe o ambiente) |
| `generate.ts` | Geração transacional sobre um cliente Prisma qualquer (a action e o teste de integração usam o mesmo código) |
| `queries.ts` | Resumo mostrado antes da confirmação |
| `actions.ts` | Server Action: ambiente → sessão → perfil → geração |

## Habilitação (desligada por padrão)

Não é parâmetro de negócio: não há opção na interface que a ligue. A seção só aparece, e a action só
executa, quando **todas** as condições valem:

- `NODE_ENV=development` (`pnpm dev`) e fora da Vercel (`VERCEL` ausente);
- `DEMO_DATA_TARGET` no `.env` com o alvo permitido no formato `host/banco`, por exemplo
  `DEMO_DATA_TARGET="localhost/fisio_orto_sport"`;
- `DATABASE_URL` aponta exatamente para esse alvo, e o host é local (`localhost`, `127.0.0.1` ou
  `::1`). Um banco remoto nunca é aceito, mesmo que declarado;
- dentro da transação, `current_database()` confere com o banco do alvo.

A URL de conexão e as credenciais nunca aparecem na interface, nas mensagens nem nos logs: só
`host/banco`.

## Conjunto `demo-v1`

Datas relativas à **data de referência** (hoje, em America/Sao_Paulo, no momento da execução).

| Paciente | Conteúdo |
|---|---|
| P1 — Ana Fictícia Demonstração | Anamnese e avaliação (−28 d), plano (−27 d), 3 agendamentos passados com comparecimento e atendimento (−21, −14, −7 d), reavaliação (−1 d) e 1 agendamento futuro (+3 d) |
| P2 — Bruno Fictício Demonstração | Anamnese e avaliação (−10 d), plano (−9 d), 1 agendamento passado com atendimento (−3 d) e 1 futuro (+2 d) |
| P3 — Carla Fictícia Demonstração | Anamnese (−5 d), 1 falta avisada (−4 d) e 1 agendamento futuro (+1 d) |
| P4 — Diego Fictício Demonstração | Só cadastro, 1 agendamento futuro (+4 d) e 1 cancelado (+5 d) |

**Quantidades:** 4 pacientes, 10 agendamentos, 3 anamneses, 2 avaliações, 2 planos (2 revisões
iniciais), 4 atendimentos e 1 reavaliação. Não cria bloqueios de agenda nem históricos de edição.

**Identificação fictícia:**

- nomes com "Fictício/Fictícia Demonstração";
- sem CPF, e-mail ou endereço; telefones `(11) 90000-000N`;
- a observação administrativa do paciente começa com o marcador estável
  `[conjunto-ficticio:demo-v1:PN]`;
- todo texto clínico começa com `[DADO FICTÍCIO — conjunto demo-v1; não é atendimento real]`.

Nenhuma mensagem é enviada.

## Usuários

Nenhum `User` é criado, alterado ou removido: perfil, estado, senha e CREFITO ficam como estão.

- **Executor:** o Administrador ativo que confirma. Ele cadastra os pacientes e os agendamentos e
  assina os registros clínicos, como faria pela interface. Os snapshots de autoria vêm do cadastro
  dele, na transação.
- **Profissional** dos agendamentos e atendimentos: um `FISIOTERAPEUTA` **ativo com CREFITO**, as
  mesmas condições da agenda mais o CREFITO que o cadastro atual exige. Os pacientes são distribuídos
  entre os elegíveis em ordem estável (nome e id).
- **Sem fisioterapeuta elegível:** a geração é recusada com orientação, e nada é gravado.

## Regras preservadas

- **Agenda:**
  - profissional apto;
  - sem agendamento sobre bloqueio ativo ou sobre outro agendamento do profissional;
  - aviso de conflito do paciente respeitado.
  Se o horário preferido estiver ocupado, usa o próximo livre do dia; sem horário livre, recusa tudo.
  A constraint `Appointment_no_overlap` continua valendo.
- **Clínico:**
  - datas clínicas não futuras;
  - avaliação a partir da anamnese, plano a partir da avaliação;
  - atendimento só em agendamento passado com comparecimento, dentro do plano, com
    `idempotencyKey` única por atendimento fictício;
  - reavaliação com a revisão aplicável e o `referenceSnapshot` da avaliação de origem.

Nenhuma constraint, trigger ou validação é desligada.

## Repetição, concorrência e falhas

- **Uma transação e um lock consultivo próprio:** duplo clique, duas abas ou duas pessoas esperam a
  primeira terminar e então encontram o conjunto pronto.
- **Conjunto completo** (os 4 marcadores presentes): nada é criado; a resposta mostra as contagens
  existentes.
- **Conjunto incompleto ou alterado manualmente** (marcador ausente, repetido ou desconhecido): a
  geração é recusada com diagnóstico, sem completar nem sobrescrever.
- **Conferências antes do COMMIT:**
  - contagens exatamente iguais às do catálogo;
  - impressão digital de todas as linhas e colunas de `User` idêntica à inicial (`User` fica
    travado em `SHARE` durante a operação).
  Qualquer falha desfaz tudo.
- **Auditoria:** a geração grava `DADOS_FICTICIOS_GERADOS` com executor, data, versão, referência e
  contagens, sem conteúdo clínico. Recusas e reexecuções sem criação não gravam nada.

A geração é aditiva e independente do `pnpm db:reset` (#62). Para voltar a uma base vazia, use o reset
conforme o procedimento dele; a geração nunca limpa nada nem chama o seed de administrador.

## Testes

- `__tests__/`: habilitação por ambiente e alvo, catálogo e action (autorização e mensagens).
- `test/integration/dados-ficticios.integration.ts`: cria um banco próprio e cobre:
  - pré-requisito ausente;
  - executor inválido;
  - banco não permitido;
  - rollback por falha simulada;
  - concorrência;
  - regras de agenda, autoria e cronologia;
  - reexecução;
  - conjunto alterado;
  - `User` idêntico (todas as colunas) e registros preexistentes preservados.
