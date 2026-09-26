# Responsabilidade: fluxo, perfis e permissões

## CONFIRMADO

Fluxo principal previsto:

`cadastro do paciente → agendamento → avaliação inicial → plano terapêutico → sessões → evolução clínica → reavaliação ou alta`

Matriz técnica vigente em `src/modules/auth/permissions.ts`:

| Permissão | Administrador | Recepção | Fisioterapeuta |
|---|:-:|:-:|:-:|
| `usuarios:ler` / `usuarios:gerir` | ✓ | — | — |
| `pacientes:ler` | ✓ | ✓ | ✓ |
| `pacientes:gerir` | ✓ | ✓ | ✓ |
| `agenda:ler` | ✓ | ✓ | ✓ |
| `agenda:gerir` | ✓ | ✓ | ✓ |
| `clinico:ler` / `clinico:gerir` | ✓ | — | ✓ |

Recepção não acessa dados clínicos; Fisioterapeuta acessa os pacientes conforme a matriz técnica atual.

**Decisão confirmada (issue #31, 26/09/2026):** o Fisioterapeuta tem todos os acessos da Recepção (o "atendente" do dia a dia; não existe perfil separado), além dos clínicos. Isso inclui cadastro de todos os pacientes e agenda de qualquer profissional apto, sem restrição aos próprios pacientes ou à própria agenda. Um teste garante que as permissões de `RECEPCAO` estão contidas nas de `FISIOTERAPEUTA`. A gestão de usuários (`usuarios:*`) continua exclusiva do Administrador. Nas gravações, o autor (`createdById`, `updatedById`, `cancelledById`) é sempre quem está logado, independentemente do profissional atendente.

## PENDENTE / TBD

A clínica ainda precisa validar formalmente o eventual acesso da Recepção a dados clínicos (hoje vedado). O escopo cadastral e de agenda do Fisioterapeuta foi decidido na #31; o escopo clínico continua sendo todos os pacientes.

Impacto: autorização, prontuário e telas das próximas fases.
