import {syntheticXmlBatch} from './snapshot';
import {serializeTiss} from '../../../src/modules/administrativo/tiss/serialize';
import {XML_HARD_LIMIT} from '../../../src/modules/administrativo/tiss/xsd';

// Escaped CR remains one decoded character; all fields stay within XSD lengths.
const text=(length:number)=>'A'+'\r'.repeat(Math.max(0,length-2))+'B';
export function capacityXmlBatch(descriptionLength:number){
  const batch=syntheticXmlBatch(),original=batch.snapshot.guides[0];
  batch.snapshot.xmlProfile.data.includeExecutor=true;
  batch.snapshot.xmlProfile.data.executorCodes[original.snapshot.requester.id]='0000123';
  batch.snapshot.guides=Array.from({length:100},(_,g)=>{
    const guide=structuredClone(original);guide.guideId=`SINT-G-${g}`;guide.number=String(g+1);
    guide.clinicalIndication=text(500);guide.snapshot.requester.name=text(70);guide.snapshot.requesterProviderName=text(70);
    guide.snapshot.items=Array.from({length:10},(_,i)=>{
      const item=structuredClone(original.snapshot.items[0]);item.productionId=`SINT-P-${g}-${i}`;
      item.production.tariff.name=text(descriptionLength);item.executor.name=text(70);return item;
    });
    guide.totalCents=String(BigInt(10474)*BigInt(10));return guide;
  });
  batch.totalCents=BigInt(10474)*BigInt(1000);return batch;
}
export function findXmlBoundary(){
  let low=2,high=150;
  while(low<high){const mid=Math.ceil((low+high)/2);try{serializeTiss(capacityXmlBatch(mid));low=mid;}catch(error){if(!(error instanceof Error)||!error.message.includes('limite de bytes'))throw error;high=mid-1;}}
  const batch=capacityXmlBatch(low),result=serializeTiss(batch);
  if(result.bytes.length<XML_HARD_LIMIT*0.99)throw new Error('Fixture não alcançou 99% do teto XML.');
  return {batch,result,descriptionLength:low};
}
