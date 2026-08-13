# Nebulas

Front-end prototypes for an enterprise AI workspace. No build step, no
dependencies, no network calls — open a file in a browser and it runs.

| Page | What it is |
|---|---|
| [index.html](index.html) | The workspace: rail · sidebar · conversation · artifact pane · app rail |
| [nebulas-cloud.html](nebulas-cloud.html) | Cloud setting — twelve-module enterprise deployment, gated by a tenant-onboarding dialog |
| [v1-single-file.html](v1-single-file.html) | The earlier conversation-only prototype, kept for reference |

```
css/tokens.css       every colour, size and duration. The source of truth.
css/base.css         reset, document defaults, .prose (model output)
css/components.css   reusable parts. None know where they sit on screen.
css/layout.css       the workspace shell and its overlays
css/install.css      the cloud page shell: menu · configuration
js/data.js           fixtures for every workspace surface
js/app.js            routing, section renderers, artifact pane, app sheets
js/install-data.js   the twelve deployment modules, as configuration
js/install.js        the cloud page's dialog, menu and configuration surface
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

[DESIGN.md](DESIGN.md) records *why* — the one-accent rule and its single
exception, why the artifact moved out of the thread, why an app is a layer
rather than a destination, and what is still missing.

Responses in the workspace are simulated from a fixed script. Nothing leaves
the page.
