/* ============================================================================
   install.js — renders the initialisation dialog, the menu and the
   configuration surface from MODULES.

   Module 01 is the gate: it arrives as a layer over the page, and the eleven
   configuration modules only become reachable once it is done. Every field is
   addressed as "moduleId.groupIndex.fieldIndex", so one state object holds the
   whole install and the dialog and the page can share every renderer.
   Values persist to localStorage; nothing leaves the page.
   ========================================================================= */

/* Icons live in js/icons.js — one set for every page, loaded before this. */

/* ==================================================================== state
   MODULES[0] is initialisation — the dialog. PAGES are the eleven that get a
   configuration page of their own. */
const KEY   = 'nebulas.install.v1';
const INIT  = MODULES[0];
const PAGES = MODULES.slice(1);

/* The two monitoring perspectives, from usage-data.js. They are views, not
   modules: nothing on them is saved, none of them can be "configured", and
   they never count toward the twelve. A page is a view when it has cards. */
const ALL    = PAGES.concat(VIEWS);
const isView = m => !!(m && m.cards);
const pageOf = id => ALL.find(m => m.id === id);

/* The menu's groups. Modules carry `phase`; the views carry their own.

   Monitoring comes first, ahead of the install it measures. The three
   configuration phases are still in dependency order among themselves, but a
   deployment is configured once and read every day after — so the pages you
   return to sit at the top, and the twelve steps sit under them. */
const PHASES = [
  { k:'usage',      l:'Platform Usage Monitoring' },
  { k:'foundation', l:'Foundation' },
  { k:'platform',   l:'Platform' },
  { k:'operations', l:'Operations' }
];

/* What the pinned menu row calls the initialisation dialog. The PRD's own
   name for the admin page ("Tenant Onboarding") stays on the sub-line either
   way, so this label is free to be whatever reads best. */
const INIT_LABEL = 'Deployment setup';

/* `range` and `scope` are the two questions a usage page is always answering,
   so they belong to the session rather than to a page — switching perspective
   keeps the window you were looking at. `ids` deliberately does not persist:
   revealing who did what is an act, not a preference. */
const state = {
  /* Lands on the first page in the menu, which is now Cloud Usage. */
  id:VIEWS[0].id, values:{}, done:{}, density:'comfortable',
  range:'30d', scope:'Whole tenant', ids:false
};

const el  = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify({
      id:state.id, values:state.values, done:state.done,
      range:state.range, scope:state.scope,
      theme:document.documentElement.dataset.theme, density:state.density
    }));
  }catch(e){ /* private mode — the page still works, it just forgets */ }
}
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(s.values) state.values = s.values;
    if(s.done)   state.done = s.done;
    if(s.range && URANGES.some(r => r.k === s.range)) state.range = s.range;
    if(s.scope)  state.scope = s.scope;
    if(s.id && ALL.some(m => m.id === s.id)) state.id = s.id;
    if(s.theme)  document.documentElement.dataset.theme = s.theme;
    if(s.density) setDensity(s.density, true);
  }catch(e){ /* corrupt entry — start clean rather than fail to render */ }
}

const mod = id => MODULES.find(m => m.id === id);
const key = (m, gi, fi) => m.id + '.' + gi + '.' + fi;
function value(m, gi, fi, f){
  const k = key(m, gi, fi);
  return k in state.values ? state.values[k] : f.v;
}
function setValue(k, v){ state.values[k] = v; save(); }
/* The three initialisation answers the rest of the install reads. */
const tenantName = () => String(value(INIT, 1, 0, INIT.groups[1].f[0]) || '').trim();
const provider   = () => value(INIT, 0, 0, INIT.groups[0].f[0]);
const region     = () => value(INIT, 3, 0, INIT.groups[3].f[0]);

/* ------------------------------------------------- configuration, by name
   The usage views judge their numbers against what was configured, and they
   have to survive a field moving. So they read by module id, group title and
   field label rather than by index — a lookup that says what it wants. */
function cval(mid, gt, fl, dflt){
  const m = mod(mid);
  if(!m) return dflt;
  const gi = m.groups.findIndex(g => g.t === gt);
  if(gi < 0) return dflt;
  const fi = m.groups[gi].f.findIndex(f => f.l === fl);
  if(fi < 0) return dflt;
  const v = value(m, gi, fi, m.groups[gi].f[fi]);
  return v == null || v === '' ? dflt : v;
}
/* Configured values are text a person typed — "250 GB", "60000", "3 – 12",
   "2 × L40S". The first number is the one meant; stripping every non-digit
   instead would read that last one as 240 GPUs. Thousands separators go first,
   so "25,000" survives. */
const cnum = (s, dflt) => {
  const m = String(s).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return isFinite(n) && n > 0 ? n : dflt;
};

function readCfg(){
  const gpuPool = cval('compute','Node pools','GPU inference pool','None');
  return {
    /* module 12 — money and limits */
    budget:cnum(cval('cost','Budgets & anomalies','Monthly budget','25000'), 25000),
    thresholds:String(cval('cost','Budgets & anomalies','Alert thresholds','50% / 80% / 100%'))
      .split('/').map(x => cnum(x, 0)).filter(Boolean),
    anomaly:!!cval('cost','Budgets & anomalies','Anomaly detection',true),
    anomalySens:cval('cost','Budgets & anomalies','Anomaly sensitivity','Medium'),
    granularity:cval('cost','Cost visibility','Granularity','Daily per tag'),
    tags:cval('cost','Tagging & chargeback','Required tags',[]),
    chargeback:cval('cost','Tagging & chargeback','Chargeback model','Showback only'),
    blockUntagged:!!cval('cost','Tagging & chargeback','Block resources missing required tags',true),
    tpm:cnum(cval('cost','Tenant quotas','Tokens per minute','60000'), 60000),
    callsDay:cnum(cval('cost','Tenant quotas','API calls per day','250000'), 250000),
    storageCap:cnum(cval('cost','Tenant quotas','Storage per tenant','250 GB'), 250),
    onExhaust:cval('cost','Tenant quotas','On quota exhaustion','Throttle'),
    recs:cval('cost','Optimisation','Recommendations to surface',[]),
    review:cval('cost','Optimisation','Review cadence','Monthly'),
    autoStopIdle:!!cval('cost','Optimisation','Auto-stop idle GPU nodes',true),
    /* module 08 — objectives and what is kept */
    slo:cval('observe','Alerts','Availability SLO','99.9%'),
    p95:cval('observe','Alerts','p95 latency objective','2.5s'),
    mRetention:cval('observe','Metrics','Retention','90 days'),
    lRetention:cval('observe','Log aggregation','Retention','30 days'),
    piiMask:!!cval('observe','Log aggregation','PII masking at ingest',true),
    tenantDash:!!cval('observe','Tenant-facing observability','Expose per-tenant usage dashboard',true),
    /* module 07 — who, and what is metered */
    metered:cval('identity','Billing dimensions','Metered on',[]),
    period:cval('identity','Billing dimensions','Billing period','Monthly'),
    hardStop:!!cval('identity','Billing dimensions','Hard stop at quota',false),
    model:cval('identity','Permission model','Model','RBAC'),
    hierarchy:cval('identity','Permission model','Hierarchy','Org → Dept → User'),
    idp:cval('identity','Enterprise SSO','Identity provider','Azure AD'),
    scim:!!cval('identity','Enterprise SSO','SCIM directory sync',true),
    offboarding:cval('identity','Member lifecycle','Offboarding','Immediate revoke'),
    transfer:!!cval('identity','Member lifecycle','Transfer owned resources on departure',true),
    mfa:!!cval('init','Initial administrators','Require MFA before first login',true),
    /* module 05 — what answers cost */
    commercial:cval('ai','LLM source','Commercial providers',[]),
    selfHosted:cval('ai','LLM source','Self-hosted open models',[]),
    gateway:cval('ai','LLM gateway','Gateway','LiteLLM'),
    rateLimit:cval('ai','LLM gateway','Default rate limit','120000 tokens/min'),
    logPrompts:!!cval('ai','LLM gateway','Log prompts and completions',false),
    routing:cval('ai','Routing & fallback','Routing strategy','Cost-aware by task'),
    onFail:cval('ai','Routing & fallback','On provider failure','Fail over to secondary'),
    topk:cval('ai','RAG pipeline','Retrieve top-k','20'),
    chunk:cval('ai','RAG pipeline','Chunk size / overlap','800 / 120'),
    rerank:!!cval('ai','RAG pipeline','Rerank before generation',true),
    cite:!!cval('ai','RAG pipeline','Require citations in answers',true),
    /* modules 03 · 04 · 06 · 09 — what it runs on */
    gpuPool:gpuPool,
    gpuCount:cnum(gpuPool, 0) || (gpuPool === 'None' ? 0 : 1),
    nodeBand:cval('compute','Node pools','General pool — size','3 – 12'),
    spot:!!cval('compute','Spot capacity','Use Spot for elastic workloads',true),
    vector:cval('data','Vector database','Engine','Qdrant'),
    broker:cval('app','Message queue','Broker','Kafka'),
    dlp:!!cval('compliance','Data loss & prompt safety','DLP on uploads and outputs',true)
  };
}

/* A bare "%" hugs its number; a worded unit takes a space. */
function fmt(v, unit){
  if(!unit) return String(v);
  return unit === '%' ? v + '%' : v + ' ' + unit;
}

/* ==================================================================== field */
function fieldHTML(m, gi, fi, f){
  const k  = key(m, gi, fi);
  const v  = value(m, gi, fi, f);
  const id = 'f_' + k.replace(/\./g, '_');
  const half = f.half ? ' field--half' : '';
  const help = f.h ? '<p class="field__help">' + esc(f.h) + '</p>' : '';

  /* A switch carries its own label, so it skips the field label entirely. */
  if(f.t === 'switch'){
    return '<div class="field field--switch' + half + '">' +
             '<label class="switch">' +
               '<input type="checkbox" data-k="' + k + '" data-t="switch"' + (v ? ' checked' : '') + '>' +
               '<span>' + esc(f.l) + '</span>' +
               '<span class="switch__track"></span>' +
             '</label>' + help +
           '</div>';
  }

  let control = '';
  if(f.t === 'select'){
    control = '<select class="select" id="' + id + '" data-k="' + k + '" data-t="select">' +
      f.o.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
      '</select>';

  }else if(f.t === 'input'){
    const cls = 'input' + (f.mono ? ' input--mono' : '');
    const input = '<input class="' + cls + '" id="' + id + '" data-k="' + k + '" data-t="input"' +
                  ' value="' + esc(v == null ? '' : v) + '"' +
                  ' placeholder="' + esc(f.ph || '') + '" autocomplete="off" spellcheck="false">';
    control = f.pre
      ? '<span class="input-pre"><span class="input-pre__sym">' + esc(f.pre) + '</span>' + input + '</span>'
      : input;

  }else if(f.t === 'seg'){
    control = '<div class="seg" role="tablist" data-k="' + k + '" data-t="seg">' +
      f.o.map(o => '<button type="button" role="tab" data-v="' + esc(o) + '"' +
                   ' aria-selected="' + (o === v) + '">' + esc(o) + '</button>').join('') +
      '</div>';

  }else if(f.t === 'multi'){
    const on = Array.isArray(v) ? v : [];
    control = '<div class="chips" data-k="' + k + '" data-t="multi">' +
      f.o.map(o => {
        const sel = on.indexOf(o) > -1;
        return '<button type="button" class="chip" data-v="' + esc(o) + '" aria-pressed="' + sel + '">' +
                 '<span class="chip__tick">' + ic('check', 11) + '</span><span>' + esc(o) + '</span>' +
               '</button>';
      }).join('') + '</div>';

  }else if(f.t === 'range'){
    control = '<div class="range-row">' +
                '<input class="range" type="range" id="' + id + '" data-k="' + k + '" data-t="range"' +
                ' min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '">' +
              '</div>';
  }

  const readout = f.t === 'range'
    ? '<span class="field__value" data-out="' + k + '">' + fmt(v, f.unit) + '</span>'
    : '';

  /* seg and multi are button groups — there is no single control for a
     <label for> to point at, so they get a plain caption instead. */
  const group = f.t === 'seg' || f.t === 'multi';
  const cap = group
    ? '<span class="field__label">' + esc(f.l) + readout + '</span>'
    : '<label class="field__label" for="' + id + '">' + esc(f.l) + readout + '</label>';

  return '<div class="field' + half + '"' + (group ? ' role="group" aria-label="' + esc(f.l) + '"' : '') + '>' +
           cap + control + help +
         '</div>';
}

function fieldsHTML(m, g, gi){
  return '<div class="fields">' + g.f.map((f, fi) => fieldHTML(m, gi, fi, f)).join('') + '</div>';
}

/* ================================================== initialisation dialog */
function renderWizard(){
  el('wizBody').innerHTML = INIT.groups.map((g, gi) =>
    '<section class="wizard__group">' +
      '<h3 class="wizard__group-t t-eyebrow">' + esc(g.t) + '</h3>' +
      fieldsHTML(INIT, g, gi) +
    '</section>').join('');
  syncWizard();
}

/* The dialog is a gate before the tenant exists and an editor after it, so
   the same footer says two different things. It is always dismissable — this
   is a prototype, and being able to look at the eleven pages without filling
   the gate in first matters more here than the flow being airtight. */
function syncWizard(){
  const started = !!state.done.init;
  const named   = !!tenantName();

  el('wizTitle').textContent  = started ? 'Tenant onboarding' : 'Start the deployment';
  el('wizStart').textContent  = started ? 'Save changes' : 'Start deployment';
  el('wizStart').disabled     = !named;
  el('wizCancel').textContent = started ? 'Cancel' : 'Not now';
  el('wizHint').textContent   = !named
    ? 'Enter the legal entity name to continue, or close to browse the modules.'
    : (started ? 'Changes apply to every module that inherits them.'
               : 'The eleven configuration modules unlock once the tenant exists.');
}

function openWizard(){
  renderWizard();
  el('wizScrim').dataset.open = 'true';
  const first = el('wizBody').querySelector('input,select');
  if(first) setTimeout(() => first.focus(), 40);
}
function closeWizard(){
  el('wizScrim').dataset.open = 'false';
  /* Closing an unfinished gate has to leave a way back to it. */
  renderIdentity();
}

/* ===================================================================== menu */
function renderMenu(){
  const row = m => {
    const cur  = m.id === state.id;
    /* A view is never "configured", so it carries no state mark — the absence
       is the signal that it is a place to look rather than a step to finish. */
    const done = !isView(m) && !!state.done[m.id];
    return '<button class="row mrow" data-go="' + m.id + '" aria-current="' + cur + '">' +
             '<span class="row__icon">' + ic(m.icon, 15) + '</span>' +
             '<span class="row__main">' +
               '<span class="row__title">' + esc(m.label) + '</span>' +
               '<span class="row__sub">' + esc(m.page) + '</span>' +
             '</span>' +
             (done ? '<span class="mrow__state">' + ic('check', 14) + '</span>' : '') +
           '</button>';
  };

  /* Initialisation is pinned above the phases and opens the dialog rather
     than a page — it is the one row that isn't a destination. */
  const started = !!state.done.init;
  const pinned =
    '<div class="menu__pinned">' +
      '<button class="row mrow mrow--init" data-init="1" aria-current="false">' +
        '<span class="row__icon' + (started ? '' : ' row__icon--act') + '">' +
          ic(started ? 'gear' : 'flag', 15) + '</span>' +
        '<span class="row__main">' +
          '<span class="row__title">' + esc(INIT_LABEL) + '</span>' +
          '<span class="row__sub">' + esc(INIT.page) + '</span>' +
        '</span>' +
        (started ? '<span class="mrow__state">' + ic('check', 14) + '</span>'
                 : '<span class="badge badge--info">Start</span>') +
      '</button>' +
    '</div>';

  /* Four groups. The first three are the dependency order of the install, not
     a preference; the fourth is what the install produced once it runs, which
     is why it sits after them rather than among them. Grouping reads `phase`
     off each page, so adding one is a data change and not a slice index. */
  el('menuBody').innerHTML = pinned + PHASES.map(p => {
    const rows = ALL.filter(m => m.phase === p.k);
    if(!rows.length) return '';
    return '<div class="menu__group"><span class="t-eyebrow">' + esc(p.l) + '</span></div>' +
           rows.map(row).join('');
  }).join('');
}

/* The page name is fixed, so the sub-line under it names the tenant instead —
   the dialog that created it is no longer on screen. Provider and region stay
   in the status strip rather than being repeated here. */
function renderIdentity(){
  const named = tenantName();
  el('menuSub').textContent = state.done.init
    ? (named || 'Tenant configured')
    : 'Not initialised';
}

/* =========================================================== configuration
   One entry point for both kinds of page. A module is a form with a footer that
   moves you along; a view is a report with no footer at all. */
function renderConfig(){
  const m = pageOf(state.id);
  if(!m) return;
  if(isView(m)) renderView(m);
  else renderModule(m);
}

function renderModule(m){
  const i = PAGES.indexOf(m);
  const done = !!state.done[m.id];

  el('cfgTitle').textContent = m.label;
  el('cfgHint').textContent = 'Choices are kept in this browser only.';
  el('prevBtn').hidden = el('nextBtn').hidden = false;

  const st = el('cfgState');
  st.className   = 'badge' + (done ? ' badge--ok' : '');
  st.textContent = done ? 'Configured' : 'Not configured';

  el('cfgBody').innerHTML =
    '<div class="cfg__inner">' +
      '<div class="pagehead">' +
        '<div class="pagehead__row">' +
          '<h2 class="t-display pagehead__title">' + esc(m.label) + '</h2>' +
        '</div>' +
        '<p class="pagehead__desc">' + esc(m.desc) + '</p>' +
        '<p class="t-mono" style="margin:var(--s-3) 0 0">Admin page · ' + esc(m.page) + '</p>' +
      '</div>' +
      m.groups.map((g, gi) =>
        '<div class="card step-card">' +
          '<div class="card__head">' +
            '<span class="card__title">' + esc(g.t) + '</span>' +
          '</div>' +
          '<div class="card__body">' + fieldsHTML(m, g, gi) + '</div>' +
        '</div>'
      ).join('') +
    '</div>';

  el('cfgBody').scrollTop = 0;

  el('prevBtn').disabled = i === 0;
  el('nextBtn').textContent = i === PAGES.length - 1
    ? (done ? 'Finish' : 'Save & finish')
    : (done ? 'Continue' : 'Save & continue');
  el('skipBtn').hidden = done || i === PAGES.length - 1;
}

/* =================================================================== views
   Seven card kinds cover both perspectives: kpi · thresh · cols · bars ·
   table · facts · note. Card content is composed in usage-data.js from
   fixtures and configured values — no field on either page is user input, so
   the small amount of markup inside a cell (a unit, an aside) is written
   rather than escaped. Labels that come from a text field still go through
   esc, because a tenant name is typed. */

/* A delta is coloured by whether it is good news, not by its sign: latency
   falling and adoption rising are both green. */
function deltaHTML(d){
  const up = d.v >= 0;
  const cls = Math.abs(d.v) < .005 ? 'flat' : (up === !!d.good ? 'up' : 'down');
  return '<span class="delta delta--' + cls + '">' +
           (up ? '+' : '−') + Math.abs(d.v * 100).toFixed(1) + '%</span>';
}

/* A sparkline is shape only — no axis, no scale, nothing to read off it. It is
   there to say "steady", "climbing" or "spiky" in the width of a word. */
function sparkHTML(s){
  if(!s || s.length < 2) return '';
  const lo = Math.min.apply(null, s), hi = Math.max.apply(null, s), sp = (hi - lo) || 1;
  const pts = s.map((v, i) =>
    (i / (s.length - 1) * 60).toFixed(1) + ',' + (16.5 - (v - lo) / sp * 14).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true">' +
           '<polyline points="' + pts + '" fill="none" stroke="currentColor" ' +
           'stroke-width="1.2" stroke-linejoin="round"/></svg>';
}

function kpiHTML(t){
  return '<div class="kpi">' +
           '<span class="kpi__l">' + esc(t.l) + '</span>' +
           '<span class="kpi__v' + (t.tone ? ' kpi__v--' + t.tone : '') + '">' + esc(t.v) + '</span>' +
           '<span class="kpi__sub">' + esc(t.sub || '') + '</span>' +
           '<span class="kpi__foot">' + (t.d ? deltaHTML(t.d) : '') + sparkHTML(t.spark) + '</span>' +
         '</div>';
}

function colsHTML(c){
  const hi = Math.max.apply(null, c.series.concat(c.target ? [c.target.v] : [])) || 1;
  const bars = c.series.map((v, i) =>
    '<span class="cols__bar" style="height:' + (v / hi * 100).toFixed(1) + '%"' +
    ' title="' + esc((c.labels && c.labels[i]) || '') + ' · ' + v.toFixed(1) + esc(c.unit || '') + '"></span>'
  ).join('');
  const target = c.target
    ? '<span class="cols__target" style="bottom:' + (c.target.v / hi * 100).toFixed(1) + '%">' +
        '<i>' + esc(c.target.l) + '</i></span>'
    : '';
  const l = c.labels || [];
  const axis = l.length
    ? '<div class="cols__axis"><span>' + esc(l[0]) + '</span>' +
      '<span>' + esc(l[Math.floor(l.length / 2)]) + '</span>' +
      '<span>' + esc(l[l.length - 1]) + '</span></div>'
    : '';
  return '<div class="cols"><div class="cols__plot">' + bars + '</div>' + target + axis + '</div>';
}

/* The one place status colour is allowed: a number against a limit that was
   configured, where crossing it is the fact being reported. */
function threshHTML(c){
  const p = c.max ? c.v / c.max * 100 : 0;
  const tone = p >= 100 ? 'err' : p >= 80 ? 'warn' : 'ok';
  /* A mark at the far end labels itself inwards, or the label is cut off. */
  const marks = (c.marks || []).map(m =>
    '<i class="thresh__mark' + (m.at >= .95 ? ' thresh__mark--end' : '') +
    '" style="left:' + (m.at * 100).toFixed(1) + '%"><b>' + esc(m.l) + '</b></i>').join('');
  return '<div class="thresh">' +
           '<span class="thresh__fill thresh__fill--' + tone + '" style="width:' + Math.min(100, p).toFixed(1) + '%"></span>' +
           marks +
         '</div>' +
         '<div class="thresh__legend"><span>' + esc(c.left) + '</span><span>' + esc(c.right) + '</span></div>';
}

function barsHTML(c){
  const hi = Math.max.apply(null, c.rows.map(r => r.v)) || 1;
  return '<div class="barlist barlist--stack barlist--flat">' + c.rows.map(r =>
    '<div class="barlist__row">' +
      '<div class="barlist__top">' +
        '<span class="barlist__k">' + esc(r.nm) + '</span>' +
        '<span class="barlist__v">' + esc(r.val) + '</span>' +
      '</div>' +
      '<span class="meter' + (r.tone ? ' meter--' + r.tone : '') + '">' +
        '<i style="width:' + (r.v / hi * 100).toFixed(1) + '%"></i></span>' +
      (r.meta ? '<span class="barlist__meta">' + esc(r.meta) + '</span>' : '') +
    '</div>').join('') + '</div>';
}

function tableHTML(c){
  return '<div class="scroll-x scroll-x--bleed"><table class="table">' +
    '<thead><tr>' + c.cols.map(h =>
      '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.l) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + c.rows.map(r =>
      '<tr>' + r.map((cell, i) =>
        '<td' + (c.cols[i] && c.cols[i].num ? ' class="num"' : '') + '>' + cell + '</td>').join('') +
      '</tr>').join('') + '</tbody>' +
  '</table></div>';
}

/* Facts are a table that needs no header: a name, a number, and the context
   that makes the number mean something. Position identifies the cells, so the
   shared .table--facts modifier styles them and they carry no classes. */
function factsHTML(c){
  return '<div class="scroll-x scroll-x--bleed"><table class="table table--facts"><tbody>' +
    c.rows.map(r =>
      '<tr><td>' + r[0] + '</td>' +
          '<td class="num">' + r[1] + '</td>' +
          '<td>' + r[2] + '</td></tr>').join('') +
    '</tbody></table></div>';
}

const noteHTML = c => '<ul class="notelist">' +
  c.lines.map(l => '<li>' + l + '</li>').join('') + '</ul>';

function cardHTML(c){
  /* The headline row is not a card — six numbers in six boxes, above the
     cards, so the page answers its own question before it explains it. */
  if(c.k === 'kpi') return '<div class="kpis">' + c.tiles.map(kpiHTML).join('') + '</div>';

  const body = c.k === 'thresh' ? threshHTML(c)
             : c.k === 'cols'   ? colsHTML(c)
             : c.k === 'bars'   ? barsHTML(c)
             : c.k === 'table'  ? tableHTML(c)
             : c.k === 'facts'  ? factsHTML(c)
             : c.k === 'note'   ? noteHTML(c)
             : '';
  const gate = c.gate
    ? '<button class="btn btn--ghost btn--sm" data-ids="' + (state.ids ? '0' : '1') + '">' +
        (state.ids ? 'Hide individual rows' : 'Show individual rows') + '</button>'
    : '';
  return '<div class="card usecard">' +
           '<div class="card__head">' +
             '<span class="card__title">' + esc(c.t) + '</span>' +
             '<div class="cfg__spacer"></div>' + gate +
           '</div>' +
           '<div class="card__body">' + body +
             (c.note ? '<p class="usenote">' + c.note + '</p>' : '') +
           '</div>' +
         '</div>';
}

/* The two questions a usage page is always answering — over what window, and
   for whom — sit above the cards and stay there while it scrolls. */
function usebarHTML(){
  return '<div class="usebar">' +
    '<div class="seg" data-t="range" role="tablist">' + URANGES.map(r =>
      '<button type="button" role="tab" data-range="' + r.k + '" aria-selected="' +
      (r.k === state.range) + '">' + esc(r.l) + '</button>').join('') + '</div>' +
    '<select class="select usebar__scope" data-scope aria-label="Scope">' +
      ['Whole tenant'].concat(UDEPTS.map(d => d.nm)).map(o =>
        '<option' + (o === state.scope ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
    '</select>' +
    '<div class="cfg__spacer"></div>' +
    '<span class="usebar__as">as of ' + esc(clock()) + '</span>' +
    '<button class="btn btn--ghost btn--sm" data-refresh>Refresh</button>' +
  '</div>';
}
const clock = () => new Date().toTimeString().slice(0, 5);

function renderView(v){
  const cfg   = readCfg();
  const dept  = UDEPTS.find(d => d.nm === state.scope) || null;
  const ctx = {
    cfg:cfg, range:urange(state.range), scope:state.scope, dept:dept,
    share:dept ? dept.w : 1,
    ids:state.ids,
    /* Range and scope are part of the seed, so the same window always draws
       the same series and switching window genuinely changes the picture. */
    seed:v.id + '|' + state.range + '|' + state.scope
  };

  el('cfgTitle').textContent = v.label;

  /* A view has no configured state, so the badge says who may see it instead —
     which is module 08's switch, and the only status it has. Until the tenant
     exists there is nothing behind these numbers, and the badge says that
     rather than the page withholding them. */
  const st = el('cfgState');
  st.className   = 'badge';
  st.textContent = !state.done.init ? 'Example data'
                 : cfg.tenantDash ? 'Shared with tenants' : 'Internal only';

  el('cfgBody').innerHTML =
    '<div class="cfg__inner cfg__inner--wide">' +
      '<div class="pagehead">' +
        '<div class="pagehead__row">' +
          '<h2 class="t-display pagehead__title">' + esc(v.label) + '</h2>' +
        '</div>' +
        '<p class="pagehead__desc">' + esc(v.desc) + '</p>' +
        '<p class="t-mono" style="margin:var(--s-3) 0 0">Admin page · ' + esc(v.page) + '</p>' +
      '</div>' +
      usebarHTML() +
      v.cards(ctx).map(cardHTML).join('') +
    '</div>';

  el('cfgBody').scrollTop = 0;

  /* Nothing to save and nowhere to continue to. */
  el('prevBtn').hidden = el('nextBtn').hidden = el('skipBtn').hidden = true;
  el('cfgHint').textContent = 'Read-only — usage is measured, not configured.';
}

/* ================================================================= progress
   All twelve modules count — initialisation is a dialog, not an exemption.
   The two views are not modules, so they are not in this arithmetic. */
function renderProgress(){
  const n   = MODULES.filter(m => state.done[m.id]).length;
  const pct = Math.round(n / MODULES.length * 100);

  el('stProg').textContent = n + ' / ' + MODULES.length + ' modules';
  el('stBar').style.width  = pct + '%';

  el('stState').textContent = n === MODULES.length ? 'ready to deploy'
                            : n === 0 ? 'not started' : 'in progress';
  el('stDot').className = 'dot ' + (n === MODULES.length ? 'dot--ok' : n === 0 ? '' : 'dot--run');

  el('stProvider').textContent = provider();
  el('stRegion').textContent   = region();
}

function render(){ renderMenu(); renderIdentity(); renderConfig(); renderProgress(); }

/* =================================================================== toasts */
function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = ic('check', 13) + '<span>' + esc(msg) + '</span>';
  el('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); }, 2200);
}

/* ============================================================== navigation */
function go(id){
  if(!ALL.some(m => m.id === id)) return;
  state.id = id;
  /* The module is in the hash, so a step is linkable and the back button
     walks the install rather than leaving it. */
  if(location.hash.slice(1) !== id) history.pushState(null, '', '#' + id);
  save();
  renderMenu();
  renderConfig();
}
/* The footer walks the eleven configuration modules — that is the install.
   The arrow keys walk everything in the menu, including the two views, because
   there they are a way of moving down a list you can see. */
function step(delta, list){
  const l = list || PAGES;
  const i = l.indexOf(pageOf(state.id)) + delta;
  if(i >= 0 && i < l.length) go(l[i].id);
}

/* =========================================================== field wiring
   One pair of handlers, bound to both surfaces — the dialog and the page
   render the same fields, and a re-render replaces every node, so nothing
   may hold a reference to a control. */
function onFieldInput(e){
  const t = e.target;
  if(!t.dataset || !t.dataset.k) return;
  const k = t.dataset.k;
  const [mid, gi, fi] = k.split('.');

  if(t.dataset.t === 'switch'){
    setValue(k, t.checked);
  }else if(t.dataset.t === 'range'){
    setValue(k, +t.value);
    const out = e.currentTarget.querySelector('[data-out="' + k + '"]');
    if(out) out.textContent = fmt(t.value, mod(mid).groups[gi].f[fi].unit);
  }else{
    setValue(k, t.value);
  }

  /* Initialisation answers show up in three other places. */
  if(mid === 'init'){ syncWizard(); renderIdentity(); renderProgress(); }
}

function onFieldClick(e){
  const segBtn = e.target.closest('.seg[data-t="seg"] button');
  if(segBtn){
    const wrap = segBtn.closest('.seg');
    wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b === segBtn));
    setValue(wrap.dataset.k, segBtn.dataset.v);
    return;
  }
  const chip = e.target.closest('.chips[data-t="multi"] .chip');
  if(chip){
    const wrap = chip.closest('.chips');
    chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    setValue(wrap.dataset.k,
      [...wrap.querySelectorAll('.chip[aria-pressed="true"]')].map(c => c.dataset.v));
  }
}

['cfgBody','wizBody'].forEach(id => {
  el(id).addEventListener('input', onFieldInput);
  el(id).addEventListener('click', onFieldClick);
});

/* ======================================================== usage view wiring
   The usage controls live inside the same scroll container as the fields, and
   they are deliberately not fields: they change what is being looked at, not
   what is configured. Nothing here writes to state.values. */
el('cfgBody').addEventListener('click', e => {
  const rb = e.target.closest('[data-range]');
  if(rb){ state.range = rb.dataset.range; save(); renderConfig(); return; }

  if(e.target.closest('[data-refresh]')){ renderConfig(); toast('Usage refreshed'); return; }

  const g = e.target.closest('[data-ids]');
  if(g){
    state.ids = g.dataset.ids === '1';
    renderConfig();
    if(state.ids) toast('Individual rows revealed for this visit');
  }
});
el('cfgBody').addEventListener('change', e => {
  if(e.target.matches('[data-scope]')){ state.scope = e.target.value; save(); renderConfig(); }
});

/* ==================================================================== wiring */
el('menuBody').addEventListener('click', e => {
  if(e.target.closest('[data-init]')){ openWizard(); return; }
  const b = e.target.closest('[data-go]');
  if(b) go(b.dataset.go);
});

el('wizClose').innerHTML = ic('x', 13);
el('wizClose').addEventListener('click', () => closeWizard());
el('wizCancel').addEventListener('click', () => closeWizard());
/* Clicking the dim area behind the dialog dismisses it too. */
el('wizScrim').addEventListener('mousedown', e => { if(e.target === el('wizScrim')) closeWizard(); });

el('wizStart').addEventListener('click', () => {
  if(!tenantName()) return;
  const first = !state.done.init;
  state.done.init = true;
  save();
  closeWizard();
  render();
  if(first){
    toast('Deployment initialised for ' + tenantName());
    go(PAGES[0].id);
  }else{
    toast('Tenant onboarding updated');
  }
});

el('nextBtn').addEventListener('click', () => {
  const m = pageOf(state.id);
  /* ⌘↵ reaches this button even while it is hidden on a usage page. */
  if(isView(m)) return;
  const first = !state.done[m.id];
  state.done[m.id] = true;
  save();
  if(first) toast(m.label + ' configured');

  const i = PAGES.indexOf(m);
  if(i < PAGES.length - 1){ go(PAGES[i + 1].id); }
  else{ renderConfig(); toast('All 12 modules configured — ready to deploy'); }
  renderMenu();
  renderProgress();
});

el('prevBtn').addEventListener('click', () => step(-1));
el('skipBtn').addEventListener('click', () => step(1));

el('resetBtn').addEventListener('click', () => {
  if(!confirm('Clear every choice and start the install over?')) return;
  state.values = {}; state.done = {}; state.id = VIEWS[0].id;
  save();
  render();
  openWizard();
  toast('Configuration cleared');
});

/* ============================================================ theme/density */
el('stThemeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  el('stTheme').textContent = dark ? 'Light' : 'Dark';
  save();
});

const DENSITY = ['compact','comfortable','roomy'];
function setDensity(d, quiet){
  state.density = d;
  if(d === 'comfortable') delete document.documentElement.dataset.density;
  else document.documentElement.dataset.density = d;
  el('stDensity').textContent = d[0].toUpperCase() + d.slice(1);
  if(!quiet) save();
}
el('stDensityBtn').addEventListener('click', () => {
  setDensity(DENSITY[(DENSITY.indexOf(state.density) + 1) % DENSITY.length]);
});

/* =================================================================== keys */
const wizOpen = () => el('wizScrim').dataset.open === 'true';

document.addEventListener('keydown', e => {
  const meta = e.metaKey || e.ctrlKey;
  if(meta && e.key.toLowerCase() === 'j'){ e.preventDefault(); el('stThemeBtn').click(); return; }
  if(meta && e.key === 'Enter'){
    e.preventDefault();
    (wizOpen() ? el('wizStart') : el('nextBtn')).click();
    return;
  }
  if(e.key === 'Escape' && wizOpen()){ closeWizard(); return; }
  if(wizOpen()) return;
  /* Bare arrows only when focus isn't in a control that wants them. */
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if(/INPUT|SELECT|TEXTAREA/.test(tag)) return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); step(1, ALL); }
  if(e.key === 'ArrowUp'){ e.preventDefault(); step(-1, ALL); }
});

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if(id === 'init'){ openWizard(); return; }
  if(ALL.some(m => m.id === id) && id !== state.id){
    state.id = id; save(); renderMenu(); renderConfig();
  }
});

/* ==================================================================== boot */
load();
/* A hash wins over the stored position — a link should land where it points. */
const hash = location.hash.slice(1);
if(ALL.some(m => m.id === hash)) state.id = hash;
el('stTheme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light';
render();

/* Nothing to configure until the tenant exists, so the gate opens itself. */
if(!state.done.init || hash === 'init') openWizard();
