import {z} from 'zod';
import {parseCivilDate} from './catalog-validation';

export const SETTLEMENT_KINDS=['RECEBER','SUBSTITUIR','ESTORNAR','GLOSAR','LIBERAR','DEFINIR','REABRIR','AJUSTAR'] as const;
export const SETTLEMENT_LABELS:Record<typeof SETTLEMENT_KINDS[number],string>={RECEBER:'Recebimento',SUBSTITUIR:'Substituição de recebimento',ESTORNAR:'Estorno de recebimento',GLOSAR:'Glosa em análise',LIBERAR:'Liberar glosa para aberto',DEFINIR:'Baixa definitiva por glosa',REABRIR:'Reabrir baixa para análise',AJUSTAR:'Ajuste do faturado'};
export const MAX_SETTLEMENT_CENTS=BigInt("9223372036854775807");
export function parseSettlementMoney(raw:string):bigint|null {
  const value=raw.trim();
  if(!/^-?\d{1,17}([.,]\d{1,2})?$/.test(value))return null;
  const negative=value.startsWith('-'),[whole,fraction='']=value.replace('-','').split(/[.,]/);
  const amount=(BigInt(whole)*BigInt("100")+BigInt(fraction.padEnd(2,'0')))*(negative?-BigInt("1"):BigInt("1"));
  return amount!==BigInt("0")&&amount<=MAX_SETTLEMENT_CENTS&&amount>=-MAX_SETTLEMENT_CENTS?amount:null;
}
const money=z.string().refine(value=>parseSettlementMoney(value)!==null,'Informe valor exato, sem separador de milhar e com até duas casas.').transform(value=>parseSettlementMoney(value)!);
const optionalId=z.union([z.uuid(),z.literal('')]).default('').transform(value=>value||null);
export const settlementSchema=z.object({
  id:z.uuid(),requestId:z.uuid(),contractId:z.uuid(),kind:z.enum(SETTLEMENT_KINDS),
  effectiveOn:z.string().refine(value=>!!parseCivilDate(value),'Data efetiva inválida.').transform(value=>new Date(value+'T00:00:00Z')),
  reference:z.string().trim().min(1,'Informe o demonstrativo/protocolo.').max(120),
  reason:z.string().trim().min(1,'Informe o motivo.').max(300),
  amount:money,reversesId:optionalId,
  lines:z.array(z.object({receivableId:z.uuid(),glosaRootId:optionalId,amount:money,code:z.string().trim().max(40).default('')}).strict()).max(1000),
}).strict().superRefine((data,ctx)=>{
  const error=(message:string)=>ctx.addIssue({code:'custom',message});
  if(data.kind!=='AJUSTAR'&&data.amount<=BigInt("0"))error('O valor deve ser positivo.');
  if(['ESTORNAR','SUBSTITUIR'].includes(data.kind)!==!!data.reversesId)error('Selecione o recebimento original somente para estorno/substituição.');
  if(data.kind==='ESTORNAR') {if(data.lines.length)error('Estorno usa as alocações originais, sem linhas novas.');return;}
  if(!data.lines.length)error('Informe ao menos uma alocação.');
  if(data.lines.reduce((sum,line)=>sum+line.amount,BigInt("0"))!==data.amount)error('O valor deve ser 100% alocado. Crédito excedente não é suportado.');
  const keys=new Set<string>();
  for(const line of data.lines){
    const key=line.receivableId+':'+(line.glosaRootId??'');
    if(keys.has(key))error('Alocação repetida para o mesmo item/origem.');keys.add(key);
    if(data.kind!=='AJUSTAR'&&line.amount<=BigInt("0"))error('Alocações devem ser positivas.');
    if(data.kind==='AJUSTAR'&&((line.amount>BigInt("0"))!==(data.amount>BigInt("0"))))error('Use ajustes separados para acréscimos e reduções.');
    if(['LIBERAR','DEFINIR','REABRIR'].includes(data.kind)&&!line.glosaRootId)error('Selecione a glosa original.');
    if(['GLOSAR','AJUSTAR'].includes(data.kind)&&line.glosaRootId)error('Esta operação não recebe origem de glosa.');
    if(data.kind==='GLOSAR'&&!line.code)error('Informe o código/motivo de glosa do demonstrativo.');
    if(data.kind!=='GLOSAR'&&line.code)error('Código de glosa é informado somente na glosa original.');
  }
});
export type SettlementInput=z.output<typeof settlementSchema>;
export const settlementFilters=z.object({contractId:z.uuid().optional(),batchId:z.uuid().optional(),page:z.coerce.number().int().min(1).max(100000).default(1),historyPage:z.coerce.number().int().min(1).max(100000).default(1),glosaPage:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
