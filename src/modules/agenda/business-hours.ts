// Expediente da clínica (issue #78; decisões de 27/09/2026): um expediente GLOBAL, semanal, com até
// dois intervalos de atendimento por dia (ex.: 08:00–12:00 e 13:00–18:00). Dia sem intervalo = fechado;
// o vão entre os intervalos é pausa. Feriados e exceções usam os bloqueios de agenda que já existem.
// Não é a faixa visual da grade (agendaDayStartHour/EndHour) e só vale quando a chave
// `businessHoursEnabled` das configurações estiver ligada.
//
// Puro, sem `server-only`: usado no formulário (opções de horário) e no servidor (validação).
// Tudo no fuso da clínica (America/Sao_Paulo).
//
// Formato persistido (ClinicSettings.businessHours), canônico para comparação e auditoria: 7 trechos
// separados por ";" (domingo a sábado); cada trecho tem os intervalos "HH:MM-HH:MM" separados por ","
// e fica vazio no dia fechado. Ex.: ";08:00-12:00,13:00-18:00;...;08:00-12:00".
import { toLocalDate, toLocalTime } from "./validation";

export type Interval = { start: number; end: number };
export type WeekSchedule = Interval[][];

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const MAX_INTERVALS_PER_DAY = 2;
export const DAY_MINUTES = 24 * 60;
// Passo das opções de horário no formulário de agendamento.
export const TIME_STEP_MINUTES = 5;
export const CLOSED_WEEK = ";;;;;;";
export const BUSINESS_HOURS_MAX_LENGTH = 200;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function toMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

export function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Problemas de um dia (ordem, sobreposição, limites); lista vazia = válido.
export function dayProblems(intervals: Interval[]): string[] {
  const problems: string[] = [];
  if (intervals.length > MAX_INTERVALS_PER_DAY) problems.push(`No máximo ${MAX_INTERVALS_PER_DAY} intervalos por dia.`);
  intervals.forEach((interval, index) => {
    if (interval.start < 0 || interval.end > DAY_MINUTES || interval.start >= interval.end) {
      problems.push("O fim de cada intervalo deve ser depois do início.");
    }
    const previous = intervals[index - 1];
    if (previous && interval.start < previous.end) {
      problems.push("O segundo intervalo deve começar depois do fim do primeiro (a pausa fica entre eles).");
    }
  });
  return problems;
}

// Texto persistido → semana; null se o formato ou as regras não baterem.
export function parseBusinessHours(text: string): WeekSchedule | null {
  const days = text.split(";");
  if (days.length !== 7) return null;
  const week: WeekSchedule = [];
  for (const day of days) {
    if (day === "") {
      week.push([]);
      continue;
    }
    const intervals: Interval[] = [];
    for (const part of day.split(",")) {
      const [start, end, extra] = part.split("-");
      if (extra !== undefined || !TIME_RE.test(start ?? "") || !TIME_RE.test(end ?? "")) return null;
      intervals.push({ start: toMinutes(start), end: toMinutes(end) });
    }
    if (dayProblems(intervals).length) return null;
    week.push(intervals);
  }
  return week;
}

export function formatBusinessHours(week: WeekSchedule): string {
  return week.map((day) => day.map((i) => `${toTime(i.start)}-${toTime(i.end)}`).join(",")).join(";");
}

export function isClosedWeek(week: WeekSchedule) {
  return week.every((day) => day.length === 0);
}

// Dia da semana (0 = domingo) de uma data civil AAAA-MM-DD.
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function intervalsOn(week: WeekSchedule, date: string): Interval[] {
  return week[weekdayOf(date)] ?? [];
}

// O atendimento inteiro [início, fim) cabe num único intervalo do dia (fuso da clínica)?
export function isWithinBusinessHours(week: WeekSchedule, startsAt: Date, endsAt: Date): boolean {
  const date = toLocalDate(startsAt);
  const start = toMinutes(toLocalTime(startsAt));
  const endDate = toLocalDate(endsAt);
  let end = toMinutes(toLocalTime(endsAt));
  // Fim exatamente à meia-noite seguinte conta como 24:00 do mesmo dia.
  if (endDate !== date) {
    if (end !== 0) return false;
    end = DAY_MINUTES;
  }
  return intervalsOn(week, date).some((interval) => interval.start <= start && end <= interval.end);
}

// Opções do formulário: inícios possíveis no dia (no passo) e fins possíveis para um início.
export function startOptions(week: WeekSchedule, date: string, step = TIME_STEP_MINUTES): string[] {
  const options: string[] = [];
  for (const interval of intervalsOn(week, date)) {
    for (let t = interval.start; t + step <= interval.end; t += step) options.push(toTime(t));
  }
  return options;
}

export function endOptions(week: WeekSchedule, date: string, startTime: string, step = TIME_STEP_MINUTES): string[] {
  if (!TIME_RE.test(startTime)) return [];
  const start = toMinutes(startTime);
  const interval = intervalsOn(week, date).find((i) => i.start <= start && start < i.end);
  if (!interval) return [];
  const options: string[] = [];
  for (let t = start + step; t <= interval.end; t += step) {
    // 24:00 não é aceito pelo campo de horário: o último fim possível no dia é 23:55.
    if (t < DAY_MINUTES) options.push(toTime(t));
  }
  return options;
}

// Resumo legível, agrupando dias iguais consecutivos: "Seg–Sex 08:00–12:00, 13:00–18:00 · Sáb 08:00–12:00".
export function describeWeek(week: WeekSchedule): string {
  const text = (day: Interval[]) => day.map((i) => `${toTime(i.start)}–${toTime(i.end)}`).join(", ");
  const groups: { from: number; to: number; text: string }[] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const day = week[weekday];
    if (!day.length) continue;
    const last = groups.at(-1);
    const label = text(day);
    if (last && last.text === label && (last.to + 1) % 7 === weekday) last.to = weekday;
    else groups.push({ from: weekday, to: weekday, text: label });
  }
  if (!groups.length) return "Nenhum dia com expediente.";
  return groups
    .map((g) => `${g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]}–${WEEKDAY_SHORT[g.to]}`} ${g.text}`)
    .join(" · ");
}

export const OUTSIDE_BUSINESS_HOURS = "Fora do expediente da clínica.";

// Sinalização (decisão de 27/09/2026): agendamento ATIVO salvo antes do expediente, ou que ficou fora
// depois de uma mudança, continua visível e utilizável; só recebe o aviso. `businessHours` null = sem
// expediente em vigor, sem aviso.
export function isOutsideBusinessHours(
  businessHours: string | null,
  item: { status: string; startsAt: Date; endsAt: Date },
): boolean {
  if (!businessHours || item.status !== "AGENDADO") return false;
  const week = parseBusinessHours(businessHours);
  return week !== null && !isWithinBusinessHours(week, item.startsAt, item.endsAt);
}

export const OUTSIDE_BADGE = "Fora do expediente";
