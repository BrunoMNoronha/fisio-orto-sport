# Issue #133 — migração e integração

Verificação em 16/10/2026, com alterações locais da issue #133.

## Ambientes autorizados

- Projeto Neon: `falling-star-59523600`, PostgreSQL 18.
- Preview: branch `br-rough-block-ac7wwnvx`, banco `neondb`.
- Integração: banco separado `fisio_issue133_test_20261016`, na mesma branch, sem cópia de dados do Preview.
- Production não foi alterado. Nenhum deploy de aplicação foi executado.
- Após os testes e autorização explícita do usuário, o banco temporário `fisio_issue133_test_20261016` foi excluído; o banco Preview `neondb` foi preservado.

## Migração

Aplicadas as 37 migrações no banco de integração inicialmente vazio com `prisma migrate deploy`. Após aprovação dos testes, aplicada somente a migração pendente `20261016130000_appointment_rescheduled` no Preview.

Snapshot anterior à alteração do Preview: `snap-royal-feather-ac7rdmz8` (`preview-before-issue133-20261016`).

Verificação posterior: `prisma migrate status` informou schema atualizado. A coluna `Appointment.lastRescheduledAt` existe como `timestamp with time zone`, precisão 3, nullable. O Preview tinha zero agendamentos antes e depois da migração.

## Integrações executadas

Com `INTEGRATION_DATABASE_URL` direcionada exclusivamente ao banco isolado:

```text
node node_modules/tsx/dist/cli.mjs --conditions=react-server --test --test-concurrency=1 test/integration/agenda*.integration.ts
```

Resultado: **40 testes, 5 suítes, 40 aprovados, zero falhas, zero pulados** (92,1 segundos).

- Bloqueios e aviso de conflito do paciente.
- Migração de capacidade com preservação de registros anteriores.
- Capacidade simultânea, configuração e concorrência.
- Presença e vínculo entre agenda e atendimento.
- Criação, reagendamento, cancelamento e concorrência da agenda.

O teste específico confirma que a marca nasce apenas ao mudar horário, persiste após consulta, não nasce em envio idêntico ou troca exclusiva de profissional e permanece após cancelamento. O cenário de reagendamento recusado confirma que a marca continua nula.

Foram executados os binários locais via Node porque o pnpm instalado tenta obter outra versão pelo registry indisponível. As integrações executam o código real dos serviços e PostgreSQL remoto; nenhuma suíte foi considerada aprovada por skip.

## Limites

Este registro cobre as cinco suítes de integração da agenda, não todas as integrações da aplicação. Validação visual no navegador e publicação da aplicação não fazem parte desta execução. Credenciais não foram gravadas neste documento.
