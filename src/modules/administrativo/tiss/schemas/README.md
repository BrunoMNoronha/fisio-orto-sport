# Schemas ANS fixados para o gerador 4.03.00

Origem: [ANS — Padrão TISS julho/2026](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/padrao-tiss-julho-2026),
publicada em 30/07/2026 e atualizada em 01/09/2026. Download em 15/10/2026 do
[Componente Comunicação 202511](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/PadroTISSComunicao_202511.zip).
Somente os sete XSD da pasta Comunicação 040300 foram extraídos, sem alteração dos bytes.
Manifesto registra SHA-256 do pacote e de cada arquivo; o worker confere cada checksum.

A página da ANS declara Creative Commons Atribuição-SemDerivações 3.0 Não Adaptada:
https://creativecommons.org/licenses/by-nd/3.0/deed.pt_BR . Preservam-se os avisos originais,
inclusive os do W3C em xmldsig-core-schema.xsd. Nenhum schema foi adaptado. O pacote não
trazia um arquivo de licença separado. Atribuição: Agência Nacional de Saúde Suplementar.

Referência de MD5 e encoding: [Componente Organizacional 202607, seção IX, HASH MD-5,
páginas 56–57](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/PadroTISS_ComponenteOrganizacional_202607.pdf).
Concatenação literal dos conteúdos na ordem documental, sem epílogo, em ISO-8859-1.
Checksum SHA-256 do arquivo tem finalidade separada. Não há assinatura digital nem envio.

04.03.00/4.03.00 identificam o mesmo perfil técnico; o valor do elemento Padrao é 4.03.00.
A seleção da versão não comprova aceite ou homologação por operadora. Outros schemas/versões
não são selecionados automaticamente. O XML desta entrega é exclusivamente lote SP/SADT.

Validador: libxml2-wasm 0.7.1, dependência MIT fixada no lockfile. Executa em worker Node
com schemas em memória por allowlist, rede/entidades externas/catálogo desabilitados,
sem DTD no documento gerado, sem recuperação tolerante e sem XML_PARSE_HUGE. O XSD original
W3C contém declaração DTD; ela permanece intacta no arquivo atribuído, sem carregar a
referência externa. Nenhuma URL ou arquivo fora da allowlist é resolvido. Documento aceito
somente na declaração ISO-8859-1 emitida pelo serializador; XML arbitrário não é upload.
Teto técnico 2 MiB (ou limite contratual menor), 10 segundos por validação e heap JS de
128 MiB por worker. Não expõe texto/erro bruto de XML nos logs ou ao cliente.
