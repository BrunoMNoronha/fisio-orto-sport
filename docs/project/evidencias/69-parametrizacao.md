# #69 — Parametrização: catálogo, visão inicial da agenda e limites centralizados

Evolução do painel da #63, sem recriá-lo. O catálogo completo (editáveis, referências, constantes
técnicas e decisões pendentes) está em `src/modules/configuracoes/README.md`.

## Decisão (Bruno M Noronha, 27/09/2026)

Dos candidatos a parâmetro editável, entrou só a **visão inicial da agenda** (Dia, Semana ou
Lista; padrão Dia). O período padrão da visão Lista continua fixo em 7 dias, e os demais itens
ficaram como referência ou constante técnica.

## O que mudou

- **Campo novo `agendaDefaultView`:** o `/agenda` sem `view` na URL abre a visão configurada. Links
  com `view` explícita continuam valendo.
- **Teto de duração centralizado:** `MAX_DURATION_MINUTES` é a fonte única. A duração sugerida e a
  mensagem de erro do agendamento derivam dele; antes, o valor estava repetido.
- **Painel:**
  - o padrão aparece em cada campo da Agenda;
  - o seletor da visão inicial explica o efeito;
  - o card "Referências" lista os limites técnicos (fuso, duração máxima, período da Lista e
    duração máxima de bloqueio).
- **Garantias mantidas:** gravação e auditoria continuam atômicas, com proteção por versão. A
  permissão continua sendo `configuracoes:gerir`, e a auditoria só registra nomes de campo.

## Migração `20260928000000_config_visao_agenda`

É aditiva:

- cria a coluna `agendaDefaultView VARCHAR(10) NOT NULL DEFAULT 'dia'`;
- acrescenta o CHECK `ClinicSettings_agenda_default_view`, que só aceita `dia`, `semana` ou
  `lista`.

A linha existente fica com `dia`, que é o comportamento anterior. `prisma migrate diff` do banco
migrado para o schema sai vazio.

Em produção, a migração deve ser aplicada **antes do merge**, com autorização própria: o código
novo lê a coluna.

**Reversão:**

```sql
ALTER TABLE "ClinicSettings" DROP CONSTRAINT "ClinicSettings_agenda_default_view";
ALTER TABLE "ClinicSettings" DROP COLUMN "agendaDefaultView";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260928000000_config_visao_agenda';
```

Depois, fazer o redeploy do código anterior. Um rollback só do código é seguro, porque o código
anterior ignora a coluna.

## Evidências técnicas (27/09/2026, local)

| Verificação | Resultado |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | ok |
| `pnpm exec jest --runInBand` | 65 suítes, 726 testes ok |
| `pnpm test:integration` (banco descartável) | 97 testes ok, 2 novos em `configuracoes.integration.ts` |

Os testes cobrem:

- **Padrão e valores:** padrão `dia` e valores válidos; valor inválido recusado com mensagem em
  pt-BR; vários campos inválidos juntos (erro por campo, nada gravado).
- **Autorização:** a action recusa quem não tem sessão, a Recepção e o Fisioterapeuta.
- **Persistência:** a visão fica gravada; a auditoria registra só o nome do campo; o conflito de
  versão continua valendo; o CHECK do banco funciona; uma linha anterior ao campo novo fica com
  `dia`.
- **Efeito real:** `parseAgendaView` usa a visão configurada, e a URL explícita prevalece.
- **Teto compartilhado:** a configuração e a agenda usam o mesmo valor.

**Fluxo no `next dev` local (Administrador):**

1. Salvou "Semana"; o `/agenda` pelo menu abriu na Semana, sem deploy.
2. `/agenda?view=dia` continuou abrindo no Dia.
3. Ao reabrir o painel, o valor continuava "Semana".
4. Em 375 px, o painel não teve rolagem horizontal.
5. O valor foi reposto para "Dia".

## Homologação manual

Não foi executada, conforme a governança: não há solicitação expressa.
