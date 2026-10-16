"use client";
import { NativeActionButton } from "@/components/informative-help";
import {useState} from "react";
import {PatientCombobox} from "../../agenda/patient-combobox";
import {searchAdministrativeReportOptions} from "@/modules/administrativo/report-actions";
const search=searchAdministrativeReportOptions.bind(null,'contractId');
export function ContractPicker(){const [value,setValue]=useState<{id:string;label:string}|null>(null);return <form className="space-y-3"><PatientCombobox name="contractId" label="Contrato e operadora" value={value} onChange={setValue} search={search} texts={{noun:'contrato',plural:'contratos',listLabel:'Contratos'}}/><NativeActionButton help="Continua a montagem do lote no contrato selecionado." className="rounded border p-2" disabled={!value}>Selecionar contrato</NativeActionButton></form>;}
