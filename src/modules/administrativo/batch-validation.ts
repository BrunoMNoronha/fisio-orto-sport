import {z} from "zod";
import {configurationMeta} from "./validation";
import {parseCivilDate} from "./catalog-validation";
export const batchSchema=z.object({...configurationMeta,operation:z.enum(['SALVAR','FECHAR','CANCELAR','ENVIAR','CORRIGIR_ENVIO']),contractId:z.uuid(),tissVersion:z.string().regex(/^\d{1,2}\.\d{2}\.\d{2}$/),guideIds:z.array(z.uuid()).max(1000).refine(v=>new Set(v).size===v.length,'Guia repetida.'),artifactId:z.union([z.uuid(),z.literal('')]).default('').transform(v=>v||null),correctsId:z.union([z.uuid(),z.literal('')]).default('').transform(v=>v||null),sentOn:z.string().refine(v=>!v||!!parseCivilDate(v),'Data civil de envio inválida.').default('').transform(v=>v?new Date(v+'T00:00:00Z'):null),protocol:z.string().trim().max(120).default(''),channel:z.string().trim().max(120).default('')}).strict();
export type BatchInput=z.output<typeof batchSchema>;
export const batchListFilters=z.object({contractId:z.uuid().optional(),state:z.enum(['ABERTO','FECHADO','ENVIADO','CANCELADO']).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export const batchPageFilter=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();

export function batchParams(raw:unknown){if(raw instanceof URLSearchParams){const params=raw;if([...params.keys()].some(k=>params.getAll(k).length!==1))return null;raw=Object.fromEntries(raw);}if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,typeof v==='string'?(v.trim()||undefined):v]));}
