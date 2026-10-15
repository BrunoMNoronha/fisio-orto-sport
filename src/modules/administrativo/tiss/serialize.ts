import {createHash} from "node:crypto";
import {z} from "zod";
import {AdministrativeConfigError} from "../service";
import {tissProfileData} from "./profile";
export const GENERATOR_VERSION='4.03.00-1';
const text=z.string().min(1),money=z.string().regex(/^\d+$/);
const professional=z.object({id:text,name:text,councilCode:text,councilNumber:text,councilState:text,occupationCode:text});
const item=z.object({productionId:text,executionOn:text,endTime:z.string().nullable(),quantity:z.number().int().min(1).max(999),unitCents:money,totalCents:money,factorNumerator:z.literal(1),factorDenominator:z.literal(1),executor:professional.nullable(),production:z.object({occurredAt:z.string().datetime().optional(),tariff:z.object({tableCode:text,code:text,name:text})})});
const snapshot=z.object({contract:z.object({id:text,tissVersion:z.enum(['04.03.00','4.03.00']),maxGuides:z.number(),maxItems:z.number(),maxXmlBytes:z.number()}),xmlProfile:z.object({id:z.string().nullable(),version:z.number(),data:tissProfileData}),guides:z.array(z.object({guideId:text,number:text,totalCents:money,clinicalIndication:z.string(),clinicalConfirmed:z.boolean(),snapshot:z.object({operator:z.object({registrationAns:text}),contract:z.object({providerCode:text,cnes:text,tissVersion:z.enum(['04.03.00','4.03.00'])}),coverage:z.object({cardNumber:text}),newbornCode:z.enum(['S','N']),requesterProviderCode:text,requesterProviderName:text,requester:professional,authorization:z.object({number:text,accessCode:z.string().nullable(),issuedOn:text,endsOn:text}).nullable(),requestedOn:text,characterCode:text,attendanceCode:text,regimeCode:text,accidentCode:text,profile:z.object({rules:z.object({requireEndTime:z.boolean(),requireClinicalIndication:z.boolean()})}),items:z.array(item).min(1)})})).min(1).max(100)});
const UF:Record<string,string>={RO:'11',AC:'12',AM:'13',RR:'14',PA:'15',AP:'16',TO:'17',MA:'21',PI:'22',CE:'23',RN:'24',PB:'25',PE:'26',AL:'27',SE:'28',BA:'29',MG:'31',ES:'32',RJ:'33',SP:'35',PR:'41',SC:'42',RS:'43',MS:'50',MT:'51',GO:'52',DF:'53'};
const fail=(message:string):never=>{throw new AdministrativeConfigError(message);};
export function latin1(value:string){if([...value].some(c=>c.codePointAt(0)!>255||(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(c))))fail('Texto não representável em XML ISO-8859-1. Corrija a fonte; não houve substituição de caracteres.');return Buffer.from(value,'latin1');}
export function tissMd5(values:string[]){return createHash('md5').update(latin1(values.join(''))).digest('hex');}
export function decimal(cents:bigint){if(cents<0||cents>BigInt('999999999999'))fail('Valor excede o decimal permitido pelo schema.');const integer=String(cents/BigInt(100)),fraction=String(cents%BigInt(100)).padStart(2,'0');if((integer+fraction.replace(/0+$/,'')).replace(/^0+/,'').length>10)fail('Valor excede totalDigits=10 do schema.');return integer+'.'+fraction;}
export function serializeTiss(batch:{number:bigint;totalCents:bigint;snapshot:unknown;closedAt:Date|null}){
 const parsed=snapshot.safeParse(batch.snapshot);if(!parsed.success)fail('Dados XML pendentes no conteúdo fechado: '+parsed.error.issues.slice(0,8).map(i=>i.path.join('.')).join(', ')+'. Corrija as guias/configuração e feche novo lote.');const s=parsed.data!;
 if(!batch.closedAt||s.guides.length>s.contract.maxGuides||s.guides.reduce((n,g)=>n+g.snapshot.items.length,0)>s.contract.maxItems)fail('Limites ou fechamento incompatíveis com XML.');
 const values:string[]=[];const tag=(name:string,value:string)=>{latin1(value);values.push(value);return '<ans:'+name+'>'+value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;')+'</ans:'+name+'>';};
 const group=(name:string,inside:string)=>'<ans:'+name+'>'+inside+'</ans:'+name+'>';
 const c=s.guides[0].snapshot.contract,o=s.guides[0].snapshot.operator;
 const civil=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(batch.closedAt!).split(' ');
 const header=group('cabecalho',group('identificacaoTransacao',tag('tipoTransacao','ENVIO_LOTE_GUIAS')+tag('sequencialTransacao',String(batch.number))+tag('dataRegistroTransacao',civil[0])+tag('horaRegistroTransacao',civil[1]))+group('origem',group('identificacaoPrestador',tag('codigoPrestadorNaOperadora',c.providerCode)))+group('destino',tag('registroANS',o.registrationAns))+tag('Padrao','4.03.00'));
 const lotNumber=tag('numeroLote',String(batch.number));
 let total=BigInt(0);const guides=s.guides.map(g=>{
  const x=g.snapshot;if(x.operator.registrationAns!==o.registrationAns||x.contract.providerCode!==c.providerCode)fail('Lote contém identificação contratual incompatível.');
  const p=x.requester,uf=UF[p.councilState];if(!uf)fail('UF do conselho solicitante não reconhecida.');
  let inner=group('cabecalhoGuia',tag('registroANS',o.registrationAns)+tag('numeroGuiaPrestador',g.number));
  if(x.authorization)inner+=group('dadosAutorizacao',tag('numeroGuiaOperadora',x.authorization.number)+tag('dataAutorizacao',x.authorization.issuedOn.slice(0,10))+(x.authorization.accessCode?tag('senha',x.authorization.accessCode)+tag('dataValidadeSenha',x.authorization.endsOn.slice(0,10)):''));
  inner+=group('dadosBeneficiario',tag('numeroCarteira',x.coverage.cardNumber)+tag('atendimentoRN',x.newbornCode));
  inner+=group('dadosSolicitante',group('contratadoSolicitante',tag('codigoPrestadorNaOperadora',x.requesterProviderCode))+tag('nomeContratadoSolicitante',x.requesterProviderName)+group('profissionalSolicitante',tag('nomeProfissional',p.name)+tag('conselhoProfissional',p.councilCode)+tag('numeroConselhoProfissional',p.councilNumber)+tag('UF',uf)+tag('CBOS',p.occupationCode)));
  if(x.profile.rules.requireClinicalIndication&&(!g.clinicalIndication||!g.clinicalConfirmed))fail('Indicação clínica obrigatória não confirmada.');
  inner+=group('dadosSolicitacao',tag('dataSolicitacao',x.requestedOn.slice(0,10))+tag('caraterAtendimento',x.characterCode)+(g.clinicalIndication&&g.clinicalConfirmed?tag('indicacaoClinica',g.clinicalIndication):''));
  inner+=group('dadosExecutante',group('contratadoExecutante',tag('codigoPrestadorNaOperadora',x.contract.providerCode))+tag('CNES',x.contract.cnes));
  inner+=group('dadosAtendimento',tag('tipoAtendimento',x.attendanceCode)+tag('indicacaoAcidente',x.accidentCode)+tag('regimeAtendimento',x.regimeCode));
  let subtotal=BigInt(0);inner+=group('procedimentosExecutados',x.items.map((i,index)=>{
   if(x.profile.rules.requireEndTime&&!i.endTime)fail('Hora final exigida pelo perfil está ausente.');
   const amount=BigInt(i.totalCents);if(amount!==BigInt(i.quantity)*BigInt(i.unitCents))fail('Valores de item não reconciliam.');subtotal+=amount;
   const initial=i.production.occurredAt?new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(i.production.occurredAt)):null;
   if(x.profile.rules.requireEndTime&&!initial)fail('Hora inicial confirmada ausente no snapshot da produção.');
   const prefix=tag('sequencialItem',String(index+1))+tag('dataExecucao',i.executionOn.slice(0,10))+(initial?tag('horaInicial',initial):'')+(i.endTime?tag('horaFinal',i.endTime+':00'):'')+group('procedimento',tag('codigoTabela',i.production.tariff.tableCode)+tag('codigoProcedimento',i.production.tariff.code)+tag('descricaoProcedimento',i.production.tariff.name))+tag('quantidadeExecutada',String(i.quantity))+tag('reducaoAcrescimo','1.00')+tag('valorUnitario',decimal(BigInt(i.unitCents)))+tag('valorTotal',decimal(amount));
   let equipe='';if(s.xmlProfile.data.includeExecutor){const e=i.executor,code=e&&s.xmlProfile.data.executorCodes[e.id],state=e&&UF[e.councilState];if(!e||!code||!state)fail('Identificação da equipe executante pendente no perfil congelado.');equipe=group('equipeSadt',group('codProfissional',tag('codigoPrestadorNaOperadora',code!))+tag('nomeProf',e!.name)+tag('conselho',e!.councilCode)+tag('numeroConselhoProfissional',e!.councilNumber)+tag('UF',state!)+tag('CBOS',e!.occupationCode));}
   return group('procedimentoExecutado',prefix+equipe);
  }).join(''));
  if(subtotal!==BigInt(g.totalCents))fail('Total da guia não reconcilia.');total+=subtotal;
  inner+=group('valorTotal',tag('valorProcedimentos',decimal(subtotal))+tag('valorTotalGeral',decimal(subtotal)));return group('guiaSP-SADT',inner);
 }).join('');
 if(total!==batch.totalCents)fail('Total do lote não reconcilia.');
 const body=group('prestadorParaOperadora',group('loteGuias',lotNumber+group('guiasTISS',guides)));
 const hash=tissMd5(values),xml='<?xml version="1.0" encoding="ISO-8859-1"?><ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">'+header+body+group('epilogo','<ans:hash>'+hash+'</ans:hash>')+'</ans:mensagemTISS>';
 const bytes=latin1(xml);if(bytes.length>Math.min(s.contract.maxXmlBytes,2*1024*1024))fail('XML excede o limite de bytes. Divida o lote.');
 return {bytes,hash,profile:s.xmlProfile,totalCents:total,guideCount:s.guides.length,itemCount:s.guides.reduce((n,g)=>n+g.snapshot.items.length,0)};
}
