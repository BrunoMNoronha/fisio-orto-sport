# manutencao

Ferramentas administrativas de manutenção de dados. As de terminal rodam fora da aplicação, do
build, do seed e das migrações; a limpeza também tem uma ação web restrita a desenvolvimento (#78).

## `pnpm db:reset` — reinicializar dados preservando os usuários (issue #62)

Regras e transação em `reset.ts`, compartilhadas com a ação web (#78); interface de terminal em
`reset-cli.ts`; entrada em `prisma/reset.ts`; leitor de terminal compartilhado com o `db:admin` em
`prisma/prompt.ts`.

### Contrato de dados

Decidido na #62, e em 27/09/2026 para as tabelas criadas depois dela. `Charge` (FIN-01, #86),
`Payment` e `PaymentReversal` (FIN-02, #87) entram
na limpeza porque referencia `Patient`: a reinicialização manual é a única remoção prevista para o
histórico financeiro, que não tem expurgo automático.

| Destino | Tabelas |
|---|---|
| **Preservar integralmente** | `User`: todas as linhas e todos os campos (id, nome, e-mail, hash de senha, perfil, CREFITO, ativo, datas), inclusive inativos. `ClinicSettings`, que é configuração. `_prisma_migrations` |
| **Limpar** | `Patient`, `Appointment`, `ScheduleBlock`, `Anamnesis`, `Assessment`, `AssessmentChange`, `TherapyPlan`, `TherapyPlanRevision`, `TherapyPlanStatusChange`, `TreatmentSession`, `TreatmentSessionChange`, `Reassessment`, `ReassessmentChange`, `Charge`, `Payment`, `PaymentReversal` (financeiro: dependem de `Patient`), `Session` (todos precisam entrar de novo) e `AuthRateLimit` |
| **Auditoria (`AuditLog`)** | Preservada por padrão. Com `--incluir-auditoria`, os eventos anteriores são apagados. Isso é uma **exceção** às regras A5 (retenção) e A7 (imutabilidade) da DEC-02 e exige autorização registrada para aquela execução. A política permanente não muda |
| **Infraestrutura** | Schema, índices, constraints, funções, triggers, extensões e permissões ficam intactos |

### Proteções

- **Simulação por padrão:** sem `--executar`, só mostra o alvo (host e banco, nunca a URL), o
  escopo e as contagens.
- **Confirmação dupla:** com `--executar`, pede o nome exato do banco e depois a palavra `LIMPAR`.
  Resposta errada ou ausente cancela sem alterar nada.
- **Schema conferido antes e dentro da transação:** a ferramenta aborta, sem escrever, se houver
  tabela não prevista, tabela prevista ausente, FK de fora apontando para uma tabela limpa, ou
  trigger da auditoria ausente ou desligada.
- **Uma transação só:**
  - trava `User` e `ClinicSettings` (e `AuditLog`, com a auditoria incluída) contra escritas
    concorrentes;
  - roda `TRUNCATE ... RESTRICT` com lista fechada: sem CASCADE, e as FKs cíclicas entre revisões
    do plano e reavaliações se resolvem por estarem no mesmo comando;
  - só com a auditoria incluída, desliga **apenas** a trigger de linha `AuditLog_immutable_row`,
    apaga os eventos e religa a trigger, tudo na mesma transação. A trigger de TRUNCATE não é
    tocada.
- **Conferências antes do COMMIT:** tabelas limpas vazias, usuários e configurações idênticos
  (impressão digital de todas as linhas e colunas, que nunca é impressa) e proteções da auditoria
  ligadas. Qualquer divergência ou falha desfaz tudo, inclusive a desativação da trigger.
- **Sem vazamento na saída:** nenhum dado pessoal, clínico, hash ou credencial aparece. Nenhum
  seed é executado, e nenhuma conta é criada, recriada ou tem a senha alterada.

### Procedimento de execução (ambiente real)

A ferramenta **não autoriza nada por si só**. Para cada execução:

1. **Alvo e autorização:** registrar ambiente, banco/branch e responsável, e a autorização
   expressa do ADMIN/Bruno para apagar pacientes, prontuários e agenda. Se a auditoria entrar,
   registrar também a exceção pontual a A5/A7. Sem isso, não executar.
2. **Janela:** interromper o uso, para que não haja escritas concorrentes.
3. **Recuperação:**
   - Neon: anotar o ponto de restauração (horário/LSN) ou criar um snapshot. Restaurar com
     `restore_snapshot` **sem** target e com `finalize: false` (o padrão moveria a produção).
   - Conferir se o ponto está dentro da janela de restauração no momento da operação.
4. **Simulação:** `pnpm db:reset` com `DATABASE_URL` apontando para o alvo. Conferir o banco
   exibido e as contagens.
5. **Execução:** `pnpm db:reset --executar` (e `--incluir-auditoria`, se autorizado). Guardar só
   a saída de contagens, sem dados.
6. **Homologação:**
   - login com contas existentes, de cada perfil;
   - inativos continuam bloqueados;
   - sessões antigas encerradas;
   - pacientes, agenda e prontuários vazios;
   - configurações mantidas;
   - novos eventos de auditoria gerados (são posteriores ao marco da limpeza).
7. **Reabrir** o sistema e registrar as evidências.

### Testes

`test/integration/db-reset.integration.ts` cria um banco PostgreSQL **próprio**, aplica as
migrações, semeia dados fictícios em todas as tabelas (usuários ativos e inativos de todos os
perfis, revisão e reavaliação cruzadas, auditoria recente) e o descarta no fim. Assim, não
interfere nas outras suítes, que rodam em paralelo.

Cobre:

- simulação sem escrita;
- confirmações erradas;
- execução completa;
- segunda execução;
- `--incluir-auditoria`, com as triggers religadas e ainda protegendo;
- falha intermediária com rollback;
- alteração concorrente de usuário detectada;
- tabela e dependência não previstas;
- URL inválida.

## Limpeza pela aba Desenvolvimento (issue #78)

Mesma regra de dados e mesmas conferências do `pnpm db:reset` (`reset.ts`), acionada pela aba
Desenvolvimento das Configurações. Nenhum comando de shell é executado pela interface.

- **Habilitação própria**, desligada por padrão: `DEV_RESET_TARGET="host/banco"`, com as mesmas
  condições da geração de dados fictícios (`pnpm dev`, fora da Vercel, banco local igual ao alvo;
  ver `dados-ficticios/README.md`). Ligar a geração não liga a limpeza. Não há opção web para
  produção.
- **Só Administrador**, checado no servidor com a habilitação, antes de qualquer escrita.
- **Simulação na tela:** alvo (`host/banco`, sem credenciais), o que será limpo e o que será
  preservado, com contagens. Schema fora do previsto bloqueia a ação.
- **Confirmação digitada:** nome do banco e `LIMPAR`. O servidor confere de novo e também confere
  `current_database()` na transação.
- **Auditoria sempre preservada:** a exceção `--incluir-auditoria` é exclusiva da CLI e não existe
  na web. A limpeza grava `BASE_REINICIADA` (autor, IP e contagem total, sem dados) na mesma
  transação.
- **Sessões:** todas são encerradas, inclusive a de quem executou. Depois do sucesso, o cookie é
  removido e a pessoa vai para `/login?base=limpa`, que avisa o que aconteceu.
- **Nada combinado:** a limpeza não gera dados fictícios em seguida, e abrir a aba ou salvar
  configurações nunca a dispara.

### Serialização com a geração de dados fictícios

Limpeza (web e CLI) e geração tomam o mesmo lock consultivo (`lock.ts`) no início da transação. Uma
espera a outra terminar e só então confere o estado: o resultado é sempre base limpa ou conjunto
completo, nunca parcial, duplicado ou enganoso. Coberto em
`test/integration/limpeza-web.integration.ts`, com limpezas e gerações simultâneas repetidas.

## `pnpm db:normalizar-nomes` — adequar nomes ao contrato em maiúsculas (issue #78)

Núcleo em `names-cli.ts`; entrada em `prisma/normalize-names.ts`. É uma operação própria: nunca
roda como efeito de leitura, deploy, reset ou geração de dados.

- **Escopo:**
  - `User.name`;
  - `Patient.fullName` e `Patient.guardianName`;
  - `ClinicSettings.displayName` e `legalName`.
  Não toca snapshots clínicos de autoria, auditoria, e-mail, endereço, textos livres, `updatedAt`,
  autoria da edição nem versão. É uma adequação técnica, não uma edição.
- **Simulação por padrão:** mostra o alvo (sem credenciais) e as contagens por campo, sem nomes.
  Aborta se algum nome passar do limite depois de normalizar.
- **Execução:** `--executar`, com confirmação pelo nome do banco. Uma transação; cada linha só é
  atualizada se ainda tiver o valor lido (alteração concorrente desfaz tudo); conferência final.
- **Idempotente:** uma segunda execução responde "Nada a adequar".
- **Base real:** exige alvo e autorização registrados, como o `db:reset`, e um ponto de
  recuperação antes.

Coberto em `test/integration/normalizar-nomes.integration.ts`.
