# auth

Autenticação (e-mail e senha), sessão, perfis, permissões e gestão de usuários.

## Peças

| Arquivo | Papel |
|---|---|
| `permissions.ts` | **Mapa único de permissões por perfil** e `can(role, permission)`. Toda checagem de acesso passa por aqui. Não compare `role === "ADMIN"` no código. |
| `dal.ts` (`server-only`) | `getCurrentUser()`, `requireUser()`, `requirePermission()`, `requireRole()` (redirecionam para `/login` ou `/acesso-negado`) e `assertPermission()` (lança `AuthorizationError`, para Server Actions). |
| `session.ts` (`server-only`) | Cria e remove a sessão: token aleatório de 32 bytes no cookie `session` (`httpOnly`, `sameSite=lax`, `secure` em produção, 8 h) e só o hash SHA-256 do token na tabela `Session`. |
| `password.ts` | Hash de senha com scrypt (`node:crypto`, N=2^15, r=8, p=1, salt de 16 bytes). |
| `validation.ts` | Schemas zod (senha com 8 a 128 caracteres, e-mail normalizado). |
| `safeguards.ts` | Regras puras: ninguém desativa ou rebaixa a si mesmo, e ninguém remove o último Administrador ativo. |
| `actions.ts` | `login` (mensagem genérica, tempo constante contra enumeração), `logout` e `setupFirstAdmin` (primeiro acesso). |
| `setup.ts` (`server-only`) | `hasAnyUser()`: diz se a tabela de usuários já tem alguém (decide login × primeiro acesso). |
| `bootstrap.ts` (`server-only`) | Autorização do primeiro acesso por `SETUP_TOKEN` (`isSetupEnabled`, `isValidSetupToken`) e `createFirstAdmin` (transação serializável). |
| `users/actions.ts` | Criar, editar (nome, perfil e CREFITO), ativar/desativar e redefinir a senha. Todas exigem `usuarios:gerir` no servidor. Desativar ou redefinir a senha encerra as sessões do usuário. |
| `rate-limit.ts` / `limits.ts` | Limites de tentativas em janela fixa, guardados no PostgreSQL (`AuthRateLimit`), com reserva em memória. `limits.ts` (`server-only`) define os limites do login e do primeiro acesso. |
| `client-ip.ts` | IP do cliente, lido dos cabeçalhos só atrás de proxy confiável (Vercel ou `TRUST_PROXY=true`). |
| `redirect-path.ts` | Aceita só caminhos internos no `?next=` (evita redirecionamento aberto). |
| `src/proxy.ts` | Checagem **otimista** (presença do cookie). Não substitui a DAL. |

## Como proteger algo novo

1. Declare a permissão em `PERMISSIONS` e distribua-a em `ROLE_PERMISSIONS`.
2. Em páginas, chame `await requirePermission("modulo:acao")`, **em cada página**, não só no layout.
3. Em Server Actions e Route Handlers, chame `await assertPermission("modulo:acao")` antes de qualquer acesso a dados.
4. Na UI, esconda botões com `can(user.role, ...)`, sempre além da checagem no servidor, nunca no lugar dela.

## Matriz vigente (a do Fisioterapeuta confirmada na issue #31)

| Permissão | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| `usuarios:ler` / `usuarios:gerir` | ✓ | — | — |
| `pacientes:ler` | ✓ | ✓ | ✓ |
| `pacientes:gerir` | ✓ | ✓ | ✓ |
| `agenda:ler` | ✓ | ✓ | ✓ |
| `agenda:gerir` | ✓ | ✓ | ✓ |
| `clinico:ler` / `clinico:gerir` | ✓ | — | ✓ (todos os pacientes) |

Contrato: toda permissão da Recepção também é do Fisioterapeuta, que soma a ela o clínico. Isso é testado em `__tests__/permissions.test.ts`. Não use `PERMISSIONS` para o Fisioterapeuta, porque isso daria `usuarios:*`. A autorização é resolvida a cada requisição a partir do usuário da sessão (`dal.ts`), então sessões já abertas recebem a matriz nova sem novo login.

## CREFITO do fisioterapeuta (Fase 2c)

- O CREFITO é do **profissional**, e o profissional é o próprio `User` com perfil `FISIOTERAPEUTA` (não há tabela de profissionais). Por isso fica em `User.crefito`, nunca em `Patient`.
- **Obrigatório** ao criar ou editar um usuário `FISIOTERAPEUTA`. Nos demais perfis é descartado (gravado `null`), inclusive quando o usuário deixa de ser fisioterapeuta.
- **Formato**: texto curto normalizado, com espaços nas pontas removidos, internos colapsados e letras em maiúsculas. Até 20 caracteres (`VarChar(20)`), sem validação de padrão.
- **Único quando informado** (`@unique`; vários `NULL` são aceitos). A duplicidade responde "Já existe um usuário com este CREFITO." sem ecoar o valor. A action distingue o P2002 do CREFITO do P2002 do e-mail procurando `crefito` em `error.meta`, formato conferido contra o PostgreSQL real em `test/integration/cadastro-complementar.integration.ts`.
- Fisioterapeutas cadastrados antes da 2c ficam com `NULL`, e a lista de usuários mostra "CREFITO não informado". Editar um deles exige informar o CREFITO.
- Quem edita: só `usuarios:gerir` (Administrador), com a matriz inalterada. A anamnese **não** guarda o CREFITO na assinatura (append-only inalterado).

## Fora do escopo (por ora)

Recuperação de senha por e-mail, troca de senha pelo próprio usuário, OAuth/SSO, 2FA e trilha de auditoria de acesso.

## Proteções do login

- Mensagem genérica e scrypt contra hash fictício (sem enumeração de contas por conteúdo ou tempo).
- Limites de tentativas **compartilhados entre instâncias** (issue #37; detalhes em [Limites de tentativas](#limites-de-tentativas)): 5 tentativas sem sucesso por e-mail, 30 por IP no login e 10 por IP no primeiro acesso, a cada 15 min. A resposta de bloqueio é a mesma para qualquer e-mail.
- A sessão é criada numa transação serializável que confere se o usuário segue ativo e com o mesmo hash de senha (sem sessão residual após uma redefinição simultânea).
- Em produção o cookie se chama `__Host-session` (Secure, Path=/, sem Domain).

## Limites de tentativas

- **Armazenamento**: tabela `AuthRateLimit` no mesmo PostgreSQL (Neon), sem serviço novo. Cada tentativa é um `INSERT … ON CONFLICT DO UPDATE … RETURNING` atômico por chave, com o relógio do banco, então instâncias diferentes e chamadas simultâneas somam no mesmo contador e na mesma janela, e um cold start não zera nada. Janela fixa de 15 min: tentativas recusadas também contam, mas não estendem a janela.
- **Custo operacional**: uma escrita pequena por tentativa de login ou de primeiro acesso (duas no login: IP e e-mail) e, em ~1% delas, a limpeza das janelas vencidas. A tabela guarda uma linha por IP/e-mail ativo na janela. Não há serviço extra a contratar nem a monitorar.
- **Privacidade**: a chave é o SHA-256 de `<limite>:<valor>`. IP e e-mail não ficam em claro na tabela nem nos logs.
- **Login**: conta toda tentativa por e-mail antes do scrypt (atômico, não fura com chamadas paralelas) e zera no login bem-sucedido. Na prática são 5 tentativas sem sucesso por conta.
- **Indisponibilidade (fail-soft)**: se o armazenamento falhar (banco fora do ar ou migração ainda não aplicada), a instância registra `[rate-limit] armazenamento indisponível` com o código do erro, sem chave, IP ou e-mail, e passa a limitar **em memória** até o banco voltar. O login não é bloqueado por falha do limitador. Se o banco inteiro cair, o login já falha de qualquer forma.
- **IP confiável**: na Vercel (`VERCEL=1`), que sobrescreve `x-forwarded-for` e não repassa o valor enviado pelo cliente, usa o primeiro `x-forwarded-for` (ou `x-real-ip`). Num proxy próprio que faça o mesmo, defina `TRUST_PROXY=true`. Sem proxy confiável (ex.: `next dev`), os cabeçalhos são ignorados e o limite por IP não é aplicado, para não aceitar IP forjado nem juntar todos os clientes num único contador. O limite por e-mail continua valendo. Valores que não são IP válido são descartados.
- **Deploy**: a migração `auth_rate_limit` precisa estar aplicada no banco de produção. Até lá, vale o fail-soft acima.

## Primeiro acesso (tabela de usuários vazia)

Mecanismo escolhido na issue #35: **código de configuração no servidor** (`SETUP_TOKEN`), com o provisionamento por terminal (`pnpm db:seed`) como alternativa.

- Enquanto **não existe nenhum usuário**, `/login` troca o login pelo primeiro acesso. O acesso rápido de desenvolvimento também some, porque não haveria quem listar.
- **Sem `SETUP_TOKEN`** (ou com menos de 32 caracteres), o primeiro acesso pela web fica **desligado**: a tela diz que o sistema não foi configurado e a action recusa qualquer POST sem consultar o banco nem gerar hash. Esse é o estado seguro padrão, inclusive em produção.
- **Com `SETUP_TOKEN`**, o formulário (`setup-form.tsx`) pede o código de configuração, nome, e-mail e senha. `setupFirstAdmin` compara o código em tempo constante (SHA-256 + `timingSafeEqual`), cria o usuário **ADMIN** (mesma política de senha do cadastro comum) e já abre a sessão, redirecionando para o `?next=` validado. Código errado responde "Código de configuração inválido." O código nunca é registrado em log nem devolvido no estado da action.
- `createFirstAdmin` reconfere a tabela vazia com `count()` **dentro de uma transação serializável** antes do `create`, para que duas requisições simultâneas não criem dois administradores (coberto em `test/integration/bootstrap.integration.ts`). `P2002` (e-mail já criado por outra requisição) e o conflito de serialização `P2034` são tratados sem vazar detalhes.
- A action segue acessível por POST depois do primeiro cadastro. Antes do scrypt ela aplica, nesta ordem: limite de **10 tentativas por IP a cada 15 min** (`setupAttemptsByIp`), `SETUP_TOKEN` configurado, código válido e uma checagem barata (`hasAnyUser()`). Com usuário cadastrado, recusa sem gerar hash nem abrir transação.
- Depois do primeiro usuário, a tela volta ao login normal e novos usuários passam a ser criados só em `/usuarios` (`usuarios:gerir`).

### Procedimento de primeiro acesso

1. Gere um código longo e aleatório, por exemplo `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Defina `SETUP_TOKEN` só no ambiente que vai receber o primeiro acesso (`.env` local ou variável do ambiente na hospedagem) e publique/reinicie para a variável valer.
3. Abra `/login`, informe o código e cadastre o Administrador.
4. Remova `SETUP_TOKEN` do ambiente. Com usuário cadastrado ele já não tem efeito, mas mantê-lo só amplia o que precisa ser guardado.

Alternativa sem expor a tela: rodar `pnpm db:seed` contra o banco antes de publicar (ver `SEED_ADMIN_*` no `.env.example`).

### Recuperação de acesso de Administrador

- Outro Administrador ativo redefine a senha em `/usuarios` (as sessões do usuário são encerradas).
- Sem nenhum Administrador utilizável, o primeiro acesso pela web **não** serve (a tabela não está vazia). Pelo terminal, com `DATABASE_URL` do banco alvo definida só naquela sessão, rode `pnpm db:admin --email <e-mail do Administrador>`. Ele redefine a senha, reativa a conta e encerra as sessões dela; se o e-mail não existir, cria um Administrador novo. Alternativa: `pnpm db:seed` com `SEED_ADMIN_*` apontando para um e-mail novo.

### `pnpm db:admin` (issue #40)

Núcleo em `admin-cli.ts` (testável); `prisma/admin.ts` é só a entrada com o prompt.

- **Alvo**: mostra só `host/banco` e se é local ou REMOTO, nunca usuário, senha ou parâmetros. `DATABASE_URL` inválida é recusada sem ecoar o valor.
- **Confirmação** antes de qualquer escrita: `sim` no banco local; no remoto, digitar o nome do banco.
- **Senha**: só pelo prompt, sem eco no terminal e duas vezes. Nunca por argumento (não fica no histórico) e nunca na saída; o banco recebe só o hash scrypt.
- **Comportamento**: e-mail novo cria um ADMIN ativo. E-mail de ADMIN troca a senha, reativa e apaga as sessões na mesma transação, reconferindo o perfil na escrita. E-mail de **outro perfil** é recusado sem perguntar nada: promover alguém a ADMIN é feito em `/usuarios`.
- **Abortos**: argumentos inválidos, confirmação diferente, senha fora de 8 a 128 caracteres, senhas diferentes, Ctrl+C ou fim da entrada encerram sem gravar (código 1, ou 130 no cancelamento). Tabela ausente, e-mail criado em paralelo (P2002) e falha do banco viram mensagens curtas, sem despejar o erro inteiro.
- **Testes**: `__tests__/admin-cli.test.ts` cobre o núcleo; `test/integration/admin-cli.integration.ts` roda o script de verdade contra o banco de integração.

## Acesso rápido em desenvolvimento

Com `next dev`, a tela de login lista os usuários ativos; clicar em um entra direto como ele (`dev-login.ts`). Fora de `NODE_ENV=development` a lista não aparece e a action responde 404.
