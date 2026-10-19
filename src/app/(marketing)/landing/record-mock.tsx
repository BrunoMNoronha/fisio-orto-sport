import { cn } from "@/lib/utils";
import { CARD } from "./landing-ui";

const TABS = ["Resumo", "Anamnese", "Avaliações", "Planos", "Sessões", "Reavaliações"] as const;
const ACTIVE_TAB = "Sessões";

const ENTRIES = [
  {
    title: "Sessão de 16/10/2026",
    meta: "#12 · CREFITO 123456-F",
    text: "Dor EVA 3/10 ao final. Mobilização de joelho D, fortalecimento de quadríceps em cadeia fechada. Paciente evolui bem na marcha.",
  },
  {
    title: "Sessão de 14/10/2026",
    meta: "#11 · CREFITO 123456-F",
    text: "Dor EVA 4/10. ADM de flexão 115°. Introduzido agachamento parcial com apoio. Orientado alongamento domiciliar.",
  },
  {
    title: "Reavaliação de 10/10/2026",
    meta: "Comparativa · Continuidade",
    text: "Flexão 95° → 110°. Força MRC 3 → 4. Plano mantido por mais 10 sessões.",
    highlight: true,
  },
] as const;

const ACTION = "flex h-7.5 items-center rounded-lg border border-input px-3 text-xs font-medium";

// Reprodução estática da ficha do paciente (abas e lista de sessões), com dados fictícios.
export function RecordMock() {
  return (
    <div
      role="img"
      aria-label="Tela da ficha do paciente, com abas e lista de sessões"
      className={cn(CARD, "flex min-w-0 flex-col gap-4 p-4 md:p-5")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            CS
          </span>
          <span className="grid gap-0.75 leading-tight">
            <span className="flex items-center gap-2">
              <span className="text-[17px] font-semibold tracking-tight">Carla Souza</span>
              <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900 dark:border-green-600 dark:bg-green-950 dark:text-green-200">
                Ativo
              </span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">34 anos · (11) 9 8765-4321 · Desde 12/03/2026</span>
          </span>
        </div>
        <div className="flex gap-2">
          <span className={ACTION}>Agendar</span>
          <span className={ACTION}>Editar</span>
        </div>
      </div>

      <div className="flex gap-4.5 overflow-hidden border-b">
        {TABS.map((tab) => (
          <span
            key={tab}
            className={cn(
              "border-b-2 border-transparent px-0.5 py-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground",
              tab === ACTIVE_TAB && "border-primary text-primary",
            )}
          >
            {tab}
          </span>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border">
        {ENTRIES.map((entry, index) => (
          <div
            key={entry.title}
            className={cn(
              "flex flex-col gap-1 px-3.5 py-3",
              index < ENTRIES.length - 1 && "border-b",
              "highlight" in entry && entry.highlight && "bg-background",
            )}
          >
            <span className="flex flex-wrap justify-between gap-2">
              <span className="text-[13px] font-semibold">{entry.title}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{entry.meta}</span>
            </span>
            <span className="text-xs leading-snug text-muted-foreground">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
