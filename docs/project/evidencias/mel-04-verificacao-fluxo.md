# MEL-04 (#47) — Verificação de navegação, acessibilidade e impressão do fluxo clínico

Verificação técnica de interface em 28/09/2026. Esta página não contém dados pessoais reais, conteúdo
clínico real, credenciais nem hashes.

## Ambiente

- **Local**: `pnpm dev` (Next 16.3.5, Turbopack), com PostgreSQL 17 do Docker de desenvolvimento.
- **Banco descartável** `fisio_verif47`, criado só para isso com `prisma migrate deploy` (23 migrações).
  Três usuários de teste sem senha utilizável (Administrador, Fisioterapeuta com CREFITO fictício,
  Recepção), com acesso pelo login rápido de desenvolvimento. O banco foi descartado ao fim.
- **Dados**: conjunto fictício `demo-v1` (#73): 4 pacientes, 10 agendamentos, 3 anamneses,
  2 avaliações, 2 planos, 4 atendimentos e 1 reavaliação. A paciente fictícia P1 percorre o fluxo
  inteiro; P3 serve de caso vazio.
- **Intocados**: o banco de desenvolvimento `fisio_orto_sport` e a produção (Neon).
- **Navegador**: painel de navegador do Claude Code (Chromium), em 1280×800 e em 375×812 (emulação
  móvel). Impressão em PDF com Microsoft Edge sem interface, usando uma sessão de teste do banco
  descartável.

## Cobertura

### Navegação paciente → avaliação → plano → sessão → reavaliação → revisão

Foram 24 telas, abertas nas duas larguras: início, lista de pacientes, ficha, anamnese, lista,
detalhe, edição e criação de avaliação, lista, detalhe, revisão, revisão nº 1 e criação de plano,
lista, detalhe, correção e criação de sessão, lista, detalhe, correção e criação de reavaliação,
documentos, agendamentos do paciente e agenda.

Uma auditoria automática rodou em cada tela, verificando:

- campo sem rótulo;
- botão ou link sem nome acessível;
- imagem sem `alt`;
- `id` duplicado;
- quantidade de `h1` e saltos de nível de título;
- landmark `main`;
- `aria-describedby` apontando para `id` inexistente;
- rolagem horizontal.

| Largura | Resultado |
|---|---|
| 1280 px | 24/24 sem ocorrências |
| 375 px | 24/24 sem ocorrências, sem rolagem horizontal |

### Teclado e foco

- Tab a partir do topo da ficha percorre marca, menu, usuário, botão do menu, trilha, tema e ações do
  paciente. Todos os elementos mostram indicador de foco visível: anel `box-shadow` ou `outline`.
- Menu móvel:
  - Enter no botão abre o diálogo e o foco entra nele;
  - Tab permanece dentro;
  - Esc fecha e devolve o foco ao botão.

### Rótulos, erros e conflitos

- **Nova sessão enviada com a evolução vazia e sem profissional** (validação do navegador desligada):
  - o servidor recusa;
  - os campos ficam com `aria-invalid`;
  - a mensagem de erro está ligada ao campo por `aria-describedby`, junto com a dica;
  - o foco vai para o primeiro campo inválido;
  - há região `aria-live` com o resumo do plano.
- Os conflitos de agenda e de versão já têm cobertura nos testes das issues anteriores. Nenhum defeito
  novo apareceu na navegação.

### Vazio e carregamento

- **Vazio**: paciente sem avaliação mostra "Nenhuma avaliação registrada" e oferece "Nova avaliação
  inicial".
- **Carregamento**: não há `loading.tsx`. Na navegação local, a tela anterior fica até a próxima
  chegar. Não foi classificado como defeito, porque nenhuma falha foi reproduzida (ver recomendações).

### Impressão dos documentos existentes

| Documento | Papel | Páginas | Botões de tela no PDF |
|---|---|---|---|
| Anamnese | A4 (210×297 mm) | 1 | ocultos |
| Cartão de frequência | A4 | 1 | ocultos |
| Termo de consentimento | A4 | 1 | ocultos |

A numeração das cláusulas do termo (1 a 9) está correta. As três telas de impressão também passaram
na auditoria automática.

## Defeitos reproduzidos e corrigidos

### D1 — Nomes acessíveis do menu e da trilha em inglês

- **Reprodução**: em qualquer tela autenticada, o leitor de tela anuncia o botão do menu como "Toggle
  Sidebar". No celular, o diálogo do menu é anunciado como "Sidebar — Displays the mobile sidebar.",
  com botão "Close". A trilha é anunciada como navegação "breadcrumb".
- **Correção**:
  - `src/components/ui/sidebar.tsx`: "Mostrar ou ocultar menu", "Menu de navegação" e "Exibe a
    navegação do sistema.";
  - `src/components/ui/sheet.tsx`: "Fechar";
  - `src/components/ui/breadcrumb.tsx`: "Trilha de navegação" e "Mais".
- **Regressão**: `src/components/__tests__/sidebar-labels.test.tsx`.

### D2 — Registro ou endereço inexistente mostra o 404 padrão do Next em inglês

- **Reprodução**: `/pacientes/<id inexistente>` e `/pacientes/<id>/avaliacoes/<id inexistente>`
  mostravam "404: This page could not be found." sem caminho de volta. O mesmo acontecia em
  `/rota-inexistente`.
- **Correção**:
  - `src/app/(app)/not-found.tsx`: 404 em português dentro do layout com menu, com "Ir para
    pacientes" e "Voltar ao início";
  - `src/app/not-found.tsx`: 404 da raiz no formato da página 403.
- **Regressão**: `src/components/__tests__/not-found.test.tsx`.

### D3 — Falha inesperada mostra a tela padrão do Next em inglês

- **Reprodução em produção** (28/09/2026): com o banco sem a coluna
  `ClinicSettings.businessHoursEnabled`, `/` mostrava "This page couldn't load. A server error
  occurred." (erro P2022 no log da Vercel).
- **Reprodução local**: a mesma falha foi provocada no banco descartável, renomeando a coluna, que
  depois foi restaurada. Uma falha dentro de uma página foi provocada da mesma forma, renomeando
  `Reassessment.planRevisionId` e abrindo o detalhe da reavaliação.
- **Correção**:
  - `src/components/error-fallback.tsx`: tela em português com `role="alert"`, código (`digest`) para
    casar com o log, "Tentar novamente" (`retry`) e "Voltar ao início";
  - `src/app/error.tsx`: pega falhas no layout da área autenticada;
  - `src/app/(app)/error.tsx`: falhas de página, mantendo o menu.
- **Verificação**:
  - falha no layout: tela nova, com código;
  - depois de restaurar a coluna, "Tentar novamente" recarregou o painel;
  - falha de página: tela nova, com o menu mantido.
- **Regressão**: `src/components/__tests__/error-fallback.test.tsx`.

## Observações sem correção nesta issue

- **Links com papel de botão**: `Button` com `render={<Link />}` (5 usos, inclusive a página 403) gera
  `<a role="button">`. A navegação funciona, mas o leitor de tela anuncia os links como botões e o
  Espaço não os ativa. É padrão do projeto; a mudança deve ser tratada à parte.
- **Título da aba no 404**: depois da hidratação, o título da aba passa a ser o da página que chamou
  `notFound()` (por exemplo "Paciente — …"). O `h1` e o conteúdo estão corretos.
- **Rótulo da assinatura na anamnese impressa**: o texto "Fisioterapeuta" é fixo. Numa anamnese
  registrada pelo Administrador sem CREFITO, o nome dele aparece sobre esse rótulo. **Decisão
  pendente** de negócio.
- **Carregamento**: não há indicador durante a navegação (`loading.tsx`). Recomendação para avaliar
  com rede lenta real.
- **Visão mensal da agenda**: fora do escopo; exige decisão separada.

## Validação técnica

| Verificação | Resultado |
|---|---|
| `pnpm lint` | sem erros nem avisos |
| `pnpm typecheck` | ok |
| `pnpm test --runInBand` (sem `.claude/worktrees`) | 76 suítes, 839 testes |
| `pnpm build` | ok |

Nota de ambiente: depois de atualizar o `main` com mudanças de schema, é preciso rodar
`pnpm db:generate`. Com o cliente Prisma antigo, a geração de dados fictícios falhou com
`PrismaClientValidationError`. Isso não é defeito da aplicação.
