# #73 — Geração de dados fictícios em desenvolvimento (verificação)

Evidências da implementação em `src/modules/dados-ficticios` (branch `feat/dados-ficticios-dev`).
Esta página não contém dados pessoais reais, conteúdo clínico real, credenciais nem hashes.

## Ambiente

- **Local**, PostgreSQL 17 do Docker de desenvolvimento (`localhost`).
- **Bancos descartáveis:** a verificação funcional usou `fisio_verif73`, criado só para isso, com três
  usuários de teste (Administrador, Fisioterapeuta com CREFITO e Recepção, sem senha utilizável,
  acesso pelo login rápido de desenvolvimento). O banco foi descartado ao fim.
- **Intocados:** o banco de desenvolvimento `fisio_orto_sport` e a produção (Neon). Nenhuma
  migração foi aplicada fora dos bancos descartáveis.

## Testes automatizados (27/09/2026)

| Verificação | Resultado |
|---|---|
| `pnpm lint` | sem erros nem avisos |
| `pnpm typecheck` | ok |
| `pnpm test --runInBand` (só `src` do projeto; a worktree antiga em `.claude/worktrees` foi excluída da varredura) | 69 suítes, 764 testes |
| `pnpm test:integration` (banco descartável `fisio_it73`, depois removido) | 122/122, incluindo os 7 desta issue |
| `pnpm build` | ok |

A integração, em banco próprio (`CREATE DATABASE` + `prisma migrate deploy`), cobre:

- sem fisioterapeuta elegível (sem CREFITO ou inativo não contam): recusa, nenhuma escrita e `User`
  idêntico;
- executor Recepção, Administrador inativo ou inexistente, e banco diferente do permitido: recusa sem
  escrita;
- falha simulada depois das inserções: rollback total, com contagens e registros preexistentes
  iguais;
- três execuções simultâneas: uma cria, as outras encontram o conjunto. Contagens exatas do
  catálogo, um único evento de auditoria, e `User` (todas as colunas), configurações, auditoria
  anterior, paciente, agendamento e bloqueio preexistentes idênticos;
- regras:
  - profissionais só entre os elegíveis;
  - presença só em horário passado;
  - atendimento vinculado a comparecimento, com o mesmo profissional e momento;
  - autoria e snapshots do executor;
  - cronologia anamnese → avaliação → plano → reavaliação;
  - horário ocupado ou bloqueado desviado para o próximo livre;
  - nenhuma sobreposição de agendamentos;
- reexecução: nada criado nem alterado;
- marcador de um paciente removido manualmente: recusa com diagnóstico ("faltam P3"), sem
  sobrescrever.

## Verificação funcional no navegador (`pnpm dev`, banco `fisio_verif73`)

1. Com `DEMO_DATA_TARGET="localhost/fisio_verif73"` e o Administrador de teste, Configurações exibiu
   a seção **Desenvolvimento**, com alvo `localhost/fisio_verif73` e sem URL nem credenciais.
2. **Confirmação:** quantidades previstas (4, 10, 3, 2, 2, 2, 4, 1) e usuários existentes a utilizar
   (o executor e o fisioterapeuta, com 4 pacientes).
3. **Duplo clique em "Gerar dados fictícios":** resultado "Conjunto gerado (referência 27/09/2026)",
   com as contagens acima. No banco: 4 pacientes, 10 agendamentos, 3 anamneses, 2 avaliações,
   2 planos, 4 atendimentos, 1 reavaliação e **um** evento `DADOS_FICTICIOS_GERADOS`. Os 3 usuários
   ficaram com perfil, CREFITO, estado, hash e `updatedAt` inalterados.
4. **Navegação:**
   - Pacientes lista os 4 fictícios;
   - o paciente P1 mostra o marcador nas observações, a anamnese e a avaliação;
   - Sessões mostra 3 atendimentos com o prefixo de dado fictício;
   - Reavaliações mostra 1;
   - a agenda (lista) mostra os agendamentos futuros, inclusive o cancelado.
5. **Reexecução:** a seção avisa que o conjunto já existe. Confirmada, respondeu "O conjunto já
   existia; nada foi criado", com as contagens existentes.
6. **Console do navegador:** sem erros.

Bloqueios de ambiente (produção, Vercel, sem habilitação, alvo diferente, banco remoto) e de perfil
(sem sessão, Recepção, Fisioterapeuta) estão cobertos pelos testes da action e da habilitação. A
seção não é renderizada nesses casos, e a action responde "Indisponível neste ambiente." ou "Acesso
negado." antes de qualquer escrita.
