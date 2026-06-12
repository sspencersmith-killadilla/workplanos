import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Layers, Sparkles, Workflow, Zap, GitBranch, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorkPlanOS — Workflows your team can feel" },
      { name: "description", content: "A premium, blazing-fast workflow & project platform. Boards, custom columns, kanban, calendar, workload, automations, forms, dashboards. No AI fluff." },
      { property: "og:title", content: "WorkPlanOS — Workflows your team can feel" },
      { property: "og:description", content: "Boards, kanban, calendar, workload, automations, intake forms, dashboards. The productivity engine teams ship with." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-30 bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold">W</div>
            <span className="font-semibold tracking-tight">WorkPlanOS</span>
          </div>
          <nav className="hidden gap-7 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#views" className="hover:text-foreground transition-colors">Views</a>
            <a href="#automations" className="hover:text-foreground transition-colors">Automations</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">Sign in</Link>
            <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
              Start free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-6">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          A modular productivity engine — no AI fluff
        </div>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05] max-w-4xl">
          Workflows your team<br/>can <span className="text-primary">actually feel.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Build any workflow: boards with custom columns, statuses, dates, people. Pivot the same data into table, kanban, calendar, or workload. Wire up automations. Ship.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            Create your workspace <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#features" className="rounded-md border border-border px-5 py-3 text-sm font-medium hover:bg-accent transition-colors">See how it works</a>
        </div>
      </section>

      <section id="features" className="border-t border-border/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-px bg-border/60 rounded-xl overflow-hidden md:grid-cols-3">
            {[
              { icon: Layers, title: "Dynamic columns", body: "Status, people, dates, timelines, numbers, formulas, links. Add or rearrange any time." },
              { icon: Workflow, title: "Four views, one source", body: "Table, kanban, calendar, workload. The same data, the way your brain works." },
              { icon: Zap, title: "Automations", body: "If status → then notify, reassign, move group. Built without a single line of code." },
              { icon: GitBranch, title: "Intake forms", body: "Generate a public form that drops submissions straight into a board as new items." },
              { icon: BarChart3, title: "Dashboards", body: "Progress batteries, number tiles, charts. Roll up across boards in seconds." },
              { icon: Sparkles, title: "Collaboration", body: "Right-hand drawer with threaded comments, edit history, change log, and subitems." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-background p-7">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="views" className="py-20 border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Same database. Four perspectives.</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Switch tabs to pivot from spreadsheet to kanban to calendar to workload. No copying, no sync.</p>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="grid h-5 w-5 place-items-center rounded bg-primary text-primary-foreground font-bold text-[10px]">W</div>
            <span>© WorkPlanOS</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/help" className="hover:text-foreground transition-colors">
              User manual
            </Link>
            <a
              href="/DEPLOY.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Self-host guide
            </a>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
