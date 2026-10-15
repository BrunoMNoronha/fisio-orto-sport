"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchChargePatients } from "@/modules/financeiro/actions";
import { PatientCombobox } from "../../agenda/patient-combobox";

type PatientOption = { id: string; label: string };
const PATIENT_TEXTS = { noun: "paciente", plural: "pacientes", listLabel: "Pacientes" };

export function ReportFilters({
  action,
  initialPatient,
  start,
  end,
  dateLabel,
}: {
  action: string;
  initialPatient: PatientOption | null;
  start?: string;
  end?: string;
  dateLabel: string;
}) {
  const [patient, setPatient] = useState(initialPatient);
  const [startDate, setStartDate] = useState(start ?? "");
  const [endDate, setEndDate] = useState(end ?? "");

  function clearFilters() {
    setPatient(null);
    setStartDate("");
    setEndDate("");
  }

  return (
    <form role="search" aria-label="Filtros do relatório" action={action} method="get" className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <PatientCombobox
          name="patientId"
          label="Paciente (opcional)"
          value={patient}
          onChange={setPatient}
          search={searchChargePatients}
          texts={PATIENT_TEXTS}
        />
        {patient && (
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setPatient(null)}>
            Remover paciente do filtro
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="relatorio-start">Data inicial</Label>
        <Input id="relatorio-start" name="start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} min="2000-01-01" max="2100-12-31" className="min-w-0" aria-describedby="relatorio-periodo-ajuda" />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="relatorio-end">Data final</Label>
        <Input id="relatorio-end" name="end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} min="2000-01-01" max="2100-12-31" className="min-w-0" aria-describedby="relatorio-periodo-ajuda" />
      </div>
      <p id="relatorio-periodo-ajuda" className="text-xs text-muted-foreground sm:col-span-2">
        {dateLabel}. As datas inicial e final estão incluídas. Deixe uma data vazia para não limitar esse lado do período.
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" variant="secondary">Filtrar</Button>
        <Link href={action} onClick={clearFilters} className={buttonVariants({ variant: "outline" })}>Limpar filtros</Link>
      </div>
    </form>
  );
}
