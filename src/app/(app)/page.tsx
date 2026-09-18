import { requireUser } from "@/modules/auth/dal";

const modulos = [
  "Pacientes",
  "Agenda",
  "Avaliações",
  "Planos terapêuticos",
  "Sessões e evolução clínica",
];

export default async function Home() {
  const user = await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">TechLab+</p>
        <h1 className="text-4xl font-semibold tracking-tight">Fisio OrtoSport</h1>
        <p className="text-lg text-muted-foreground">
          Olá, {user.name}. Gestão clínica organizada. Atendimento com continuidade. Evolução
          acompanhada.
        </p>
      </div>
      <section aria-labelledby="modulos-titulo" className="flex flex-col gap-3">
        <h2 id="modulos-titulo" className="text-base font-medium">
          Módulos em construção
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {modulos.map((modulo) => (
            <li key={modulo} className="rounded-lg border px-4 py-3 text-sm">
              {modulo}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
