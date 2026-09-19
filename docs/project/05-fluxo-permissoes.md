# Responsabilidade: fluxo, perfis e permissões

## CONFIRMADO

Fluxo principal previsto:

`cadastro do paciente → agendamento → avaliação inicial → plano terapêutico → sessões → evolução clínica → reavaliação ou alta`

Matriz técnica vigente em `src/modules/auth/permissions.ts`:

| Permissão | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| `usuarios:ler` / `usuarios:gerir` | ✓ | — | — |
| `pacientes:ler` | ✓ | ✓ | ✓ |
| `pacientes:gerir` | ✓ | ✓ | — |
| `agenda:ler` | ✓ | ✓ | ✓ |
| `agenda:gerir` | ✓ | ✓ | — |
| `clinico:ler` / `clinico:gerir` | ✓ | — | ✓ |

Recepção não acessa dados clínicos; Fisioterapeuta acessa os pacientes conforme a matriz técnica atual.

## PENDENTE / TBD

A clínica ainda precisa validar formalmente os limites de negócio: escopo de pacientes do fisioterapeuta e eventual acesso da Recepção a dados clínicos.

Impacto: autorização, prontuário e telas das próximas fases.
