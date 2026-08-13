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
js/app.js            routing, section renderers, artifact pane, simulated turns
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
template.

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
  composer:false                        // bool, or a function for per-view
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
| Library section (own rail icon) | Knowledge → Artifacts, next to the bases and sources |
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
modes it can be asked in, and starters that write themselves into the composer
directly below. The workspace opens here rather than on the last conversation —
history is one click away in the sidebar.

Mode (`Work` / `Data Discovery`) is view state, not app state: it dies with the
empty thread, because it only selects which starters are offered. The first
turn replaces the hero with the reading column, since a centred block and a
measured column are different layouts, not one layout with content added.

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

- Responses are **simulated from a fixed script**; two canned replies cycle.
  No network calls.
- Row-level actions (retry, branch, export, launching an app) fire a toast.
- Live controls: theme, density, model, panel state, artifact width, tabs,
  New chat. The rest are visual only.

## Next

- `styleguide.html` — render every token and every component state as an
  enforceable contract, so `index.html` is a consumer of the system rather
  than its definition.
- The states that are still missing: loading, permission-denied, failed tool
  call mid-turn, an artifact that fails to render, zero search results.
- ~~The app rail is a launcher with nowhere to launch to.~~ Resolved: apps open
  as a sheet beside the rail. What is still missing is any *state* inside one —
  every surface is read-only, and a queue you cannot triage from is a report.
- Keyboard traversal of the sidebar, and focus management when the palette
  closes.
