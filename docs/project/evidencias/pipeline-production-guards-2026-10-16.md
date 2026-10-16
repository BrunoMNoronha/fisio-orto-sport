# Correção dos gates de Production — 16/10/2026

Problemas observados na publicação da #132: a CLI de promoção retornou `User not found (404)`, e a aplicação publicada usou uma conexão Preview apesar de as migrações do runner terem sido executadas corretamente em Production.

## Correção

- Promoção pela API Vercel com equipe, projeto e deployment explícitos, aceitando resposta sem corpo e aguardando a confirmação do domínio.
- Validação da configuração devolvida por `vercel pull` antes das migrações produtivas.
- URLs com overrides de roteamento, credenciais, schema não público ou parâmetros duplicados são recusadas antes de conectar/migrar.
- Rota `/api/release/verify` com desafio HMAC, nonce e janela de 60 segundos. A autenticação vincula a conexão esperada ao runtime; sem prova válida, nenhuma consulta ao banco ocorre.
- A consulta usa a mesma instância Prisma do login, apenas para ler `current_database()` e `current_user`. Não retorna credenciais nem dados de negócio.
- Runtime conferido antes dos checks HTTP gerais, novamente antes da promoção e depois pelo domínio publicado.
- Exceção exata no proxy para a autenticação própria da rota, mantendo a exigência de sessão nas demais páginas e APIs.
- Artefatos de conferência contêm somente identidade do alvo, deployment e horário, sem prova HMAC ou URL de conexão.

## Validação local

| Check | Resultado |
|---|---|
| Testes do pipeline | 24 aprovados, incluindo runtime Preview em release Production com a mesma senha/nome de banco, prova expirada/adulterada, role/banco incorretos, overrides de URL e bloqueio da promoção |
| Suíte Jest | 1.408 testes / 126 suítes aprovados; inclui 6 casos do proxy |
| TypeScript | Aprovado |
| Lint integral | Aprovado |
| Build Webpack local | Aprovado, com rota dinâmica de verificação incluída |
| Diff | Sem erros de whitespace |

Também foi executado o build local por HTTP com PostgreSQL local, sem dados reais:
```json
{"unauthorized":404,"invalidChallenge":404,"authenticatedProof":200,"connectedDatabase":"fisio_issue132_test","connectedRole":"fisio","protectedRoute":307,"writes":0}
```

A prova autorizada consultou a conexão local real. Como esse PostgreSQL local não usa TLS, o validador de release recusou qualificá-lo para publicação, mesmo com assinatura íntegra. Servidor e contêiner local foram encerrados após o teste.

A implementação foi feita em checkout isolado. Nenhum workflow de publicação foi disparado e nenhum banco remoto foi alterado nesta correção. A ativação do novo pipeline exige integrar o patch e publicar pelo processo normal com novo Preview aprovado.
