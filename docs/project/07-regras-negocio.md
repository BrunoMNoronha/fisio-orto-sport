# Responsabilidade: regras de negócio

## CONFIRMADO

- Plano terapêutico decorre da avaliação.
- Sessões registram profissional, técnicas, exercícios e evolução.
- Reavaliação retorna ao plano.
- Tratamento termina em alta ou continuidade.
- Agenda usa fisioterapeuta ativo, horários explícitos em `America/Sao_Paulo`, intervalo semiaberto `[início, fim)`, conflito por profissional e cancelamento sem exclusão física.
- Anamnese vigente usa versionamento append-only; paciente inativo continua consultável, mas não recebe nova versão.
- Avaliação inicial (decisões de 18/09 e 26/09/2026): exige data clínica, anamnese de referência do mesmo paciente e diagnóstico fisioterapêutico; os demais campos são opcionais, e em branco significa "não informado". A avaliação é editável, com histórico por campo (valor anterior, autor, CREFITO, data). O paciente pode ter várias avaliações iniciais, sem vínculo com a agenda. O paciente inativo não recebe avaliação nem edição.
- Snapshot de CREFITO nos registros clínicos, anulável: o Administrador pode registrar sem CREFITO. Na avaliação, vale para o autor e para cada edição.

Fontes: `README.md`, `src/modules/agenda/README.md`, `src/modules/clinico/README.md`, issue #24.

## DECISÃO TÉCNICA

Sexo é enum Prisma; profissão tem até 120 caracteres; CREFITO fica em `User.crefito`, normalizado, com até 20 caracteres e unicidade quando informado. A anamnese mantém assinatura nominal histórica, ainda sem snapshot de CREFITO (backfill previsto na decisão D1, fora da entrega da avaliação).

Fonte: `src/modules/pacientes/README.md` e `src/modules/auth/README.md`.

## PENDENTE / TBD

Duração padrão, antecedência/motivo obrigatório de cancelamento, conflito por paciente e horário de funcionamento ainda precisam de decisão.
