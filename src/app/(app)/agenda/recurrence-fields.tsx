"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { displayDate, recurrenceDates, recurrenceSchema, WEEKDAYS, weekday } from "@/modules/agenda/recurrence";
import { isValidDate, isValidTime } from "@/modules/agenda/validation";

export type RecurrenceValues = { enabled: boolean; sessionCount: string; weekdays: number[]; requestKey: string };
export const EMPTY_RECURRENCE: RecurrenceValues = { enabled: false, sessionCount: "", weekdays: [], requestKey: "" };

export function RecurrenceFields({ date, startTime, endTime, value, onChange, errors, disabled, maxSessions }: {
  date: string; startTime: string; endTime: string; value: RecurrenceValues;
  onChange: (value: RecurrenceValues) => void; errors?: Partial<Record<string, string[]>>; disabled: boolean; maxSessions: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const firstDay = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const currentDay = isValidDate(date) ? weekday(date) : null;
  const parsed = recurrenceSchema.safeParse({ date, sessionCount: value.sessionCount, weekdays: value.weekdays });
  const dates = value.enabled && parsed.success && parsed.data.sessionCount <= maxSessions ? recurrenceDates(parsed.data) : [];
  const weekdaysError = errors?.weekdays?.[0] ?? (value.enabled && value.weekdays.length && currentDay && !value.weekdays.includes(currentDay)
    ? "Inclua o dia da nova data inicial em Alterar dias." : undefined);
  const countError = errors?.sessionCount?.[0] ?? (Number(value.sessionCount) > maxSessions ? `Máximo de ${maxSessions} sessões por lote.` : undefined);

  function showDays(target: HTMLElement) {
    returnFocus.current = target;
    setDraft([...new Set([...value.weekdays, ...(currentDay ? [currentDay] : [])])].sort());
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    if (!value.weekdays.length) onChange({ ...value, enabled: false });
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">Recorrência</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.enabled} onChange={(event) => {
          onChange({ ...value, enabled: event.target.checked });
          if (event.target.checked) showDays(event.target);
        }} />
        Agendamento recorrente
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sessionCount">Quantidade de sessões</Label>
        <Input id="sessionCount" name="sessionCount" type="number" min={1} max={maxSessions} step={1}
          disabled={!value.enabled || disabled} value={value.sessionCount}
          aria-invalid={countError ? true : undefined} aria-describedby="sessionCount-help sessionCount-error"
          onChange={(event) => onChange({ ...value, sessionCount: event.target.value })} />
        <p id="sessionCount-help" className="text-xs text-muted-foreground">Total incluindo a primeira sessão. Máximo configurado: {maxSessions} por lote.</p>
        <p id="sessionCount-error" className="text-sm text-destructive">{countError}</p>
      </div>
      {value.enabled && <>
        <input type="hidden" name="recurring" value="1" />
        <input type="hidden" name="requestKey" value={value.requestKey} />
        {value.weekdays.map((day) => <input key={day} type="hidden" name="weekdays" value={day} />)}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Dias: {value.weekdays.map((day) => WEEKDAYS[day - 1]).join(", ") || "Selecione os dias"}</span>
          <Button type="button" variant="outline" onClick={(event) => showDays(event.currentTarget)} aria-describedby="weekdays-error">Alterar dias</Button>
        </div>
        <p id="weekdays-error" className="text-sm text-destructive" role={weekdaysError ? "alert" : undefined}>{weekdaysError}</p>
        <div aria-live="polite" className="text-sm">
          {dates.length && isValidTime(startTime) && isValidTime(endTime) && endTime > startTime ? <>
            <p className="font-medium">Prévia: {dates.length} {dates.length === 1 ? "sessão" : "sessões"}</p>
            <ol className="mt-2 max-h-60 list-decimal overflow-auto pl-6" aria-label="Datas previstas">
              {dates.map((day) => <li key={day}>{displayDate(day)} — {startTime}–{endTime}</li>)}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">Todos os horários serão validados ao salvar. Se houver impedimento, nenhuma sessão será criada.</p>
          </> : <p>Informe quantidade, dias e horários válidos para conferir as datas previstas.</p>}
        </div>
      </>}
      <Dialog open={open} onOpenChange={(next) => { if (!next) cancel(); }}>
        <DialogContent initialFocus={firstDay} finalFocus={() => returnFocus.current}>
          <DialogHeader>
            <DialogTitle>Dias do agendamento recorrente</DialogTitle>
            <DialogDescription>Escolha os dias da semana. O dia da data inicial deve estar incluído.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {WEEKDAYS.map((label, index) => {
              const day = index + 1;
              return <label key={day} className="flex items-center gap-2">
                <input ref={index === 0 ? firstDay : undefined} type="checkbox" checked={draft.includes(day)}
                  onChange={(event) => setDraft((days) => event.target.checked ? [...days, day].sort() : days.filter((item) => item !== day))} />
                {label}
              </label>;
            })}
          </div>
          {!draft.length && <p className="text-sm text-destructive">Selecione ao menos um dia.</p>}
          {currentDay && !draft.includes(currentDay) && <p className="text-sm text-destructive">Inclua {WEEKDAYS[currentDay - 1]}, dia da data inicial.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
            <Button type="button" disabled={!draft.length || !currentDay || !draft.includes(currentDay)} onClick={() => {
              onChange({ ...value, weekdays: draft });
              setOpen(false);
            }}>Confirmar dias</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
