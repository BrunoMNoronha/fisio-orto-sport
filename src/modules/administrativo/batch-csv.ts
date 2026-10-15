import {csvText} from "./report-csv";
import type {BatchReport} from "./batch-read";
export function batchCsv(r:BatchReport){if(r.error||r.rows.length!==r.itemCount)throw new Error('CSV exige lote integral.');const lines:unknown[][]=[['Tipo','Lote','Guia','Execução','Paciente','Autorização','Profissional','Tabela','Código','Procedimento','Quantidade','Unitário (centavos)','Total (centavos)','Contexto']];
 lines.push(['META',r.number,'','','','','','','','','','','',`${r.operator} / ${r.contract}; TISS ${r.tissVersion}; estado ${r.state}; conteúdo ${r.contentVersion}; ${r.itemCount} de ${r.itemCount} itens; gerado ${r.generatedAt.toISOString()}; fechado não é recebido; faturamento pelo envio manual`]);
 for(const row of r.rows)lines.push(['ITEM',r.number,row.guideNumber,row.executionOn,row.patient,row.authorization,row.professional,row.tableCode,row.code,row.procedure,row.quantity,row.unitCents,row.totalCents,row.productionId]);
 for(const guide of r.guides)lines.push(['GUIA',r.number,guide.number,'','','','','','','','','',guide.totalCents,`${guide.items} itens`]);
 for(const group of r.groups)lines.push(['UNIDADE',r.number,'','','','','',group.tableCode,group.code,group.procedure,group.quantity,'',group.totalCents,group.procedureId]);
 lines.push(['LOTE',r.number,'','','','','','','','','','',r.totalCents,`${r.guideCount} guias / ${r.itemCount} itens`]);
 for(const s of r.sends)lines.push(['ENVIO',r.number,'','','','','','','','','','','',`${s.id}; data ${s.sentOn.toISOString().slice(0,10)}; protocolo ${s.protocol}; canal ${s.channel}; arquivo ${s.artifactId}; corrige ${s.correctsId??'original'}`]);
 return '﻿'+lines.map(line=>line.map(v=>typeof v==='bigint'?String(v):csvText(String(v??''))).join(';')).join('\r\n')+'\r\n';}
