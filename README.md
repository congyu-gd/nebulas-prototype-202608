# Nebulas

Front-end prototypes for an enterprise AI workspace. No build step, no
dependencies, no network calls — open a file in a browser and it runs.

| Page | What it is |
|---|---|
| [index.html](index.html) | The workspace: rail · sidebar · conversation · results column · app panel · app rail |
| ↳ **start here** | Open a new chat and click a starter — each one runs a worked case ending in something you can fill in, answer or sort, and whatever it settles on is filed in the results column on the right, which can hand it back as a file (csv · md · txt · json · pdf, offered from what the content can take), as a shared link behind an access choice, or delete it with an undo |
| [nebulas-cloud.html](nebulas-cloud.html) | Cloud setting — twelve-module enterprise deployment, gated by a tenant-onboarding dialog, plus two usage perspectives that grade it against its own settings |
| [styleguide.html](styleguide.html) | The design system, rendered — every token and every component state, with theme and density switches. The section list is a column beside the specimens, each side the height of the viewport and scrolling on its own, and the list says which section you are in. Loads `components.css` only, so anything that needs a page's stylesheet to look right shows up as broken |
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
js/icons.js          one glyph set, for every page
css/styleguide.css   the styleguide's own shell
js/styleguide.js     the specimen list
tools/audit.py       the system's rules, as a check
```

Plain `<script src>` rather than modules, so `file://` works with no server.
Load order matters: `data.js` before `app.js`.

Every page shares `tokens.css`, `base.css`, `components.css` and `js/icons.js`
and nothing else — no shared layout, no shared control layer. Dark mode and three
interface densities are a redefinition of about twenty variables; everything else
follows.

`python3 tools/audit.py` checks the six rules that keep it one system: colour
only in `tokens.css`, one owner per class name, one drawing per glyph name, every
token shown in the styleguide, no specimen naming a class that does not exist,
and a raw-pixel count that only goes down. It has already caught a class
collision that had shipped, an icon the two pages drew differently, and a bar
that painted nothing.

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
(only you · the workspace · anyone with the link). It starts closed and opens
itself the moment something new is filed — a store earns its width when it
receives, not on arrival — and `⌘.` or the topbar toggle is always the reader's
own choice over that default.

A **project** is made with one answer: type a name and press Create. Everything
else in the dialog is optional and changeable afterwards — an icon from nine
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

Its page is a **panel and a box**, and each side is the height of the pane and
scrolls on its own, like the sidebar — reading to the bottom of the panel leaves
the box where it was. On the left, a column with the sidebar's own
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

One project is a worked example of publishing rather than only reading:
**Social publishing** posts to Facebook, Instagram and LinkedIn and reports on
what any of it did. Its **channels** name the connectors that hold the
credentials — so connecting is done once and both the project and Cloud →
Connections read the same state, and the channel that ships disconnected offers
`Connect` in the panel and again inside the post that cannot leave. Its **queue**
holds what is written but not out, each post *draft · needs review · scheduled*;
opening one gives you the text, that channel's own character limit, when it goes
out, and `Rewrite it in the box` to hand the draft to the composer. Work mode
writes, Data mode asks the three insight tables what happened, and the Monday
program files the weekly channel report — which says `not measured` for the
channel that is not connected rather than showing it as zero.

The new-chat screen's third mode is **Auto program**: describe what should
exist, in plain words, and the reply drafts it. **Intent is detected, not
asked** — one parser reads which of four makers the sentence wants, and each
thing lands in its existing home rather than a new store:

- *"Every morning, check the weather and my calendar, then write me a
  briefing"* → a **program**: an editable widget with the cadence as a choice
  (one time, or every day, week or month — recurrence has to be said, so a
  plain "water the plants" reads as a one-time ask), every step as an input,
  and one action. Create writes a real row into Chat → Schedule — a job with
  steps when the routine has several, a task when it has one — whose Chat cell
  points back at the conversation that described it.
- *"When a ticket arrives, triage it, then post the summary to #support"* → a
  **workflow**: the same widget asking *When* instead of how often. The row's
  cron is the trigger (`on a ticket arrives`) and its next run says *when it
  fires* — an event's next run is not a time anyone can compute.
- *"A script that renames my photos by date, then moves them into folders"* →
  an **executable script**: an honest skeleton in Python and Bash — each step
  a named function with a TODO where the work goes, the header quoting the
  ask — filed in the results column, where it downloads as `.py` or `.sh` and
  Copy takes the runtime on screen.
- *"A widget showing my daily step count"* → a **web widget**: a design
  element drafted with Build's own canvas as the preview. The chat edits one
  thing — its name — because Build's inspector already edits everything else,
  and two editors of one element would drift. Create files a draft in Build →
  Design elements, embed snippet included.

Seven starters run worked examples of all four; free text goes through the
same parsers; and nothing runs, ships or leaves until Create is pressed — each
widget's footer says so out loud. The reading is a parse, not understanding,
which is why everything is editable before anything exists. When a created
program **runs** (Run now in its schedule overlay), the promise "in this chat"
is kept literally: the product is posted into the authoring thread as a turn —
the schedule's timeline quotes it, but the chat is where it is delivered — and
the toast's `Open the chat` lands on it.

**Chat → Schedule** is everything that runs without being asked, in two tables.
**Jobs** lead: a job is the workflow of its schedule — named steps that run in
order each time it fires — and its table is a tree, the twist folding the steps
out underneath. **Tasks** are one piece of work on a cron. Both say what the
last run **produced**, not just whether it ran, and both carry a **Chat**
column that is a door: a row that writes into a conversation names it and
clicking goes there, while a row that feeds a corpus or a channel says so
instead of pretending there is a chat to open. Any row opens its run history: a
timeline of runs, newest first, and each entry quotes **the product itself** —
the morning LinkedIn post as written, with its image, the digest as sent, the
report's headlines — because a run log answers "what did it make", and for
generated content the answer is the content. The images are inline SVGs drawn
from the design tokens, so they follow theme and density and nothing is
fetched; a copy icon under each post takes the text, markdown marks stripped,
ready for the platform's own composer. A failed run quotes nothing, since
nothing was made. Per-step outcomes for a job sit under the quote, and an `Open result`
door reads the full record right there in the overlay, so the results column
keeps whatever state it had. The
overlay's footer holds the two things you can do to the row itself: `Stop`
(reversible, `Resume` gives back the cron it had) and `Delete` (undoable from
the toast; deleting a project's program row turns the program off too, since
the two are one fact). A project's `Run now` appears in the history as well,
marked *on request*.

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
and sections. The calendar reads a week as a time grid or a month as a day grid
— arrows move whichever is on screen — with an Upcoming list naming what the
blocks can only place, and `New event` adds to the panel's own list: it mirrors
a work calendar it cannot write to, and says so.

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
