/** @jest-environment node */
import {capacityXmlBatch,findXmlBoundary} from '../../../../test/fixtures/tiss/capacity';
import {serializeTiss} from '../tiss/serialize';
import {validateTissXsd,XML_HARD_LIMIT} from '../tiss/xsd';
test('100 guias/1.000 itens próximos a 2 MiB passam XSD; incremento recusa integralmente',async()=>{
  const {batch,result,descriptionLength}=findXmlBoundary();
  expect(result.guideCount).toBe(100);expect(result.itemCount).toBe(1000);
  expect(result.totalCents).toBe(batch.totalCents);expect(result.bytes.length).toBeLessThanOrEqual(XML_HARD_LIMIT);
  expect(result.bytes.length).toBeGreaterThan(XML_HARD_LIMIT*0.99);
  await expect(validateTissXsd(result.bytes)).resolves.toHaveProperty('schemaDigest');
  expect(()=>serializeTiss(capacityXmlBatch(descriptionLength+1))).toThrow('limite de bytes');
  batch.snapshot.contract.maxXmlBytes=result.bytes.length-1;
  expect(()=>serializeTiss(batch)).toThrow('limite de bytes');
},20000);
