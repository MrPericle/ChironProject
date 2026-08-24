import { Activity, CalendarCheck, Dumbbell, ShieldCheck, Users } from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const modules = [
  {
    title: "Catalogo corsi",
    description: "Filtri per sede, orario e disponibilita.",
    icon: Dumbbell,
  },
  {
    title: "Prenotazioni",
    description: "Posti limitati, cancellazione entro soglia e storico personale.",
    icon: CalendarCheck,
  },
  {
    title: "Backoffice",
    description: "Gestione sedi, corsi, iscritti e riepiloghi operativi.",
    icon: ShieldCheck,
  },
  {
    title: "Iscritti",
    description: "Scadenza abbonamento informativa, senza pagamenti in app.",
    icon: Users,
  },
];

export function App() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ASD movement platform</p>
            <h1>Chiron Project</h1>
          </div>
          <a className="status-pill" href={`${apiBaseUrl}/health`}>
            <Activity aria-hidden="true" size={18} />
            API health
          </a>
        </div>

        <div className="summary-grid">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article className="module-card" key={module.title}>
                <Icon aria-hidden="true" size={22} />
                <h2>{module.title}</h2>
                <p>{module.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

