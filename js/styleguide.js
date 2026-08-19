/* ============================================================================
   styleguide.js — the system, stated.

   DESIGN.md records why a decision was made. This renders what the decision
   was: every token, and every component in the state it is used in. It loads
   tokens.css, base.css and components.css and nothing else, which is the whole
   test — a specimen that needs a page's stylesheet to look right is not a
   component, and here it will look wrong.

   tools/audit.py holds this file to two rules: every token declared in
   tokens.css appears here, and every class named here exists in the shared
   layers. So the page cannot fall behind the system without the check failing.
   ========================================================================= */

/* ==================================================================== tokens
   Grouped as tokens.css groups them, and rendered by kind: a colour gets a
   swatch, a length gets a bar, a duration and a metric get their value. */
const TOKENS = [
  { g:'Neutrals', kind:'swatch', note:'The ramp. Nothing outside tokens.css may name one of these — components read the semantic aliases below.',
    items:['--g-0','--g-50','--g-100','--g-150','--g-200','--g-300','--g-400',
           '--g-500','--g-600','--g-700','--g-800','--g-900'] },
  { g:'Surfaces', kind:'swatch', note:'Four steps, about 2% apart. Hierarchy comes from position and type, not from contrast.',
    items:['--bg','--surface','--raised','--raised-2','--line','--line-strong'] },
  { g:'Text', kind:'swatch', items:['--text','--text-2','--text-3','--text-4'] },
  { g:'Inverted', kind:'swatch', note:'Tooltips and toasts. Flips wholesale in dark.',
    items:['--inv-bg','--inv-text'] },
  { g:'Rail', kind:'swatch', note:'The rail sits one step below the sidebar in light and below --bg in dark, because a recessed column reads as further away there.',
    items:['--rail-bg','--rail-active'] },
  { g:'Accent', kind:'swatch', note:'One accent. It means "the model acted" or "you can act" — never decoration. --accent-fg-soft is for the one thing that sits on the accent and still needs a surface: the ⌘↵ badge.',
    items:['--accent','--accent-hi','--accent-fg','--accent-soft','--accent-line','--accent-fg-soft'] },
  { g:'App identity', kind:'swatch', note:'An identity channel, not emphasis: it answers "which app", never "act here", which is why it appears on a tile and nowhere else.',
    items:['--app-1','--app-2','--app-3','--app-4','--app-5','--app-6','--app-fg'] },
  { g:'Status', kind:'swatch', note:'Dull on purpose. These carry meaning in data — a variance column, a run state, a value past its limit — and never appear in chrome.',
    items:['--ok','--ok-soft','--warn','--warn-soft','--err','--err-soft'] },
  { g:'Scrim', kind:'swatch', items:['--scrim'] },
  { g:'Shadow', kind:'shadow', note:'Only things that genuinely float. Separation is a hairline everywhere else.',
    items:['--shadow-sm','--shadow-md','--shadow-lg'] },
  { g:'Type', kind:'type', note:'Seven steps. Mono is reserved: it means machine-generated — tool names, timings, counts, paths, numeric columns.',
    items:['--t-11','--t-12','--t-13','--t-15','--t-18','--t-22','--t-28'] },
  { g:'Type · families and metrics', kind:'value',
    items:['--font','--mono','--lh-tight','--lh-ui','--lh-prose','--ls-tight','--ls-snug','--ls-caps','--w-normal','--w-medium','--w-semi'] },
  { g:'Space', kind:'space', note:'One 4px unit multiplied by --density. Switching density is a single-variable change; the scale has no 7 or 9, and asking for one computes to nothing.',
    items:['--s-1','--s-2','--s-3','--s-4','--s-5','--s-6','--s-7','--s-8','--s-9','--s-10','--s-12','--s-16',
           '--week-hour'] },
  { g:'Space · inputs', kind:'value', items:['--u','--density'] },
  { g:'Radius and edge', kind:'radius', items:['--r-xs','--r-sm','--r-md','--r-lg','--r-xl','--r-2xl','--r-full'] },
  { g:'Edge widths', kind:'value', items:['--border','--ring'] },
  { g:'Motion', kind:'value', note:'Three durations and two curves. A transition longer than --slow is an animation, and there are none here.',
    items:['--fast','--base','--slow','--ease','--ease-out'] },
  { g:'Control geometry', kind:'value', note:'Named so a component never invents a height.',
    items:['--ctl-xs','--ctl-sm','--ctl-md','--ctl-lg','--dot'] },
  { g:'Shell metrics', kind:'value', note:'The columns of the workspace and the widths a page caps itself at. --list-w, --art-w, --app-w and --sheet-w are registered lengths that animate; the rest are fixed.',
    items:['--rail-w','--list-w','--mill-w','--list-w-mill','--art-w','--art-w-min','--art-w-max',
           '--app-w','--app-w-wide','--sheet-w','--sheet-w-open','--topbar-h','--status-h',
           '--measure','--composer-max','--ask-max','--brand','--app-tile'] }
];

/* ================================================================ specimens */
const ic13 = n => ic(n, 13);

const SECTIONS = [
{
  id:'type', title:'Typography', blurb:
    'Six classes carry every piece of text in the interface. Mono is a reservation, not a style: it says a machine produced this.',
  items:[
    { cls:'.t-display', what:'page title', html:'<span class="t-display">Q3 revenue analysis</span>' },
    { cls:'.t-title', what:'section or dialog title', html:'<span class="t-title">Start the deployment</span>' },
    { cls:'.t-body', what:'default', html:'<span class="t-body">Two segments carry the whole beat.</span>' },
    { cls:'.t-meta', what:'secondary', html:'<span class="t-meta">Updated 12 minutes ago</span>' },
    { cls:'.t-mono', what:'machine-generated', html:'<span class="t-mono">warehouse.query · 1.2s · 4,318 rows</span>' },
    { cls:'.t-eyebrow', what:'group label', html:'<span class="t-eyebrow">Foundation</span>' },
    { cls:'.prose', what:'model output', wide:true, block:true, html:
      '<div class="prose"><h3>What changed</h3><p>Q3 landed at <strong>$41.2M</strong>, ' +
      '<strong>12.4%</strong> over plan. The beat is narrower than it looks.</p>' +
      '<ul><li>Enterprise carries two thirds of it.</li>' +
      '<li>Services timing is not growth — see <code>q3_ledger</code>.</li></ul></div>',
      note:'The only place a heading, a list and a paragraph are styled as a document rather than as interface.' },
    { cls:'.sr', what:'screen-reader only', html:'<span>Visible label<span class="sr"> — and one only a reader hears</span></span>' }
  ]
},
{
  id:'controls', title:'Controls', blurb:
    'Every control is one of these. The accent appears on exactly one of them per surface — the thing you came to do.',
  items:[
    { cls:'.btn--primary', what:'the one action', html:
      '<button class="btn btn--primary">Send <span class="kbd">⌘↵</span></button>' +
      '<button class="btn btn--primary btn--sm">Save</button>' +
      '<button class="btn btn--primary" disabled>Disabled</button>' },
    { cls:'.btn--secondary', html:'<button class="btn btn--secondary">Run now</button>' +
      '<button class="btn btn--secondary btn--sm">Test</button>' },
    { cls:'.btn--ghost', html:'<button class="btn btn--ghost">Cancel</button>' +
      '<button class="btn btn--ghost btn--sm">Skip for now</button>' },
    { cls:'.btn--danger', html:'<button class="btn btn--danger">Delete project</button>' },
    { cls:'.linkbtn', what:'a cell that goes somewhere', html:
      '<span style="font-size:var(--t-12)">Writes into <button class="linkbtn">September social calendar</button></span>',
      note:'A button that reads as a link, for table cells and prose where a full button would shout.' },
    { cls:'.iconbtn', what:'three sizes', html:
      '<button class="iconbtn">' + ic('gear', 16) + '</button>' +
      '<button class="iconbtn iconbtn--sm">' + ic('gear', 14) + '</button>' +
      '<button class="iconbtn iconbtn--xs">' + ic('gear', 12) + '</button>' +
      '<button class="iconbtn" disabled>' + ic('gear', 16) + '</button>' },
    { cls:'.input', block:true, what:'live · placeholder · disabled', html:'<input class="input" value="Acme Industrial Co., Ltd">' +
      '<input class="input" placeholder="Empty, with a placeholder">' +
      '<input class="input" value="Disabled" disabled>' },
    { cls:'.input--mono', what:'a value a machine will read', html:'<input class="input input--mono" value="10.0.0.0/16">' },
    { cls:'.textarea', block:true, html:'<textarea class="textarea" rows="2">Bounded, and it grows.</textarea>' },
    { cls:'.textarea--prose', block:true, html:'<textarea class="textarea textarea--prose" rows="3">Rebuild the forecast bridge and flag every line that moved more than 5% against plan.</textarea>',
      note:'For text a person writes for the model to read: the interface font, at reading size.' },
    { cls:'.select', html:'<select class="select"><option>Every week</option></select>' },
    { cls:'.switch', block:true, html:
      '<label class="switch"><input type="checkbox" checked><span>Require citations in answers</span><span class="switch__track"></span></label>' +
      '<label class="switch"><input type="checkbox"><span>Log prompts and completions</span><span class="switch__track"></span></label>' },
    { cls:'.seg', what:'two to four exclusive choices', html:
      '<div class="seg"><button aria-selected="true">Work</button><button aria-selected="false">Data</button><button aria-selected="false">Auto program</button></div>' },
    { cls:'.range', block:true, html:'<input class="range" type="range" min="0" max="100" value="80">' },
    { cls:'.chip', what:'a multi-select member', html:
      '<button class="chip" aria-pressed="true"><span class="chip__tick">' + ic13('check') + '</span><span>Anthropic</span></button>' +
      '<button class="chip" aria-pressed="false"><span class="chip__tick">' + ic13('check') + '</span><span>OpenAI</span></button>' +
      '<span class="chip chip--plain">read-only</span>' +
      '<span class="chip chip--removable">q3_ledger<button class="chip__x">' + ic('x', 11) + '</button></span>' },
    { cls:'.check', block:true, html:
      '<label class="check"><input type="checkbox" checked><span>Send the digest</span></label>' +
      '<label class="check check--radio"><input type="radio" name="sg-r" checked><span>Personal</span></label>' +
      '<label class="check check--radio"><input type="radio" name="sg-r"><span>Shared</span></label>' },
    { cls:'.exchip', what:'a suggestion, put in the box rather than sent', wide:true, html:
      '<button class="exchip">Draft this week\'s three posts from the retrofit case study.</button>' },
    { cls:'.kbd', html:'<span>Send <span class="kbd">⌘↵</span></span>' },
    { cls:'.star', html:'<button class="star" aria-pressed="true">' + ic('star', 13) + '</button>' +
      '<button class="star" aria-pressed="false">' + ic('star', 13) + '</button>' },
    { cls:'.tabs', wide:true, block:true, html:
      '<div class="tabs"><button class="tab" aria-selected="true">Files <span class="tab__n">12,408</span></button>' +
      '<button class="tab" aria-selected="false">Tables <span class="tab__n">3</span></button>' +
      '<button class="tab" aria-selected="false">Access</button></div>' },
    { cls:'.toolbar', wide:true, block:true, html:
      '<div class="toolbar"><span class="toolbar__meta">Synced 12 minutes ago</span>' +
      '<div class="toolbar__spacer"></div><button class="btn btn--ghost btn--sm">Re-embed</button>' +
      '<button class="btn btn--primary btn--sm">Add files</button></div>' }
  ]
},
{
  id:'fields', title:'Fields', blurb:
    'A control with a name, and the one line that says what choosing it will do. Help text sits under the control, never beside the label.',
  items:[
    { cls:'.field', wide:true, block:true, html:
      '<div class="field"><div class="field__label"><span>Primary region</span></div>' +
      '<select class="select"><option>ap-southeast-1</option></select>' +
      '<div class="field__help">Must differ from the disaster-recovery region for the drills to mean anything.</div></div>' },
    { cls:'.field__value', what:'a range\'s readout, on the label', wide:true, block:true, html:
      '<div class="field"><div class="field__label"><span>Sample rate</span>' +
      '<span class="field__value">10%</span></div>' +
      '<input class="range" type="range" min="1" max="100" value="10"></div>' },
    { cls:'.hint', wide:true, block:true, html:
      '<div class="hint"><span class="hint__ico">' + ic13('help') + '</span>' +
      '<span class="hint__t">What answers in this project may read. Nothing ticked means it answers from the model alone.</span>' +
      '<button class="hint__x">' + ic('x', 11) + '</button></div>',
      note:'Explains a setting the first time. Retires once the dialog has been used; the ? in its header brings it back.' },
    { cls:'.fold', wide:true, block:true, html:
      '<details class="fold"><summary class="fold__head"><span class="fold__chev">' + ic13('chevR') +
      '</span><span class="fold__nm">Knowledge</span><span class="fold__sum">Finance corpus · q3_ledger</span></summary>' +
      '<div class="fold__body"><div class="field__help">Closed, the row names what is chosen — which is what a reader wants before deciding whether to open it.</div></div></details>' },
    { cls:'.picklist', wide:true, block:true, html:
      '<div class="picklist">' +
      '<button class="picklist__row" aria-pressed="true"><span class="picklist__ico">' + ic13('library') + '</span>' +
      '<span class="picklist__main"><span class="picklist__nm">Finance corpus</span>' +
      '<span class="picklist__sub">12,408 documents</span></span><span class="picklist__meta">docs</span></button>' +
      '<button class="picklist__row" aria-pressed="false"><span class="picklist__ico">' + ic13('data') + '</span>' +
      '<span class="picklist__main"><span class="picklist__nm">q3_ledger</span>' +
      '<span class="picklist__sub">warehouse · 2,431,004 rows</span></span><span class="picklist__meta">table</span></button></div>' },
    { cls:'.iconpick', wide:true, block:true, html:
      '<div class="iconpick">' +
      ['folder','chart','code','users','spark','calendar','doc','dollar','share'].map(function(n, i){
        return '<button class="iconpick__b" aria-pressed="' + (i === 8) + '">' + ic(n, 15) + '</button>';
      }).join('') + '</div>',
      note:'Nine glyphs naming kinds of work. A colour picker here would be a second accent and a craft project.' }
  ]
},
{
  id:'rows', title:'Rows and lists', blurb:
    'The workspace is mostly rows. One block, four slots: a lead, a title with a sub-line, a meta value, and an action that only appears on hover.',
  items:[
    { cls:'.row', wide:true, block:true, html:
      '<button class="row"><span class="row__icon">' + ic13('chart') + '</span>' +
      '<span class="row__main"><span class="row__title">Q3 close</span>' +
      '<span class="row__sub">Everything feeding the Q3 revenue close</span></span>' +
      '<span class="row__meta">2m</span></button>' +
      '<button class="row" aria-current="true"><span class="row__icon">' + ic13('share') + '</span>' +
      '<span class="row__main"><span class="row__title">Social publishing</span>' +
      '<span class="row__sub">Facebook · Instagram · LinkedIn</span></span>' +
      '<span class="row__flag">' + ic('clock', 12) + '</span></button>',
      note:'aria-current is the selected state — a row is never selected by colour alone.' },
    { cls:'.row--wrap', wide:true, block:true, html:
      '<button class="row row--wrap"><span class="dot dot--warn"></span>' +
      '<span class="row__main"><span class="row__title">June backfill incomplete — 12,402 tickets missing, so anything aggregating Q2 undercounts</span>' +
      '<span class="row__sub">Zendesk</span></span></button>' },
    { cls:'.rowline', wide:true, block:true, html:'<div class="rowline"></div>' },
    { cls:'.deflist', wide:true, block:true, html:
      '<dl class="deflist"><dt>State</dt><dd>live</dd><dt>Auth</dt><dd>Service account</dd>' +
      '<dt>Direction</dt><dd>read only</dd><dt>Last sync</dt><dd>2 min ago</dd></dl>' },
    { cls:'.checklist', wide:true, block:true, html:
      '<div class="checklist">' +
      '<div class="checklist__row"><span class="checklist__ico">' + ic13('check') + '</span>' +
      '<span class="checklist__nm">Assistant bound</span><span class="checklist__val">Revenue analyst</span></div>' +
      '<div class="checklist__row"><span class="checklist__ico">' + ic13('alert') + '</span>' +
      '<span class="checklist__nm">Connector granted</span><span class="checklist__val">missing</span></div></div>' },
    { cls:'.detrow', wide:true, block:true, html:
      '<button class="detrow"><span class="detrow__ico">' + ic13('agent') + '</span>' +
      '<span class="detrow__nm">Revenue analyst</span><span class="detrow__meta">Revenue · Nebula Pro</span></button>' },
    { cls:'.table__twist / .table__step', what:'grouped rows', wide:true, block:true, html:
      '<table class="table table--rows"><thead><tr><th>Task</th><th>Runs</th><th>Status</th></tr></thead><tbody>' +
      '<tr><td style="color:var(--text)"><span style="display:inline-flex;align-items:center;gap:var(--s-2)">' +
      '<button type="button" class="table__twist" aria-expanded="true">' + ic('chevR', 12) + '</button>' +
      'Weekly revenue digest <span class="badge badge--mono">job · 2 steps</span></span></td>' +
      '<td style="font-family:var(--mono)">Mon 07:00</td><td>ok</td></tr>' +
      '<tr class="table__step"><td>Refresh revenue tables</td><td style="font-family:var(--mono)">step 1</td><td>ok</td></tr>' +
      '<tr class="table__step"><td>Draft the digest</td><td style="font-family:var(--mono)">step 2</td><td>ok</td></tr>' +
      '</tbody></table>',
      note:'A row that contains rows. The twist folds; the contained rows indent and speak more quietly. Which rows appear is the caller’s decision.' },
    { cls:'.timeline', what:'a run log', wide:true, block:true, html:
      '<ul class="timeline">' +
      '<li class="timeline__item"><span class="timeline__rail"><span class="dot dot--ok"></span></span>' +
      '<div class="timeline__main"><div class="timeline__head">' +
      '<span class="timeline__when">Mon Aug 10 · 07:00</span><span class="timeline__meta">1:12</span></div>' +
      '<div class="timeline__out">Digest · week 33 → #leadership</div>' +
      '<div class="timeline__product">' +
      '<figure class="timeline__img"><svg viewBox="0 0 600 160" role="img" aria-label="A generated visual, drawn from the tokens">' +
      '<rect width="600" height="160" fill="var(--raised)"/>' +
      '<rect x="32" y="40" width="380" height="30" rx="5" fill="var(--line-strong)"/>' +
      '<rect x="32" y="86" width="260" height="30" rx="5" fill="var(--accent)"/>' +
      '</svg></figure>' +
      '<p><strong>ARR $41.3M</strong>, +2.1% w/w — enterprise carried it.</p>' +
      '<ul><li>Pipeline coverage 3.1× against the Q3 target</li></ul></div>' +
      '<div class="timeline__acts"><button type="button" class="iconbtn iconbtn--sm" title="Copy the text">' +
      ic('copy', 13) + '</button></div>' +
      '<div class="timeline__steps">' +
      '<span class="timeline__step"><span class="dot dot--ok"></span>Refresh revenue tables<span class="timeline__meta">0:22</span></span>' +
      '<span class="timeline__step"><span class="dot dot--ok"></span>Draft the digest<span class="timeline__meta">0:41</span></span>' +
      '</div></div></li>' +
      '<li class="timeline__item"><span class="timeline__rail"><span class="dot dot--err"></span></span>' +
      '<div class="timeline__main"><div class="timeline__head">' +
      '<span class="timeline__when">Mon Jul 27 · 07:00</span><span class="timeline__meta">0:24</span></div>' +
      '<div class="timeline__out">Stopped at step 1 — q3_close_lines was mid-load</div></div></li>' +
      '<li class="timeline__item"><span class="timeline__rail"><span class="dot"></span></span>' +
      '<div class="timeline__main"><div class="timeline__head">' +
      '<span class="timeline__when">Mon Jul 20 · 07:00</span><span class="timeline__meta">—</span></div>' +
      '<div class="timeline__out">Skipped — nothing new since the last run</div></div></li>' +
      '</ul>',
      note:'Newest first, one dot per entry coloured by how the run ended, a rail joining them because the entries are one history. The product itself is quoted in the entry — a run log answers "what did it make", and for generated content the answer is the content. A failed run quotes nothing, because nothing was made.' }
  ]
},
{
  id:'containers', title:'Containers', blurb:
    'Things that hold other things. A card is a hairline box; a dialog and a popover float, so they earn a shadow.',
  items:[
    { cls:'.card', wide:true, block:true, html:
      '<div class="card"><div class="card__head"><span class="card__title">LLM gateway</span></div>' +
      '<div class="card__body"><div class="field__help">Everything calls through here, so per-tenant cost is measured rather than inferred.</div></div></div>' },
    { cls:'.card--raised', wide:true, block:true, html:
      '<div class="card card--raised"><div class="card__body">A card one step up, for something quoted inside a page.</div></div>' },
    { cls:'.card--click', wide:true, block:true, html:
      '<div class="card card--click"><div class="card__body">A card that opens something. Its border firms up on hover.</div></div>' },
    { cls:'.dialog', wide:true, block:true, html:
      '<div class="dialog" style="position:static">' +
      '<header class="dialog__head"><span class="dialog__ico">' + ic('gear', 15) + '</span>' +
      '<span class="dialog__id"><span class="dialog__title">Project settings</span>' +
      '<span class="dialog__sub">Social publishing · weekly</span></span>' +
      '<button class="iconbtn iconbtn--sm">' + ic13('x') + '</button></header>' +
      '<div class="dialog__body"><div class="field__help">The body scrolls; the head and foot do not.</div></div>' +
      '<footer class="dialog__foot"><button class="btn btn--danger">Delete</button>' +
      '<div class="dialog__spacer"></div><button class="btn btn--ghost">Cancel</button>' +
      '<button class="btn btn--primary">Save changes</button></footer></div>',
      note:'Shown in the flow. In use it sits on a .scrim, which is the only full-page layer in the system.' },
    { cls:'.popmenu', wide:true, block:true, html:
      '<div class="popmenu" data-open="true" style="position:static">' +
      '<button class="popmenu__item"><span class="popmenu__main"><span class="popmenu__nm">Spreadsheet</span>' +
      '<span class="popmenu__sub">comma-separated, opens in Excel</span></span>' +
      '<span class="popmenu__meta">.csv</span></button>' +
      '<button class="popmenu__item"><span class="popmenu__main"><span class="popmenu__nm">Markdown</span>' +
      '<span class="popmenu__sub">a table you can paste into a doc</span></span>' +
      '<span class="popmenu__meta">.md</span></button></div>',
      note:'Fixed position in use, because the panes it opens from clip their own overflow. .pop is its sibling, anchored to its control instead.' },
    { cls:'.section', wide:true, block:true, html:
      '<div class="section"><div class="section__head"><span class="t-eyebrow">Channels</span></div>' +
      '<div class="field__help">A labelled block of a page.</div></div>' },
    { cls:'.pagehead', wide:true, block:true, html:
      '<div class="pagehead"><div class="pagehead__row">' +
      '<h2 class="t-display pagehead__title">Cloud Usage</h2>' +
      '<span class="badge">Example data</span></div>' +
      '<p class="pagehead__desc">What the deployment consumed, measured against the budget, quotas and objectives set in the modules.</p>' +
      '<p class="pagehead__meta">Admin page · Platform Consumption</p></div>' },
    { cls:'.scroll-x', wide:true, block:true, html:
      '<div class="scroll-x"><div style="width:150%;height:var(--ctl-md);background:var(--raised);' +
      'border-radius:var(--r-sm)"></div></div>',
      note:'A wide thing scrolls inside its own box rather than widening the page. --bleed lets it reach a card\'s own edge.' }
  ]
},
{
  id:'measure', title:'Measurements', blurb:
    'Five ways of showing a number, and the rule they share: a measurement is not an action, so none of them takes the accent. Colour appears only where a value has crossed a limit somebody set.',
  items:[
    { cls:'.kpis / .kpi', wide:true, block:true, html:
      '<div class="kpis">' +
      '<div class="kpi"><span class="kpi__l">Requests</span><span class="kpi__v">1.42M</span>' +
      '<span class="kpi__sub">across 30 days</span>' +
      '<span class="kpi__foot"><span class="delta delta--up">+2.4%</span></span></div>' +
      '<div class="kpi"><span class="kpi__l">Spend</span><span class="kpi__v kpi__v--warn">$21,480</span>' +
      '<span class="kpi__sub">of $25,000 budget</span>' +
      '<span class="kpi__foot"><span class="delta delta--down">+8.1%</span></span></div>' +
      '<div class="kpi"><span class="kpi__l">Availability</span><span class="kpi__v">99.94%</span>' +
      '<span class="kpi__sub">objective 99.9%</span>' +
      '<span class="kpi__foot"><span class="delta delta--flat">+0.0%</span></span></div></div>' },
    { cls:'.kpis--auto', wide:true, block:true, html:
      '<div class="kpis kpis--auto">' +
      '<div class="kpi"><span class="kpi__l">This month</span><span class="kpi__v">$1,284</span></div>' +
      '<div class="kpi"><span class="kpi__l">Tokens</span><span class="kpi__v">86.4M</span></div>' +
      '<div class="kpi"><span class="kpi__l">Cap</span><span class="kpi__v">$2,000</span></div>' +
      '<div class="kpi"><span class="kpi__l">Projection</span><span class="kpi__v kpi__v--sm">$1,610</span></div></div>',
      note:'As many as fit, for short readings rather than headline numbers.' },
    { cls:'.delta', html:
      '<span class="delta delta--up">+2.4%</span><span class="delta delta--down">−1.8%</span>' +
      '<span class="delta delta--flat">+0.0%</span><span class="delta delta--lg delta--up">+12.4%</span>',
      note:'Coloured by whether it is good news, not by its sign: latency falling and adoption rising are both green.' },
    { cls:'.meter', wide:true, block:true, html:
      '<span class="meter"><i style="width:64%"></i></span>' +
      '<span class="meter meter--warn" style="margin-top:var(--s-2)"><i style="width:88%"></i></span>' +
      '<span class="meter meter--err" style="margin-top:var(--s-2)"><i style="width:104%"></i></span>' },
    { cls:'.thresh', wide:true, block:true, html:
      '<div class="thresh"><span class="thresh__fill thresh__fill--ok" style="width:73%"></span>' +
      '<i class="thresh__mark" style="left:50%"><b>50%</b></i>' +
      '<i class="thresh__mark" style="left:80%"><b>80%</b></i>' +
      '<i class="thresh__mark thresh__mark--end" style="left:100%"><b>100%</b></i></div>' +
      '<div class="thresh__legend"><span>$18,250 spent</span><span>$6,750 left of $25,000</span></div>',
      note:'The one place a status colour is the fact being reported: --ok under 80%, --warn to 100%, --err past it.' },
    { cls:'.barlist', wide:true, block:true, html:
      '<div class="barlist">' +
      ['Enterprise 48%','Mid-market 27%','SMB 15%','Services 10%'].map(function(t, i){
        var p = [100, 56, 31, 20][i];
        return '<div class="barlist__row"><span class="barlist__k">' + t.split(' ')[0] +
               '</span><span class="meter"><i style="width:' + p + '%"></i></span>' +
               '<span class="barlist__v">' + t.split(' ')[1] + '</span></div>';
      }).join('') + '</div>',
      note:'The leading bar keeps the accent — one of its legitimate uses.' },
    { cls:'.barlist--stack', wide:true, block:true, html:
      '<div class="barlist barlist--stack barlist--flat">' +
      '<div class="barlist__row"><div class="barlist__top">' +
      '<span class="barlist__k">Engineering</span><span class="barlist__v">66 / 78 active</span></div>' +
      '<span class="meter"><i style="width:100%"></i></span>' +
      '<span class="barlist__meta">$94 per head</span></div>' +
      '<div class="barlist__row"><div class="barlist__top">' +
      '<span class="barlist__k">Untagged</span><span class="barlist__v">$412</span></div>' +
      '<span class="meter meter--err"><i style="width:12%"></i></span>' +
      '<span class="barlist__meta">cannot be charged back</span></div></div>',
      note:'A row of a report rather than a widget in an answer, and grey because a measurement is not an action.' },
    { cls:'.spark', html:
      '<svg class="spark" viewBox="0 0 60 18" preserveAspectRatio="none"><polyline fill="none" ' +
      'stroke="currentColor" stroke-width="1.2" points="0,14 10,11 20,12 30,7 40,8 50,4 60,3"/></svg>' },
    { cls:'.spark--bars', html:
      '<span class="spark spark--bars" style="width:120px">' +
      [42,46,51,47,55,58,61,66].map(function(v){ return '<i style="height:' + v + '%"></i>'; }).join('') +
      '</span>' },
    { cls:'.cols', wide:true, block:true, html:
      '<div class="cols"><div class="cols__plot">' +
      [38,44,41,52,49,58,62,57,66,71,68,74,79,72].map(function(v){
        return '<span class="cols__bar" style="height:' + v + '%"></span>';
      }).join('') + '</div>' +
      '<span class="cols__target" style="bottom:70%"><i>70% target</i></span>' +
      '<div class="cols__axis"><span>Day 1</span><span>Day 8</span><span>Day 14</span></div></div>' },
    { cls:'.table', wide:true, block:true, html:
      '<table class="table"><thead><tr><th>Model</th><th class="num">Share</th>' +
      '<th class="num">Cost</th><th class="num">p95</th></tr></thead><tbody>' +
      '<tr><td>Anthropic</td><td class="num">62%</td><td class="num">$11,320</td><td class="num">2.34s</td></tr>' +
      '<tr><td>Qwen <span class="t-mono" style="color:var(--text-4)">self-hosted</span></td>' +
      '<td class="num">38%</td><td class="num">$2,410</td><td class="num">1.12s</td></tr></tbody></table>',
      note:'.num right-aligns and switches to mono, because a column of numbers is read by shape.' },
    { cls:'.table--facts', wide:true, block:true, html:
      '<table class="table table--facts"><tbody>' +
      '<tr><td>Object storage</td><td class="num">168 GB</td><td>67% of the 250 GB tenant cap</td></tr>' +
      '<tr><td>Spot reclaims</td><td class="num">6</td><td>spot capacity is on</td></tr></tbody></table>',
      note:'A table that needs no header. Position identifies the cells, so they carry no classes.' },
    { cls:'.dot', html:
      ['','dot--ok','dot--run is-live','dot--warn','dot--err','dot--unread'].map(function(m){
        return '<span class="dot ' + m + '"></span>';
      }).join('') + '<span class="t-mono" style="color:var(--text-4)">idle · ok · running · warn · err · unread</span>' }
  ]
},
{
  id:'feedback', title:'Feedback', blurb:
    'What the interface says back. None of it interrupts: a banner explains, a toast confirms and carries the way back, an empty state names the one action that fills it.',
  items:[
    { cls:'.badge', html:
      '<span class="badge">Not configured</span><span class="badge badge--ok">Configured</span>' +
      '<span class="badge badge--warn">Degraded</span><span class="badge badge--err">Failed</span>' +
      '<span class="badge badge--info">Start</span><span class="badge badge--mono">v2.1.0</span>' },
    { cls:'.banner--info', wide:true, block:true, html:
      '<div class="banner banner--info"><span style="display:flex;margin-top:1px">' + ic('help', 14) + '</span>' +
      '<span>A connector is the credential and the scope, never the data.</span></div>' },
    { cls:'.banner--warn', wide:true, block:true, html:
      '<div class="banner banner--warn"><span style="display:flex;margin-top:1px">' + ic('alert', 14) + '</span>' +
      '<span><strong>LinkedIn is not connected.</strong> This post can be written and kept here, but nothing leaves until the connection is made.</span></div>' },
    { cls:'.banner--err', wide:true, block:true, html:
      '<div class="banner banner--err"><span style="display:flex;margin-top:1px">' + ic('alert', 14) + '</span>' +
      '<span>The June backfill never completed, so anything aggregating Q2 undercounts.</span></div>' },
    { cls:'.toast', wide:true, block:true, html:
      '<div class="toast" style="position:static"><span style="display:flex">' + ic13('check') + '</span>' +
      '<span>Churn program no longer runs on its own</span><button class="toast__act">Undo</button></div>',
      note:'Six seconds with an action, two without. This is why the interface has no confirmation dialogs.' },
    { cls:'.empty', wide:true, block:true, html:
      '<div class="empty"><div class="empty__icon">' + ic('folder', 18) + '</div>' +
      '<div class="empty__title">No results yet</div>' +
      '<div class="empty__body">Anything definite a turn produces is kept here.</div></div>',
      note:'States what is missing, then names the one action that fills it. No encouragement.' },
    { cls:'.skel', wide:true, block:true, html:
      '<div class="skel" style="height:var(--ctl-sm);margin-bottom:var(--s-2)"></div>' +
      '<div class="skel" style="height:var(--ctl-sm);width:70%"></div>',
      note:'Defined, and used nowhere — the loading state that was never wired. See the gaps below.' },
    { cls:'.tip', html:'<span class="tip" data-tip="Project settings" style="display:inline-flex;color:var(--text-4)">' +
      ic13('help') + '</span><span class="t-meta">hover the mark</span>' },
    { cls:'.statusbar', wide:true, block:true, html:
      '<footer class="statusbar" style="height:var(--status-h)">' +
      '<span class="statusbar__item"><span class="dot dot--ok"></span><span>ready</span></span>' +
      '<span class="statusbar__item statusbar__hide-sm">Nebula Pro</span>' +
      '<div class="statusbar__spacer"></div>' +
      '<span class="statusbar__item statusbar__hide-sm"><span>16k / 200k</span>' +
      '<span class="meter statusbar__meter"><i style="width:8%"></i></span></span>' +
      '<button class="statusbar__item">Light</button>' +
      '<button class="statusbar__item">Comfortable</button></footer>',
      note:'Both prototypes carry one. It does not place itself — where the strip sits is the page\'s business.' }
  ]
},
{
  id:'thread', title:'A turn', blurb:
    'What a conversation is made of. The steps a turn took are foldable and closed by default; what it produced leaves the thread and is referenced from it.',
  items:[
    { cls:'.trace', wide:true, block:true, html:
      '<details class="trace"><summary class="trace__sum"><span class="trace__chev">' + ic('chevR', 12) + '</span>' +
      '<span class="trace__ico">' + ic13('tool') + '</span><span>3 steps</span>' +
      '<span class="trace__dur">3.4s</span></summary>' +
      '<div class="trace__body">' +
      '<div class="step"><span class="step__name">warehouse.query</span>' +
      '<span class="step__detail">SELECT segment, month, arr FROM q3_ledger …</span>' +
      '<span class="step__t">1.1s</span></div>' +
      '<div class="step"><span class="step__name">code.run</span>' +
      '<span class="step__detail">reconcile against FY25_targets, normalise FX</span>' +
      '<span class="step__t">0.9s</span></div></div></details>' },
    { cls:'.artref', wide:true, block:true, html:
      '<button class="artref"><span class="artref__ico">' + ic13('table') + '</span>' +
      '<span class="artref__title">Q3 variance by segment</span>' +
      '<span class="artref__meta">Table · 4 rows</span></button>',
      note:'The one-line card a turn leaves behind. The thing itself is in the results column.' },
    { cls:'.artlist', wide:true, block:true, html:
      '<div class="artlist">' +
      '<div class="artlist__row"><span class="artlist__k">Enterprise</span><span class="artlist__v">$22.4M</span></div>' +
      '<div class="artlist__row"><span class="artlist__k">Mid-market</span><span class="artlist__v">$12.8M</span></div>' +
      '</div>' },
    { cls:'.code', wide:true, block:true, html:
      '<pre class="code"># variance decomposition\nq3 = wh.read("q3_ledger")\nvar = q3.groupby("segment").arr.sum()</pre>' },
    { cls:'.capa', wide:true, block:true, html:
      '<div class="capa"><div class="capa__head"><span class="capa__nm">warehouse.query</span></div>' +
      '<div class="capa__desc">Read the warehouse, read-only</div>' +
      '<button class="capa__ex">Q3 ARR by segment, plan vs actual</button></div>' },
    { cls:'.sharebar', wide:true, block:true, html:
      '<div class="sharebar"><span class="sharebar__ico">' + ic13('users') + '</span>' +
      '<span class="sharebar__txt">Anyone in Gnomon Digital with the link can open this result.</span></div>' },
    { cls:'.linkrow', wide:true, block:true, html:
      '<div class="linkrow"><input class="input" value="https://nebulas.app/r/8f2c4a" readonly>' +
      '<button class="btn btn--secondary btn--sm">Copy</button></div>' },
    { cls:'.initial', html:'<span class="initial">CY</span>' }
  ]
},
{
  id:'gaps', title:'States that are not built', blurb:
    'The system names what it lacks. Each of these has a place in the interface and nothing behind it yet — listed here rather than drawn, so nobody reads a specimen as a promise.',
  gaps:[
    ['Loading', '.skel exists and is used nowhere. Every surface renders from fixtures synchronously, so nothing has ever had to wait.'],
    ['Permission denied', 'Access is modelled in the fixtures — a base can be read by some assistants and not others — but no surface refuses anything.'],
    ['A failed tool call, mid-turn', '.trace shows steps that all succeeded. A step that raised has no styling, and the turn has no way to stop half-finished.'],
    ['An artifact that will not render', 'A result whose payload does not match its kind falls through to nothing rather than to a stated failure.'],
    ['Zero search results', 'The palette filters as you type and shows a shorter list. It does not have a state for the list being empty.']
  ]
}
];

/* =================================================================== render */
const $sg = s => document.querySelector(s);

function tokenRow(name){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return { name:name, value:v };
}

function renderTokens(into){
  TOKENS.forEach(group => {
    const sec = document.createElement('div');
    sec.className = 'sg__item sg__item--wide';
    let head = '<div class="sg__label"><span class="sg__cls">' + group.g + '</span>' +
               '<span class="sg__what">' + group.items.length + '</span></div>';
    if (group.note) head += '<p class="sg__note" style="margin:0 0 var(--s-3)">' + group.note + '</p>';

    const cells = group.items.map(name => {
      const t = tokenRow(name);
      let demo;
      if (group.kind === 'swatch'){
        demo = '<span class="sg__swatch" style="background:var(' + name + ')"></span>';
      } else if (group.kind === 'shadow'){
        demo = '<span class="sg__swatch" style="box-shadow:var(' + name + ');border-color:transparent"></span>';
      } else if (group.kind === 'radius'){
        demo = '<span class="sg__swatch" style="border-radius:var(' + name + ');background:var(--raised-2)"></span>';
      } else if (group.kind === 'type'){
        demo = '<span class="sg__swatch" style="border:0;display:grid;place-items:center;font-size:var(' +
               name + ')">Aa</span>';
      } else if (group.kind === 'space'){
        demo = '<span class="sg__swatch" style="border:0;display:flex;align-items:center">' +
               '<span class="sg__bar" style="width:var(' + name + ')"></span></span>';
      } else {
        demo = '';
      }
      return '<div class="sg__tok">' + demo +
             '<span class="sg__tokid"><span class="sg__tokname">' + name + '</span>' +
             '<span class="sg__tokval">' + (t.value || '—') + '</span></span></div>';
    }).join('');

    sec.innerHTML = head + '<div class="sg__tokens">' + cells + '</div>';
    into.append(sec);
  });
}

function renderSection(s){
  const wrap = document.createElement('section');
  wrap.className = 'sg__sec';
  wrap.id = s.id;

  const n = s.items ? s.items.length
          : s.gaps ? s.gaps.length
          : TOKENS.reduce((a, g) => a + g.items.length, 0);
  wrap.innerHTML =
    '<div class="sg__sech"><h2 class="t-title">' + s.title + '</h2>' +
    '<span class="sg__count">' + n + '</span></div>' +
    (s.blurb ? '<p class="sg__blurb">' + s.blurb + '</p>' : '');

  const grid = document.createElement('div');
  grid.className = 'sg__grid';

  if (s.id === 'tokens'){
    renderTokens(grid);
  } else if (s.gaps){
    s.gaps.forEach(([title, body]) => {
      const g = document.createElement('div');
      g.className = 'sg__item sg__item--wide';
      g.innerHTML = '<div class="sg__gap"><span style="display:flex;color:var(--text-4)">' +
        ic('alert', 14) + '</span><span><span class="sg__gapt">' + title + '</span>' +
        '<p class="sg__gapb">' + body + '</p></span></div>';
      grid.append(g);
    });
  } else {
    s.items.forEach(it => {
      const d = document.createElement('div');
      d.className = 'sg__item' + (it.wide ? ' sg__item--wide' : '');
      d.innerHTML =
        '<div class="sg__label"><span class="sg__cls">' + it.cls + '</span>' +
        (it.what ? '<span class="sg__what">' + it.what + '</span>' : '') + '</div>' +
        '<div class="sg__demo' + (it.block ? ' sg__demo--block' : '') + '">' + it.html + '</div>' +
        (it.note ? '<p class="sg__note">' + it.note + '</p>' : '');
      grid.append(d);
    });
  }
  wrap.append(grid);
  return wrap;
}

function render(){
  const body = $sg('#sgBody');
  body.innerHTML = '';

  const all = [{ id:'tokens', title:'Tokens', blurb:
    'The single source of truth. Every colour, size and duration in the interface comes from here, which is why dark mode and three densities are a redefinition of about twenty variables and nothing else.' }]
    .concat(SECTIONS);

  all.forEach(s => body.append(renderSection(s)));

  $sg('#sgNav').innerHTML = all.map(s =>
    '<a href="#' + s.id + '">' + s.title + '</a>').join('');

  const count = SECTIONS.reduce((a, s) => a + (s.items ? s.items.length : 0), 0);
  $sg('#sgCount').textContent = count + ' specimens · ' +
    TOKENS.reduce((a, g) => a + g.items.length, 0) + ' tokens';

  markCurrent();
}

/* The section list is beside the page now rather than above it, so it can say
   where you are.

   The rule is "the last section whose heading has passed the top of the column",
   not "the first one visible" — after an anchor jump the section you left is still
   on screen by a few pixels, and picking the first visible one keeps the mark one
   row behind for the whole page. Measured against the right column, because that
   is the scroll container; the viewport never moves. */
let spying = false;

function markCurrent(){
  const body = $sg('#sgBody');
  const links = [].slice.call($sg('#sgNav').children);
  const top = body.getBoundingClientRect().top;

  /* The edge is each section's own scroll-margin plus a pixel, not a number of my
     own choosing: that margin is exactly where an anchor jump parks a heading, so
     anything smaller would leave the mark on the previous section for the whole
     page — and the margin is a density-scaled token, so hard-coding it would be
     right at one density and wrong at the other two. */
  let here = links[0];
  links.forEach(a => {
    const sec = document.getElementById(a.hash.slice(1));
    if (!sec) return;
    const edge = parseFloat(getComputedStyle(sec).scrollMarginTop) + 1;
    if (sec.getBoundingClientRect().top - top <= edge) here = a;
  });
  links.forEach(a => a.setAttribute('aria-current', String(a === here)));

  if (!spying) {
    spying = true;
    let queued = false;
    body.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; markCurrent(); });
    });
    /* Clicking says where you are going before the scroll gets there, so the mark
       moves on the click rather than a frame later. */
    $sg('#sgNav').addEventListener('click', e => {
      const a = e.target.closest('a');
      if (!a) return;
      [].forEach.call($sg('#sgNav').children,
        el => el.setAttribute('aria-current', String(el === a)));
    });
  }
}

/* The page's own chrome is the system's own segmented control, on the same
   attributes the prototypes use — so switching here proves the same thing
   switching there proves. */
function themeCtl(){
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const seg = $sg('#sgTheme');
  const sync = () => {
    [].forEach.call(seg.children, b =>
      b.setAttribute('aria-selected', String((b.dataset.v === 'dark') === dark())));
  };
  seg.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.documentElement.dataset.theme = b.dataset.v;
    sync();
    render();
  };
  sync();
}
function densityCtl(){
  const seg = $sg('#sgDensity');
  const cur = () => document.documentElement.dataset.density || 'comfortable';
  const sync = () => {
    [].forEach.call(seg.children, b =>
      b.setAttribute('aria-selected', String(b.dataset.v === cur())));
  };
  seg.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.v === 'comfortable') delete document.documentElement.dataset.density;
    else document.documentElement.dataset.density = b.dataset.v;
    sync();
    render();
  };
  sync();
}

render();
themeCtl();
densityCtl();
