import {assertPermission,AuthorizationError} from "@/modules/auth/dal";
import {downloadBatchXml} from "@/modules/administrativo/tiss/queries";
import {exactXmlBytes} from "@/modules/administrativo/tiss/xml-service";
import {AdministrativeConfigError} from "@/modules/administrativo/service";
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;artifactId:string}>}){const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};try{await assertPermission('administrativo:fechar');}catch(e){if(e instanceof AuthorizationError)return new Response('Acesso negado.',{status:403,headers});throw e;}const {id,artifactId}=await params,a=await downloadBatchXml(id,artifactId);if(!a)return new Response('Arquivo não encontrado.',{status:404,headers});try{return new Response(exactXmlBytes(a),{headers:{...headers,'Content-Type':'application/xml; charset=ISO-8859-1','Content-Disposition':`attachment; filename="lote-${a.batch.number}-v${a.version}-${a.purpose.toLowerCase()}.xml"`}});}catch(e){if(e instanceof AdministrativeConfigError)return new Response(e.message,{status:409,headers});throw e;}}
