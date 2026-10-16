# Cobertura de ajuda informativa — issues #137 e #138

Inventário da implementação em 16/10/2026. Textos dinâmicos usam o catálogo explícito `src/lib/field-help.ts`; não há inferência a partir do rótulo em tempo de execução.

| Arquivo e linha | Componente | Campo/ação | Explicação ou catálogo |
|---|---|---|---|
| `src/app/(app)/administrativo/beneficiary-form.tsx:36` | Label | Exigência de autorização | "Define quando a cobertura exige autorização prévia para executar procedimentos." |
| `src/app/(app)/administrativo/beneficiary-form.tsx:40` | Label | {f.label} {f.required ? " *" : ""} | {fieldHelp(f.name)} |
| `src/app/(app)/administrativo/beneficiary-form.tsx:45` | Label | Situação | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/administrativo/beneficiary-form.tsx:49` | Label | Motivo do registro ou alteração * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/beneficiary-form.tsx:52` | Button | {pending ? "Salvando…" : "Salvar"} | "Valida os campos e salva o cadastro com a justificativa informada." |
| `src/app/(app)/administrativo/beneficiary-form.tsx:53` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/administrativo/coberturas/[id]/elegibilidade/page.tsx:21` | HelpLabel | Data de execução | "Data em que o procedimento será executado, usada para consultar vigência e elegibilidade." |
| `src/app/(app)/administrativo/coberturas/[id]/elegibilidade/page.tsx:22` | HelpLabel | Quantidade | "Número de unidades do procedimento para a consulta de elegibilidade." |
| `src/app/(app)/administrativo/coberturas/[id]/elegibilidade/page.tsx:23` | NativeActionButton | Consultar | "Consulta a elegibilidade com os parâmetros informados, sem registrar uma execução." |
| `src/app/(app)/administrativo/conciliacao/page.tsx:15` | HelpLabel | Contrato | "Identifica o contrato da operadora ao qual a consulta será limitada." |
| `src/app/(app)/administrativo/conciliacao/page.tsx:15` | HelpLabel | Identificador do lote (opcional) | "Informe o identificador de um lote para limitar a conciliação a ele; deixe vazio para não restringir." |
| `src/app/(app)/administrativo/conciliacao/page.tsx:15` | NativeActionButton | Consultar | "Consulta a conciliação do contrato e do lote informados." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:27` | HelpLabel | Operação | "Escolha o tipo de movimento financeiro a registrar na conciliação." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:28` | HelpLabel | Data efetiva | "Data civil em que o movimento financeiro ocorreu." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:29` | HelpLabel | Demonstrativo ou protocolo | "Identificação do documento da operadora que comprova o movimento." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:30` | HelpLabel | Valor total (R$) | "Valor total do movimento em reais; deve corresponder às alocações informadas." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:32` | HelpLabel | Motivo do registro, revisão ou correção | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:40` | HelpLabel | Item faturado | "Selecione o item faturado ao qual o valor será atribuído." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:41` | HelpLabel | Identificador do outro item | "Identificador de outro item faturado que receberá parte do valor." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:42` | HelpLabel | Valor alocado (R$) | "Parcela do movimento atribuída a este item, em reais." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:43` | HelpLabel | Origem da alocação | "Identifica a origem que está sendo conciliada nesta alocação." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:43` | HelpLabel | Identificador da glosa original | "Vincula a revisão à glosa original para preservar seu histórico." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:44` | HelpLabel | Código/motivo de glosa do demonstrativo | "Código ou justificativa de glosa conforme o demonstrativo recebido da operadora." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:45` | NativeActionButton | Remover alocação {index+1} | "Retira esta alocação do formulário; nada é salvo até confirmar o movimento." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:48` | NativeActionButton | Adicionar alocação | "Acrescenta uma linha para distribuir o valor do movimento entre itens faturados." |
| `src/app/(app)/administrativo/conciliacao/settlement-form.tsx:51` | NativeActionButton | {pending?'Confirmando…':'Confirmar movimento'} | "Valida e registra o movimento financeiro e suas alocações." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:10` | HelpLabel | Mês civil de execução | "Mês civil das execuções que integrarão a guia." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:10` | NativeActionButton | Continuar montagem | "Abre a montagem da guia para o mês escolhido." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:20` | HelpLabel | Mês civil de execução | "Mês civil das execuções que integrarão a guia." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:21` | HelpLabel | Autorização da guia | "Autorização recebida da operadora que será vinculada à guia." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:23` | HelpLabel | Solicitante | "Profissional que solicitou os procedimentos documentados nesta guia." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:24` | HelpLabel | Data real da solicitação | "Data efetiva da solicitação, conforme o documento de origem." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:25` | HelpLabel | {label} {frozen && <input type="hidden" name={field} value={g?.[field] ?? ''} />} | "Preencha o campo da guia conforme o documento recebido e o perfil de campos do contrato." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:26` | HelpLabel | Atendimento de recém-nascido | "Indique se o atendimento documentado é de um recém-nascido." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:26` | HelpLabel | Código do contratado solicitante na operadora | "Identificação do solicitante atribuída pela operadora; preserve zeros à esquerda." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:26` | HelpLabel | Nome do contratado solicitante | "Nome do prestador solicitante conforme o cadastro da operadora." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:27` | HelpLabel | Indicação clínica exclusiva para faturamento | "Informação clínica necessária ao faturamento; não substitui a evolução no prontuário." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:27` | HelpLabel | Confirmação clínica | "Confirmação clínica exigida para a conferência dos itens da guia." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:29` | HelpLabel | {l.production.executionOn.toISOString().slice(0, 10)} · {l.production.procedure.code} · {l.production.procedure.name} · {l.production.session.professionalNameSnapshot} · {l.production.quantity} un. · {l.production.amountCents === null ? 'Pendente' : formatBRL(l.production.amountCents)} · {l.production.state} {frozen && <input type="hidden" name="productionIds" value={l.productionId} />} | "Selecione a produção para compor a guia; itens indisponíveis não podem ser adicionados." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:30` | HelpLabel | {c.executionOn.toISOString().slice(0, 10)} · {c.procedure.code} · {c.procedure.name} · {c.session.professionalNameSnapshot} · {c.quantity} un. · {formatBRL(c.amountCents ?? 0)} | "Selecione a produção para compor a guia; itens indisponíveis não podem ser adicionados." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:33` | HelpLabel | Motivo do registro ou alteração | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:33` | NativeActionButton | Salvar rascunho | "Salva o rascunho da guia sem realizar sua conferência." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:33` | NativeActionButton | Conferir guia | "Valida e confere a guia para avançar no fluxo de faturamento." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:33` | NativeActionButton | Devolver para correção | "Devolve a guia para que os dados possam ser corrigidos." |
| `src/app/(app)/administrativo/guias/guide-form.tsx:33` | NativeActionButton | Cancelar guia e liberar itens | "Cancela a guia e libera seus itens para nova composição, conforme as regras do fluxo." |
| `src/app/(app)/administrativo/itens/[id]/page.tsx:19` | HelpLabel | Data de execução | "Data em que o procedimento será executado, usada para consultar vigência e elegibilidade." |
| `src/app/(app)/administrativo/itens/[id]/page.tsx:20` | HelpLabel | Quantidade | "Número de unidades do procedimento para a consulta de elegibilidade." |
| `src/app/(app)/administrativo/itens/[id]/page.tsx:21` | NativeActionButton | Consultar | "Consulta a elegibilidade com os parâmetros informados, sem registrar uma execução." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:10` | HelpLabel | Filtrar candidatas pelo perfil de campos | "Limita as guias candidatas ao perfil de campos escolhido." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:10` | HelpLabel | Guia {g.number} · {g.patient} · {g.month} · {formatBRL(g.totalCents)} | "Marca esta guia para inclusão na composição do lote." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:11` | HelpLabel | Arquivo validado | "Selecione o artefato XML validado correspondente ao envio manual." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:11` | HelpLabel | Data civil do envio | "Data em que o lote foi enviado fora do sistema." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:11` | HelpLabel | Protocolo | "Número do comprovante de recebimento fornecido pela operadora." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:11` | HelpLabel | Canal utilizado | "Meio utilizado para encaminhar o lote à operadora." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:12` | HelpLabel | Motivo obrigatório | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:12` | NativeActionButton | Salvar composição | "Salva as guias selecionadas na composição do lote." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:12` | NativeActionButton | Fechar lote | "Fecha a composição do lote para as próximas etapas do faturamento." |
| `src/app/(app)/administrativo/lotes/batch-form.tsx:12` | NativeActionButton | {mode==='cancel'?'Cancelar lote':correctsId?'Acrescentar correção do envio':'Registrar envio manual'} | {mode === 'cancel' ? 'Cancela o lote com a justificativa informada.' : correctsId ? 'Acrescenta uma correção ao registro do envio manual.' : 'Registra o envio realizado fora do sistema; não transmite o lote à operadora.'} |
| `src/app/(app)/administrativo/lotes/contract-picker.tsx:7` | NativeActionButton | Selecionar contrato | "Continua a montagem do lote no contrato selecionado." |
| `src/app/(app)/administrativo/lotes/page.tsx:5` | HelpLabel | Estado | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/administrativo/lotes/page.tsx:5` | HelpLabel | Identificador do contrato | "Identifica o contrato da operadora ao qual a consulta será limitada." |
| `src/app/(app)/administrativo/lotes/page.tsx:5` | NativeActionButton | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/administrativo/lotes/xml-form.tsx:5` | HelpLabel | Motivo da geração | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/lotes/xml-form.tsx:5` | NativeActionButton | {pending?'Validando XML…':'Gerar e validar XML'} | "Gera o XML do lote e valida o arquivo conforme o perfil configurado." |
| `src/app/(app)/administrativo/producao/production-form.tsx:22` | Label | Cobertura | "Cobertura do beneficiário usada na elegibilidade desta produção." |
| `src/app/(app)/administrativo/producao/production-form.tsx:23` | Label | Procedimento | "Procedimento executado que será preparado para faturamento." |
| `src/app/(app)/administrativo/producao/production-form.tsx:25` | Label | Quantidade inteira | "Quantidade de unidades efetivamente executadas do procedimento." |
| `src/app/(app)/administrativo/producao/production-form.tsx:26` | Label | Hora final real (opcional) | "Horário real de término da execução, quando disponível." |
| `src/app/(app)/administrativo/producao/production-form.tsx:28` | Label | Item de autorização | "Item de autorização que ampara a execução deste procedimento." |
| `src/app/(app)/administrativo/producao/production-form.tsx:29` | Label | Motivo | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/administrativo/producao/production-form.tsx:30` | Button | Salvar preparação | "Salva a preparação do item de produção para conferência posterior." |
| `src/app/(app)/administrativo/producao/production-form.tsx:30` | Button | Conferir produção | "Valida e confere o item de produção para uso no faturamento." |
| `src/app/(app)/administrativo/producao/production-form.tsx:30` | Button | Devolver à preparação | "Devolve o item à preparação para permitir correções." |
| `src/app/(app)/administrativo/producao/production-form.tsx:30` | Button | Invalidar item | "Invalida a produção com a justificativa informada, preservando o histórico." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:12` | NativeActionButton | Remover {title.toLowerCase()} | "Limpa a seleção deste filtro; aplique os filtros para atualizar o resultado." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:17` | HelpLabel | Eixo temporal | "Escolhe qual data do movimento será usada para limitar o período do relatório." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:18` | HelpLabel | Data inicial (inclusiva) | "Primeira data incluída na consulta do período." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:19` | HelpLabel | Data final (inclusiva) | "Última data incluída na consulta do período." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:20` | HelpLabel | Estado do lote | "Limita o relatório aos lotes na situação escolhida." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:20` | HelpLabel | Posição atual do item | "Limita o relatório à situação atual dos itens faturados." |
| `src/app/(app)/administrativo/relatorios/financial-filters.tsx:21` | NativeActionButton | Aplicar filtros | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/administrativo/relatorios/report-filters.tsx:16` | NativeActionButton | Remover {label.toLowerCase()} | "Limpa a seleção deste filtro; aplique os filtros para atualizar o resultado." |
| `src/app/(app)/administrativo/relatorios/report-filters.tsx:21` | HelpLabel | Data inicial | "Primeira data incluída na consulta do período." |
| `src/app/(app)/administrativo/relatorios/report-filters.tsx:22` | HelpLabel | Data final | "Última data incluída na consulta do período." |
| `src/app/(app)/administrativo/relatorios/report-filters.tsx:23` | HelpLabel | Estado | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/administrativo/relatorios/report-filters.tsx:24` | NativeActionButton | Aplicar filtros | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/administrativo/ui.tsx:7` | NativeActionButton | Buscar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:39` | ActionLink | (composição/ícone) | "Exibe o período anterior da agenda, mantendo o profissional selecionado." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:46` | ActionLink | Hoje | "Exibe a agenda na data de hoje." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:53` | ActionLink | (composição/ícone) | "Exibe o próximo período da agenda, mantendo o profissional selecionado." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:66` | ActionLink | {VIEW_LABELS[key]} | "Muda a forma de visualizar a agenda, preservando a data e o profissional." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:80` | ActionLink | Bloqueios | "Abre a consulta de indisponibilidades dos profissionais." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:86` | ActionLink | Novo agendamento | "Abre o formulário para criar um agendamento; a marcação só ocorre ao confirmar." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:99` | Label | Profissional | "Profissional ao qual os horários ou bloqueios se referem." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:117` | Label | De | "Primeira data incluída na consulta do período." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:121` | Label | Até | "Última data incluída na consulta do período." |
| `src/app/(app)/agenda/agenda-toolbar.tsx:126` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/agenda/appointment-form.tsx:148` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/agenda/appointment-form.tsx:177` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/agenda/appointment-form.tsx:199` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/agenda/appointment-form.tsx:304` | Label | Observação administrativa (opcional) | "Informação administrativa de apoio; não inclua evolução clínica neste campo." |
| `src/app/(app)/agenda/appointment-form.tsx:317` | Button | {pending ? "Salvando…" : "Confirmar mesmo assim"} | "Confirma o agendamento apesar do conflito de horário do paciente; outras validações continuam sendo aplicadas." |
| `src/app/(app)/agenda/appointment-form.tsx:321` | Button | {pending ? "Salvando…" : submitLabel} | {appointmentId ? 'Salva o novo horário e profissional deste agendamento.' : 'Valida e cria o agendamento ou a série recorrente informada.'} |
| `src/app/(app)/agenda/appointment-form.tsx:326` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/agenda/attendance-form.tsx:26` | Label | Presença | "Registra comparecimento ou modalidade de falta; deixar sem registro remove a presença informada." |
| `src/app/(app)/agenda/attendance-form.tsx:43` | Button | {pending ? "Salvando…" : "Salvar presença"} | "Salva a presença selecionada para este agendamento." |
| `src/app/(app)/agenda/bloqueios/block-form.tsx:59` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/agenda/bloqueios/block-form.tsx:88` | Label | Profissional * | "Profissional ao qual os horários ou bloqueios se referem." |
| `src/app/(app)/agenda/bloqueios/block-form.tsx:117` | Label | Motivo (opcional) | "Explique a indisponibilidade deste horário, sem incluir informações clínicas." |
| `src/app/(app)/agenda/bloqueios/block-form.tsx:130` | Button | {pending ? "Salvando…" : "Bloquear horário"} | "Registra a indisponibilidade do profissional no período informado." |
| `src/app/(app)/agenda/bloqueios/block-form.tsx:133` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/agenda/bloqueios/page.tsx:33` | ActionLink | Voltar à agenda | "Abre a agenda para consultar os horários." |
| `src/app/(app)/agenda/bloqueios/page.tsx:36` | ActionLink | Novo bloqueio | "Abre o formulário para bloquear um intervalo de horários." |
| `src/app/(app)/agenda/bloqueios/page.tsx:52` | Label | Profissional | "Profissional ao qual os horários ou bloqueios se referem." |
| `src/app/(app)/agenda/bloqueios/page.tsx:67` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/agenda/bloqueios/remove-block-form.tsx:23` | Button | (composição/ícone) | "Abre a confirmação para remover este bloqueio de horário." |
| `src/app/(app)/agenda/bloqueios/remove-block-form.tsx:39` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/agenda/bloqueios/remove-block-form.tsx:40` | Button | {pending ? "Removendo…" : "Remover bloqueio"} | "Remove o bloqueio após a confirmação, liberando o período para novos agendamentos." |
| `src/app/(app)/agenda/cancel-appointment-form.tsx:28` | Button | (composição/ícone) | "Abre a confirmação de cancelamento do agendamento." |
| `src/app/(app)/agenda/cancel-appointment-form.tsx:39` | Label | Motivo do cancelamento (opcional) | "Justificativa administrativa do cancelamento, quando houver." |
| `src/app/(app)/agenda/cancel-appointment-form.tsx:59` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/agenda/cancel-appointment-form.tsx:60` | Button | {pending ? "Cancelando…" : "Confirmar cancelamento"} | "Confirma o cancelamento deste agendamento, preservando o registro no histórico." |
| `src/app/(app)/agenda/patient-combobox.tsx:123` | Label | {label} | "Digite parte do nome e selecione um resultado da lista; digitar sozinho não confirma a seleção." |
| `src/app/(app)/agenda/recurrence-fields.tsx:44` | HelpLabel | Agendamento recorrente | "Cria várias sessões nos dias da semana selecionados, a partir do primeiro agendamento." |
| `src/app/(app)/agenda/recurrence-fields.tsx:52` | Label | Quantidade de sessões | "Total de sessões da série, incluindo a primeira, respeitando o limite configurado pela clínica." |
| `src/app/(app)/agenda/recurrence-fields.tsx:66` | Button | Alterar dias | "Abre a seleção dos dias da semana usados na recorrência." |
| `src/app/(app)/agenda/recurrence-fields.tsx:88` | HelpLabel | {label} | "Inclui ou retira este dia da semana da distribuição das sessões recorrentes." |
| `src/app/(app)/agenda/recurrence-fields.tsx:98` | Button | Cancelar | "Fecha a seleção de dias e descarta as mudanças ainda não confirmadas." |
| `src/app/(app)/agenda/recurrence-fields.tsx:99` | Button | Confirmar dias | "Aplica os dias selecionados à recorrência no formulário; ainda é necessário salvar o agendamento." |
| `src/app/(app)/agenda/[id]/page.tsx:81` | ActionLink | Ver na agenda do dia | "Exibe este agendamento na agenda do dia." |
| `src/app/(app)/agenda/[id]/page.tsx:91` | ActionLink | Registrar atendimento | "Abre o formulário de atendimento vinculado a este agendamento." |
| `src/app/(app)/agenda/[id]/page.tsx:99` | ActionLink | Reagendar | "Abre o formulário para escolher outro horário ou profissional; não altera o agendamento antes de salvar." |
| `src/app/(app)/configuracoes/catalog-form.tsx:36` | Label | {label} | {fieldHelp(key)} |
| `src/app/(app)/configuracoes/catalog-form.tsx:55` | Label | {field.label} {field.required ? " *" : ""} | {fieldHelp(field.name)} |
| `src/app/(app)/configuracoes/catalog-form.tsx:65` | Label | Motivo do registro ou alteração * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/configuracoes/catalog-form.tsx:68` | Button | {pending ? "Salvando…" : "Salvar"} | "Valida os campos e salva o cadastro com a justificativa informada." |
| `src/app/(app)/configuracoes/catalog-form.tsx:69` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/configuracoes/dev-data-section.tsx:117` | Button | (composição/ícone) | "Abre a confirmação para gerar dados fictícios no ambiente habilitado." |
| `src/app/(app)/configuracoes/dev-data-section.tsx:149` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/configuracoes/dev-data-section.tsx:150` | Button | {pending ? "Gerando…" : "Gerar dados fictícios"} | "Gera os dados fictícios previstos para este ambiente após a confirmação." |
| `src/app/(app)/configuracoes/dev-reset-section.tsx:113` | Label | Digite o nome do banco ( {database} ) | "Repita o nome do banco exibido para confirmar o alvo da limpeza." |
| `src/app/(app)/configuracoes/dev-reset-section.tsx:123` | Label | Digite LIMPAR | "Digite a palavra LIMPAR em maiúsculas para confirmar a limpeza da base." |
| `src/app/(app)/configuracoes/dev-reset-section.tsx:133` | Button | {pending ? "Limpando…" : "Limpar a base"} | "Executa a limpeza da base selecionada após as confirmações exigidas." |
| `src/app/(app)/configuracoes/operadoras/config-form.tsx:54` | Label | {field.label} {field.required ? " *" : ""} | {fieldHelp(field.name)} |
| `src/app/(app)/configuracoes/operadoras/config-form.tsx:66` | Label | Situação | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/configuracoes/operadoras/config-form.tsx:74` | Label | Motivo do registro ou alteração * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/configuracoes/operadoras/config-form.tsx:81` | Button | {pending ? "Salvando…" : "Salvar"} | "Valida os campos e salva o cadastro com a justificativa informada." |
| `src/app/(app)/configuracoes/operadoras/config-form.tsx:82` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/configuracoes/operadoras/page.tsx:17` | ActionLink | Nova operadora | "Abre o cadastro de uma nova operadora." |
| `src/app/(app)/configuracoes/operadoras/page.tsx:21` | Button | Buscar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/configuracoes/operadoras/[id]/page.tsx:21` | ActionLink | Novo contrato | "Abre o cadastro de um contrato para esta operadora." |
| `src/app/(app)/configuracoes/perfis-guia/[contractId]/profile-form.tsx:6` | HelpLabel | Manual/perfil utilizado | "Identifica o manual ou perfil de campos da operadora utilizado nesta versão." |
| `src/app/(app)/configuracoes/perfis-guia/[contractId]/profile-form.tsx:6` | HelpLabel | {label} | "Configure os campos exigidos ou permitidos pelo manual do contrato nesta versão do perfil." |
| `src/app/(app)/configuracoes/perfis-guia/[contractId]/profile-form.tsx:6` | HelpLabel | {label} (separados por vírgula) | "Configure os campos exigidos ou permitidos pelo manual do contrato nesta versão do perfil." |
| `src/app/(app)/configuracoes/perfis-guia/[contractId]/profile-form.tsx:6` | HelpLabel | Motivo | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/configuracoes/perfis-guia/[contractId]/profile-form.tsx:6` | NativeActionButton | Salvar nova versão do perfil | "Salva uma nova versão do perfil de campos do contrato." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | Schema ANS | "Schema oficial utilizado para validar a estrutura do arquivo XML." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | Finalidade | "Define para qual fluxo de envio o perfil XML será utilizado." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | {label} | "Informe o código correspondente no manual da operadora para compor o XML." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | Versão aceita pela operadora | "Versão do XML que a operadora aceita para este contrato." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | Incluir equipe executante (conforme manual) | "Inclui os dados da equipe executante no XML quando exigidos pelo manual." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | {p.name} | "Seleciona o procedimento a vincular ao perfil XML." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | HelpLabel | Motivo | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/configuracoes/perfis-xml/[contractId]/profile-form.tsx:7` | NativeActionButton | Salvar nova versão do perfil XML | "Salva uma nova versão do perfil de geração e validação XML." |
| `src/app/(app)/configuracoes/procedimentos/page.tsx:22` | NativeActionButton | Buscar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/configuracoes/procedimentos/[id]/page.tsx:35` | HelpLabel | Data de execução | "Data em que o procedimento será executado, usada para consultar vigência e elegibilidade." |
| `src/app/(app)/configuracoes/procedimentos/[id]/page.tsx:36` | NativeActionButton | Consultar | "Consulta a elegibilidade com os parâmetros informados, sem registrar uma execução." |
| `src/app/(app)/configuracoes/profissionais/page.tsx:13` | NativeActionButton | Buscar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/configuracoes/profissionais/professional-editor.tsx:16` | NativeActionButton | Localizar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/configuracoes/settings-form.tsx:249` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/configuracoes/settings-form.tsx:341` | Button | Recarregar | "Recarrega a página com a versão atual das configurações; alterações locais não salvas serão perdidas." |
| `src/app/(app)/configuracoes/settings-form.tsx:376` | Label | CNPJ | "CNPJ da clínica, com 14 dígitos e verificadores válidos; a formatação é aplicada na exibição." |
| `src/app/(app)/configuracoes/settings-form.tsx:389` | Label | Telefone | "Telefone da clínica com DDD, usado na identificação e nas impressões configuradas." |
| `src/app/(app)/configuracoes/settings-form.tsx:423` | Label | Início da faixa do dia | "Primeira hora exibida na grade; não define o expediente nem bloqueia horários." |
| `src/app/(app)/configuracoes/settings-form.tsx:441` | Label | Fim da faixa do dia | "Última hora preferida da grade; agendamentos fora da faixa continuam visíveis." |
| `src/app/(app)/configuracoes/settings-form.tsx:464` | Label | Duração sugerida (minutos) | "Sugere o término de novos agendamentos a partir do início; não sobrescreve um término editado." |
| `src/app/(app)/configuracoes/settings-form.tsx:486` | Label | Agendamentos simultâneos por fisioterapeuta | "Capacidade de agendamentos simultâneos por profissional durante todo o intervalo." |
| `src/app/(app)/configuracoes/settings-form.tsx:502` | Label | Máximo de sessões por agendamento recorrente | "Limite de sessões em uma nova série recorrente, contando a primeira sessão." |
| `src/app/(app)/configuracoes/settings-form.tsx:514` | Label | Visão inicial da agenda | "Visão aberta por padrão ao acessar a agenda sem escolher outra visão." |
| `src/app/(app)/configuracoes/settings-form.tsx:557` | HelpLabel | {name} | "Habilita o atendimento neste dia da semana e permite definir os intervalos do expediente." |
| `src/app/(app)/configuracoes/settings-form.tsx:588` | Button | Sem pausa | "Remove o segundo intervalo do dia no formulário; salve as configurações para aplicar." |
| `src/app/(app)/configuracoes/settings-form.tsx:598` | Button | Adicionar pausa | "Adiciona um segundo intervalo para representar a pausa do expediente; salve para aplicar." |
| `src/app/(app)/configuracoes/settings-form.tsx:635` | Label | Aplicar o expediente à agenda | "Restringe novas marcações e reagendamentos aos intervalos do expediente configurado." |
| `src/app/(app)/configuracoes/settings-form.tsx:669` | Label | Mostrar a identificação da clínica nas impressões | "Inclui os dados preenchidos da clínica nos documentos gerados para impressão." |
| `src/app/(app)/configuracoes/settings-form.tsx:709` | Label | Exibir tooltips nos botões de ação | "Controla a ajuda dos botões para todos os usuários da clínica após salvar." |
| `src/app/(app)/configuracoes/settings-form.tsx:721` | Button | {pending ? "Salvando…" : "Salvar configurações"} | "Salva as alterações de todas as abas para uso pela clínica." |
| `src/app/(app)/configuracoes/settings-form.tsx:724` | Button | Descartar alterações | "Restaura os valores da última configuração salva, descartando as alterações locais de todas as abas." |
| `src/app/(app)/financeiro/charge-form.tsx:105` | Label | Descrição * | "Identificação do serviço ou cobrança que aparecerá no registro financeiro." |
| `src/app/(app)/financeiro/charge-form.tsx:119` | Label | Valor (R$) * | "Valor total da cobrança em reais." |
| `src/app/(app)/financeiro/charge-form.tsx:137` | Label | Vencimento * | "Data civil em que o pagamento da cobrança vence." |
| `src/app/(app)/financeiro/charge-form.tsx:145` | Label | Motivo do cancelamento da original * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/financeiro/charge-form.tsx:161` | Button | {pending ? "Salvando…" : submitLabel} | {chargeId ? 'Cancela a cobrança original e registra sua substituta com os dados informados.' : 'Registra uma nova cobrança para o paciente.'} |
| `src/app/(app)/financeiro/charge-form.tsx:164` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/financeiro/page.tsx:63` | ActionLink | Conciliação de operadoras | "Abre a consulta de conciliação dos movimentos das operadoras." |
| `src/app/(app)/financeiro/page.tsx:63` | ActionLink | Relatórios de operadoras | "Abre os relatórios administrativos de faturamento das operadoras." |
| `src/app/(app)/financeiro/page.tsx:64` | ActionLink | Relatórios | "Abre o relatório de contas a receber com os filtros correspondentes." |
| `src/app/(app)/financeiro/page.tsx:67` | ActionLink | Nova cobrança | "Abre o formulário para registrar uma nova cobrança." |
| `src/app/(app)/financeiro/page.tsx:81` | Label | Buscar por nome do paciente | "Digite parte do nome do paciente para limitar os resultados da consulta." |
| `src/app/(app)/financeiro/page.tsx:85` | Label | Situação | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/financeiro/page.tsx:95` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/financeiro/page.tsx:159` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/page.tsx:164` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/payment-form.tsx:74` | Label | Valor recebido (R$) * | "Quantia efetivamente recebida, em reais, respeitando o saldo da cobrança." |
| `src/app/(app)/financeiro/payment-form.tsx:81` | Label | Data do recebimento * | "Data em que o pagamento foi efetivamente recebido." |
| `src/app/(app)/financeiro/payment-form.tsx:91` | Label | Data do estorno da original * | "Data civil em que o recebimento original foi estornado." |
| `src/app/(app)/financeiro/payment-form.tsx:97` | Label | Motivo da correção * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/financeiro/payment-form.tsx:108` | Button | {pending ? "Salvando…" : correcting ? "Estornar original e registrar substituto" : "Registrar recebimento"} | {correcting ? 'Estorna o recebimento original e registra o substituto com os dados informados.' : 'Registra o pagamento recebido e atualiza o saldo da cobrança.'} |
| `src/app/(app)/financeiro/payment-form.tsx:109` | ActionLink | Voltar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/financeiro/relatorios/report-common.tsx:46` | ActionLink | Cobranças | "Abre a consulta de cobranças dos pacientes." |
| `src/app/(app)/financeiro/relatorios/report-common.tsx:47` | ActionLink | Contas a receber | "Abre o relatório de contas a receber com os filtros correspondentes." |
| `src/app/(app)/financeiro/relatorios/report-common.tsx:48` | ActionLink | Recebimentos | "Abre o relatório dos recebimentos registrados." |
| `src/app/(app)/financeiro/relatorios/report-common.tsx:88` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/relatorios/report-common.tsx:89` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/relatorios/report-filters.tsx:48` | Button | Remover paciente do filtro | "Limpa a seleção deste filtro; aplique os filtros para atualizar o resultado." |
| `src/app/(app)/financeiro/relatorios/report-filters.tsx:55` | Label | Data inicial | "Primeira data incluída na consulta do período." |
| `src/app/(app)/financeiro/relatorios/report-filters.tsx:59` | Label | Data final | "Última data incluída na consulta do período." |
| `src/app/(app)/financeiro/relatorios/report-filters.tsx:66` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/financeiro/relatorios/report-filters.tsx:67` | ActionLink | Limpar filtros | "Limpa os filtros e atualiza a consulta." |
| `src/app/(app)/financeiro/[id]/cancel-charge-form.tsx:29` | Button | (composição/ícone) | "Abre a confirmação de cancelamento desta cobrança." |
| `src/app/(app)/financeiro/[id]/cancel-charge-form.tsx:41` | Label | Motivo do cancelamento * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/financeiro/[id]/cancel-charge-form.tsx:63` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/financeiro/[id]/cancel-charge-form.tsx:64` | Button | {pending ? "Cancelando…" : "Confirmar cancelamento"} | "Cancela esta cobrança com a justificativa informada, preservando o histórico financeiro." |
| `src/app/(app)/financeiro/[id]/page.tsx:65` | ActionLink | Registrar recebimento | "Abre o formulário para registrar um pagamento desta cobrança." |
| `src/app/(app)/financeiro/[id]/page.tsx:67` | ActionLink | Substituir | "Abre o formulário de substituição da cobrança; o cancelamento da original só ocorre ao confirmar." |
| `src/app/(app)/financeiro/[id]/page.tsx:126` | ActionLink | Corrigir | "Abre o formulário de correção do recebimento, que exige justificativa." |
| `src/app/(app)/financeiro/[id]/page.tsx:128` | ActionLink | Registrar substituto | "Abre o formulário para registrar o substituto do recebimento estornado." |
| `src/app/(app)/financeiro/[id]/page.tsx:137` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/[id]/page.tsx:139` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/financeiro/[id]/reverse-payment-form.tsx:26` | Button | (composição/ícone) | "Abre a confirmação de estorno deste recebimento." |
| `src/app/(app)/financeiro/[id]/reverse-payment-form.tsx:36` | Label | Data do estorno * | "Data civil em que o recebimento original foi estornado." |
| `src/app/(app)/financeiro/[id]/reverse-payment-form.tsx:43` | Label | Motivo do estorno * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/financeiro/[id]/reverse-payment-form.tsx:51` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/financeiro/[id]/reverse-payment-form.tsx:52` | Button | {pending ? "Estornando…" : "Confirmar estorno"} | "Estorna o recebimento com a data e o motivo informados, preservando o registro original." |
| `src/app/(app)/not-found.tsx:19` | Button | Ir para pacientes | "Abre a lista de pacientes." |
| `src/app/(app)/not-found.tsx:20` | Button | Voltar ao início | "Abre a página inicial do sistema." |
| `src/app/(app)/pacientes/page.tsx:60` | ActionLink | Novo paciente | "Abre o formulário para cadastrar um paciente." |
| `src/app/(app)/pacientes/page.tsx:69` | Label | Buscar por nome | "Digite parte do nome do paciente para limitar os resultados da consulta." |
| `src/app/(app)/pacientes/page.tsx:73` | Label | Situação | "Restringe ou define a situação ativa/inativa do registro; registros anteriores são preservados." |
| `src/app/(app)/pacientes/page.tsx:83` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/pacientes/page.tsx:132` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/page.tsx:137` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/patient-form.tsx:129` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/patient-form.tsx:150` | Label | Sexo * | "Sexo informado para o cadastro do paciente." |
| `src/app/(app)/pacientes/patient-form.tsx:172` | Label | Endereço (opcional) | "Endereço de contato do paciente, com até 300 caracteres." |
| `src/app/(app)/pacientes/patient-form.tsx:211` | Label | Observações administrativas (opcional) | "Informação administrativa de apoio; não inclua evolução clínica neste campo." |
| `src/app/(app)/pacientes/patient-form.tsx:223` | Button | {pending ? "Salvando…" : submitLabel} | "Valida e salva os dados cadastrais do paciente." |
| `src/app/(app)/pacientes/patient-form.tsx:226` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/toggle-status-button.tsx:52` | Button | {pending ? "Salvando…" : "Reativar"} | "Reativa o cadastro do paciente para os fluxos que exigem paciente ativo." |
| `src/app/(app)/pacientes/toggle-status-button.tsx:63` | Button | (composição/ícone) | "Abre a confirmação para inativar o cadastro do paciente." |
| `src/app/(app)/pacientes/toggle-status-button.tsx:80` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/pacientes/toggle-status-button.tsx:81` | Button | {pending ? "Salvando…" : "Inativar"} | "Inativa o cadastro após confirmação, preservando prontuário e histórico." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:228` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:276` | NativeActionButton | {item.title} {hasError && <span className="sr-only"> (com erro)</span>} | "Abre esta etapa da anamnese sem salvar nem descartar os dados preenchidos." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:319` | Label | Data da avaliação * | "Data civil em que a avaliação de anamnese foi realizada." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:354` | Label | Localização | "Região do corpo em que o paciente relata dor." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:428` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:431` | Button | Anterior | "Volta à etapa anterior da anamnese sem perder os dados preenchidos." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:437` | Button | {pending ? "Salvando…" : "Salvar anamnese"} | "Valida e salva os dados da anamnese de todas as etapas." |
| `src/app/(app)/pacientes/[id]/anamnese/anamnesis-form.tsx:440` | Button | {next.title} | "Avança à próxima etapa da anamnese sem salvar o formulário." |
| `src/app/(app)/pacientes/[id]/anamnese/choice-chip.tsx:4` | HelpLabel | {label} | "Marca ou desmarca esta característica da dor relatada pelo paciente." |
| `src/app/(app)/pacientes/[id]/anamnese/page.tsx:32` | ActionLink | Histórico de versões | "Exibe as versões anteriores da anamnese, preservadas no histórico." |
| `src/app/(app)/pacientes/[id]/anamnese/page.tsx:37` | ActionLink | Nova versão | "Abre o formulário de uma nova anamnese do paciente." |
| `src/app/(app)/pacientes/[id]/anamnese/page.tsx:60` | ActionLink | Registrar anamnese | "Abre o formulário de uma nova anamnese do paciente." |
| `src/app/(app)/pacientes/[id]/anamnese/pain-scale.tsx:33` | InformativeHelp | (composição/ícone) | "Selecione a intensidade relatada: zero é ausência de dor e dez é a maior intensidade da escala. Não informado deixa a intensidade sem registro." |
| `src/app/(app)/pacientes/[id]/avaliacoes/assessment-form.tsx:152` | Label | {ASSESSMENT_FIELD_LABELS[name]} {options.required ? " *" : " (opcional)"} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/[id]/avaliacoes/assessment-form.tsx:186` | Label | {ASSESSMENT_FIELD_LABELS.assessmentDate} * | "Data civil em que a avaliação fisioterapêutica foi realizada." |
| `src/app/(app)/pacientes/[id]/avaliacoes/assessment-form.tsx:198` | Label | Anamnese de referência * | "Anamnese do paciente utilizada como referência desta avaliação." |
| `src/app/(app)/pacientes/[id]/avaliacoes/assessment-form.tsx:239` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/[id]/avaliacoes/assessment-form.tsx:242` | Button | {pending ? "Salvando…" : submitLabel} | "Valida e salva a avaliação fisioterapêutica do paciente." |
| `src/app/(app)/pacientes/[id]/avaliacoes/page.tsx:42` | ActionLink | Nova avaliação inicial | "Abre o formulário de avaliação fisioterapêutica inicial." |
| `src/app/(app)/pacientes/[id]/avaliacoes/page.tsx:63` | ActionLink | Registrar anamnese | "Abre o formulário de uma nova anamnese do paciente." |
| `src/app/(app)/pacientes/[id]/avaliacoes/page.tsx:100` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/avaliacoes/page.tsx:108` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/avaliacoes/[avaliacaoId]/page.tsx:48` | ActionLink | Editar | "Abre a edição desta avaliação fisioterapêutica." |
| `src/app/(app)/pacientes/[id]/avaliacoes/[avaliacaoId]/page.tsx:51` | ActionLink | Criar plano terapêutico | "Abre um novo plano terapêutico com esta avaliação como referência." |
| `src/app/(app)/pacientes/[id]/documentos/page.tsx:69` | ActionLink | Abrir para imprimir | "Abre o documento em outra aba para impressão ou salvamento em PDF." |
| `src/app/(app)/pacientes/[id]/layout.tsx:70` | ActionLink | Agendar | "Abre o formulário para criar um agendamento; a marcação só ocorre ao confirmar." |
| `src/app/(app)/pacientes/[id]/layout.tsx:78` | ActionLink | Editar | "Abre o formulário de edição dos dados cadastrais do paciente." |
| `src/app/(app)/pacientes/[id]/page.tsx:221` | ActionLink | Ver anamnese completa | "Exibe todos os dados da anamnese atual do paciente." |
| `src/app/(app)/pacientes/[id]/page.tsx:228` | ActionLink | Registrar anamnese | "Abre o formulário de uma nova anamnese do paciente." |
| `src/app/(app)/pacientes/[id]/page.tsx:251` | ActionLink | Ver última avaliação | "Exibe a avaliação fisioterapêutica mais recente do paciente." |
| `src/app/(app)/pacientes/[id]/page.tsx:261` | ActionLink | Nova avaliação inicial | "Abre o formulário de avaliação fisioterapêutica inicial." |
| `src/app/(app)/pacientes/[id]/planos/page.tsx:43` | ActionLink | Novo plano | "Abre o formulário de um novo plano terapêutico." |
| `src/app/(app)/pacientes/[id]/planos/page.tsx:64` | ActionLink | Ir para Avaliações | "Abre a lista de avaliações do paciente." |
| `src/app/(app)/pacientes/[id]/planos/page.tsx:102` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/planos/page.tsx:110` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:154` | Label | {label} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:196` | Label | Avaliação de origem * | "Avaliação fisioterapêutica que fundamenta o planejamento terapêutico." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:224` | Button | Usar estes objetivos no plano | "Copia os objetivos da avaliação para o formulário do plano; revise antes de salvar." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:247` | HelpLabel | {REVISION_KIND_LABELS[option]} | "Distingue uma correção documental de uma mudança clínica no planejamento." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:264` | Label | Motivo da revisão * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:333` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/[id]/planos/plan-form.tsx:336` | Button | {pending ? "Salvando…" : submitLabel} | "Salva o plano terapêutico ou sua nova revisão com os dados informados." |
| `src/app/(app)/pacientes/[id]/planos/plan-status-dialog.tsx:36` | Button | (composição/ícone) | "Abre a confirmação para encerrar ou reabrir o plano terapêutico." |
| `src/app/(app)/pacientes/[id]/planos/plan-status-dialog.tsx:49` | Label | Motivo * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/pacientes/[id]/planos/plan-status-dialog.tsx:71` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/pacientes/[id]/planos/plan-status-dialog.tsx:72` | Button | {pending ? "Salvando…" : closing ? "Encerrar" : "Reabrir"} | {closing ? 'Encerra o plano preservando suas revisões e atendimentos.' : 'Reabre o plano terapêutico para continuidade do tratamento.'} |
| `src/app/(app)/pacientes/[id]/planos/[planoId]/page.tsx:56` | ActionLink | Registrar sessão | "Abre o formulário para registrar um atendimento clínico." |
| `src/app/(app)/pacientes/[id]/planos/[planoId]/page.tsx:59` | ActionLink | Nova reavaliação | "Abre o formulário de reavaliação clínica do paciente." |
| `src/app/(app)/pacientes/[id]/planos/[planoId]/page.tsx:65` | ActionLink | Revisar plano | "Abre o formulário de uma nova revisão do plano, preservando as anteriores." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/page.tsx:41` | ActionLink | Nova reavaliação | "Abre o formulário de reavaliação clínica do paciente." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/page.tsx:62` | ActionLink | Ir para Planos | "Abre a lista de planos terapêuticos do paciente." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/page.tsx:98` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/page.tsx:106` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:141` | Label | {REASSESSMENT_FIELD_LABELS[name]} {options.required ? " *" : " (opcional)"} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:176` | HelpLabel | {labels[option]} | "Registra a situação dos objetivos ou a conclusão clínica; indicação de alta não encerra o plano automaticamente." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:197` | Label | {REASSESSMENT_FIELD_LABELS.reassessmentDate} * | "Data civil em que a reavaliação foi realizada." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:226` | Label | Plano terapêutico * | "Plano terapêutico do paciente ao qual este registro ficará vinculado." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:276` | Label | Motivo da correção * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:328` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/reassessment-form.tsx:331` | Button | {pending ? "Salvando…" : submitLabel} | "Valida e salva a reavaliação clínica do paciente." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/[reavaliacaoId]/page.tsx:42` | ActionLink | Ver plano | "Exibe o plano terapêutico de referência deste registro." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/[reavaliacaoId]/page.tsx:45` | ActionLink | Corrigir | "Abre a correção desta reavaliação, preservando seu histórico." |
| `src/app/(app)/pacientes/[id]/reavaliacoes/[reavaliacaoId]/page.tsx:61` | ActionLink | Revisar plano a partir desta reavaliação | "Abre uma revisão do plano usando esta reavaliação como referência." |
| `src/app/(app)/pacientes/[id]/sessoes/invalidate-session-dialog.tsx:34` | Button | (composição/ícone) | "Abre a confirmação para invalidar o atendimento clínico." |
| `src/app/(app)/pacientes/[id]/sessoes/invalidate-session-dialog.tsx:45` | Label | Motivo * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/pacientes/[id]/sessoes/invalidate-session-dialog.tsx:67` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/pacientes/[id]/sessoes/invalidate-session-dialog.tsx:68` | Button | {pending ? "Salvando…" : "Invalidar"} | "Invalida este atendimento com justificativa, mantendo o registro no histórico." |
| `src/app/(app)/pacientes/[id]/sessoes/nova/page.tsx:64` | ActionLink | Voltar ao agendamento | "Exibe os detalhes do agendamento vinculado." |
| `src/app/(app)/pacientes/[id]/sessoes/nova/page.tsx:69` | ActionLink | Registrar sem agendamento | "Abre o formulário de atendimento sem vínculo com um agendamento." |
| `src/app/(app)/pacientes/[id]/sessoes/page.tsx:42` | ActionLink | Registrar sessão | "Abre o formulário para registrar um atendimento clínico." |
| `src/app/(app)/pacientes/[id]/sessoes/page.tsx:63` | ActionLink | Ir para Planos | "Abre a lista de planos terapêuticos do paciente." |
| `src/app/(app)/pacientes/[id]/sessoes/page.tsx:102` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/sessoes/page.tsx:110` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:158` | Label | {SESSION_FIELD_LABELS[name]} {options.required ? " *" : " (opcional)"} | {fieldHelp(name)} |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:195` | Label | Plano terapêutico * | "Plano terapêutico do paciente ao qual este registro ficará vinculado." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:209` | Label | Revisão do plano aplicada * | "Versão do plano que orientou este atendimento; preserva a referência aplicada." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:243` | Label | Motivo da correção * | "Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:263` | Label | Data * | "Dia em que o atendimento foi efetivamente realizado." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:274` | Label | Hora * | "Horário local em que o atendimento foi realizado." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:285` | Label | Profissional responsável * | "Fisioterapeuta responsável pela execução do atendimento." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:323` | ActionLink | Cancelar | "Sai do formulário sem salvar as alterações e retorna à tela de origem." |
| `src/app/(app)/pacientes/[id]/sessoes/session-form.tsx:326` | Button | {pending ? "Salvando…" : submitLabel} | "Valida e salva o atendimento e sua evolução clínica." |
| `src/app/(app)/pacientes/[id]/sessoes/[sessaoId]/page.tsx:46` | ActionLink | Ver plano | "Exibe o plano terapêutico de referência deste registro." |
| `src/app/(app)/pacientes/[id]/sessoes/[sessaoId]/page.tsx:51` | ActionLink | Corrigir | "Abre a correção deste atendimento, preservando seu histórico." |
| `src/app/(app)/page.tsx:97` | ActionLink | Abrir agenda | "Abre a agenda para consultar os horários." |
| `src/app/(app)/usuarios/auditoria/page.tsx:79` | Label | Usuário | "Limita a auditoria aos eventos do usuário selecionado." |
| `src/app/(app)/usuarios/auditoria/page.tsx:90` | Label | Ação | "Limita a auditoria ao tipo de ação selecionado." |
| `src/app/(app)/usuarios/auditoria/page.tsx:101` | Label | De | "Primeira data incluída na consulta do período." |
| `src/app/(app)/usuarios/auditoria/page.tsx:105` | Label | Até | "Última data incluída na consulta do período." |
| `src/app/(app)/usuarios/auditoria/page.tsx:108` | Button | Filtrar | "Atualiza a consulta usando os filtros informados, sem alterar os registros." |
| `src/app/(app)/usuarios/auditoria/page.tsx:172` | ActionLink | Anterior | "Exibe a página anterior dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/usuarios/auditoria/page.tsx:177` | ActionLink | Próxima | "Exibe a próxima página dos resultados, mantendo os filtros atuais." |
| `src/app/(app)/usuarios/page.tsx:42` | ActionLink | Auditoria | "Abre a consulta dos eventos registrados na auditoria." |
| `src/app/(app)/usuarios/user-dialogs.tsx:68` | Label | {label} | {fieldHelp(label)} |
| `src/app/(app)/usuarios/user-dialogs.tsx:167` | Button | (composição/ícone) | "Abre o formulário de criação de um usuário." |
| `src/app/(app)/usuarios/user-dialogs.tsx:195` | Button | {pending ? "Salvando…" : "Criar usuário"} | "Cria o usuário com os dados e o perfil informados." |
| `src/app/(app)/usuarios/user-dialogs.tsx:212` | Button | (composição/ícone) | "Abre o formulário para editar os dados deste usuário." |
| `src/app/(app)/usuarios/user-dialogs.tsx:253` | Button | {pending ? "Salvando…" : "Salvar"} | "Salva as alterações dos dados e do perfil deste usuário." |
| `src/app/(app)/usuarios/user-dialogs.tsx:270` | Button | (composição/ícone) | "Abre o formulário de redefinição da senha deste usuário." |
| `src/app/(app)/usuarios/user-dialogs.tsx:294` | Button | {pending ? "Salvando…" : "Redefinir senha"} | "Substitui a senha de acesso deste usuário pela nova senha informada." |
| `src/app/(app)/usuarios/user-dialogs.tsx:311` | Button | {user.active ? "Desativar" : "Ativar"} | {user.active ? 'Desativa o acesso deste usuário sem apagar seus registros.' : 'Reativa o acesso deste usuário ao sistema.'} |
| `src/app/(app)/usuarios/user-dialogs.tsx:338` | Button | (composição/ícone) | "Abre a confirmação para excluir definitivamente este usuário." |
| `src/app/(app)/usuarios/user-dialogs.tsx:354` | Button | (composição/ícone) | "Fecha a confirmação sem executar a operação." |
| `src/app/(app)/usuarios/user-dialogs.tsx:355` | Button | {pending ? "Excluindo…" : "Excluir definitivamente"} | "Exclui definitivamente o usuário após a confirmação, conforme as restrições do sistema." |
| `src/app/(auth)/login/dev-user-picker.tsx:18` | Button | (composição/ícone) | "Entra com o usuário de desenvolvimento selecionado no ambiente habilitado." |
| `src/app/(auth)/login/login-form.tsx:22` | Label | E-mail | "Endereço de e-mail utilizado para acessar a conta." |
| `src/app/(auth)/login/login-form.tsx:36` | Label | Senha | "Senha da conta; o conteúdo não é exibido durante a digitação." |
| `src/app/(auth)/login/login-form.tsx:39` | Button | {pending ? "Entrando…" : "Entrar"} | "Valida as credenciais e inicia uma sessão no sistema." |
| `src/app/(auth)/login/setup-form.tsx:35` | Label | Código de configuração | "Código de configuração fornecido para autorizar a criação da primeira conta." |
| `src/app/(auth)/login/setup-form.tsx:50` | Label | Nome | "Nome pelo qual o administrador será identificado no sistema." |
| `src/app/(auth)/login/setup-form.tsx:63` | Label | E-mail | "Endereço de e-mail utilizado para acessar a conta." |
| `src/app/(auth)/login/setup-form.tsx:77` | Label | Senha | "Senha da primeira conta administrativa; respeite os requisitos exibidos no formulário." |
| `src/app/(auth)/login/setup-form.tsx:95` | Button | {pending ? "Cadastrando…" : "Criar conta e entrar"} | "Cria a primeira conta administrativa e inicia sua sessão." |
| `src/app/acesso-negado/page.tsx:17` | Button | Voltar ao início | "Abre a página inicial do sistema." |
| `src/app/impressao/pacientes/[id]/layout.tsx:20` | ActionLink | Voltar à ficha | "Volta à área de documentos na ficha do paciente." |
| `src/app/impressao/print-button.tsx:8` | Button | Imprimir / Salvar em PDF | "Abre o diálogo de impressão do navegador, onde também é possível salvar em PDF." |
| `src/app/not-found.tsx:15` | Button | Voltar ao início | "Abre a página inicial do sistema." |
| `src/components/action-link.tsx:6` | InformativeHelp | (composição/ícone) | {help} |
| `src/components/app-sidebar.tsx:147` | InformativeHelp | (composição/ícone) | "Encerra sua sessão e retorna à tela de entrada." |
| `src/components/error-fallback.tsx:23` | Button | Tentar novamente | "Tenta carregar novamente a tela que apresentou erro." |
| `src/components/error-fallback.tsx:24` | Button | Voltar ao início | "Abre a página inicial do sistema." |
| `src/components/informative-help.tsx:51` | InformativeHelp | (composição/ícone) | {help} |
| `src/components/informative-help.tsx:55` | InformativeHelp | (composição/ícone) | {help} |
| `src/components/mode-toggle.tsx:10` | Button | (composição/ícone) | "Alterna entre os temas claro e escuro da interface." |

## Exceções e controles compostos

- A label de busca de operadoras com `sr-only` mantém seu nome acessível e não recebe ícone visual de ajuda. O botão Buscar tem explicação.
- A escala de dor possui ajuda única para o grupo; os 12 rádios mantêm labels e nomes acessíveis próprios.
- Labels com inputs internos usam `HelpLabel`: a ajuda é irmã da label, nunca um botão dentro dela.
- Campos dinâmicos dos catálogos, formulários clínicos e cadastro usam `fieldHelp(chave)`. As explicações completas estão em `FIELD_HELP`.
- Abas, opções de selects, opções de combobox e itens de seleção usam a ajuda do campo/grupo; não recebem controles de ajuda individuais adicionais.
- Links comuns de conteúdo e paginação administrativa sem estilo de botão mantêm navegação normal; links apresentados como botões recebem `ActionLink`.
- Navegação da barra lateral e controles estruturais de abrir/fechar menu/diálogo preservam seus nomes acessíveis e tooltips existentes. A ação Sair usa ajuda informativa condicionada.
- Autenticação tem ajuda das labels; os botões anteriores ao login não recebem a preferência privada da clínica.
- Impressões usam a preferência no layout autenticado; ícones e conteúdo de ajuda têm `print:hidden`.
