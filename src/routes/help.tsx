import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & User Manual · WorkPlanOS" },
      { name: "description", content: "Learn how to use WorkPlanOS — workspaces, boards, views, forms, automations, dashboards, and your account." },
      { property: "og:title", content: "WorkPlanOS — User Manual" },
      { property: "og:description", content: "A plain-language guide to every feature in WorkPlanOS." },
    ],
  }),
  component: HelpPage,
});

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting started",
    body: (
      <>
        <p>WorkPlanOS organizes your work into <strong>workspaces</strong>. Inside each workspace you create <strong>boards</strong> (think of them as smart spreadsheets), and inside each board you add <strong>items</strong> — the tasks, requests, or projects you're tracking.</p>
        <ol>
          <li>Sign in from the home page.</li>
          <li>Click <em>New workspace</em> and give it a name (e.g. "Marketing").</li>
          <li>Open the workspace and click <em>+</em> next to "Boards" to create your first board.</li>
        </ol>
        <p className="tip"><strong>Tip:</strong> One workspace per team, one board per project usually works best.</p>
      </>
    ),
  },
  {
    id: "workspaces",
    title: "Workspaces",
    body: (
      <>
        <p>A workspace is a private container for your team. Each workspace has its own members, boards, dashboards, and forms.</p>
        <ul>
          <li><strong>Create</strong> — from the <em>Your workspaces</em> page, click <em>New workspace</em>.</li>
          <li><strong>Switch</strong> — click the WorkPlanOS logo (top-left inside a workspace) to return to the list.</li>
          <li><strong>Invite people</strong> — open <em>Members</em> in the workspace sidebar.</li>
        </ul>
      </>
    ),
  },
  {
    id: "boards",
    title: "Boards &amp; items",
    body: (
      <>
        <p>Boards hold your work. Each row is an <strong>item</strong>; each column is a typed field.</p>
        <ul>
          <li>Click <em>+ Add item</em> at the bottom of any group to create one.</li>
          <li>Click any cell to edit it — changes save automatically.</li>
          <li>Click an item title to open the <strong>side drawer</strong> with comments, files, and activity history.</li>
          <li>Add columns from the <em>+</em> at the right edge of the column row. Types: Text, Number, Date, Status, Person, Link.</li>
          <li><strong>Groups</strong> are horizontal sections (e.g. "To Do", "In Progress"). Drag to reorder.</li>
        </ul>
        <p className="tip"><strong>Tip:</strong> Add a Status column early — many features (Kanban, automations, dashboards) light up once you have one.</p>
      </>
    ),
  },
  {
    id: "views",
    title: "Views",
    body: (
      <>
        <p>Every board can be viewed four ways without changing the underlying data:</p>
        <ul>
          <li><strong>Table</strong> — the default spreadsheet grid. Best for editing.</li>
          <li><strong>Kanban</strong> — drag cards between status columns.</li>
          <li><strong>Calendar</strong> — items appear on the day of their date column.</li>
          <li><strong>Timeline</strong> — Gantt-style bars (requires a start and end date column).</li>
        </ul>
      </>
    ),
  },
  {
    id: "forms",
    title: "Forms (public intake)",
    body: (
      <>
        <p>Forms let people <strong>without an account</strong> submit work into your board.</p>
        <ol>
          <li>Open a board → <em>Forms</em> tab → <em>New form</em>.</li>
          <li>Choose the destination group submissions should land in.</li>
          <li>Add the fields you want to collect. Mark them required or optional.</li>
          <li>Toggle <em>Published</em> on and share the public link.</li>
        </ol>
        <p>Each submission becomes a new item on the board automatically.</p>
      </>
    ),
  },
  {
    id: "automations",
    title: "Automations",
    body: (
      <>
        <p>Automations are "When X happens, then do Y" rules. No code.</p>
        <ol>
          <li>Open a board → <em>Automations</em> tab → <em>New rule</em>.</li>
          <li>Pick a trigger (e.g. <em>Status changes to Done</em>).</li>
          <li>Add one or more actions: set another status, notify a member, etc.</li>
          <li>Save. The rule is live immediately.</li>
        </ol>
        <p>Recent runs appear at the bottom of the page so you can see what fired and when.</p>
      </>
    ),
  },
  {
    id: "dashboards",
    title: "Dashboards",
    body: (
      <>
        <p>Dashboards roll up data from many boards into one view.</p>
        <ul>
          <li>Open <em>Dashboards</em> in the workspace sidebar → <em>New dashboard</em>.</li>
          <li>Add widgets: KPI count, Status breakdown, Numbers sum, or Board link.</li>
          <li>Widgets refresh automatically every 30 seconds.</li>
        </ul>
      </>
    ),
  },
  {
    id: "members",
    title: "Members &amp; roles",
    body: (
      <>
        <p>Each workspace member has one of three roles:</p>
        <ul>
          <li><strong>Owner</strong> — full control, including deleting the workspace.</li>
          <li><strong>Admin</strong> — can manage boards, members, and invites.</li>
          <li><strong>Member</strong> — can use boards but not change membership.</li>
        </ul>
        <p>Invite from <em>Members</em> in the workspace sidebar — enter an email and pick a role. The invite link is emailed and works once.</p>
        <p className="tip"><strong>Locked members:</strong> Admins can temporarily lock someone in the workspace. Their items, comments, and files are hidden until they're unlocked.</p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p>Click <em>Account</em> in the top-right of the workspaces page (or the person icon in the workspace sidebar) to:</p>
        <ul>
          <li>Update your display name and avatar.</li>
          <li>Change your password.</li>
          <li>Sign out.</li>
        </ul>
      </>
    ),
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    body: (
      <></>
    ),
  },
  {
    id: "tess-integration",
    title: "Total Event System Solutions integration",
    body: (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2">Key</th>
            <th className="text-left py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/60"><td className="py-2"><kbd>/</kbd></td><td>Open global search</td></tr>
          <tr className="border-b border-border/60"><td className="py-2"><kbd>c</kbd></td><td>Create new item in the focused group</td></tr>
          <tr className="border-b border-border/60"><td className="py-2"><kbd>Esc</kbd></td><td>Close drawer or dialog</td></tr>
          <tr><td className="py-2"><kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Save a field while editing</td></tr>
        </tbody>
      </table>
    ),
  },
];

function HelpPage() {
  const [active, setActive] = useState(SECTIONS[0].id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 z-20 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold">W</div>
            WorkPlanOS
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            <BookOpen className="h-3.5 w-3.5" /> User manual
          </div>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                className={
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors " +
                  (active === s.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60")
                }
                dangerouslySetInnerHTML={{ __html: s.title }}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight">WorkPlanOS user manual</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Everything you need to use WorkPlanOS day-to-day, written in plain language. Skim the section list on the left, or read straight through.
          </p>

          <div className="mt-12 space-y-16">
            {SECTIONS.map((s) => (
              <section
                id={s.id}
                key={s.id}
                className="scroll-mt-24 help-prose"
              >
                <h2
                  className="text-2xl font-semibold tracking-tight border-b border-border/60 pb-2"
                  dangerouslySetInnerHTML={{ __html: s.title }}
                />
                <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-foreground/90">
                  {s.body}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-20 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold tracking-tight">Need more?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Admins and self-hosters can read the technical{" "}
              <a className="text-primary hover:underline" href="/USER_GUIDE.md" target="_blank" rel="noopener noreferrer">
                self-host &amp; admin guide
              </a>.
            </p>
          </div>
        </main>
      </div>

      <style>{`
        .help-prose ul { list-style: disc; padding-left: 1.25rem; }
        .help-prose ol { list-style: decimal; padding-left: 1.25rem; }
        .help-prose li { margin-top: 0.35rem; }
        .help-prose p.tip {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          border-left: 3px solid hsl(var(--primary) / 0.6);
          background: hsl(var(--muted) / 0.5);
          border-radius: 0.5rem;
          font-size: 0.92rem;
        }
        .help-prose kbd {
          display: inline-block;
          padding: 0.1rem 0.45rem;
          border: 1px solid hsl(var(--border));
          border-bottom-width: 2px;
          border-radius: 0.35rem;
          background: hsl(var(--muted));
          font-family: ui-monospace, monospace;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}