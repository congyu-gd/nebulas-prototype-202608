# Nebulas — "Quiet Precision"

Design system notes. Records *why*, so decisions don't have to be re-derived.
The prototype is [index.html](index.html); the system lives in [css/](css/).

---

## Files

```
css/tokens.css       every color, size, duration. The source of truth.
css/base.css         reset, document defaults, .prose (model output)
css/components.css   reusable parts. None know where they sit on screen.
css/layout.css       the shell only: rail · sidebar · chat · results · apps
js/data.js           fixtures for every surface
js/app.js            routing, section renderers, the builder, the results
                     store, the app panel, simulated turns
index.html           shell markup; everything inside is rendered by app.js
v1-single-file.html  the earlier single-file conversation-only prototype

styleguide.html      the system, rendered: every token, every component state
css/styleguide.css   that page's shell only — no specimen selector is in it
js/styleguide.js     the specimen list, held to two audit rules
tools/audit.py       the rules, as a check. python3 tools/audit.py

nebulas-cloud.html   deployment setup — an independent page on the same tokens
css/install.css      its shell only: menu · configuration · usage views
js/install-data.js   the twelve deployment modules, as configuration
js/usage-data.js     the two usage perspectives, as seeded measurements
js/install.js        the initialisation dialog, menu, configuration and views
```

`nebulas-cloud.html` shares `tokens.css`, `base.css` and `components.css` with
the workspace and nothing else — no shared script, no shared layout.

Which makes the class names in `components.css` a namespace two pages live in,
and taking a name a page shell already uses breaks that page silently. It has
happened once: a `.menu` popover added for the results column landed on the
cloud page's `<aside class="menu">`, whose own rules in `install.css` could not
override properties they never declare — the left column inherited
`position:fixed` and `opacity:0` and disappeared, taking the grid with it. The
popover is `.popmenu` now. A component that belongs to one page is named in
that page's stylesheet; a component in `components.css` checks both pages
first.

Plain `<script src>`, not modules, so `file://` works with no server.
Load order matters: `data.js` before `app.js`.

## The system, as rules

Everything below this section is *why*. This is *what*, in the form a decision
can be checked against. [styleguide.html](styleguide.html) renders it — 117
tokens and 78 specimens, on its own theme and density switches — and
[tools/audit.py](tools/audit.py) enforces the parts a page can break silently.

**Four layers, and a value belongs to exactly one.**

```
tokens.css       every colour, size, duration     — the only place values live
base.css         reset, document defaults, type, .prose
components.css   page-agnostic parts, every page
<page>.css       that page's shell (layout · install · styleguide)
```

**One name, one owner.** A component in `components.css` may not take a name a
page shell already uses, and a page shell may not name a component. When two
pages need the same part it moves up under one name; when one page needs a
variant it takes a modifier. A page may *extend* a component with a state
(`.chip[aria-pressed]`) or place it in a context (`.projwrap .section`), but
re-declaring the bare block claims the name — which is exactly how `.menu`
deleted the cloud page's left column and `.barlist` silently redefined a shared
geometry.

**`block__element--modifier`**, lowercase, no abbreviations for new blocks:
`.cols__bar`, not `.cols__b`; `.barlist`, not `.bl`.

**A component does not know where it sits.** `.statusbar` describes a strip; the
page says `grid-row:2`. `.kpi` is a tile; the page decides what sits under the
row of them. The moment a component names a grid position it only works in pages
that have one.

**A component contains what it positions.** If a block positions any part of
itself absolutely, the block is the containing block — otherwise the part anchors
to the document and no longer belongs to the component at all. `.switch` had a
hidden `input` positioned this way and no `position` of its own, so every switch
left an absolutely positioned box at its static position in the document: nothing
visible, but scrollable overflow that no pane can clip, which is enough to make an
in-page anchor scroll a whole shell instead of the column the reader is looking
at. One line on the block, and it is contained.

**Colour is spoken for.** The accent means *you can act* or *the model acted* —
never decoration, and one per surface. App colour answers *which app* and lives
only on a tile. A status colour carries meaning in data and never in chrome, so a
measurement takes one only when it has crossed a limit somebody configured.
Everything else is a neutral.

**Mono means machine-generated** — tool names, timings, counts, paths, numeric
columns, ids. It is a reservation, not a style.

**Where a new thing goes.** Used by one page → that page's stylesheet. Used by
two → `components.css`. A value used twice → `tokens.css`. A state that does not
exist yet → the styleguide's list of gaps, so the system says what it lacks.

**What the check enforces** (`python3 tools/audit.py`):

| Rule | Failure |
|---|---|
| Colour lives in `tokens.css` | any hex or `rgba()` in another stylesheet |
| A class block has one owner | the same bare `.name` declared in two files |
| A glyph name has one drawing | the same name in two scripts, copied or diverged |
| The styleguide shows every token | a token declared and never rendered |
| The styleguide names only real classes | a specimen whose class exists nowhere |
| Raw px never increases | the total across known files going up |

The last one is a ratchet rather than a ban: 187 values remain, mostly 2–6px
optical offsets, and the number may only come down. Moving a rule between files
moves its values with it, which is why the comparison is a total rather than
per-file.

## The premise

An AI workspace is mostly chrome around content the model generates. The
interface cannot know whether it will wrap a table, a diff, a three-line
answer or two pages of argument. So the language recedes.

1. **One accent.** It means "the model acted" or "you can act" — send button,
   active nav marker, streaming caret, running-step dot, palette selection,
   the leading bar in a ranked list, focus ring. Never decoration.

   **App colour is the one exception, and it is a different language, not a
   second accent.** An app tile carries a colour and a glyph (`--app-1..5`)
   because a launcher is scanned, not read: ten neutral tiles differing only
   by two letters make you read all ten to find one. Colour there answers
   *which app*, never *act here* — which is why it appears on the tile and
   nowhere else: not on chrome, not on text, not on state. The two channels
   stay legible because they never occupy the same surface.

   **The design-element canvas is the other exception, and for the same
   reason.** Inside `.canvas__frame` a widget or website template carries the
   *customer's* brand (`--wgt-a`, chosen from the same six tokens). It is not
   our accent and not our identity — it is someone else's, quarantined to the
   frame. Outside that frame it does not exist.
2. **Separation by hairline, not shadow.** A 1px `--line` does the structural
   work. Shadows appear only on things that genuinely float: palette, toasts,
   the composer at rest.
3. **Small surface steps.** `--bg` → `--surface` → `--raised` → `--raised-2`
   are ~2% apart. Hierarchy comes from position and type, not contrast jumps.
4. **Mono means machine-generated.** Tool names, timings, token counts, file
   paths, numeric columns, app initials. That reservation is what makes the
   interface read as technical without any explicitly "technical" styling.

## Tokens

Components reference **semantic aliases only** (`--text-2`, `--line`), never
the raw ramp (`--g-600`). That indirection is why dark mode is a redefinition
of ~20 variables and nothing else changes.

Dark is not an inversion: `--bg` is `#0d0d0f` rather than black so elevation
has somewhere to go, and the accent lightens to hold contrast.

**The palette is scopable; the metrics are not.** `tokens.css` declares colour
on `:root, [data-theme="light"]` and the dark overrides on
`:root[data-theme="dark"], [data-theme="dark"]`, so putting `data-theme` on any
element re-themes that subtree — which is how a design element previews in dark
inside a light workspace. Type, space, radius and shell metrics stay in a
`:root`-only block: a scoped block that re-declared `--density` would silently
reset density inside the scope.

### Space and density

One 4px unit, multiplied by `--density`:

```css
--u:4px;  --density:1;
--s-4: calc(var(--u) * 4 * var(--density));
```

`:root[data-density="compact"|"roomy"]` changes one number and the whole
interface reflows. Verified: at compact/comfortable/roomy the row padding
goes 6.4 / 8 / 10px and the topbar 42 / 48 / 56px, from that variable alone.

This is the test that proves a space layer is real. Shell metrics
(`--rail-w`, `--list-w`, `--app-w`) are deliberately **not** scaled — an
icon rail sized to its icons shouldn't breathe with text density.

### Status colors

`--ok / --warn / --err` are dull on purpose. They carry meaning in data — the
variance column, agent run states, log levels, dataset health, an app that
needs attention — and appear nowhere in chrome.

---

## Layout

Six columns plus a status strip spanning all of them.

```
┌────┬───────────┬──────────────┬───────────────┬───────────┬────┐
│    │ Chat    ⌕ │ Q3 revenue…⁘ │ ▤ FY25 bridge │ ▣ Todo  × │ ⊞  │
│ ▣  ├───────────┼──────────────┼───────────────┼───────────┤APPS│
│ ▫  │ + New chat│  YOU         │ TODAY         │ 2 of 6    │ ⬤ │
│ ◑  │ ◈ Assist. │  │ Pull Q3…  │ ▤ Q3 variance │ ☐ Send…   │ ⬤ │
│ ▤  │ ⏱ Schedule│              │   Table 17:03 │ ☐ Confirm…│ ⬤ │
│    │ PROJECTS +│  NEBULA 3.4s │ ▦ pipeline.py │ ☑ File…   │ ⬤ │
│    │  Q3 close │  ▸ 3 steps   │   Diff  16:05 │           │ ⬤ │
│    │ TODAY     │  Q3 landed…  │ YESTERDAY     │           │ ⬤ │
│ ⌄  │  Q3 rev…  │  ▤ Q3 var…   │ ▥ Churn model │           │ ⬤ │
│ ◕  │  Refac…   ├──────────────┤   Chart 14:05 │           │ ⌄ │
├────┴───────────┤ [ ask… ]     ├───────────────┴───────────┴────┤
│ ● ready  Nebula Pro       16k/200k  $0.24  Light  Comfortable  │
└────────────────────────────────────────────────────────────────┘
  56      264       fluid        440 (drag)     380 (on demand) 64
```

- **Rail** — Chat & tasks · Knowledge · Build · Cloud, then Account at the
  foot, separated by a rule. Buttons are generated from the section registry.
  Its surface sits one step off the sidebar's (`--rail-bg`), so the two left
  columns read apart without a second border between them. The mark is the
  logo itself, with no tile behind it; its outer ring is `currentColor` so it
  survives the dark rail.
- **Sidebar** — content changes per section. In Chat it is the pinned
  actions, then projects, then threads.
- **Chat** — `--measure` caps the reading column at 760px for prose; data
  views use the full width.
- **Results** — see below. Draggable boundary, 320–720px, width persisted.
- **App panel** — zero-width until an app is opened, and then a column like any
  other: it pushes the conversation rather than covering it — see below.
- **App rail** — the workspace's own apps. Never collapses; the chevron widens it
  to show names rather than opening a screen of its own.
- **Status strip** — spans all six columns, because usage belongs to none
  of them.

Every column but the two rails collapses to zero through a data attribute on
`.app`, which redefines its width token rather than restating the whole grid
template. Build widens the sidebar the same way
(`.app[data-section="build"]`), so a section can change the shell without
anything in it knowing a pixel.

The three collapsing widths are **registered** (`@property`, `<length>`) and the
shell transitions *those* rather than `grid-template-columns`: interpolating a
whole track list to move one column animates every column whenever any one of
them changes. Where `@property` is unsupported the panels snap, which is the
right fallback.

### The right column is one store for everything produced

Previously a table or diff rendered inline, inside the message that produced
it. That is fine for one artifact and wrong for a working session: the thing
you are reading scrolls away the moment you ask a follow-up question, and a
long output pushes the next turn off the screen entirely.

So output leaves the thread, and the column that receives it is a **store**, not
a viewer. Its resting state is a **list of names**, and a detail is one click
away. That is the shape the column has to have once a session produces more than
one thing: a viewer showing the most recent output makes everything before it
unreachable.

The store is **global** — every thread's results in one list, newest first,
under the day they happened on:

```
┌─ Results ───────── 6 ─┐        ┌─ ‹ Q3 variance by segment ⤓⤒ ─┐
│ TODAY                 │        │ 🔗 People in Gnomon Digital ·  │
│ ▤ Q3 variance  🔗16:23│  click │    can view · expires in 7 days│
│ ▦ pipeline.py    15:25│ ─────► │ Enterprise            $22.4M   │
│ YESTERDAY             │        │ Mid-market            $12.8M   │
│ ▥ Churn model    13:25│        │ SMB                    $4.6M   │
└─ 6 results · 1 shared ┘        └ table · 4 rows · Today 16:23 · │
                                   from Q3 revenue analysis ──────┘
```

It was per-thread first, and that was wrong twice over. A new chat opened on an
empty column while six real results sat one click away in other threads; and
people look for **the thing they made**, not for the conversation it happened
in — "the variance table" is easier to remember than which of four threads
produced it. So the thread became a property of the result (`from`, shown on
every row and clickable in the footer) rather than a filing cabinet around it.

- **A timestamp, not an age.** Every result carries `at`, a real millisecond
  stamp; the day is a heading and the row says the time. Fixtures are authored
  as an age (`2d 5h`) and converted once at boot, because a hand-written date
  rots on the shelf. The stamp is when the result **first settled** — sorting a
  table it already produced is not a new result, and a list that reshuffles
  itself under the reader is a list nobody trusts.
- **The type is named** on every row (Table, Chart, Document, Form, Source) and
  again in the footer, because two results from the same thread otherwise look
  identical.
- **The column opens itself when there is something in it, and only then.** With
  no explicit choice it stays shut while the store is empty, and the first
  result filed opens it. An explicit toggle still wins both ways — opening an
  empty column is how you reach the empty state — and emptying the store hands
  the choice back so the next result opens it again.
- **The header names the result in the detail view**, and "Results" in the list.
  This reverses an earlier decision: with an index in front of the detail, the
  list is no longer on screen to say which of six results you opened.
- A turn that produces a definite artifact still leaves a one-line **reference
  card** in the thread, so the answer and its output stay connected.

The panes per kind differ, and the difference is the point:

| Kind | Panes |
|---|---|
| Table | Result · Source |
| Chart | Chart · **Data** · Source |
| Diff | Diff |
| Doc | Document |
| Result (from a widget) | one — it *is* the outcome |

A chart gets its data table because a bar nobody can check is decoration. A
table artifact renders as a label against one muted value, with no column
headers — with two columns a header row only names what the rows say. The full
table survives where columns are worth labelling: the chart's Data pane.

### A result that cannot leave is a screenshot

Three ways out: a file, a link, and the bin.

**Download offers the formats the content can honestly take**, not a fixed list.
The first is the one the result already is; the menu is anchored to the button
that opened it and says what each format is for, because `.csv` and `.json` are
not a choice most people should have to translate.

| Result | Formats |
|---|---|
| Table, form, chart | `.csv` spreadsheet · `.md` table · `.txt` padded columns · `.json` a row per object · `.pdf` |
| Document | `.md` source · `.txt` markers stripped · `.pdf` |
| Snippet, diff | `.py` · `.js` · `.sql` · `.diff` as written · `.txt` · `.pdf` |

Every serialiser reads the result **once** — what is tabular about it, or what
its text is — so adding a format is a row in `formatsFor` rather than a branch in
five places. Files are assembled in the page and handed to the browser; nothing
is uploaded, and no format needs a library that is not here.

**Including the PDF, which is written by hand.** There are no dependencies in
this prototype, so `pdfBytes` emits PDF 1.4 itself: a text object per page,
Courier because a table that loses its column alignment is not a table any more,
Courier-Bold for the title and the header row, and an xref table whose offsets
are counted as the string is assembled. Bytes are WinAnsi — the typographic
characters this workspace actually uses (`—` `·` `€` `"`) have slots there, and
anything else becomes `?`, which is honest where the alternative is embedding a
font. Verified by rendering, not by inspection: macOS opens the output and the
columns line up.

Values are normalised on the way out — the typographic minus (U+2212) that
belongs in prose becomes an ASCII `-`, or the spreadsheet reads `−184,000` as
text (the same normalisation the table sort uses) — and the inline markers a
document carries for the prose renderer (`**`, backticks, `<code>`) are taken off
rather than printed.

### Deleting is undoable, so it does not need a dialog

A store you cannot delete from fills with mistakes, so a result can go: from the
list, where a hovered row reveals its own bin, and from the detail, where it sits
at the **far end of the footer**. That placement is deliberate — the header holds
the two actions that hand the result to someone else, and a destructive one
beside `Close` is one mis-click from being expensive. The footer holds the
record's own facts, and deleting the record belongs with them.

No confirmation dialog. Deletion is immediate and the toast that reports it
carries `Undo` for six seconds; asking someone to be certain about something they
can already reverse is what teaches people to click through dialogs. Undo
restores the record whole — its share state and its original timestamp included —
so it lands back in the same place in the timeline rather than at the top. A
shared result says what deleting it costs: *the shared link no longer opens*.

Two consequences worth stating:

- **A result a live widget still produces comes back** the next time that widget
  changes, because the widget is its source. The record is derived, and deleting
  a derivation does not delete what derives it.
- **Deleting the last result closes the column** — it has no claim on the width
  with nothing in it — and a reference card in an older turn whose result has
  been deleted says so rather than opening an empty pane.

**Share** is where the substance is, and the substance is not the link. A link
with no access control is not a share, it is a leak — so the dialog asks who may
open it *first*, and mints nothing until that is answered. Three audiences,
chosen because they differ in consequence rather than in wording:

| Who can open it | Means |
|---|---|
| Only you | the link opens for nobody else, inside the workspace or out |
| People in *the workspace* | signed in, any member — the default |
| Anyone with the link | no sign-in; a warning banner says so in those words |

Beside them: what they can do (view · comment) and when the link stops working
(24 hours · **7 days** · never). An expiry is the default because a result is a
snapshot of one moment in a conversation, and the conversation moves on.

Once a link exists, the access state is stated **where the result is read** — a
strip above the result naming the audience, the permission and the expiry, with
`Manage` on it, and coloured as a warning when the audience is the internet.
The list marks a shared result with a link glyph and counts them in the footer
(`6 results · 1 shared`). Stop sharing takes the link away and says what that
means. The URL is derived from the result id, not drawn at random: reopening the
dialog has to show the same link, or the one already sent is a lie.

### Panel priority

Six columns want more width than a laptop has, so each collapsible one has a
width below which it stops being worth the space it takes — `list: 1120`,
`art: 1400`. An explicit toggle overrides that; `null` hands control back to the
viewport. The results column is first to go because it is the only one that can
be re-opened from the content itself.

Two columns sit outside that ladder. The **app rail** never collapses: it is the
only way in to the apps. The **app panel** is not viewport-managed either — it is
opened deliberately, and what it takes, it takes from the conversation (see
*Which column yields*).

### Adding a feature

One entry in the `SECTIONS` registry in [js/app.js](js/app.js):

```js
evals:{
  label:'Evals', icon:'chart', listTitle:'Evals',
  list(body){ /* rows in the sidebar */ },
  head(){ return { title, sub } },      // chat-pane topbar
  main(body){ /* the chat pane body */ },
  composer:false,                       // bool, or a function for per-view
  miller:false                          // true hands the sidebar body to columns
}
```
…then add the key to `ORDER`. The rail button, routing, palette entry and
sidebar all follow.

Sidebar items are addressed as `"kind:id"` (`kb:k1`, `so:so3`) so one
selection slot per section can hold several kinds of thing without a second
state field.

## Where things landed

Removing a surface doesn't delete a need — it relocates it, and each one
should land next to the thing it affects.

| Was | Now |
|---|---|
| Inline artifact in the message | Artifact pane, with a reference card in the thread |
| Library section (own rail icon) | ~~Knowledge → Artifacts~~ → nowhere of its own. An artifact is addressed by the pane that renders it and the turn that produced it; a third list of the same objects was one nobody opened. The palette still finds them by name. |
| Sources panel | citation chips on the response that used them |
| Model routing | the composer, next to the message it governs — first-party or not, which is why the status strip's "Nebulas Pro" is the platform and the composer's label is the model |
| Token / cost readout | the status strip |
| Tool toggles | Cloud → Tools & permissions |
| Theme toggle (rail) | the status strip, beside density |
| Search button (topbar) | the sidebar header, as drawn |
| Sidebar toggle (topbar) | `⌘\` and the palette — a column you are looking at needs no button to say so |
| App-rail close button | the topbar toggle, which is always on screen |
| Artifact title (pane header) | ~~the content itself; the header names the pane~~ → back in the header. Once the pane became a list of results, the header is the only thing that can say which one you opened |
| Copy artifact | gone — the Source pane is selectable text |
| "Nothing here yet" empty thread | the hero: a question, two modes, and starters |
| Cloud → Connections as its own fixture | derived from `CONNECTORS`. Configured in Build, reported in Cloud — one object, two views, because two lists of the same endpoints drift on the second edit |
| Solution "Composition" read-out | the solution builder: the same facts, but editable, plus the checklist that says whether they add up to something shippable |
| Build → Skills, Build → Agents | gone. A skill is chosen inside an assistant; scheduled runs are Chat → Schedule. Neither needed a page of its own, and six flat groups made the sidebar unnavigable |
| Build's folding groups | Miller columns. An accordion asks you to manage what is open; columns just show the path you are on |
| Build → Connectors | Cloud → Connections, as an index whose rows open the connector. Build grants one; Cloud connects it |
| An assistant's definition living only in Chat | Build → Assistants. Chat still chooses one; the definition has an address of its own, and the two write to the same record |
| Results scoped to the open thread | one global store, sorted by day. The thread is a property of the result, not a cabinet around it — and a new chat no longer opens on an empty column while six results sit one click away |
| The results column open by default | open only when there is something in it. The first result opens it; emptying the store closes it |
| A result you could only look at | download in a format the content can take (csv · md · txt · json · pdf), share behind an access choice, or delete with an undo |
| One format per result, chosen for you | a menu that says what each format is for. The PDF is written by hand, since there are no dependencies here |
| App sheet floating over the page | a column of the shell. Opening an app takes width from the conversation instead of covering it, so nothing has to be dismissed before the page is usable again |
| App-rail toggle (`⌘]`, topbar) | the rail is permanent; the shortcut and the button now open the *panel*, on the app you had last |
| Apps as ten analytical solution front-ends | the workspace's own seven tools — calendar, two extractors, files, news, note, todo. What you want open beside a conversation, not another dashboard |
| `New project` as a toast saying "prototype" | a dialog that makes one. Name required, everything else optional, and one switch that turns the folder into something that produces a result on a schedule |
| A project you could open but not change | the same dialog, reopened from `Settings` in the project view. Create and edit are the same answers, so they are the same screen |
| A `Description` field | written from the settings and marked as written. Someone who has chosen what a project reads has already said what it is for |
| Knowledge and Assistant as open lists | folded rows that name what is chosen. A form you scroll before naming the thing feels like work |
| Help text under every setting, forever | hints with an `×` that retire after the dialog's first use, and a `?` in the header that brings them back |
| `New thread here`, as a button | the composer itself, borrowed into the project page. A button beside a box you can type in was two doors into one room |
| A thread called "New chat" for as long as it lives | named from its first message, cut to a row's width. A project's thread list was otherwise three rows of the same word |
| Four stat cards on the project page | ~~one line under the name~~ → the panel itself. Four cards for four small known numbers was a dashboard where a sentence would do; then the sentence became a column that says the same things and opens each one |
| The project's facts as page content | a panel with the sidebar's surface and hairline. It is a column of the shell, not a block of the page, because it names what you are working inside |
| The results column, open on a project page | closed on arrival, as a loan. Panel + box + results is three columns too many, and the results column is the one with a way back from the content |
| Projects as an undifferentiated list of folders | a row that carries the glyph its owner picked, a clock if it runs by itself, and a `users` mark if the workspace can see it. Personal is the default, so personal is what goes unmarked |

## The knowledge detail is tabbed

A base is six kinds of thing at once — the files in it, the tables and series
extracted from them, what the model derived from it, who may read it, and what
has happened to it. As one scroll that is a report; as tabs it is a place you
work.

| Tab | Holds |
|---|---|
| Files | the documents, selectable and sortable |
| Tables | tables extracted from those documents |
| Time Series | series, each with a sparkline and its cadence |
| Analysis | what the model has derived, and from which thread |
| Access | principals, roles and the scope each one sees |
| Activity | what happened to the base, most recent first |

Each tab takes a glyph as well as a label: six labels in a row read as a list,
six labels with glyphs read as a set of places. The selected tab takes the
system's selected surface (`--raised-2`) rather than a filled dark pill, and
only its glyph takes the accent — the same move the active rail marker makes.

**Base-level facts stay above the tabs.** Document count, embedding model, when
it last changed and how many assistants use it belong to the base, not to any
one view of it, so they do not move when the tab does.

**The tab survives switching bases; a selection does not.** You opened Files
for a reason, and it still applies to the next base. A set of picked rows
refers to rows that are no longer there.

Sorting is real, not decorative: Size sorts on a byte count and Date added on a
timestamp, both carried in the fixture beside the display string, because
`"2.1 MB"` and `"412 MB"` sort backwards as text. Ascending points up and
descending points down, from one rotated glyph so the two cannot drift apart.

## A project is a folder until you switch something on

A project is the only container in this workspace that people make for
themselves, so making one has to cost almost nothing: **type a name, press
Create.** Every other answer in the dialog is marked optional, and none of them
is a decision you are stuck with.

That is what lets one object be two things. With nothing filled in, a project is
a folder — threads you start in it stay together and the assistant, if there is
one, answers in all of them. Switch on **a result on a schedule** and the same
project is a small application: it runs without being asked and files what it
produces in the results column. Nothing in the interface announces which kind it
is, because the switch is the only difference.

**One screen, not a wizard.** A wizard implies the answers arrive in an order
that matters. Here only the name is required, so the form is ordered by how much
it changes what the project does:

| Answer | Why it is there |
|---|---|
| **Name** | the only required one, and the only text anyone types |
| **Icon** | eight glyphs naming kinds of work — General · Analysis · Engineering · Team · Ideas · Planning · Writing · Money |
| **Who can see it** | Personal or shared with the workspace, with the consequence stated under whichever is picked, and *this can change afterwards* said out loud |
| **Knowledge** *(folded)* | bases and datasets in one list, because both are "things it may read" |
| **Assistant** *(folded)* | bound to new threads here; a thread can still pick another |
| **Runs by itself** | the switch that decides which of the two things this is |

`Icon` and `Who can see it` sit side by side: stacked, two one-line choices push
the rest of the form another 90px down for no gain.

**The two list-shaped settings are folded shut**, because a list is tall and a
form you have to scroll before you can name the thing is a form that feels like
work. Closed, each row carries its name and *what is currently chosen* —
`Knowledge · Finance corpus · q3_ledger`, `Assistant · Board writer` — which is
the only thing a reader needs before deciding whether to open it. Native
`<details>`, so the keyboard and the accessibility tree get it for free, and the
summary is rewritten the moment the list inside is touched. Everything shut, the
dialog is 334px of body: one screen, no scrolling.

**Nobody writes the description.** By the time someone has said what a project
reads, who answers in it and whether it runs, they have already said what it is
for — a text field asking again is asking twice. So the description is composed
from the settings (`Produces a result every week, written by Board writer, from
Finance corpus and accounts_health.`) and rewritten on every save while it stays
automatic, which means it cannot describe a project that has since changed. The
project page marks it with one `?` naming its author. A description that came
from somewhere else — the fixtures' hand-written ones — is left alone.

**Instructions expire.** Each setting can carry one line saying what it does, and
that line is worth its space exactly once. So every hint has an `×`, the concept
banner has one too, and the whole set retires when the dialog is first closed —
one flag in `localStorage`, not a count of visits. The `?` in the dialog header
brings them back for anyone who wants the tour again, which is why they are
hidden rather than deleted. First open: 609px and five hints. Second: 334px and
none.

**Icons, not colours.** A glyph that names a kind of work is the cheapest way to
say what a project is for, and nine of them are a vocabulary. A colour picker
would be a second accent and a craft project.

**Three cadences: every day, every week, every month.** A fourth would be a cron
expression, and something that needs cron is a scheduled task, which Chat →
Schedule already holds. The cadence chosen states its own consequence
underneath — `daily 07:00 · next run in 14 h` — and the schedule row and the
project's `run` are kept as one fact in two places: saving the project writes the
row, switching the schedule off deletes it, and Chat → Schedule never lists a run
that no longer exists.

### A project page is a panel and a box

A project answers two different questions, and one long page answered neither. So
the page is split, and the split is not two columns of content — it is a **column
of the shell and a page beside it**:

```
rail │ menu (chat list) │ this project │ ask it something
```

The panel on the left takes the sidebar's own surface and hairline, because it is
the same kind of thing: a fixed column naming what you are working inside. It
does not wrap under the content when the pane narrows — a panel that becomes a
full-width band is no longer a panel — it shrinks, and the composer's toolbar
wraps if the remainder gets tight.

**Each column is the height of the pane and scrolls inside itself**, the way the
sidebar does, so `.pane__body` gives up its own scrolling for this view
(`.pane__body--split`, reset on every render so the modifier belongs to the view
that asked for it). One scrollbar for the whole page would tie the two halves
together: reading to the bottom of a panel carrying channels, a queue, a
workflow, threads and results would drag the box off the screen, and the box is
what the page is for. Vertical centring stays `margin:auto 0` rather than
`justify-content:center` for the same reason it always did — auto margins
collapse to zero once the content is taller than the column, so Auto program's
form scrolls from its top instead of being clipped at both ends.

**What the panel says, in the order it says it.** The three facts that are true
of the project itself — its **name** under the glyph its owner picked, the
**description** written for it, and **who can see it**, as the control that
changes it — then the three that decide what an answer will be: the
**assistant**, the **knowledge** (a base is documents, a dataset is a table, and
the row says which), and the **workflow**: when it runs, the script it runs, and
`Run now`. Then what has happened: **threads**, then **results**.

**Every row is a door.** The assistant opens its record, a base opens in
Knowledge, a dataset opens beside it, a thread opens, a result opens in the
results column, and anything the project has not got — no assistant, no
knowledge, no workflow — opens the settings dialog at the place that would fix
it. A fact you can act on is worth more than a fact you can read.

**The results column closes when you arrive.** A project page already has a panel
and a box; the results column is the third column too many, and it is the one
with a way back from the content itself. So arriving borrows it — the same loan an
open app makes — and leaving hands back exactly what was borrowed, including an
explicit choice made before the loan. `⌘.` on a project page ends the loan, and so
does a result filed by `Run now`: the reader has just been given the column, and
leaving should not take it away.

**Three modes, because a project is asked for three kinds of thing.** The
right-hand side is one column of one thing, centred in whatever room is left, and
the modes are the only heading it needs:

| Mode | What it is |
|---|---|
| **Work** | the box, and four questions worth asking this project — what it produces on a schedule, its assistant's own examples, its first source |
| **Data** | the same box, pointed at the tables: `Profile q3_ledger — columns, ranges, what is missing`. Every suggestion names a source this project actually reads, because "profile a table" is a tutorial and "profile q3_ledger" is a question |
| **Auto program** | not a question, so not a box: what the project should produce, how often, and `Save` · `Run now` · `Turn it off` |

The same control the empty thread's hero uses, for the same reason — a mode says
what you are here for before you have written anything. It belongs to the project
you opened rather than to you, so opening another one starts at Work.

**The box is the way in** in two of the three. It is *the* composer, borrowed into
the page the way the hero borrows it, not a second input that can do less —
attach a file, bind an assistant, route a model, `⌘↵`. Only its placeholder
changes, and `detachComposer` hands that back along with the node. Auto program
has no question to type, so the section predicate hides the composer outright
rather than leaving it pinned under a form.

**Auto program is the same program the dialog holds**, editable where you are
looking at it: the three cadences, the script, and the schedule row kept in step
by the same `syncProjectRun`. Turning it off is undoable for six seconds — the
rule the results column, the project bin and this now share — and saving rewrites
the generated description, since what a project produces is most of what it is.

**Borrowed, it is dressed down.** In a thread the composer is the surface you are
working in: full column width, raised on a shadow, accent border on focus. On a
project page it is one part of the page, so it is 540px rather than 760,
left-aligned with everything else, flat, and its focus ring is grey. The accent
says *this is the thing you are using*, and on a project page that is the page.

**The suggestions are the project's own.** What it produces on a schedule, then
its assistant's own example questions, then a question about the first source it
reads — and for a project with none of that, three generic openers. A click puts
one in the box rather than sending it, because the point of putting it there is
that it can be edited first.

**Centred, and centred properly.** The column is centred horizontally by the flex
box and vertically by `margin:auto 0` rather than `justify-content:center`, which
clips the top of anything taller than the pane instead of scrolling it.

Sending from a project page opens a thread in the project and puts the message in
it, which is the one thing the submit handler has to know: every other surface
already has the thread its turn belongs to. The project's assistant is bound at
the same moment, so the answer comes back under its name.

There is no `New thread here` button any more. A button next to a box you can
type in was two doors into one room — and the box is the door that carries the
message. A thread that arrives this way **takes its title from its first
message**, cut to a row's width, because "New chat · New chat · New chat" in a
project's thread list is a list of nothing.

**`Run now`, because a weekly project is hard to believe in on a Tuesday.** It
produces a real record in the global store — timestamped, downloadable,
shareable, deletable — under the project's name rather than a thread's. The
project view lists what it has produced, so the loop closes where it started.

**Deleting keeps the threads.** They outlive the folder they were filed in, so
they return to History and the toast says how many. Undoable for six seconds,
which is why there is no confirmation dialog — the same rule the results column
follows.

### A project that publishes

*Social publishing* is the worked example of a project that writes outward as well
as reading inward: posts for Facebook, Instagram and LinkedIn, and the weekly read
on what any of it did. Two optional fields carry it, and a project without them is
exactly what it was before.

**A channel names a credential; it does not hold one.** `channels` points at the
`CONNECTORS` row that holds the endpoint, the auth and the scope, because
connecting a system is administrative and Cloud → Connections is where that lives.
The project reports the state of the connection rather than owning it: one fact in
one place, the rule the schedule row already follows. Clicking a channel opens its
connector page; the state travels back the other way, so connecting from the
project updates Connections and connecting in Connections updates the project.

**The connect action is where the problem is noticed.** LinkedIn ships
disconnected, and the person who sees that is looking at the project, not at the
admin surface — so `Connect LinkedIn` is offered in the panel and again inside the
post that cannot go out, rather than a sentence telling somebody to go elsewhere.
Undoable for six seconds, like everything else that changes state.

**A queue, because writing and sending are different acts.** A post is drafted,
reviewed and only then scheduled, and the gap between those is where a review
happens — so `queue` holds each post with its channel, its time and one of
*draft · needs review · scheduled*. Opening one is the only thing on this page
that is neither a question nor a setting, which is why it gets a dialog: the text,
the channel it was written for, when it leaves, and the button that lets it. The
character count is that channel's limit rather than a generic one, because a post
written for one channel is the only one that can be counted honestly. `Rewrite it
in the box` hands the draft to the composer, so editing by asking and editing by
typing are the same door.

**A channel that is not connected reports nothing, not zero.** The weekly result
says `not measured` for LinkedIn and `li_page_analytics` is marked stale, because a
zero would read as "nothing worked" rather than "nothing was measured" — the same
distinction the cloud page's usage views make.

**The modes divide the same way the work does.** Work is writing (draft this
week's three posts, adapt one channel's post for another), Data is the three
insight tables (compare reach and engagement, which post beat its channel average,
why one source is stale), and Auto program is the Monday report. The suggestions
name this project's own channels and tables, because "draft a post" is a tutorial
and "draft this week's three posts" is the job.

## Assistants: filter the list, shortlist the ones you use

Sixteen assistants is past the point where a grid is read rather than scanned,
so the view is a filtered list beside a shortlist:

- **Filter tabs** — `All`, `Favourites`, then one per team, each carrying its
  count so the size of a pile is known before it is opened. Same `.tab`
  component as the knowledge detail; a filter and a section are the same
  gesture, so they should not be two controls.
- **The favourites column** is fixed at 240px. It is a shortlist, and a
  shortlist that grows with the viewport stops being one. Below 1080px it stops
  being a column and becomes a section.
- **Starring is not decoration.** The favourites column *is* what the composer
  offers, so starring an assistant and putting it within reach of the next
  message are the same act. That is why the column is headed **In the
  composer** rather than "Favourites" — the header names the consequence, not
  the gesture.

A favourite is one glyph in two weights (outline, then filled in the accent)
rather than two glyphs, so the states cannot drift out of shape.

**In the composer**, the assistant button opens a popover of favourites,
anchored to the composer rather than the viewport, and carries a count so an
empty picker is visible before it is opened. Picking one drops a chip into the
composer's chip row — beside the attachments, because an assistant governs the
message, the same reason model routing lives there.

Two consequences of binding one, both deliberate:

- **Attachments die with their message; the binding does not.** The chip row is
  cleared on send and the assistant chip is put back.
- **A bound assistant answers under its own name** in the turn header, instead
  of the model's. That is what binding one means; the model it routes to is
  still shown in the composer.

### Clicking one opens the record, over the list

A card says enough to tell two assistants apart. It does not say enough to trust
one with a question — which model, at what temperature, what it may call, what it
may reach, and what it was told to do. So the card opens an **overlay** on the
list rather than navigating anywhere:

```
┌─────────────────────┬──────────────────────────────────────────┐
│ ▣ Revenue analyst   │ Configuration  Logs  Activity  Access  × │
│ bcf853b6-e2c6-…     ├──────────────────────────────────────────┤
│ ID: f1633f7f-bad6-… │ MODEL CONFIGURATION                      │
│                     │  ✦ Nebula Pro           Temperature 0.2  │
│ Answers from the    │ CAPABILITIES ⓘ                           │
│ finance warehouse…  │  warehouse.query  Read the warehouse     │
│                     │   ( Q3 ARR by segment, plan vs actual )  │
│ ( Q3 ARR by segm… ) │  code.run         Run Python over it     │
│ ( Which segments… ) │ TOOLS ⓘ    Snowflake · Drive · corpus    │
│ Gnomon · Cong Yu    │ INSTRUCTIONS ⓘ                           │
│ Last updated 14 Aug │  Answer from the finance warehouse…      │
└─────────────────────┴──────────────────────────────────────────┘
```

An overlay because of *why* it was opened: to decide whether this is the one you
want and then get on with asking it something. A page would put a back button
between the decision and the question.

- **Identity on the left, configuration on the right.** The left column is the
  record — glyph, name, both ids, what it is for, what to ask it, whose it is,
  when it last changed. It is 340px because a uuid shown with an ellipsis in it
  is a uuid nobody can read back over a call, and both ids copy on click.
- **Two identifiers, because they answer different questions.** The endpoint id
  is what an API call addresses; the record id is what a support ticket quotes.
  Both are generated from the record id rather than hand-written, so they are
  the same on every reload — a fixture uuid that changes when someone edits the
  file is one nobody can quote.
- **A capability says what it is called, what it is for, and what to ask it.**
  The name is the skill (`warehouse.query`); the line beside it is the short form
  — the long behavioural contract stays on the skill's own record. Under it sit
  the examples.
- **Tools are grants, so they show the kind of system and whether it can
  write** — a glyph per kind rather than a vendor logo, because in a list of
  grants what matters is *what kind* of thing it can reach. The knowledge base
  sits with them: it is the one source every answer is allowed to cite.
- **Logs and Activity are simulated, and say so.** They are derived from the
  record — the skills it has, when it was last edited — rather than drawn at
  random, so the same assistant shows the same runs twice and the list can be
  talked about. Times are laid out unevenly on purpose: calls seven minutes apart
  to the second are a template, not a log.

### An example is the way out of the overlay

The examples are the interaction, not decoration. Clicking one **closes the
overlay, binds the assistant, lands in a thread and leaves the question in the
composer** with the caret in it. Three steps become one, which is the whole
argument for the overlay in the first place.

It stops short of sending. The point of putting a question in the box rather than
running it is that it can be edited first — and unlike a starter on the empty
thread, this text is a *template* for the reader's own question, not a worked
case with an answer waiting behind it.

Where it lands: the thread you were in if you were in one, otherwise the first
empty thread, and only then a new one — clicking three examples in a row should
not leave three "New chat" rows in the sidebar. The examples appear twice, in the
identity column and inside their capability, because the two answer different
questions: *what can I ask this?* and *what is this capability for?*

Every assistant has them, written per assistant. "Run a query" is not an example.

## Build is where things are made, and it has one shape

Build holds **three** kinds of thing: the **assistant** that answers, the
**solution** that ships it, and the **design setting** it renders as. The first
cut of this section had six, and six flat lists came to forty-six rows — a
sidebar you scroll to navigate is not a sidebar. What went, and why it did not
need a page:

| Was a group | Now |
|---|---|
| Skills | chosen inside an assistant, never authored. A skill's signature and body are platform facts, not something a builder edits, so the pick list is the whole interaction. |
| Agents | scheduled runs are already visible in Chat → Schedule. Two lists of "things that run on a clock" was one too many. |
| Connectors | Cloud → Connections. Connecting a system is an administrative act, usually by a different person than the one composing an assistant. Build *grants* a connector; Cloud makes the grant mean something. |

### The sidebar is Miller columns

Build navigates the way a Finder column view does — kind, then item, then the
thing itself:

```
┌──────────────────┬───────────────────────┬──────────────────────────┐
│ ◈ Assistants   › │ ASSISTANTS      16  + │  Revenue analyst         │
│ ▣ Solutions    › │ ┌ Mine ┬ Teams ┬ All┐ │  ┌ form ────┬ inspector ┐│
│ ▤ Design set…  › │  Revenue analyst      │  │ name…    │ becomes   ││
│                  │  Code reviewer        │  │ skills…  │ test      ││
│                  │  Support triage   Ana │  └──────────┴───────────┘│
└──────────────────┴───────────────────────┴──────────────────────────┘
   --mill-w 176      the rest of --list-w      the pane = last column
```

- **Two columns in the sidebar, not three.** The last Miller column is the
  *preview* of the selected leaf, and here that preview is the whole builder —
  form plus inspector. Repeating it in a narrow third column would be a worse
  version of something already on screen.
- **The section widens the shell**, it does not restate it:
  `.app[data-section="build"] { --list-w: var(--list-w-mill) }`. `render()`
  stamps `data-section` on `.app`; one token changes and the grid follows, the
  same move density makes.
- **Selecting a kind returns you to where you were in it** (`state.build.last`),
  the way reopening a folder does. It never lands you on an empty pane.
- **Only a hairline divides the columns.** A second surface step would make the
  left column read as chrome rather than as the first column.
- The kind row carries a glyph, a name and a chevron — no count. Three counts
  nobody asked for cost the labels their width, and the item column's head
  carries the count for the kind you are actually in.

### The scope filter

- **It answers the two questions a list this size provokes**: *where is the one
  I made* and *what has the rest of the company built*. Hence `Mine · Teams ·
  All`, at the top of the item column because it governs what is below it.
  Ownership is stored on the record as `owner: 'me'`, so the filter needs no
  notion of the signed-in user beyond the label.
- **The count says how much of the pile is showing** — `16` unfiltered,
  `7/16` filtered.
- **Your own things are not labelled as yours.** The row shows an owner only
  when it is someone else's, so the column stays quiet for the common case, and
  the page head repeats it as `Ravi · Support` next to the state badge.
- **The filter never hides the row you are on.** `scoped(list, keep)` keeps the
  current selection in the list even when it falls outside the scope: a filter
  one row loose beats a selection with no visible home.
- Scope starts at `All`. A filter that hides content on arrival reads as missing
  content.

Every build surface is the same two-part shape — `.build`:

| Left (`.build__main`) | Right (`.build__side`, 288px, sticky) |
|---|---|
| the thing being built | what it becomes, and the one action that commits it |

Config on the right is where anyone who has used a design tool looks for it,
and it leaves the wide column to the thing itself. Below 1080px the inspector
stops being sticky and becomes the last section. The inspector's buttons are
the only full-width controls in the app: a commit should not have to be aimed
at.

**Selection is a checkbox; a setting is a switch.** Which skills an assistant
composes is a selection (`.picklist`, whole row as the target). Whether it
cites every claim is a setting (`.switch`). The distinction is not cosmetic —
one is a list you are assembling, the other takes effect as you touch it.

### An assistant is defined in Build and chosen in Chat

One record, two verbs. Nothing is duplicated: starring in Chat and editing here
write to the same object, the assistant card in Chat carries an **Edit in
Build** button, and the builder's **Test in a thread** binds the assistant and
opens a new one. The palette lands on the definition, because that is the
address that can do both.

Two gaps are shown rather than hidden:

- **A skill an assistant names but the workspace has not defined** stays in the
  list, marked *not defined in this workspace*, with a banner saying calls to it
  will fail at run time. Filtering it out would turn a broken assistant into a
  tidy one.
- **A connector granted but not connected** is allowed. A grant states what the
  assistant will need; the connection is a separate act, on a separate page,
  usually by a different person.

### Connectors hold credentials, never data

So the page has no preview — there is nothing to look at, only what it may
reach and who reaches through it. `usedBy` is **derived** (assistants whose
`conn` contains it, solutions that require it), never stored: the builder mutates
these objects, so a cached list of dependents would be wrong by the second edit.
The same connector is *reported* in Cloud → Connections and *configured* here;
two fixtures for one endpoint would have drifted immediately.

Disconnecting leaves every grant in place, and the toast says how many just
stopped working. Grants do not disappear when the connection does.

### Design elements: two kinds, one canvas

A **widget** is embedded in a page someone else owns; a **website template** is
the page. `shape` picks the renderer, `cfg` is what the inspector edits.

| Shape | Reads as |
|---|---|
| `kpi` | one number, its delta, the period |
| `chart` | a value over a sparkline whose last bar takes the brand |
| `ask` | a question field and the three questions worth starting from |
| `rows` | a ranked list where the bar *is* the score |
| `portal` | signed-in page: side nav, card grid |
| `landing` | public page: one claim, three supports, one action |
| `docs` | three columns — what exists, what you are reading, where you are |

**A template preview is a wireframe, not a mockup.** Bars stand in where text
goes, so the reader judges the layout instead of reading placeholder prose. Only
one nav line takes the brand: branding all of them would say every page is the
current one.

**Theme is a real decision, not a preview toggle.** `Follow` inherits the host
page; `Light` and `Dark` stamp `data-theme` on the frame and fix it. The widget
ships its own tokens, which is why it can look like itself inside a page whose
CSS we have never seen — and why the scoped palette in `tokens.css` had to exist.

### A solution is publishable, or it says why not

The checklist is the substantive part. A solution binds an assistant, the skills
it may call, the knowledge it may cite, the connectors it needs, what it renders
as, and where it reaches — all by id, so it cannot claim a part that does not
exist. Publish is disabled until every line is met, and the button's tooltip
names the first gap.

Two of the six checks are conditional, which is the whole point:

- **Design element** is required only if a chosen surface *renders*. `App rail`,
  `Embedded widget` and `Public website` need one; `Webhook` and
  `Scheduled digest` answer in JSON and do not. That is why `SURFACES` carries a
  `renders` flag rather than a description.
- **Skills** must be a subset of the bound assistant's. One it does not have
  would ship a call that cannot resolve, so the row reads *not on Revenue
  analyst* rather than being quietly droppable.

The chosen design element is previewed inside the solution, because that page
is where someone decides what the answer looks like and a name is not enough to
decide from. Publishing bumps the minor version and states every surface it went
to.

## An app is a column, not a layer

Clicking an app used to navigate to the solution behind it, which meant opening
a calendar cost you the conversation you were having. The fix after that was a
fixed sheet floating against the rail — better, but still a layer over the page,
with a shadow, and something you had to dismiss before the width underneath was
usable again.

So an app is now **a column of the shell**. Opening one takes width from the
conversation instead of covering it:

- **It is part of the grid** (`--sheet-w`, 0 when closed), not `position:fixed`.
  No shadow and no scrim, because it is not floating above anything — the only
  thing between it and the chat is the same hairline every other column uses.
- **Both halves stay usable.** The composer is still on screen while an app is
  open, which is the whole point: files attach to the next message, a headline
  writes the question into the composer, an extraction files a result.
- **The rail is permanent.** It is the only way in to the apps, and a launcher
  you have to summon is one nobody uses — so the topbar toggle and `⌘]` now open
  the *panel*, on whichever app you had last. The rail's own chevron still widens
  it to show names.
- **The tile is a toggle** and the rail marks which app is open, so swapping apps
  is one click rather than close-then-open. `Esc` and the header's close dismiss.

### The apps are the workspace's own tools

Seven of them, and deliberately ordinary: a calendar, two extractors, files,
news, a note, a todo list. These are the things worth having open *beside* a
conversation. (Published solutions reach this rail through the App-rail surface;
none of the fixtures is installed, which is what the builder's `Open` button
says when it is disabled.)

**Flat inside the column.** The panel is already the container, so the cards
inside it go flat: no border, no tinted head, no inset body — a section is a
heading on the panel's own background, rows bleed their hover inset so their
text lines up with the headings, and one hairline (the same `--line` every
column boundary uses, including the panel's own left edge) separates a
section from the next. A box inside a box inside a column was three edges
saying "here is a thing" once each; the only boxes that remain are the ones
that mean something — a dashed upload target, a tinted banner, an input.

Seven surfaces cover the seven, each assembled from components that already
exist elsewhere — an app is a new arrangement, not a new vocabulary:

| Surface | Built from | Apps |
|---|---|---|
| `agenda` | a week time grid + a month grid over one event list, and an Upcoming list | Calendar |
| `cvx` | an upload box, a candidate list, and behind each candidate the resume itself | CV extractor |
| `invx` | the same two screens with a second way in — the camera — and the list as a ledger | Invoice extractor |
| `files` | rows that attach to the next message | My files |
| `news` | rows that wrap, unread marked, that ask the thread about themselves | News |
| `note` | a list plus a `textarea`, first line as title | Note |
| `todo` | `.picklist` rows with real checkboxes, a count and a meter | Todo |

**The calendar is generated from the clock**, and the fixture marks events by
their offset from today rather than by date — a calendar pinned to August 2026
is wrong by September. It is two views over one list: **Week** is a time grid,
seven day columns against an hour ruler, and **Month** is the day grid — the
arrows move whichever unit is on screen and a `Week · Month` seg switches. One
token, `--week-hour`, sizes the whole grid, and it sits on the density scale
rather than the control scale: an hour is area to read, not a control to hit.
The gutter's rows *are* the vertical scale — the day columns stretch to them,
so the ruler and the events cannot disagree. In a column the width of the app
panel a day is about forty pixels, so the grid only answers *when is the day
busy*; the **Upcoming** list under it answers *what*, and each block carries
its full fact in its tooltip. The calendar is also where the colour rule gets
tested: an event is a surface step with a strong leading edge, a marked day a
neutral dot, today a tinted column or an inset hairline. None of it is the
accent, because **a date is not an action**. The grids themselves are doors:
an empty week slot drafts an event on that day at the clicked hour, a month
day drafts on that day, and an event — a block in the grid or a row in
Upcoming — opens for editing. All of them land in **one form** asking the
three things that make an event — what, when, how long — differing only in
what the fields start as and whether `Remove` (undoable) is on the table;
`New event` in the Upcoming header is the same form for a day you would
rather name than click. Whatever is added or changed lands in the panel's own
list and nowhere else, which the footer says out loud: the panel mirrors a
work calendar this prototype cannot write to. Sync says the same thing when
clicked — nothing upstream to fetch, so it reports being a mirror instead of
pretending.

**The CV extractor is a tray and a reading room, two screens deep.** The
first screen is the tray: an upload box (from a fixed pretend set — an upload
is simulated here like every reply, and the box says so), one `Extract` for
everything waiting, and a candidate list where a row is a person once read
and a filename until then. Clicking a candidate goes one screen deeper, to
**the resume itself** — name, title and location as a header, a summary,
experience with dates, education, what they work with — with one control, the
way back to the list. The first pass at this surface showed a "Fields" table
and a "Skills found" card; both were extraction furniture standing between
the reader and the person, and the word *field* meant nothing to the reader
anyway. What remains of the extraction's honesty is the one thing that needs
a human: a notice period inferred from prose carries a `check` badge and a
note saying so, and the footer names the file each resume was read from.

**The invoice extractor has the same two screens, but its list is a
ledger.** Candidates are compared by reading them; invoices are compared by
their numbers — so where the CV list is names, the invoice list is a table:
vendor, issue date, total, the totals right-aligned in the mono hand. Two
ways in — a picture from disk, or a capture from the computer's camera —
each fed by its own pretend pool, so the two buttons keep meaning two
different things. An undigitised row holds its filename where the vendor
will be and `—` where the total will be: the columns say what `Digitise` is
about to fill in. A row opens as **the invoice itself** — vendor, number,
issued and due, then the amounts re-added at the bottom the way the paper
adds them, the total ruled off — with one way back to the ledger. A due date
the frame cropped out reads `—` with a `check` badge and a note saying
retake or fill it by hand: a guess would be worse than a gap. Neither the
upload nor the capture is real, and both say so where they happen.

**Anything the reader can change lives in `APP_STATE`**, seeded from the fixture
once and owned in JS after that — the same rule as a chat widget's state. A
ticked box, a typed note and a headline marked read survive switching apps,
changing section and coming back. A fixture the interface writes into is a
fixture that lies after the first click.

Two of the apps produce **results**, and they go where every other outcome goes:
`fileResult` puts an extraction in the results store under a name, so a CV read
in a panel is filed, shareable and downloadable exactly like a table a thread
produced. Its `from` is the app rather than a thread, which is why the detail
footer only offers navigation when the origin *is* one.

### Which column yields

Four columns can be open at once and only one of them is the conversation. On a
laptop, the results column and an app panel cannot both have their width: at
1560px, both open leaves the chat at 356px, narrower than either of them.

So opening an app **borrows** the results column when the conversation would
otherwise drop below 560px, says so in a toast that names the shortcut back, and
returns it when the app closes. It is a loan, not a decision made on the
reader's behalf — and asking for the results column yourself ends the loan, so
closing the app cannot undo what you just asked for. For the same reason, a
result filed while an app is open is announced but does not seize the width.

## The empty thread

A new chat is the one moment the reader is deciding what to ask, so the pane
does not spend it saying the thread is empty. It shows the question, the two
modes it can be asked in, and starters that **run a worked example**. The
workspace opens here rather than on the last conversation — history is one click
away in the sidebar.

**A starter runs its case; it does not type a word into the box.** The first
version wrote the label into the composer and left the reader to press Send,
which is half an offer: someone opening this to evaluate it needs a way *into* a
conversation, not a head start on writing one. Clicking one now names the
thread, streams a real turn, and lands something to act on. The chip carries a
play glyph and the question as its tooltip, and a line under the row says what
will happen — a button that runs something should say so before it is pressed.

**The composer still sits in the hero, directly under the starters** — a starter
is the shape of a message, and the place a typed one lands should be the next
thing beneath it. It is the *same node*, moved: the composer carries bound listeners, so
anything that clears the pane hands it back to its pinned position first
(`detachComposer`) rather than rebuilding it. Inside the hero it drops the
gradient and the pinned padding; on the first turn it returns to the foot of
the pane, because from then on it is a bar over a scroll.

Mode (`Work` / `Data Discovery`) is view state, not app state: it dies with the
empty thread. The first turn replaces the hero with the reading column, since a
centred block and a measured column are different layouts, not one layout with
content added.

### Data Discovery carries dashboards

Asking about data produces something that outlives the question, so the mode
holds those things below the input: one card per dashboard, each bound to one
source, with its two headline figures, a sparkline whose last bar is the
current value, and the source name in mono.

**A dashboard can only be built on a source the user holds a grant on.** The
picker lists each source with the grant beside it (`q3_ledger · Editor`), so it
says what you may *do* with a source rather than only that you may see it. The
sources you cannot use are **named, not hidden** — "3 sources shared with you.
`renewals_export` is not." A picker that silently omits them reads as a missing
source rather than as a permission, and the user is left wondering whether the
data exists.

A new dashboard starts with a flat sparkline rather than an invented one: it
has measured nothing yet. The mode also stops centring itself once dashboards
are below the input (`.hero--tall`), because vertical centring with more
content than height clips the top.

## A turn can hand back something to act on

Most answers are read. Some of them should be *worked*, and a prototype that
only renders prose cannot be tested for the thing it is actually for. So a
scripted case can end in a **live widget** — one per turn, deliberately, because
two things to act on in one answer means neither gets acted on.

| Kind | The interaction | Where it turns up |
|---|---|---|
| `form` | fill fields, add rows, undo the last one | Sales insight — add the new admin |
| `quiz` | choose an answer; the outcome is built from what was chosen | Slide, CV filter, Explain a metric |
| `chart` | switch series; negative bars take the loss colour | Visualization, Chart a trend |
| `table` | sort any column, numerically where the column is numeric | Explanation, Profile a table, Find anomalies |
| `code` | switch runtime or dialect, copy | Documentation, Join two sources, generated scripts |
| `program` | edit the cadence — or the trigger — and the steps, then create it | Auto program — routines and workflows |
| `element` | preview with Build's own canvas, name it, create it | Auto program — "a widget showing…" |

**Answering has to change something**, or a questionnaire is a form nobody
completes. The outcome block appears when the last question is answered and is
assembled from the answers — `{1}` in the outcome text is the first answer, and
`outcomeBy` lets one answer select a different outcome entirely (three deck
shapes, three real outlines). Clicking a chosen answer again clears it: an answer
you cannot take back is one people hesitate to give.

**The chosen option takes the accent.** This is the one-accent rule working, not
an exception to it — choosing is exactly the "you can act / you acted" the accent
is reserved for.

### A routine becomes a program

The hero's third mode reads a plain sentence — *"every morning, check the
weather and my calendar, then write me a briefing"* — as a program. The reading
is a **parse, not understanding**: cadence words pick the cadence, the joins
people actually say split the steps, a stated time becomes a free-text cron
override. That would be a dangerous thing to act on, which is exactly why it is
not acted on: the parse lands in an editable widget, the footer says *not
created yet — nothing runs until you press Create*, and the person who wrote
the sentence approves the reading of it before anything exists anywhere.

Three decisions worth recording:

- **A program's result is `null`.** Every other widget files its outcome in the
  results column; a program's outcome is the schedule row it creates, and
  filing a document about it would put the same fact in two stores. The row
  *is* the record.
- **`createProgram` is the first writer of `steps`.** Jobs existed only as
  fixtures until this mode; a multi-step routine becomes a job, a one-step
  routine a task, and the row's `thread` points back at the conversation that
  described it — the schedule's Chat cell is a door to where the words were
  said.
- **Cadence stays a short choice.** One time · Every day / week / month, plus a
  free-text clock the schedule already accepts (`daily 07:40`, `once Fri
  17:00`); picking a cadence by hand in the widget discards the parsed clock,
  because the seg is now the truth. This is the standing refusal of cron, kept.
  Recurrence has to be *said* — "every", "daily" — or the sentence reads as a
  one-time ask: assuming daily would create work nobody ordered. A one-time row
  that has run shows no next run; it stays, because its history is the record
  of what it did. One time exists only here — a project that "runs by itself"
  is recurring by definition, so the project surfaces keep the three.

Created, the widget freezes into a record and a door — the row is the fact,
and two editable copies of one program would drift. Undo removes the row *and*
re-arms the draft: one fact, both halves together.

### Scripts, widgets, workflows — same door, three more makers

One sentence, four possible things. **Intent is detected, not asked** — a
when-clause anchored at the start is a workflow, "script" is explicit, widget
words pick the element maker, and everything else is the routine it always
was. A kind picker would put one more question between the sentence and the
draft; the parse is cheap to correct because every draft is editable.

**No new stores.** Each maker writes into the home its thing already had:

- A **script** is what a simulated prototype can honestly generate — a
  *skeleton*, each parsed step a named function with a TODO body, `main()` in
  order, the header quoting the ask so the file remembers where it came from.
  It rides the existing code widget, which already files itself in the results
  column; `CODE_EXT` turns the visible runtime into `.py` or `.sh`. No Save
  button, because that would file the same fact twice.
- A **web widget** becomes a design element in Build, previewed in the turn
  with `designCanvas` itself — the preview *is* the element, not a picture of
  one. The chat widget edits exactly one thing, the name: Build's inspector
  already edits everything else, and two editors of one element drift. Its
  placeholder values say they are placeholders ("Bound to a source in Build").
- A **workflow** is an event-triggered job: the program widget asks *When*
  instead of how often, and the row's cron is the trigger as free text
  (`on a ticket arrives`) — legal since before this mode existed, a fixture
  has run `on webhook` all along. Its next run says *when it fires*, because
  an event's next run is not a time anyone can compute, and saying one would
  be a guess wearing a clock.

The element widget returns `null` from `liveResult` for the same reason the
program does: the design record is the outcome, and the fallback branch reads
`w.variants`, which neither has — the same shipped crash the program's guard
was built for.

### The widget stays; its outcome is what leaves

An earlier version let you move the widget itself into the right column. That was
the wrong object to move: the widget is where the *working* happens, and the
place the question was asked is where the thing you are working on belongs. What
should travel is the **outcome**.

So a widget is filed, not relocated. The moment its output is settled it appears
in the results column under a name:

| Widget | Settled when | Filed as |
|---|---|---|
| Form | at least one row added | the rows |
| Questionnaire | every question answered | the outcome, as a document |
| Chart | immediately; re-filed when you switch series | the chosen series |
| Table | immediately | the table |
| Code | immediately; re-filed when you switch runtime | the chosen variant |

**Settled is a real condition, not a timer.** An unanswered questionnaire and an
empty form have no outcome, so they have no result — and undoing the last row
takes the result away again. `liveResult(w)` returns `null` and the record is
dropped, which is also why the pane falls back to the list if you were reading
the result that just stopped existing, and why the column can close itself: a
store with nothing in it has no claim on the width.

A result appearing where there was none is also the moment the column has
something to show, so that is when it opens — including after an undo took the
last one away and a second answer brought one back. The toast fires **once** per
widget: announcing every row added would train people to ignore it.

None of this needs the widget to move, because **widget state lives in the
instance, never in the DOM** (`LIVE[id]`). Half-typed fields, chosen answers, the
sorted column and the selected series survive being rebuilt — after a re-render,
or after you navigate to Build and come back.

One more consequence worth stating: **a turn is now written into the thread.**
Before this, simulated turns lived only in the DOM and were lost on navigation —
fine for a scripted demo, useless for a tester who wants to fill a form, look at
something else, and come back to it.

### A user turn sits on the right

It was a left-ruled block, on the argument that a user turn is a record of input
rather than a bubble. That was right about the styling and wrong about the
position: side is the cheapest possible way to say who spoke — no label to read,
no colour to decode — and every messaging surface a reader already uses puts
their own words on the right.

So it moves right and keeps its restraint: a quiet `--raised` block at
`min(78%, 54ch)`, not a saturated bubble. The accent is reserved, and a filled
bubble would make the shortest turn on screen the loudest thing on it. The text
inside stays left-aligned, because right-aligned prose is harder to read, and the
`YOU` label with its row actions flips to follow the block rather than sitting
across the empty half of the column.

## Turn structure

1. **Tool trace** — collapsed by default, showing step count and duration.
   Nobody reads it until something goes wrong, and then they read all of it.
2. **Body** — one claim per bullet, so citation and disagreement both have
   somewhere to attach.
3. **Artifact reference** — a single line pointing at the pane.
4. **Citations** — a hairline-separated chip row.

## Interaction notes

**Streaming.** The full markup is built first, every text node emptied, then
refilled progressively. Blocks reveal only once they have content, so nothing
reflows as text arrives — the visible difference from naive token-appending.
The caret rides the block being filled, so it sits at the true end of the text.

**Scroll-follow** is instant, not smooth, and engages only when the reader is
within 260px of the bottom. CSS smooth scrolling restarts its animation on
every append and perpetually lags the caret.

**Resizing.** The artifact boundary is a pointer-captured grip kept fully
inside the pane, so the pane can still clip itself shut. Width is stored, not
recomputed per session. Arrow keys move it 24px when focused.

**Tooltips.** Styled `.tip` everywhere except controls sitting on a clipped
edge — the app rail scrolls, and a CSS tooltip cannot escape a scroll
container. Those use a native `title` instead. The two columns that never
collapse (`rail`, `chatpane`) stay `overflow:visible` so their tooltips can
reach open space.

**Keyboard.** `⌘K` palette · `⌘↵` send · `⌘\` sidebar · `⌘.` results column ·
`⌘]` app panel · `⌘J` theme · `/` focus composer · `Esc` dismiss. The palette
merges threads, apps, projects, assistants, knowledge, sources, results,
solutions and commands into one ranked list.

## The cloud page has two kinds of page

Eleven of its pages answer *what should exist*. Two answer *what happened*, and
the difference is load-bearing: a configuration page has a state (`Configured`),
a footer that moves you to the next one, and a place in `0 / 12 modules`. A
usage page has none of those. It has a window and a scope instead, and its
footer says `Read-only — usage is measured, not configured`. Making them look
alike would promise a Save button that cannot exist.

The menu carries four groups now, and **Platform Usage Monitoring** is the
first of them — ahead of Foundation, Platform and Operations. A deployment is
configured once and read every day afterwards, so the pages you come back to
are at the top and the twelve steps are underneath, still in dependency order
among themselves. The page a fresh visit lands on is Cloud Usage for the same
reason. Grouping reads a `phase` field off each page rather than slicing the
array by index, which is what it used to do and what broke every time a module
was added.

Both views show **example data from the first visit**, before any tenant
exists — this is a prototype, and a reader who opens a dashboard should see what
it reports rather than an empty state describing what it would report. The
header badge carries the caveat instead: `Example data` until the tenant is
created, then `Shared with tenants` or `Internal only` from module 08's switch.

### A dashboard that invents its own limits says nothing

Every threshold on both pages is read from a module: the budget and its alert
thresholds from 12, the availability SLO and the p95 objective from 08, the
quotas from 12, the metered dimensions from 07, the models and the routing
strategy from 05, the GPU pool from 03. Change the monthly budget and the spend
bar re-grades itself; deselect a provider and it leaves the model table. The
lookup is by module id, group title and field label — not by index — so a field
can move without silently reporting the wrong number.

Two consequences worth keeping:

- **Cards report their own misconfiguration.** Untagged spend is `$0` when
  module 12 blocks untagged resources and a real number when it does not.
  Failover counts are the only evidence that module 05's fallback choice works.
  A dimension that is consumed but not metered is named as unbillable.
- **Windows have to agree.** Spend follows the range picker, but the budget in
  module 12 is monthly, so the budget card stays on the month and says so.
  Comparing a quarter's spend to a monthly budget would have read 300%.

Figures come from a seeded PRNG keyed on view, range and scope — not
`Math.random`, so the same page draws the same numbers on every render, and a
series that has a real ceiling is clamped to it. A utilisation chart that
reports 130% is a chart nobody trusts again.

### Employee usage is aggregate until you ask

An adoption page is one bad decision away from being a surveillance tool, so the
defaults do the arguing: departments and totals are the view, individual rows
are hidden behind a button, and revealing them is not remembered — it is an act
for a purpose, not a preference. The page reports counts and categories and
never contents, which is also all it *could* report, since module 05 leaves
prompt logging off. What is collected, how long module 08 keeps it, and who can
see it are a card on the page rather than a policy elsewhere. The fixture people
are fictional for the same reason.

### The chart vocabulary

Seven card kinds cover both pages: `kpi · thresh · cols · bars · table · facts ·
note`. All of it is inline SVG and CSS — no chart library, same as everything
else here.

Charts are grey. The accent still means "you can act", so a bar may not borrow
it, and a value takes colour only when it has crossed a limit somebody
configured — which is the one case where status colour is the fact being
reported. A tile that went green for "as expected" would make the exceptions
harder to find, which is why the green came back out again after the first pass.

## Scope of the prototype

- Responses are **simulated from a fixed script**. The eleven starters run
  written cases; anything typed cycles two canned replies. No network calls.
- Row-level actions (retry, branch, export, launching an app) fire a toast.
- Live controls: theme, density, model, panel state, artifact width, tabs,
  New chat, every build form, and the live widgets — form, questionnaire, chart,
  sortable table, code — each filing its outcome into the results column as it
  settles. The rest are visual only.
- Turns are held in memory for the session. Nothing is stored except theme,
  density, artifact width and the app-rail state.

## Next

- ~~`styleguide.html` — render every token and every component state as an
  enforceable contract.~~ Resolved: the page exists, and `tools/audit.py` holds
  it to the system. What is still missing is coverage — 78 of the 269 classes in
  `components.css` have a specimen, and the rest are composites (`.tpl`,
  `.canvas`, `.live`, `.detail`, `.palette`) that need a page around them to mean
  anything. A seventh rule reporting that percentage would say so out loud.
- The states that are still missing: loading, permission-denied, failed tool
  call mid-turn, an artifact that fails to render, zero search results. They are
  listed in the styleguide as gaps now, which is not the same as building them.
- ~~The app rail is a launcher with nowhere to launch to.~~ Resolved: apps open
  as a sheet beside the rail. What is still missing is any *state* inside one —
  every app surface is read-only, and a queue you cannot triage from is a report.
  The live widgets in the thread are the pattern to copy: state in the instance,
  and an outcome filed under a name.
- A live widget cannot be produced by a typed message, only by a scripted case.
  A tester who writes their own question gets prose, which makes the widgets feel
  like a rail rather than a capability.
- Results are never removed by hand and never renamed. A store you cannot prune
  is a store that stops being read.
- Keyboard traversal of the sidebar, and focus management when the palette
  closes.
- Build has no draft state and no version history. Edits apply as you make them,
  which is honest for a prototype and wrong for a product: publishing a solution
  should promote a draft, not mutate the live thing in place.
- A design element cannot yet be previewed against real data from the solution
  that renders it — the fixture values are typed into the inspector, so a widget
  can claim a number its assistant could not produce.
