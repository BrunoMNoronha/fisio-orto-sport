# Issue #132 — agendamento recorrente

Implementação e verificação local em 16/10/2026, na branch `codex/issue-132-agendamento-recorrente`, baseada em `main` após o merge da #133.

## Contrato implementado

- Checkbox somente na criação; habilita quantidade e modal Seg/Ter/Qua/Qui/Sex/Sáb/Dom. Confirmar os dias não grava registros.
- Quantidade inclui a primeira sessão. A data inicial precisa estar nos dias selecionados. Cancelar/Escape na primeira abertura desmarca a recorrência; cancelar uma edição preserva a seleção anterior.
- Limite configurável em **Configurações → Agenda e expediente → Máximo de sessões por agendamento recorrente**, padrão **10**. Inteiro de 1 a 100; 100 é o teto técnico confirmado para limitar o lote.
- Prévia cronológica em datas civis no fuso da clínica. Paciente, profissional, início, fim e observação administrativa são replicados; não gera presença, atendimento clínico ou cobrança.
- Validação transacional de limite vigente, paciente/profissional, expediente, bloqueios, capacidade e conflitos do paciente. Impedimentos listam data/horário/motivo, sem pular datas. O aviso do paciente é agregado e permite confirmação, sem liberar os demais impedimentos.
- Lote inteiro em uma transação READ COMMITTED; locks configuração → profissional → tentativa. Falhas revertem os registros e a chave. Reenvios com chave UUID, autor e conteúdo normalizado iguais retornam IDs/quantidade originais, inclusive após alterações individuais. Conteúdo diferente com chave já concluída é recusado. A interface troca a chave ao editar.
- Reagendamento, cancelamento e presença continuam individuais. O detalhe identifica a quantidade real de agendamentos do lote.
- Catálogos de manutenção e vínculos de usuários reconhecem `AppointmentBatch`, mantendo as proteções existentes.

## Migração e ambiente

Migração aditiva `20261016140000_recurring_appointments`: `AppointmentBatch`, associação opcional em `Appointment`, índice/chave por autor e tentativa, limite `ClinicSettings.maxRecurringSessions` com padrão 10 e CHECK de 1 a 100.

As **38 migrações** foram aplicadas em PostgreSQL 18 local, no contêiner isolado `fisio-issue132-postgres`, banco `fisio_issue132_test`, porta **127.0.0.1:55432**. Somente dados fictícios foram utilizados. Nenhuma conexão ou migração foi feita no Neon, Preview ou Production, conforme a escolha explícita do usuário.

O teste de atualização sobre schema anterior confirmou preservação do agendamento e das configurações existentes, `batchId` nulo e novo limite padrão 10. Schema Prisma validado.

## Resultados

| Verificação | Resultado |
|---|---|
| Suíte Jest completa | **1.402 testes / 125 suítes aprovados** |
| Integrações de agenda, configurações e exclusão de usuário | **74 testes / 9 suítes aprovados**, zero falhas e zero pulados |
| TypeScript | Aprovado |
| ESLint do código do projeto | Aprovado, excluindo somente `release/**`, diretório local ignorado pelo Git |
| `git diff --check` | Aprovado |
| Build Webpack com `DATABASE_URL` local | Aprovado, incluindo geração de páginas e rastreamento de arquivos |
| Build padrão Turbopack | Não aprovado: erro interno ao iniciar processo Node do PostCSS de `globals.css` no ambiente Windows |

O lint integral inicial detectou 13 erros `no-require-imports` em scripts CommonJS locais não versionados de `release/`. Esses scripts foram preservados; a checagem foi repetida com esse diretório ignorado. Comandos foram executados com os binários já instalados via Node, devido à resolução da versão do pnpm pelo registry no ambiente.

Comandos de integração (com `INTEGRATION_DATABASE_URL` apontando exclusivamente ao banco local):

```text
node node_modules/tsx/dist/cli.mjs --conditions=react-server --test --test-concurrency=1 test/integration/agenda*.integration.ts test/integration/configuracoes.integration.ts test/integration/excluir-usuario.integration.ts
```

Cobertura específica: exemplo solicitado, uma sessão, todos os dias/um dia/fim de semana, viradas de ano e fevereiro bissexto, entradas inválidas, limite vigente e teto 100, reenvios concorrentes, replay após reagendamento individual, dados alterados na mesma chave, lote contra lote/bloqueio concorrente, aviso do paciente, paciente/profissional inativos, expediente fechado, impedimento na ocorrência intermediária/final e falha real na terceira inserção com rollback dos registros anteriores e da chave.

## Fluxo no navegador

Aplicação local na porta 3132, autenticada com administrador fictício. Conferidos:

1. Limite padrão 10 no painel; salvar temporariamente 12 e conferir esse valor no novo agendamento; restauração para 10.
2. Paciente e profissional fictícios, início em **19/10/2026 às 14h**, fim às 15h, **5 sessões**, dias **Seg/Qua/Sex**.
3. Prévia e registros persistidos em **19, 21, 23, 26 e 28/10/2026**, todos às 14h–15h; confirmação do lote e consulta na lista após navegar.
4. Modal em viewport 390 × 844, foco inicial em Seg e Escape devolvendo foco ao checkbox e desmarcando a recorrência. Viewport restaurado após a verificação.

Evidências visuais com dados fictícios:

- [Prévia das cinco sessões](132-recorrencia-previa.jpg) — o limite 12 exibido é a configuração temporária usada no teste, não o padrão.
- [Confirmação do lote](132-recorrencia-salva.jpg).
- [Lista com as cinco datas persistidas](132-recorrencia-lista.jpg).
- [Modal em viewport móvel](132-recorrencia-modal-mobile.jpg).

A validação descrita acima precede o commit e a abertura do PR. Não houve publicação ou migração remota.

## Correção identificada no CI do PR #135

O CI detectou que a fixture de db:reset não preenchia a nova tabela AppointmentBatch. A fixture agora cria um lote associado ao agendamento e registra seus IDs, preservando a verificação de limpeza de todas as tabelas.

Validação local após o ajuste: 9 testes de integração de db:reset aprovados no PostgreSQL local e ESLint do arquivo aprovado. Nenhum banco remoto foi alterado.
