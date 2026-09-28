# #78 — Nomes, e-mail, abas, manutenção e expediente (verificação)

Evidências da branch `feat/cadastros-configuracoes-78`. Esta página não contém dados pessoais reais,
conteúdo clínico real, credenciais nem hashes.

## Decisões de negócio (Bruno, 27/09/2026)

- **Expediente:** global da clínica e semanal, com até dois intervalos por dia. Dia sem intervalo é
  fechado. Feriados e ausências continuam nos bloqueios. Desligado por padrão: os horários são
  preenchidos e aplicados na aba "Agenda e expediente".
- **Agendamentos já salvos fora do expediente:** ficam como estão, sinalizados ("Fora do
  expediente"), consultáveis e canceláveis. Reagendar exige um horário válido.
- **Troca de e-mail:** encerra as sessões do usuário alterado. Na própria conta, o Administrador
  mantém só a sessão atual.

## Decisões técnicas

- **Contrato de nomes** (`src/lib/names.ts`): NFC, trim, espaços colapsados e maiúsculas pt-BR.
  Abrange `User.name`, `Patient.fullName`/`guardianName` e `ClinicSettings.displayName`/`legalName`.
  Nomes antigos só mudam pelo `pnpm db:normalizar-nomes`.
- **Expediente na linha de `ClinicSettings`:** reaproveita versão, atomicidade e auditoria das
  configurações. É texto canônico com CHECK de forma.
- **Formulário de agendamento:** com expediente, início e fim viram listas de horários válidos. A
  data continua no campo nativo, que não desabilita dias específicos; em dia fechado, os horários
  ficam desabilitados e a tela orienta.
- **Abas do Base UI:** um único formulário e um único "Salvar" para as três abas de configuração.
- **Limpeza web:** usa o núcleo compartilhado com a CLI (`manutencao/reset.ts`), com habilitação
  própria (`DEV_RESET_TARGET`) e sem a exceção da auditoria. Geração e limpeza compartilham o lock
  consultivo.
- **Migrações aditivas:**
  - `20260928030000_config_expediente`;
  - `20260928040000_auditoria_base_reiniciada` (enum).
  Nenhuma foi aplicada fora dos bancos descartáveis.

## Testes automatizados (27/09/2026)

| Verificação | Resultado |
|---|---|
| `pnpm lint` | sem erros nem avisos |
| `pnpm typecheck` | ok |
| `pnpm test --runInBand` | 73 suítes, 831 testes |
| `pnpm test:integration` (banco descartável `fisio_it78`, depois removido) | 138/138 |
| `pnpm build` | ok |

Integrações novas, cada uma em banco próprio ou com dados isolados:

- `normalizar-nomes`:
  - a simulação não escreve nem mostra nomes;
  - confirmação errada e falha simulada desfazem tudo;
  - a execução só altera os cinco campos, sem mexer em `updatedAt`, snapshots e auditoria;
  - `searchName` é recalculado;
  - é idempotente.
- `editar-email`:
  - troca normalizada, sessões encerradas e auditoria sem valores;
  - e-mail repetido não altera nome, perfil nem CREFITO;
  - na própria conta, a sessão atual é mantida;
  - duas contas disputando o mesmo e-mail ao mesmo tempo: só uma fica com ele, sem alteração
    parcial.
- `expediente`:
  - sem restrição com a chave desligada;
  - CHECK de forma;
  - aceita dentro; recusa dia fechado, pausa, abertura e fechamento;
  - agendamento antigo fica intacto e o reagendamento exige horário válido;
  - o gerador só usa horários dentro do expediente.
- `limpeza-web`:
  - banco não permitido e falha simulada desfazem tudo, inclusive a auditoria;
  - só as 15 tabelas previstas são limpas;
  - `User`, `ClinicSettings` e a auditoria anterior ficam idênticos;
  - evento `BASE_REINICIADA` registrado;
  - sessões encerradas;
  - limpezas e gerações simultâneas em três rodadas terminam sempre em base vazia ou conjunto
    completo.
- `db-reset` (CLI, agora sobre o núcleo compartilhado): 9/9 sem mudança de comportamento.

## Verificação funcional no navegador (`pnpm dev`, banco descartável `fisio_verif78`)

Usuários de teste: Administrador, Fisioterapeuta com CREFITO e Recepção, com uma senha de teste
gerada na hora e descartada com o banco. Nome dos usuários gravado antes do contrato, em caixa
mista.

1. **`pnpm db:normalizar-nomes`:**
   - simulação: "User.name 3", demais campos 0, sem nomes na saída;
   - execução com o nome do banco: "Nomes adequados: 3";
   - nova execução: "Nada a adequar".
2. **Abas:** Clínica, Agenda e expediente, Impressões, Administração e Desenvolvimento.
   - **Teclado:** seta, End e Home movem o foco; Enter ativa a aba focada.
   - **Tela de 375 px:** lista de abas com rolagem própria, página sem rolagem horizontal.
3. **Erro em aba oculta:**
   - ação: "Aplicar o expediente" ligado sem nenhum dia aberto, alteração do nome na aba Clínica e
     "Salvar";
   - resultado: "Corrija os campos destacados. Nada foi salvo." A aba "Agenda e expediente (com
     erros)" foi aberta, com foco no campo e a mensagem "Defina ao menos um dia com expediente antes
     de aplicá-lo à agenda."
4. **Expediente e nome da clínica salvos:**
   - Seg–Sex 08:00–12:00 e 13:00–18:00, aplicado: "Configurações salvas.", versão 1;
   - ao recarregar, os valores persistem, e o nome digitado "  clínica  ortosport demo " aparece
     como `CLÍNICA ORTOSPORT DEMO`, inclusive na barra lateral.
5. **Aba Desenvolvimento, gerar dados fictícios:** a confirmação mostra as quantidades e
   "FISIO VERIFICAÇÃO (CREFITO 12345-F)". A geração criou 4/10/3/2/2/2/4/1 registros. A referência
   caiu num domingo, e a lista da agenda mostra todos os agendamentos em dias úteis, dentro do
   expediente, com nomes em maiúsculas.
6. **Novo agendamento:**
   - domingo: início e fim desabilitados, com "A clínica não tem expediente neste dia" e o resumo
     do expediente;
   - segunda: 108 inícios, de 08:00 a 11:55 e de 13:00 a 17:55, sem 12:00; o fim fica desabilitado
     até escolher o início.
7. **Gestão de usuários:**
   - o diálogo "Editar" mostra o e-mail e o aviso sobre login e sessões;
   - e-mail de outra conta: "Já existe um usuário com este e-mail.";
   - "  Recep.Nova@Verif.test " foi gravado como `recep.nova@verif.test`.
8. **Limpeza da base:**
   - a simulação lista 29 registros a limpar e o que é preservado: 3 usuários, 1 configuração, 23
     migrações e 3 eventos de auditoria;
   - o botão só habilita com o nome do banco e `LIMPAR`;
   - depois da execução, a tela vai para `/login?base=limpa` com o aviso "A base foi limpa e todas
     as sessões foram encerradas. Entre de novo."
9. **Login:**
   - e-mail antigo da Recepção com a senha: "E-mail ou senha inválidos.";
   - e-mail novo com a mesma senha: entrou;
   - Recepção em `/configuracoes`: acesso negado.
10. **Banco no fim:**
    - 0 pacientes e 0 agendamentos;
    - 3 usuários, com os mesmos ids e hashes, nomes em maiúsculas e o e-mail novo;
    - 1 configuração;
    - auditoria em ordem: `CONFIGURACAO_ALTERADA` ("Versão 1: Nome de exibição, Aplicar
      expediente, Expediente"), `DADOS_FICTICIOS_GERADOS`, `USUARIO_EDITADO` ("Campos: e-mail."),
      `BASE_REINICIADA` (contagem, sem dados), `LOGIN` com falha, `LOGIN` com sucesso e
      `ACESSO_NEGADO`.
11. **Console do navegador:** sem erros.

Os bloqueios de ambiente, perfil e confirmação da limpeza e da geração em produção, na Vercel, sem
habilitação, com alvo diferente ou banco remoto estão cobertos pelos testes de `guard` e das actions.
