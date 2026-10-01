// Intervalos semiabertos: saídas no mesmo instante antecedem entradas.
export type CapacitySlot = { startsAt: Date; endsAt: Date };

export function peakOccupancy(slots: CapacitySlot[]): number {
  const events = slots
    .flatMap(({ startsAt, endsAt }) => [
      { at: startsAt.getTime(), delta: 1 },
      { at: endsAt.getTime(), delta: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let count = 0;
  let peak = 0;
  for (const event of events) {
    count += event.delta;
    peak = Math.max(peak, count);
  }
  return peak;
}

// Recorta os registros ao candidato: excesso fora desse intervalo não interfere.
export function occupancyIn(candidate: CapacitySlot, slots: CapacitySlot[]): number {
  return peakOccupancy(
    slots
      .filter((slot) => slot.startsAt < candidate.endsAt && slot.endsAt > candidate.startsAt)
      .map((slot) => ({
        startsAt: new Date(Math.max(slot.startsAt.getTime(), candidate.startsAt.getTime())),
        endsAt: new Date(Math.min(slot.endsAt.getTime(), candidate.endsAt.getTime())),
      })),
  );
}
