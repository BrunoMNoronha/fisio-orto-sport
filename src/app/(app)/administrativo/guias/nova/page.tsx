import { guideFormData } from "../guide-form-data";
import { randomUUID } from "node:crypto";
import { getGuideEditor } from "@/modules/administrativo/guide-queries";
import { CoveragePicker, GuideForm } from "../guide-form";
export default async function NewGuide({ searchParams }: { searchParams: Promise<{ coverageId?: string; month?: string }> }) { const raw = await searchParams, data = await getGuideEditor(undefined, raw.coverageId, raw.month); return <div className="mx-auto flex max-w-4xl flex-col gap-5"><h1 className="text-2xl font-semibold">Montar guia SP/SADT</h1>{!data ? <p role="alert">Cobertura inválida.</p> : !data.coverage || !data.selectedMonth ? <CoveragePicker /> : <><h2>{data.coverage.patient.fullName} · {data.coverage.contract.name}</h2><GuideForm data={guideFormData(data)} id={randomUUID()} requestId={randomUUID()} /></>}</div>; }
