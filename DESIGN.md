# Nebulas — "Quiet Precision"

Design system notes. Records *why*, so decisions don't have to be re-derived.
The prototype is [index.html](index.html); the system lives in [css/](css/).

---

## Files

```
css/tokens.css       every color, size, duration. The source of truth.
css/base.css         reset, document defaults, .prose (model output)
css/components.css   reusable parts. None know where they sit on screen.
css/layout.css       the shell only: rail · sidebar · chat · artifact · apps
js/data.js           fixtures for every surface
js/app.js            routing, section renderers, the builder, artifact pane,
                     app sheets, simulated turns
index.html           shell markup; everything inside is rendered by app.js
v1-single-file.html  the earlier single-file conversation-only prototype

nebulas-cloud.html   deployment setup — an independent page on the same tokens
css/install.css      its shell only: menu · configuration
js/install-data.js   the twelve deployment modules, as configuration
js/install.js        the initialisation dialog, menu and configuration surface
```

`nebulas-cloud.html` shares `tokens.css`, `base.css` and `components.css` with
the workspace and nothing else — no shared script, no shared layout.

Plain `<script src>`, not modules, so `file://` works with no server.
Load order matters: `data.js` before `app.js`.

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

Five columns plus a status strip spanning all of them.

```
┌────┬───────────┬──────────────────┬───────────────┬────┐
│    │ Chat    ⌕ │ Q3 revenue…  ▣▤⁘ │ ▤ FY25 bridge │ ⊞  │
│ ▣  ├───────────┼──────────────────┼───────────────┤APPS│
│ ▫  │ + New chat│  YOU             │ step   amt  Δ │ ⬤ │
│ ◑  │ ◈ Assist. │  │ Pull Q3 rev…  │ actual 41.2 — │ ⬤ │
│ ▤  │ ⏱ Schedule│                  │ timing 39.8 ↓ │ ⬤ │
│    │ PROJECTS +│  NEBULA PRO 3.4s │ growth 41.9 ↑ │ ⬤ │
│    │  Q3 close │  ▸ 3 steps       │               │ ⬤ │
│    │ TODAY     │  Q3 landed at…   │               │ ⬤ │
│ ⌄  │  Q3 rev…  │  ▤ Q3 variance   │               │ ⬤ │
│ ◕  │  Refac…   ├──────────────────┤               │ ⌄ │
├────┴───────────┤ [ ask anything ] ├───────────────┴────┤
│ ● ready  Nebula Pro     16k/200k  $0.24  Light  Comfy  │
└────────────────────────────────────────────────────────┘
  56      264          fluid            440 (drag)     64
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
- **Artifact** — see below. Draggable boundary, 320–720px, width persisted.
- **Apps** — solutions as launchable surfaces. The chevron widens the rail
  to show names rather than opening a screen of its own. Clicking a tile opens
  the app **beside** the rail, not instead of the page — see below.
- **Status strip** — spans all five columns, because usage belongs to none
  of them.

Each of the four outer columns collapses to zero through a data attribute on
`.app`, which redefines its width token rather than restating the whole grid
template. Build widens the sidebar the same way
(`.app[data-section="build"]`), so a section can change the shell without
anything in it knowing a pixel.

The three collapsing widths are **registered** (`@property`, `<length>`) and the
shell transitions *those* rather than `grid-template-columns`: interpolating a
whole track list to move one column animates every column whenever any one of
them changes. Where `@property` is unsupported the panels snap, which is the
right fallback.

### Why the artifact moved out of the thread

Previously a table or diff rendered inline, inside the message that produced
it. That is fine for one artifact and wrong for a working session: the thing
you are reading scrolls away the moment you ask a follow-up question, and a
long output pushes the next turn off the screen entirely.

So the artifact goes in a pane that survives the next question, and the turn
keeps a one-line **reference card** you can scan past or click to bring the
thing back. Opening a thread restores the last artifact it produced.

The panes per kind differ, and the difference is the point:

| Kind | Panes |
|---|---|
| Table | Result · Source |
| Chart | Chart · **Data** · Source |
| Diff | Diff |
| Doc | Document |

A chart gets its data table because a bar nobody can check is decoration.

The pane header names the **pane**, not the artifact: an artifact says what it
is through its content, and the thread that produced it is already in the
footer. A table artifact renders as a label against one muted value, with no
column headers — with two columns a header row only names what the rows say.
The full table survives where columns are worth labelling: the chart's Data
pane.

### Panel priority

Four columns want more width than a laptop has, so each has a width below
which it stops being worth the space it takes — `apps: 900`, `list: 1120`,
`art: 1400`. An explicit toggle overrides that; `null` hands control back to
the viewport. The artifact pane is first to go because it is the only one
that can be re-opened from the content itself.

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
| Artifact title (pane header) | the content itself; the header names the pane |
| Copy artifact | gone — the Source pane is selectable text |
| "Nothing here yet" empty thread | the hero: a question, two modes, and starters |
| Cloud → Connections as its own fixture | derived from `CONNECTORS`. Configured in Build, reported in Cloud — one object, two views, because two lists of the same endpoints drift on the second edit |
| Solution "Composition" read-out | the solution builder: the same facts, but editable, plus the checklist that says whether they add up to something shippable |
| Build → Skills, Build → Agents | gone. A skill is chosen inside an assistant; scheduled runs are Chat → Schedule. Neither needed a page of its own, and six flat groups made the sidebar unnavigable |
| Build's folding groups | Miller columns. An accordion asks you to manage what is open; columns just show the path you are on |
| Build → Connectors | Cloud → Connections, as an index whose rows open the connector. Build grants one; Cloud connects it |
| An assistant's definition living only in Chat | Build → Assistants. Chat still chooses one; the definition has an address of its own, and the two write to the same record |

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

## An app is a layer, not a destination

Clicking an app used to navigate to the solution behind it, which meant opening
a calendar cost you the conversation you were having. So an app opens as a
fixed sheet against the rail that launched it:

- **It stops short of the rail** (`right: --app-w`), so the rail stays live and
  one app can be swapped for another in a single click. Clicking the open app
  again closes it — the tile is a toggle, and the rail marks which app is open.
- **No scrim.** The thread behind stays readable, which is the entire reason an
  app is a layer rather than a page. `Esc` and the header's close both dismiss.
- **It sits inside `.app`** so it inherits `--app-w` and lands flush against the
  edge when the rail is closed.
- **The solution is still reachable** from the footer. The app is the front end
  of a solution, not a replacement for it.

Six surfaces cover the ten apps, and every one is assembled from components
that already exist elsewhere — an app is a new arrangement, not a new
vocabulary:

| Surface | Built from | Apps |
|---|---|---|
| `ledger` | stat tiles + rows with a stated value | Revenue Cockpit, Forecast Studio, Pricing Lab |
| `queue` | stat tiles + rows with a badge | Churn Radar, Ticket Triage |
| `health` | `.barlist` meters + a source list with state dots | Pipeline Health, Data Quality |
| `calendar` | a month grid, marked days carrying a value | Renewals Desk |
| `note` | `.prose` | Board Digest |
| `search` | an input + a result list | Corpus Explorer |

The calendar is where the colour rule gets tested: a marked day takes a
neutral dot and a surface step, and today takes an inset hairline. Neither is
the accent, because **a date is not an action**.

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
| `code` | switch runtime or dialect, copy | Documentation, Join two sources |

**Answering has to change something**, or a questionnaire is a form nobody
completes. The outcome block appears when the last question is answered and is
assembled from the answers — `{1}` in the outcome text is the first answer, and
`outcomeBy` lets one answer select a different outcome entirely (three deck
shapes, three real outlines). Clicking a chosen answer again clears it: an answer
you cannot take back is one people hesitate to give.

**The chosen option takes the accent.** This is the one-accent rule working, not
an exception to it — choosing is exactly the "you can act / you acted" the accent
is reserved for.

### Moving a widget to the artifact pane

The widget's head carries one control, and it relocates the widget. Promoting it
uses the mechanism that already existed for artifacts rather than a second one:
the pane holds the widget, and the thread keeps the same one-line reference card
any other artifact leaves behind. The button reverses in the pane, so the trip is
symmetrical.

That is possible because **widget state lives in the instance, never in the
DOM** (`LIVE[id]`). Half-typed fields, chosen answers, the sorted column and the
selected series all survive being re-rendered in a different column — or being
rebuilt from scratch after you navigate to Build and come back. `rerender(w)`
repaints the widget wherever it happens to be, and nothing else on the page has
to know which of the two columns that is.

Two consequences worth stating:

- **The artifact record is created on promotion, not in the fixture.** Until
  someone moves it there is nothing to reference, so `D.ARTIFACTS` gains an entry
  (`kind: 'live'`) at that moment and loses it on the way back.
- **A turn is now written into the thread.** Before this, simulated turns lived
  only in the DOM and were lost on navigation — which is fine for a scripted
  demo and useless for a tester who wants to fill a form, look at something else,
  and come back to it.

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

**Keyboard.** `⌘K` palette · `⌘↵` send · `⌘\` sidebar · `⌘.` artifact pane ·
`⌘]` app rail · `⌘J` theme · `/` focus composer · `Esc` dismiss. The palette
merges threads, apps, projects, assistants, knowledge, sources, artifacts,
skills, agents, solutions and commands into one ranked list.

## Scope of the prototype

- Responses are **simulated from a fixed script**. The eleven starters run
  written cases; anything typed cycles two canned replies. No network calls.
- Row-level actions (retry, branch, export, launching an app) fire a toast.
- Live controls: theme, density, model, panel state, artifact width, tabs,
  New chat, every build form, and the live widgets — form, questionnaire, chart,
  sortable table, code — including moving one between the thread and the
  artifact pane. The rest are visual only.
- Turns are held in memory for the session. Nothing is stored except theme,
  density, artifact width and the app-rail state.

## Next

- `styleguide.html` — render every token and every component state as an
  enforceable contract, so `index.html` is a consumer of the system rather
  than its definition.
- The states that are still missing: loading, permission-denied, failed tool
  call mid-turn, an artifact that fails to render, zero search results.
- ~~The app rail is a launcher with nowhere to launch to.~~ Resolved: apps open
  as a sheet beside the rail. What is still missing is any *state* inside one —
  every app surface is read-only, and a queue you cannot triage from is a report.
  The live widgets in the thread are the pattern to copy: state in the instance,
  the same node renderable in either column.
- A live widget cannot be produced by a typed message, only by a scripted case.
  A tester who writes their own question gets prose, which makes the widgets feel
  like a rail rather than a capability.
- Keyboard traversal of the sidebar, and focus management when the palette
  closes.
- Build has no draft state and no version history. Edits apply as you make them,
  which is honest for a prototype and wrong for a product: publishing a solution
  should promote a draft, not mutate the live thing in place.
- A design element cannot yet be previewed against real data from the solution
  that renders it — the fixture values are typed into the inspector, so a widget
  can claim a number its assistant could not produce.
