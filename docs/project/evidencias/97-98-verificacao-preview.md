# Verificação de ADM-01/ADM-02 para Preview — 15/10/2026

Bruno autorizou verificar #97/#98, abrir PR, mesclar para Preview e executar migrações
necessárias. Conferência do escopo contra as duas issues:

| Issue | Implementação conferida |
|---|---|
| #97 | Operadoras/contratos e identificação faturável; catálogo; tarifa por vigência com consulta de snapshot; exclusão GiST de intervalos; autorização, idempotência, versão/histórico; manutenção e proteção de autores |
| #98 | Coberturas históricas sem conversão do legado; autorizações/itens por contrato; validade pela execução; saldos derivados; consumo/devolução transacional e append-only; correção/cancelamento com consumo bloqueados |

Snapshot de tarifa e de consumo preserva a origem versionada. Persistência dos snapshots
nos futuros itens conferidos/guias pertence a #99/#101, onde essas entidades serão criadas.
Não se declara produção ou guia fechada nesta entrega. Dados reais e homologação externa
permanecem em #103/#106 conforme recorte ajustado da #96.

Validação atual: 104 suítes/1.217 testes unitários aprovados; dez testes de pipeline,
lint e TypeScript aprovados. Gate aditivo aprovado nas três migrações novas.
Docker não está disponível nesta sessão; PostgreSQL descartável e build serão gates do CI
antes de qualquer merge. O build local Turbopack falhou ao iniciar subprocesso CSS também
fora do sandbox; não se registrou build local como aprovado nesta rodada.
Evidências autenticadas sintéticas anteriores em 97-catalogo.md e 98-coberturas.md.

Fluxo autorizado: branch de implementação → PR para main → CI completo → merge;
main → PR para production → CI completo → merge → Deploy Preview (migrações e build).
Não acionar Deploy Production (manual). As três novas migrações são aditivas e a
migração de parâmetros não preenche identificadores contratuais fictícios.
