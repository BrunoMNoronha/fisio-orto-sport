# Preços da landing — cálculo de valor justo

Valores publicados na landing pública (`src/app/(marketing)/landing/landing-content.ts`) em
19/10/2026. São mensais, por clínica, com até 3 fisioterapeutas; equipes maiores recebem proposta
sob medida. Os preços finais continuam sendo definidos na proposta comercial: esta página registra
o raciocínio para que a revisão seja objetiva.

## Referências de mercado (Brasil, outubro de 2026)

Páginas públicas de fornecedores e comparativos; os valores podem mudar e devem ser reconferidos.

| Produto | Valor publicado | Base de cobrança | O que inclui |
|---|---|---|---|
| Simples Agenda | R$ 39,90 a R$ 119,90/mês | por número de profissionais (1 a 10) | agenda e cadastro |
| Vedius | R$ 79,90/mês (R$ 66,66 no anual) | por profissional | agenda, financeiro, prontuário |
| Zenfisio | R$ 79/mês | por conta, até 1.000 pacientes | lembretes e cobrança à parte |
| Clinix Care | a partir de R$ 97/mês | por profissional | agenda e prontuário |
| EIFisio | R$ 197/mês | por clínica | gestão de fisioterapia |
| Clínica Ágil | R$ 249/mês (até 3 profissionais) a R$ 1.999/mês | por faixa de profissionais | prontuário, agenda; TISS a R$ 99/mês, incluso nos planos maiores |
| Fisioly | R$ 44,90 (entrada), R$ 399,90 (clínica), R$ 799,90 (equipes) | por plano | gratuito limitado; clínica completa |

Fontes: comparativos e páginas de preço listados ao final.

## Método

1. **Âncora de mercado por degrau.** Cada plano é comparado ao conjunto de produtos que entrega o
   mesmo escopo para uma clínica com 3 fisioterapeutas.
2. **Ajuste pelo que o produto não tem.** Sem WhatsApp, telessaúde, aplicativo instalável ou IA, que
   os concorrentes cobram à parte ou embutem nos planos maiores. Isso puxa o valor para baixo.
3. **Ajuste pelo que o produto tem a mais.** Prontuário versionado com assinatura CREFITO, XML TISS
   4.03 validado contra o XSD com hash guardado, conciliação de glosas item a item, trilha de
   auditoria fora do alcance da aplicação e hospedagem em São Paulo. Isso puxa para cima nos planos
   Clínica e Convênios.
4. **Piso de custo.** Stack compartilhada por clínica: Vercel Pro (US$ 20/mês) e Neon Launch
   (US$ 19/mês), cerca de R$ 215/mês a R$ 5,50 por dólar (câmbio assumido). Suporte e implantação
   entram na proposta comercial, não na mensalidade.

## Cálculo

| Plano | Âncora | Cálculo | Valor |
|---|---|---|---|
| Essencial | 3 profissionais em ferramentas de agenda cobradas por profissional: 3 × R$ 40 a R$ 80 = R$ 120 a R$ 240; EIFisio R$ 197 por clínica; Clínica Ágil R$ 249 já com prontuário | Meio da faixa de agenda por profissional (R$ 180), menos a ausência de lembretes e WhatsApp (−R$ 30) | **R$ 149/mês** |
| Clínica | Clínica Ágil R$ 249 (sem TISS) e Fisioly R$ 399,90; ponto médio R$ 324 | Ponto médio, menos telessaúde e WhatsApp (−R$ 50), mais prontuário versionado com CREFITO e financeiro com auditoria (+R$ 25) | **R$ 299/mês** |
| Convênios | Clínica Ágil com TISS: R$ 249 + R$ 99 = R$ 348; Fisioly R$ 399,90 | Clínica (R$ 299) + módulo TISS ao preço de mercado (R$ 99) + XML validado contra XSD, lotes com hash e conciliação de glosas item a item (+R$ 51) | **R$ 449/mês** |

Degraus de R$ 150 entre planos mantêm a leitura "comece pela agenda, cresça para convênios".
Com dois clientes no Essencial o piso de infraestrutura compartilhada já está coberto; o plano
Convênios sozinho cobre o piso com folga.

## Decisões em aberto para a proposta comercial

- Desconto no plano anual (prática de mercado: 1 a 2 mensalidades).
- Valor por fisioterapeuta adicional acima de 3 (sugestão: R$ 39/mês, abaixo do piso por
  profissional dos concorrentes).
- Taxa de implantação e migração de cadastro, hoje combinadas caso a caso.

## Fontes

- [Clínica Ágil — software para fisioterapia](https://www.clinicaagil.com.br/site/software-para-fisioterapia/)
- [Fisioly](https://fisioly.com.br/) e [5 melhores sistemas para fisioterapeutas em 2026](https://fisioly.com.br/melhores-sistemas-para-fisioterapeutas)
- [Vedius — quanto custa o prontuário eletrônico para fisioterapia](https://vedius.com.br/prontuario-eletronico-para-fisioterapia-quanto-custa-de-verdade-e-o-que-cada-plano-inclui-ou-nao-diz/)
- [Simples Agenda — sistema para clínica](https://www.simplesagenda.com.br/site/sistema-para-clinica)
- [Clinix Care](https://clinixcare.com.br/)
- [EIFisio](http://eifisio.com.br/)
- [ByDoctor — 7 melhores sistemas para clínica de fisioterapia (2026)](https://bydoctor.com.br/blog/melhores-sistemas-clinica-fisioterapia)
- [Physitrack — comparativo de sistemas no Brasil](https://www.physitrack.com/insights/melhor-software-fisioterapia-brasil-comparativo)
