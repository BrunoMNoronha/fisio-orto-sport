# Responsabilidade: repositório, diretório e branch

## CONFIRMADO

- Repositório: `fisio-orto-sport`.
- Diretório: `C:\Development\Projects\fisio-orto-sport`.
- Branch principal: `main`, com remote `origin`.
- Estado verificado em 2026-09-19: working tree limpo e alinhado ao `origin/main` antes das alterações documentais desta sessão.
- Alvo de deploy: `main` publica em produção na Vercel pela integração nativa com o GitHub; demais branches geram Preview Deployments. Configuração em `vercel.json` e `.github/workflows/deploy-migrations.yml`; instruções em `README.md` (seção "Deploy").

Fonte: `git status --short --branch`, `git log`, `vercel.json` e `.github/workflows/deploy-migrations.yml`.

## AMBIGUIDADE DOCUMENTAL

O checklist antigo de Agenda no `README.md` estava divergente do código e da documentação dos módulos. O roadmap foi atualizado para refletir a implementação verificada.

## PENDENTE / TBD

- Ambiente de homologação separado (com banco próprio) ainda não foi definido.
- O primeiro deploy de produção e o seed do administrador inicial ainda não foram comprovados.
