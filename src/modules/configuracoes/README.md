# configuracoes

Painel de configurações da clínica (issue #63), em `/configuracoes`. Só o Administrador acessa
(`configuracoes:ler` e `configuracoes:gerir`). Os demais perfis nunca veem o painel; recebem, no
servidor, só os valores de que seus fluxos precisam (`queries.ts`).

## Catálogo

Todos os campos são opcionais ou têm padrão. Sem configuração salva, vale o padrão, que é o
comportamento anterior à issue, e nenhuma leitura grava nada.

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
| Agenda | Duração sugerida (`suggestedDurationMinutes`) | Minutos inteiros, 5–720, ou em branco | desligada | No novo agendamento, sugere o fim a partir do início (também com o horário vindo da grade). Não sobrescreve um fim digitado, não vale no reagendamento, não altera agendamentos existentes, não muda a regra de conflito nem a duração das sessões clínicas |
| Impressões | Identificação nas impressões (`printShowClinicInfo`) | Liga/desliga | desligado | Termo de consentimento e ficha de anamnese: marca e dados lado a lado no cabeçalho (cabe no A4). Cartão de frequência: só nome e telefone. Campos vazios são omitidos, sem separadores soltos |
| Referência | Fuso horário | Só leitura (`CLINIC_TIMEZONE`) | `America/Sao_Paulo` | Informativo |
| Referência | Links para usuários e auditoria | Respeitam as permissões | — | Atalhos; não duplicam os módulos |

Os limites estão em `settings.ts` e `validation.ts`, e são repetidos em CHECKs no banco
(migração `20260927150000_configuracoes`).

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
- **Painel:** mostra os valores vigentes, a última alteração (quem, quando, versão), a prévia do
  cabeçalho, erros por campo e o aviso "Há alterações não salvas". "Descartar alterações" volta à
  última versão salva, só no navegador. O aviso ao sair cobre recarregar e fechar a página, não a
  navegação interna do aplicativo.

## Fora do escopo

Editor de termos ou cláusulas, prazo de cancelamento e faltas, fuso editável, retenção e expurgo,
backup e restauração, matriz de permissões, parâmetros de senha, sessão e limite de tentativas,
credenciais, financeiro, integrações, multi-clínica e upload de logotipo (ver a #63). Horário de
funcionamento, disponibilidade e bloqueios ficam na issue de disponibilidade (MEL-02, #45).

## Testes

- Unitários (`__tests__/`): padrões, CNPJ, término sugerido, resumo de auditoria sem valores,
  linhas de identificação, validação e a action (recusa sem sessão, RECEPCAO e FISIOTERAPEUTA;
  dado inválido sem gravação; conflito; falha que não parece sucesso).
- Integração (`test/integration/configuracoes.integration.ts`, PostgreSQL real): linha única,
  versão, gravações concorrentes, rollback quando a auditoria falha, "sem mudança" e CHECKs.
- Agenda: `day-layout.test.ts` (faixa configurada que ainda se amplia) e
  `appointment-form.test.tsx` (sugestão que não sobrescreve o fim editado).
