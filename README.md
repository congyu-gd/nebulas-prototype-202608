# Nebulas

Front-end prototypes for an enterprise AI workspace. No build step, no
dependencies, no network calls — open a file in a browser and it runs.

| Page | What it is |
|---|---|
| [index.html](index.html) | The workspace: rail · sidebar · conversation · results column · app panel · app rail |
| ↳ **start here** | Open a new chat and click a starter — each one runs a worked case ending in something you can fill in, answer or sort, and whatever it settles on is filed in the results column on the right, which can hand it back as a file (csv · md · txt · json · pdf, offered from what the content can take), as a shared link behind an access choice, or delete it with an undo |
| [nebulas-cloud.html](nebulas-cloud.html) | Cloud setting — twelve-module enterprise deployment, gated by a tenant-onboarding dialog, plus two usage perspectives that grade it against its own settings |
| [v1-single-file.html](v1-single-file.html) | The earlier conversation-only prototype, kept for reference |

```
css/tokens.css       every colour, size and duration. The source of truth.
css/base.css         reset, document defaults, .prose (model output)
css/components.css   reusable parts. None know where they sit on screen.
css/layout.css       the workspace shell and its overlays
css/install.css      the cloud page shell: menu · configuration · usage views
js/data.js           fixtures for every workspace surface
js/app.js            routing, section renderers, the results store, the app panel
js/install-data.js   the twelve deployment modules, as configuration
js/usage-data.js     the two usage perspectives, as seeded measurements
js/install.js        the cloud page's dialog, menu, configuration and views
```

Plain `<script src>` rather than modules, so `file://` works with no server.
Load order matters: `data.js` before `app.js`.

Both pages share `tokens.css`, `base.css` and `components.css` and nothing
else — no shared script, no shared layout. Dark mode and three interface
densities are a redefinition of about twenty variables; everything else
follows.

## Running it

```sh
open index.html
```

Or serve the folder if you want `localStorage` to persist between reloads
(Chrome restricts it on `file://` origins):

```sh
python3 -m http.server
```

## Design system

[DESIGN.md](DESIGN.md) records *why* — the one-accent rule and its two
exceptions, why the artifact moved out of the thread, why an app is a layer
rather than a destination, why Build puts the inspector on the right, and what
is still missing.

The **results column** on the right is one store for everything the workspace has
produced, whichever thread produced it — a day-grouped list with the time and the
type on every row, a detail one click away, and each result downloadable as the
format it already is or shareable as a link whose audience you choose first
(only you · the workspace · anyone with the link). It opens itself when a result
appears and stays shut while there are none.

A **project** is made with one answer: type a name and press Create. Everything
else in the dialog is optional and changeable afterwards — an icon from eight
naming kinds of work, personal or shared with the workspace, and two folded rows
for the knowledge it reads and the assistant that answers in it, each naming what
is chosen so you only open what you want to change. Nobody writes the
description: it is composed from those settings and rewritten when they change.
Leave the rest empty and a project is a folder. Switch on **a result on a
schedule** and the same project becomes a small application: every day, week or
month it produces a result and files it in the results column, `Run now` does it
immediately, and the run appears in Chat → Schedule. Sidebar rows say which is
which — a clock if it runs by itself, a `users` mark if the workspace can see it.
Each setting explains itself the first time and the hints retire once you have
used the dialog; the `?` in its header brings them back.

Its page is a **panel and a box**. On the left, a column with the sidebar's own
surface — the project's name, the description written for it, who can see it, then
its assistant, its knowledge (documents and tables), its workflow with the script
it runs and a `Run now`, then its threads and results. Every row is a door: the
assistant opens its record, a base opens in Knowledge, a result opens in the
results column. On the right, centred, three modes: **Work** is the composer
itself — borrowed, so attach, the assistant picker, model routing and `⌘↵` work as
they do anywhere — with four questions worth asking this project in particular;
**Data** points the same box at the tables it reads, naming them
(`Profile q3_ledger…`); **Auto program** drops the box for the program itself —
what to produce, how often, `Run now`, `Turn it off`. Typing in either box opens a
thread inside the project, binds the project's assistant, and names the thread
from what you asked. The results column steps aside while you are on a project
page and comes back when you leave.

In **Chat → Assistants**, clicking an assistant opens its whole record in an
overlay — model and temperature, capabilities with example questions, the systems
it may reach, and its instructions, plus logs, activity and access. Clicking any
example closes the overlay, binds that assistant and drops the question into the
composer, ready to edit and send.

The **app rail** on the far right is always there, and clicking a tile opens that
app in a panel *beside* the conversation rather than over it — a column of the
shell, so the chat compresses instead of being covered, and the composer stays on
screen. Seven apps: **Calendar**, **CV extractor**, **Invoice extractor**, **My
files**, **News**, **Note**, **Todo**. They are wired into the rest of the
workspace rather than being pictures of apps — a file attaches to your next
message, a headline writes the question into the composer, an extraction is filed
in the results column, and a ticked box or a typed note survives switching apps
and sections.

The workspace's **Build** section is the maker's half, and it has three groups:
**assistants**, **solutions** (with a publish checklist that says what is still
missing), and **design settings** — widgets and website templates, previewed
live as you configure them. Its sidebar is **Miller columns** — kind, then item,
with the builder itself as the last column — filtered on ownership
(`Mine · Teams · All`). Connectors live in Cloud → Connections, since
connecting a system is an administrative act; Build only grants one. Everything
references everything else by id, so a solution cannot claim a part that does
not exist.

The **cloud page** is twelve deployment modules in four menu groups, and the
first one — **Platform Usage Monitoring** — is a different kind of page. It
leads the menu, and a fresh visit lands there, because a deployment is
configured once and read every day after.
**Cloud Usage** reports requests, tokens, GPU hours, spend, availability and
p95, then ten cards under them: spend against the budget's own alert
thresholds, consumption by the dimensions module 07 actually meters, per-model
cost and failover counts, GPU utilisation against the pool module 03 defined,
quota pressure, error classes, chargeback by tag with untagged spend called out,
and the optimisations module 12 chose to surface. **Employee Usage** reports
seats against activation: who is active, by department, doing what, which seats
are dormant or held by leavers and what reclaiming them is worth. Every limit a
number is judged against is read from the modules, so changing the budget
re-grades the bar and deselecting a provider empties its row. Both show example
figures from the first visit, with `Example data` in the header until a tenant
exists. Both are read-only
— no Configured badge, no Save, and they stay out of `0 / 12 modules`. Employee
Usage is aggregate by default: individual rows sit behind a button, revealing
them is not remembered, and the page reports counts and categories rather than
anything anyone typed.

Responses in the workspace are simulated from a fixed script. Nothing leaves
the page.
