import {NextRequest} from "next/server";
import {getBatchReport} from "@/modules/administrativo/batch-queries";
import {batchCsv} from "@/modules/administrativo/batch-csv";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params,{report,error}=await getBatchReport(id,request.nextUrl.searchParams,true);const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};if(!report)return new Response(error,{status:400,headers});if(report.error)return new Response(report.error,{status:422,headers});return new Response(batchCsv(report),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="lote-${report.number}.csv"`}});}
