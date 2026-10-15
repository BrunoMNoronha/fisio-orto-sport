"use client";
import { useActionState, useState } from "react";
import { saveProductionAction } from "@/modules/administrativo/production-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
type Props={id:string;sessionId:string;requestId:string;version:number;state?:string;coverageId?:string;procedureId?:string;quantity?:number;endTime?:string|null;
 coverages:{id:string;cardNumber:string;contractId:string;contract:{name:string}}[];
 procedures:{id:string;code:string;name:string;contractId:string}[];
 authorizationItems:{id:string;procedureId:string;authorization:{number:string;coverageId:string}}[]};
export function ProductionForm(p:Props){
 const [state,action,pending]=useActionState(saveProductionAction,undefined);
 const [coverage,setCoverage]=useState(p.coverageId??''),[procedure,setProcedure]=useState(p.procedureId??'');
 const [quantity,setQuantity]=useState(String(p.quantity??1)),[endTime,setEndTime]=useState(p.endTime??''),[reason,setReason]=useState('');
 const contract=p.coverages.find(c=>c.id===coverage)?.contractId;
 const frozen=!!p.state&&p.state!=='PENDENTE';
 const control=(name:string)=>`${p.id}-${name}`;
 return <form action={action} className="flex flex-col gap-3 rounded border p-4">
 <input type="hidden" name="id" value={p.id}/><input type="hidden" name="sessionId" value={p.sessionId}/><input type="hidden" name="requestId" value={p.requestId}/><input type="hidden" name="expectedVersion" value={p.version}/>
 {state?.error&&<p role="alert" className="text-destructive">{state.error}</p>}
 <Label htmlFor={control('coverage')}>Cobertura</Label><NativeSelect id={control('coverage')} name="coverageId" value={coverage} onChange={e=>{setCoverage(e.target.value);setProcedure('');}} disabled={frozen} required><option value="">Selecione</option>{p.coverages.map(c=><option key={c.id} value={c.id}>{c.contract.name} — {c.cardNumber}</option>)}</NativeSelect>
 <Label htmlFor={control('procedure')}>Procedimento</Label><NativeSelect id={control('procedure')} name="procedureId" value={procedure} onChange={e=>setProcedure(e.target.value)} disabled={frozen} required><option value="">Selecione</option>{p.procedures.filter(x=>x.contractId===contract).map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</NativeSelect>
 {frozen&&<><input type="hidden" name="coverageId" value={coverage}/><input type="hidden" name="procedureId" value={procedure}/></>}
 <Label htmlFor={control('quantity')}>Quantidade inteira</Label><Input id={control('quantity')} name="quantity" type="number" min={1} max={2147483647} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} readOnly={frozen} required/>
 <Label htmlFor={control('end')}>Hora final real (opcional)</Label><Input id={control('end')} name="endTime" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} readOnly={frozen}/>
 <p className="text-sm">Início e data vêm da sessão no fuso de São Paulo. Não deduza a hora final da agenda.</p>
 <Label htmlFor={control('authorization')}>Item de autorização</Label><NativeSelect id={control('authorization')} name="authorizationItemId" defaultValue=""><option value="">Sem seleção (depende da regra contratual)</option>{p.authorizationItems.filter(x=>x.procedureId===procedure&&x.authorization.coverageId===coverage).map(x=><option key={x.id} value={x.id}>{x.authorization.number}</option>)}</NativeSelect>
 <Label htmlFor={control('reason')}>Motivo</Label><Input id={control('reason')} name="reason" maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} required/>
 <div className="flex flex-wrap gap-2">{(!p.state||p.state==='PENDENTE')&&<><Button type="submit" name="operation" value="PREPARAR" disabled={pending}>Salvar preparação</Button><Button type="submit" name="operation" value="CONFERIR" disabled={pending}>Conferir produção</Button></>}{p.state==='APTO'&&<Button type="submit" name="operation" value="DEVOLVER" disabled={pending}>Devolver à preparação</Button>}{p.state&&['PENDENTE','APTO'].includes(p.state)&&<Button type="submit" name="operation" value="INVALIDAR" disabled={pending}>Invalidar item</Button>}</div>
 </form>;
}
