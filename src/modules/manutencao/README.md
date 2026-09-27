# manutencao

Ferramentas administrativas executadas por terminal, fora da aplicação, do build, do seed e das
migrações.

## `pnpm db:reset` — reinicializar dados preservando os usuários (issue #62)

Núcleo em `reset-cli.ts`; entrada em `prisma/reset.ts`; leitor de terminal compartilhado com o
`db:admin` em `prisma/prompt.ts`.

### Contrato de dados

Decidido na #62, e em 27/09/2026 para as tabelas criadas depois dela.

| Destino | Tabelas |
|---|---|
| **Preservar integralmente** | `User`: todas as linhas e todos os campos (id, nome, e-mail, hash de senha, perfil, CREFITO, ativo, datas), inclusive inativos. `ClinicSettings`, que é configuração. `_prisma_migrations` |
| **Limpar** | `Patient`, `Appointment`, `ScheduleBlock`, `Anamnesis`, `Assessment`, `AssessmentChange`, `TherapyPlan`, `TherapyPlanRevision`, `TherapyPlanStatusChange`, `TreatmentSession`, `TreatmentSessionChange`, `Reassessment`, `ReassessmentChange`, `Session` (todos precisam entrar de novo) e `AuthRateLimit` |
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
