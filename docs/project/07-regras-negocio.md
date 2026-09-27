# Responsabilidade: regras de negócio

## CONFIRMADO

- Plano terapêutico decorre da avaliação.
- Sessões registram profissional, técnicas, exercícios e evolução.
- Reavaliação retorna ao plano.
- Tratamento termina em alta ou continuidade.
- Agenda usa fisioterapeuta ativo, horários explícitos em `America/Sao_Paulo`, intervalo semiaberto `[início, fim)`, conflito por profissional e cancelamento sem exclusão física. Presença (MEL-01, 27/09/2026): compareceu, faltou (avisou) ou faltou (sem aviso), marcada a partir do início do horário por quem gere a agenda; só registro, sem cobrança nem bloqueio. Agendamento com atendimento válido ou presença marcada não é cancelado nem reagendado. Disponibilidade (MEL-02, 27/09/2026): o profissional pode ter bloqueios de horário; não se agenda nem se reagenda sobre bloqueio, e bloqueio sobre agendamento ativo é recusado com a lista dos agendamentos (nada é cancelado em silêncio). O conflito do paciente com outro horário sobreposto é aviso, que a pessoa confirma. Encaixe não tem regra extra.
- Anamnese vigente usa versionamento append-only; paciente inativo continua consultável, mas não recebe nova versão.
- Avaliação inicial (decisões de 18/09 e 26/09/2026): exige data clínica, anamnese de referência do mesmo paciente e diagnóstico fisioterapêutico; os demais campos são opcionais, e em branco significa "não informado". A avaliação é editável, com histórico por campo (valor anterior, autor, CREFITO, data). O paciente pode ter várias avaliações iniciais, sem vínculo com a agenda. O paciente inativo não recebe avaliação nem edição.
- Plano terapêutico (decisões de 26/09/2026): decorre de uma avaliação do mesmo paciente (versão registrada). Obrigatórios: data, objetivos e conduta. Quantidade prevista de 1 a 100, só informativa. Frequência e reavaliação em texto livre. Revisões imutáveis com tipo (correção ou mudança clínica) e motivo; a vigente é a de maior número. Pode haver vários planos, Ativo ou Encerrado, e encerrar e reabrir pedem motivo. Encerrar não é alta. Data não futura e não anterior à avaliação. Paciente inativo não recebe escrita.
- Sessões de atendimento (decisões de 26/09/2026): exigem plano ativo e a revisão exata aplicada, momento clínico não futuro (nem antes do início do plano), responsável fisioterapeuta e evolução obrigatória. O Fisioterapeuta registra por si, e o Admin escolhe o fisioterapeuta. A sessão é corrigível com motivo e histórico por campo, e a invalidação (com motivo) a tira da contagem. Só atendimentos válidos contam, e a previsão do plano é informativa. Uma chave única evita duplicidade. Desde a MEL-01 (#44, decisões de 27/09/2026), o atendimento pode vir de um agendamento elegível (um atendimento válido por agendamento, profissional do agendamento, marca "compareceu") ou ser lançado sem agendamento.
- Reavaliação (decisões de 26/09/2026): exige plano ativo. Compara com a avaliação de origem e com a última reavaliação do plano, numa comparação congelada ao salvar. Registra a situação dos objetivos (Atingidos, Parcialmente ou Não atingidos) com justificativa e a conclusão (Continuidade, Ajuste ou Indicação de alta) com síntese. A indicação de alta só documenta. O ajuste gera pendência até a revisão do plano, que é uma ação explícita, única por reavaliação e sempre mudança clínica. Não há quantidade mínima de sessões.
- Snapshot de CREFITO nos registros clínicos, anulável: o Administrador pode registrar sem CREFITO. Na avaliação, vale para o autor e para cada edição.

Fontes: `README.md`, `src/modules/agenda/README.md`, `src/modules/clinico/README.md`, issues #24 a #27.

## DECISÃO TÉCNICA

Sexo é enum Prisma; profissão tem até 120 caracteres; CREFITO fica em `User.crefito`, normalizado, com até 20 caracteres e unicidade quando informado. Desde a MEL-03 (#46, decisões de 27/09/2026), a anamnese grava snapshot de CREFITO nas versões novas, como os demais registros clínicos. As versões anteriores ficam sem CREFITO, marcadas como "não registrado nesta versão", sem backfill. Isso substitui o backfill previsto na D1.

Fonte: `src/modules/pacientes/README.md` e `src/modules/auth/README.md`.

## PENDENTE / TBD

Antecedência/motivo obrigatório de cancelamento ainda precisa de decisão. Horário de funcionamento é posterior ao MVP (DEC-01). A duração sugerida é configuração (#63), não regra.
