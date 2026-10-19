import { toLocalTime } from "@/modules/agenda/validation";

// Grade do dia: faixa configurável (padrão 07:00–20:00, issue #63), sempre ampliada quando há
// agendamento fora dela. A faixa é só visual: não é horário de funcionamento nem bloqueio.
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 20;
export const HOUR_HEIGHT_PX = 64;

type Timed = { startsAt: Date; endsAt: Date };
type Person = { id: string; name: string };

function minutesOf(instant: Date) {
  const [hh, mm] = toLocalTime(instant).split(":").map(Number);
  return hh * 60 + mm;
}

export function dayHourRange(
  items: Timed[],
  range: { startHour: number; endHour: number } = { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR },
) {
  let start = range.startHour;
  let end = range.endHour;
  for (const item of items) {
    start = Math.min(start, Math.floor(minutesOf(item.startsAt) / 60));
    // Fim à meia-noite do mesmo dia não existe (mesmo dia, fim > início), então 0 min não ocorre aqui.
    end = Math.max(end, Math.ceil(minutesOf(item.endsAt) / 60));
  }
  return { startHour: start, endHour: Math.min(end, 24) };
}

// Posição vertical (px) dentro da grade que começa em `startHour`.
export function placeOnGrid(item: Timed, startHour: number) {
  const start = minutesOf(item.startsAt);
  const end = minutesOf(item.endsAt);
  const pxPerMinute = HOUR_HEIGHT_PX / 60;
  return { top: (start - startHour * 60) * pxPerMinute, height: Math.max(end - start, 15) * pxPerMinute };
}

// Faixas lado a lado para itens sobrepostos na mesma coluna (ex.: cancelado no mesmo horário de um novo).
// As faixas são contadas por grupo de sobreposição (itens encadeados por conflito), não pela coluna
// inteira: um único cruzamento de minutos não deve estreitar os cards do dia todo. `lanes` de cada
// item é a largura do seu grupo; `lanes` do retorno é o máximo, usado só na largura mínima da coluna.
export function assignLanes<T extends Timed>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const placed: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let cluster: { lane: number; item: T }[] = [];
  let clusterEnd = -Infinity;
  const closeCluster = () => {
    for (const entry of cluster) placed.push({ ...entry, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.startsAt.getTime() >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.startsAt.getTime());
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.endsAt.getTime();
    clusterEnd = Math.max(clusterEnd, item.endsAt.getTime());
    cluster.push({ item, lane });
  }
  closeCluster();
  return { lanes: Math.max(1, ...placed.map((entry) => entry.lanes)), placed };
}

// Uma coluna por profissional, na ordem recebida. Agendamentos de profissional fora da lista
// (ex.: fisioterapeuta desativado depois) ganham coluna própria ao final.
export function groupByProfessional<T extends Timed & { professional: Person }>(items: T[], professionals: Person[]) {
  const columns = new Map<string, { professional: Person; items: T[] }>(
    professionals.map((professional) => [professional.id, { professional, items: [] }]),
  );
  for (const item of items) {
    const column = columns.get(item.professional.id) ?? { professional: item.professional, items: [] };
    column.items.push(item);
    columns.set(item.professional.id, column);
  }
  return [...columns.values()];
}

// Trecho de um bloqueio (MEL-02) visível no dia [dayStart, dayEnd), em minutos desde 00:00 do dia (fim até 1440).
// Bloqueios podem atravessar vários dias; fora do dia, null.
export function blockMinutesOnDay(block: Timed, dayStart: Date, dayEnd: Date) {
  if (block.endsAt <= dayStart || block.startsAt >= dayEnd) return null;
  const start = block.startsAt <= dayStart ? 0 : minutesOf(block.startsAt);
  const end = block.endsAt >= dayEnd ? 24 * 60 : minutesOf(block.endsAt);
  return end > start ? { start, end } : null;
}
