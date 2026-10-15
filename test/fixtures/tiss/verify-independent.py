"""Validação independente: lxml/libxml2 nativo; fixture exclusivamente sintética."""
from pathlib import Path
from lxml import etree as E
import hashlib
root=Path(__file__).resolve().parents[3]
parser=E.XMLParser(resolve_entities=False,load_dtd=False,no_network=True)
schema=E.XMLSchema(E.parse(str(root/'src/modules/administrativo/tiss/schemas/4.03.00/tissV4_03_00.xsd'),parser))
raw=(root/'test/fixtures/tiss/lote-4.03.00.xml').read_bytes()
doc=E.fromstring(raw,parser)
schema.assertValid(doc)
ns={'a':'http://www.ans.gov.br/padroes/tiss/schemas'}
values=''.join(''.join(c.itertext()) for c in list(doc)[:2])
expected=hashlib.md5(values.encode('iso-8859-1')).hexdigest()
assert expected=='63ec3f5e0681b21001787fa0a2129648'
assert doc.find('a:epilogo/a:hash',ns).text==expected
for bad in [raw.replace(b'4.03.00</ans:Padrao>',b'4.99.99</ans:Padrao>'),raw.replace(b'52.37</ans:valorUnitario>',b'52,37</ans:valorUnitario>'),raw.replace(b'<ans:CNES>0000001</ans:CNES>',b''),raw.replace(b'http://www.ans.gov.br/padroes/tiss/schemas',b'urn:invalid')]:
 assert not schema.validate(E.fromstring(bad,parser))
print('Golden: XSD nativo aprovado; MD5 independente aprovado; 4 mutações recusadas.')
