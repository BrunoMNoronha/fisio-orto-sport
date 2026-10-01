import { render, screen } from '@testing-library/react';
import { AgendaDayGrid } from '../agenda-day-grid';
import { AgendaWeekView } from '../agenda-week-view';
import { AgendaListView } from '../agenda-list-view';
const professionals = [{ id: 'f1', name: 'FISIO TESTE' }];
const items = Array.from({ length: 3 }, (_, index) => ({
  id: `appointment-${index}`, startsAt: new Date('2026-10-01T12:00:00Z'), endsAt: new Date('2026-10-01T13:00:00Z'),
  status: 'AGENDADO' as const, professional: professionals[0], patient: { id: `p${index}`, fullName: `PACIENTE ${index}` },
}));
it.each(['dia', 'semana', 'lista'])('visão %s mantém links individuais para três pacientes simultâneos', view => {
  render(view === 'dia' ? <AgendaDayGrid date="2026-10-01" items={items} professionals={professionals} canManage /> :
    view === 'semana' ? <AgendaWeekView from="2026-09-28" today="2026-10-01" items={items} /> : <AgendaListView items={items} />);
  items.forEach(item => expect(screen.getByRole('link', { name: new RegExp(item.patient.fullName) })).toHaveAttribute('href', `/agenda/${item.id}`));
  if (view === 'dia') {
    const boxes = items.map(item => screen.getByRole('link', { name: new RegExp(item.patient.fullName) }));
    expect(new Set(boxes.map(box => box.style.left)).size).toBe(3);
  }
});
