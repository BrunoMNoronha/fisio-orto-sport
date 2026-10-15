# VAL-03 — Revalidação por perfil após MEL-01/MEL-02 (critério 7, #48)

Coleta de 04/10/2026, entre 23:30 e 23:55 em `America/Sao_Paulo` (05/10/2026,
02:30–02:55 UTC). Executada para o critério 7 da
[conclusão do MVP](../06-escopo-mvp.md#critérios-de-conclusão-do-mvp): "fluxo por
perfil revalidado depois de publicar MEL-01 e MEL-02, no mesmo formato da VAL-02".
Formato e limitações reaproveitados da [VAL-02](val-02-producao.md), sem
exigência adicional de homologação manual.

Em produção, tudo foi feito só com leitura. Nenhum deploy, migração, seed,
usuário ou dado foi criado ou alterado, e o workflow de Production não foi
acionado. Este documento não contém valores de variáveis nem dados pessoais.

Legenda: **COMPROVADO** (evidência coletada), **LIMITAÇÃO** (o que a evidência
não cobre).

## 1. Alvo publicado — COMPROVADO

| Item | Valor |
|---|---|
| SHA em Production | `20b32826fc3b219606bfffe254f8df119ec0f941` (merge da PR #83) |
| Deployment Vercel | `dpl_DLGwiETe1d5GcMiTarwCWctxgKkK`, `READY`, alvo `production` (01/10/2026) |
| Deployment GitHub | 6791949763, ambiente Production |
| URL de produção | https://fisio-orto-sport.vercel.app (região `gru1`) |
| CI do SHA | [run 36906169916](https://github.com/BrunoMNoronha/fisio-orto-sport/actions/runs/36906169916), `success` |
| MEL-01 / MEL-02 no SHA | `801cfaa` (PR #68) e `62860df` (PR #70) são ancestrais de `20b3282` |

Desde `20b3282`, `main` (`9a9a446`) e o candidato em `production`
(`8552f1b`) não alteram `src/`, `prisma/`, `public/` nem `next.config.ts`. As
diferenças são de pipeline, documentação e configuração de release. Por isso,
este roteiro vale para o código de aplicação atual. O Preview de 04/10
([evidência](pipeline-preview-2026-10-04.md)) segue pendente da liberação manual.

## 2. Acesso sem sessão em produção — COMPROVADO

| Rota | Resposta |
|---|---|
| `/login` | 200 |
| `/` | 307 → `/login` |
| `/pacientes` | 307 → `/login?next=%2Fpacientes` |
| `/agenda` | 307 → `/login?next=%2Fagenda` |
| `/configuracoes` | 307 → `/login?next=%2Fconfiguracoes` |
| `/usuarios` | 307 → `/login?next=%2Fusuarios` |

`Strict-Transport-Security` está presente. O HTML de `/login` não contém o
acesso rápido de desenvolvimento.

## 3. Migrações em produção — COMPROVADO (leitura no Neon)

Projeto `falling-star-59523600`, branch `production` (`br-divine-pine-acip2yet`).

- `_prisma_migrations`: 24 linhas, 24 concluídas, 0 revertidas. A última é
  `20261001000000_agenda_capacity`.
- Os 24 checksums são idênticos ao sha256 de cada
  `prisma/migrations/*/migration.sql` em `20b3282`. Não há migração pendente.
- Só metadados técnicos foram lidos. Nenhuma tabela de pacientes, prontuário ou
  usuários foi consultada.

## 4. Runtime em produção — COMPROVADO

`get_runtime_errors` da Vercel cobriu de 02/10/2026 20:35 UTC (depois da
correção da migração `agenda_capacity`) até a coleta. Há um único grupo: o
aviso informativo de SSL já classificado na VAL-02 (item 8). Não há 500, erro
de aplicação nem P2022 no deployment atual.

As variáveis de produção não foram reabertas nesta coleta. A conferência
vigente é a da implantação da pipeline em 04/10
([evidência](pipeline-preview-2026-10-04.md#configuração-conferida)).

## 5. Roteiro autenticado por perfil — COMPROVADO (build de produção local) — LIMITAÇÃO

Mesmo motivo da VAL-02: Claude não digita senha em produção, e não foi
autorizado gravar contas ou dados fictícios no banco real. O roteiro rodou com
o **mesmo SHA publicado**:

- worktree isolado em `20b3282`, `pnpm install --frozen-lockfile`;
- `pnpm build` + `next start -p 3100` (`NODE_ENV=production`);
- PostgreSQL 17 **descartável** em contêiner próprio, com as mesmas 24
  migrações aplicadas por `prisma migrate deploy`.

O administrador `admin.val03@example.test` foi criado pelo seed existente,
com senha gerada localmente. As contas RECEPCAO e FISIOTERAPEUTA
(`teste-*-val03@example.test`) foram criadas pela tela. Ao fim, o contêiner,
o worktree e as senhas temporárias foram removidos.

Login e sessão:

- [x] Na build de produção, a tela de login não mostra o acesso rápido.
- [x] Senha errada mostra a mensagem genérica "E-mail ou senha inválidos.". Na
      6ª tentativa com o mesmo e-mail, aparece "Muitas tentativas de acesso…".

ADMIN:

- [x] Login ok. `/`, `/pacientes`, `/pacientes/novo`, `/agenda`, `/agenda/novo`,
      `/usuarios`, `/usuarios/auditoria` e `/configuracoes` respondem 200.
- [x] Criou pela tela o usuário RECEPCAO e o FISIOTERAPEUTA (com CREFITO fictício).
- [x] Depois do logout, `/pacientes`, `/agenda`, `/usuarios` e `/configuracoes`
      redirecionam para `/login`.

RECEPCAO:

- [x] Telas que abrem: `/pacientes`, `/pacientes/novo`, `/agenda` e
      `/agenda/novo`, além da ficha, edição, agendamentos e documentos do paciente.
- [x] Impressões que abrem: cartão de frequência e termo de consentimento.
- [x] Cadastrou o paciente fictício "Paciente Teste VAL03". Sem telefone, o
      formulário recusou com "Informe o telefone." e manteve os campos.
- [x] Anamnese, avaliações, planos, sessões e reavaliações (listas e "novo")
      levam a `/acesso-negado`, assim como a impressão da anamnese, `/usuarios`,
      `/usuarios/auditoria` e `/configuracoes`.
- [x] **MEL-02:** criou um agendamento para hoje, 23:49–23:59.
  - O bloqueio sobre esse horário foi recusado, listando o agendamento a
    reagendar ou cancelar.
  - O bloqueio de 05/10 08:00–12:00, com motivo, foi criado com autor e data.
  - Agendar às 09:00 dentro do bloqueio foi recusado com "O profissional está
    com a agenda bloqueada nesse horário."
  - O agendamento das 14:00 foi aceito.
  - Um segundo horário sobreposto para o mesmo paciente (14:30) exibiu o aviso
    de conflito com a lista dos horários. Com "Confirmar mesmo assim", foi gravado.
- [x] **MEL-01:** antes do início, a presença aparece como "Disponível a partir
      do início do horário". Às 23:49, marcou "Compareceu", registrado com autor
      e horário. Com presença marcada, a tela informa que não é possível cancelar
      nem reagendar.
- [x] Logout ok.

FISIOTERAPEUTA:

- [x] Telas clínicas, agenda e bloqueios respondem 200. `/usuarios`,
      `/usuarios/auditoria` e `/configuracoes` levam a `/acesso-negado`.
- [x] Fluxo clínico com o paciente fictício. Nenhum prontuário real foi aberto
      e nada foi gravado em produção:
  - anamnese ok → avaliação ok → plano ok (10 sessões previstas, assinatura
    com CREFITO);
  - **sessão registrada a partir do agendamento das 23:49 (MEL-01)**, com a
    revisão vigente do plano;
  - reavaliação ok (metas parcialmente atingidas, conclusão "continuidade").
- [x] O agendamento passou a mostrar "Atendimento: Registrado — ver atendimento".
      Abrir outro registro para o mesmo agendamento mostrou "Este agendamento já
      tem atendimento registrado."
- [x] Impressões da anamnese, do cartão de frequência e do termo respondem 200,
      com o paciente fictício. A anamnese e o termo trazem o CREFITO.
- [x] **MEL-02:** removeu o bloqueio (remoção lógica, com confirmação). A lista
      ficou "Nenhum bloqueio em vigor ou futuro."
- [x] Depois do logout, a rota de sessões do paciente redireciona para `/login`.

Auditoria (`/usuarios/auditoria`, como ADMIN):

- [x] 32 registros: 6 falhas e 1 bloqueio de login com e-mail não cadastrado,
      logins e logouts dos três perfis, 2 usuários criados e cada acesso negado
      da RECEPCAO e do FISIOTERAPEUTA acima.

## 6. Limitações

- READY e CI verdes não equivalem a teste funcional. Por isso, o item 5 foi
  executado de fato.
- O item 5 rodou na build de produção **local** do SHA publicado, não no
  domínio de produção. Os motivos são os da VAL-02: Claude não digita senha em
  produção, e gravar contas ou dados fictícios no banco real não foi autorizado.
- O teste de bloqueio por tentativas usou um e-mail fictício não cadastrado. A
  mensagem exibida é a mesma usada para senha errada de conta existente.
- O teste de conflito do paciente usou o mesmo fisioterapeuta, porque a
  capacidade simultânea configurável (#82) aceitou a sobreposição. Não houve
  segundo fisioterapeuta.
- A liberação do candidato `8552f1b` em Production continua pendente do
  acionamento manual. Ela só altera pipeline e configuração. A verificação
  pós-publicação descrita em [pipeline-deploy](../pipeline-deploy.md) segue
  obrigatória nessa liberação.
- Os limites históricos dos critérios 1–6 e a exceção da COR-02 continuam como
  registrados no [briefing financeiro](../16-financeiro-integracoes.md#gate-de-início--critérios-do-mvp-e-evidências).
