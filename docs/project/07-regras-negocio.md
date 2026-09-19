# Responsabilidade: regras de negócio

## CONFIRMADO

- Plano terapêutico decorre da avaliação.
- Sessões registram profissional, técnicas, exercícios e evolução.
- Reavaliação retorna ao plano.
- Tratamento termina em alta ou continuidade.
- Agenda usa fisioterapeuta ativo, horários explícitos em `America/Sao_Paulo`, intervalo semiaberto `[início, fim)`, conflito por profissional e cancelamento sem exclusão física.
- Anamnese vigente usa versionamento append-only; paciente inativo continua consultável, mas não recebe nova versão.

Fontes: `README.md`, `src/modules/agenda/README.md`, `src/modules/clinico/README.md`.

## DECISÃO TÉCNICA

Sexo é enum Prisma; profissão tem até 120 caracteres; CREFITO fica em `User.crefito`, normalizado, com até 20 caracteres e unicidade quando informado. A anamnese mantém assinatura nominal histórica, sem snapshot de CREFITO.

Fonte: `src/modules/pacientes/README.md` e `src/modules/auth/README.md`.

## PENDENTE / TBD

Duração padrão, antecedência/motivo obrigatório de cancelamento, conflito por paciente, horário de funcionamento, edição após salvamento e snapshot de CREFITO em registros clínicos ainda precisam de decisão.
