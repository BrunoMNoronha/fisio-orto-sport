# configuracoes

Painel de configurações da clínica (issues #63 e #69), em `/configuracoes`. Só o Administrador acessa
(`configuracoes:ler` e `configuracoes:gerir`). Os demais perfis nunca veem o painel; recebem, no
servidor, só os valores de que seus fluxos precisam (`queries.ts`).

## Catálogo

Inventário de 27/09/2026 (#69). Cada item é classificado como:

- **Editável:** parâmetro administrativo, salvo em `ClinicSettings`, com efeito verificável.
- **Referência:** somente leitura, mostrado no painel.
- **Técnica:** constante técnica ou de segurança, fora do painel.

Segredos e variáveis de infraestrutura não entram no catálogo. Não há editor genérico de
chave/valor, código ou expressões: cada parâmetro é um campo tipado em `settings.ts`, com validação
em `validation.ts` e CHECK no banco.

### Editáveis (Administrador, `configuracoes:gerir`)

Todos são opcionais ou têm padrão. Sem configuração salva, vale o padrão, que é o comportamento
anterior, e nenhuma leitura grava nada. A leitura (`queries.ts`) acontece a cada requisição, no
servidor; o consumidor recebe só o recorte de que precisa.

| Grupo | Campo | Tipo e limites | Padrão | Efeito |
|---|---|---|---|---|
| Clínica | Nome de exibição (`displayName`) | Texto, até 120 | vazio | Aparece abaixo da marca na barra lateral (sem ele, "Fisioterapia especializada") e no cabeçalho das impressões. Não muda a marca do produto |
| Clínica | Razão social (`legalName`) | Texto, até 160 | vazio | Cabeçalho das impressões |
| Clínica | CNPJ (`cnpj`) | 14 dígitos com verificadores válidos; guardado só com dígitos | vazio | Cabeçalho das impressões |
| Clínica | Telefone (`phone`) | 10 ou 11 dígitos com DDD | vazio | Cabeçalho das impressões e cartão de frequência |
| Clínica | E-mail (`email`) | E-mail válido, até 254, minúsculo | vazio | Cabeçalho das impressões |
| Clínica | Endereço (`address`) | Texto, até 300 | vazio | Cabeçalho das impressões |
| Agenda | Início da faixa do dia (`agendaDayStartHour`) | Hora inteira, 0–23 | 7 | Primeira hora da grade do dia |
| Agenda | Fim da faixa do dia (`agendaDayEndHour`) | Hora inteira, 1–24, maior que o início | 20 | Última hora da grade do dia. A grade continua se ampliando para mostrar agendamentos fora da faixa. Não é horário de funcionamento nem bloqueio |
| Agenda | Duração sugerida (`suggestedDurationMinutes`) | Minutos inteiros, 5 até o teto técnico do agendamento (720), ou em branco | desligada | No novo agendamento, sugere o fim a partir do início (também com o horário vindo da grade). Não sobrescreve um fim digitado, não vale no reagendamento, não altera agendamentos existentes, não muda a regra de conflito nem a duração das sessões clínicas |
| Agenda | Visão inicial da agenda (`agendaDefaultView`, #69) | `dia`, `semana` ou `lista`; ausente no formulário = `dia` | `dia` | Visão que `/agenda` abre sem `view` na URL (menu lateral), para todos os perfis (consumidor: `parseAgendaView`, via `getAgendaPreferences`). Links com `view` explícita continuam valendo, e a pessoa troca de visão pela barra. Só exibição: não muda regras, dados nem permissões |
| Impressões | Identificação nas impressões (`printShowClinicInfo`) | Liga/desliga | desligado | Termo de consentimento e ficha de anamnese: marca e dados lado a lado no cabeçalho (cabe no A4). Cartão de frequência: só nome e telefone. Campos vazios são omitidos, sem separadores soltos |
| Agenda | Expediente (`businessHours`, #78) | Semana (domingo a sábado), até 2 intervalos por dia, texto canônico validado em `agenda/business-hours.ts` | todos os dias fechados | Dias e intervalos de atendimento; só restringe com a chave abaixo ligada. Regras em `agenda/README.md` |
| Agenda | Aplicar expediente (`businessHoursEnabled`, #78) | Liga/desliga; não liga com a semana toda fechada | desligado | Ligado: o formulário de agendamento só oferece horários do expediente, e o servidor recusa criar/reagendar fora dele. Registros existentes não mudam (ficam sinalizados) |

Nomes institucionais (`displayName`, `legalName`) são gravados em maiúsculas (contrato de nomes da
#78, `src/lib/names.ts`).

Os limites estão em `settings.ts` e `validation.ts` e são repetidos em CHECKs no banco
(migrações `20260927150000_configuracoes`, `20260928000000_config_visao_agenda` e
`20260928030000_config_expediente`).

### Referências (somente leitura no painel, aba Administração)

| Item | Valor | Origem | Consumidor | Por que não é editável |
|---|---|---|---|---|
| Fuso horário | `America/Sao_Paulo` | `CLINIC_TIMEZONE` (`agenda/validation.ts`) | Agenda, datas clínicas, impressões | Mudar reinterpretaria horários já gravados |
| Duração máxima de um agendamento | 12 h (720 min), no mesmo dia | `MAX_DURATION_MINUTES` | Validação de criar/reagendar e teto da duração sugerida | Limite técnico contra erro de digitação. É a fonte única: a duração sugerida e a mensagem de erro derivam dele (antes, o valor estava repetido) |
| Período da visão Lista | 7 dias sem datas; até 31 por consulta | `DEFAULT_RANGE_DAYS`, `MAX_RANGE_DAYS` | `parseAgendaFilter` | Técnico (tamanho da consulta). Tornar o padrão editável foi avaliado e não aprovado em 27/09/2026 |
| Duração máxima de um bloqueio | 366 dias | `MAX_BLOCK_DAYS` | Validação de bloqueio (MEL-02) | Limite técnico contra erro de digitação |
| Links para usuários e auditoria | — | Permissões vigentes | Atalhos | Não duplicam os módulos |

### Técnicas e de segurança (fora do painel)

| Item | Valor | Onde | Observação |
|---|---|---|---|
| Resultados por busca de paciente na agenda | 20 | `agenda/actions.ts` | Desempenho e privacidade (mostra só id e nome) |
| Conflitos listados (bloqueio e aviso do paciente) | até 20 | `agenda/rules.ts` | Tamanho da resposta |
| Bloqueios na tela de bloqueios | até 200 | `agenda/queries.ts` | Tamanho da resposta |
| Sessão, senha e limite de tentativas de login | — | `auth/*` | Segurança; decisões das #37 e #56. Não editáveis |
| Matriz de perfis e permissões | — | `auth/permissions.ts` | Decisão de negócio vigente (#31); não editável |
| Retenção e auditoria | — | #41, #56 | Decisões registradas em `15-retencao-rastreabilidade-recuperacao` |
| Credenciais e variáveis de ambiente | — | Vercel e `.env` | Nunca no painel nem no banco de configurações |

### Decisões pendentes

- **Textos de documentos** (termo de consentimento, cláusulas): editar conteúdo de consentimento
  exige definição específica. Continuam fixos em `pacientes/documents.ts`.
- **Prazo e motivo de cancelamento:** sem decisão (07-regras-negocio). O expediente foi entregue
  na #78 (global e semanal; decisões de 27/09/2026).
- **Disponibilidade e conflitos:** as políticas da MEL-02 (#45) não criaram parâmetros editáveis.

## Regras

- **Linha única** (`ClinicSettings.id = 1`, com CHECK). Sem linha, vale `DEFAULT_SETTINGS`.
  Um erro de leitura propaga para a página de erro, para não se passar por "sem configuração".
- **Gravação atômica** (`write.ts`, `saveClinicSettings`): configuração e registro de auditoria
  entram na mesma transação. Se a auditoria falhar, nada é gravado. Dado inválido é recusado antes,
  com mensagens em pt-BR por campo, e nada é gravado.
- **Sem sobrescrita silenciosa:** o formulário envia a `version` lida. Se outra gravação chegou
  antes, a action responde com conflito e pede para recarregar. A primeira gravação concorrente
  cai na chave primária e recebe o mesmo conflito.
- **Sem mudança real:** não grava, não audita e não incrementa a versão.
- **Auditoria** (`CONFIGURACAO_ALTERADA`): autor, perfil, IP, data e `details`, com a versão nova
  e os **nomes** dos campos alterados, nunca os valores. A consulta continua exclusiva do
  Administrador (`auditoria:ler`).
- **Efeito:** a configuração é lida a cada requisição, sem cache entre requisições, e depois de
  salvar a action revalida o layout. Navegação, agenda e impressões mudam sem deploy e iguais em
  todas as instâncias. Só novas operações e documentos são afetados: horários salvos, prontuários
  e snapshots de autoria não são recalculados. Reimpressões usam a identificação vigente, não a da
  época do documento.
- **Abas (#78):** Clínica, Agenda e expediente, Impressões, Administração e, só com ferramenta de
  desenvolvimento habilitada e para Administrador, Desenvolvimento. As três primeiras são **um único
  formulário** com um único "Salvar": os painéis ficam montados, então trocar de aba não perde nem
  salva nada, e a gravação continua atômica e protegida pela versão (não há sobrescrita de campos de
  outra aba). A aba alterada fica marcada; erro numa aba oculta abre essa aba e leva o foco ao campo.
  Navegação por teclado do Base UI (setas, Home, End; Enter ou Espaço ativam) e lista de abas com
  rolagem horizontal em telas pequenas. Administração traz os atalhos para usuários e auditoria e as
  referências. Desenvolvimento reúne a geração de dados fictícios (#73) e a limpeza da base
  (`manutencao/README.md`), cada uma com sua habilitação; abrir a aba ou salvar configurações nunca
  dispara nenhuma delas.
- **Painel:** mostra os valores vigentes, a última alteração (quem, quando, versão), a prévia do
  cabeçalho, erros por campo e o aviso "Há alterações não salvas". "Descartar alterações" volta à
  última versão salva, só no navegador. O aviso ao sair cobre recarregar e fechar a página, não a
  navegação interna do aplicativo.

## Fora do escopo

Editor de termos ou cláusulas, prazo de cancelamento e faltas, fuso editável, retenção e expurgo,
backup e restauração, matriz de permissões, parâmetros de senha, sessão e limite de tentativas,
credenciais, financeiro, integrações, multi-clínica e upload de logotipo (ver a #63). Bloqueios e aviso
de conflito foram entregues na MEL-02 (#45), sem parâmetros editáveis; o expediente, na #78.

## Testes

- Unitários (`__tests__/`): padrões, CNPJ, término sugerido, resumo de auditoria sem valores,
  linhas de identificação, validação (inclusive a visão inicial e vários campos inválidos juntos),
  teto compartilhado com a agenda e a action (recusa sem sessão, RECEPCAO e FISIOTERAPEUTA; dado
  inválido sem gravação; conflito; falha que não parece sucesso).
- Integração (`test/integration/configuracoes.integration.ts`, PostgreSQL real): linha única,
  versão, gravações concorrentes, rollback quando a auditoria falha, "sem mudança", CHECKs, a
  visão inicial persistida e auditada só pelo nome, e linha antiga com o padrão `dia`.
- Consumidor da visão inicial: `parseAgendaView` em `agenda/__tests__/validation.test.ts`.
- Agenda: `day-layout.test.ts` (faixa configurada que ainda se amplia) e
  `appointment-form.test.tsx` (sugestão que não sobrescreve o fim editado).
