/* ============================================================================
   install.js — renders the initialisation dialog, the menu and the
   configuration surface from MODULES.

   Module 01 is the gate: it arrives as a layer over the page, and the eleven
   configuration modules only become reachable once it is done. Every field is
   addressed as "moduleId.groupIndex.fieldIndex", so one state object holds the
   whole install and the dialog and the page can share every renderer.
   Values persist to localStorage; nothing leaves the page.
   ========================================================================= */

/* ==================================================================== icons
   Same 24px grid, same stroke weight as the workspace. */
const P = {
  flag:'<path d="M5 21V4M5 4h11l-1.6 4L16 12H5"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3.4 9.2h17.2M3.4 14.8h17.2"/><path d="M12 3c2.4 2.6 3.7 5.6 3.7 9S14.4 18.4 12 21c-2.4-2.6-3.7-5.6-3.7-9S9.6 5.6 12 3Z"/>',
  cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  data:'<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  spark:'<path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9Z"/>',
  layers:'<path d="m12 3 9 4.8-9 4.8-9-4.8Z"/><path d="m3 13.2 9 4.8 9-4.8"/>',
  user:'<circle cx="12" cy="9" r="3.2"/><path d="M5.6 19.6a6.7 6.7 0 0 1 12.8 0"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield:'<path d="M12 3l7.5 3v5.6c0 4.3-3.1 7.8-7.5 8.9-4.4-1.1-7.5-4.6-7.5-8.9V6Z"/><path d="m9.2 12 2 2 3.6-3.6"/>',
  branch:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="9" r="2.4"/><path d="M6 8.4v7.2M8.4 6H14a2 2 0 0 1 2 2v.6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M14.6 9.2A2.6 2.6 0 0 0 12 7.8c-1.4 0-2.6.9-2.6 2s1.2 2 2.6 2 2.6.9 2.6 2-1.2 2-2.6 2a2.6 2.6 0 0 1-2.6-1.4M12 6.2v11.6"/>',
  check:'<path d="m5 13 4 4L19 7"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 4.2V3M12 21v-1.2M4.2 12H3M21 12h-1.2M6.5 6.5l-.9-.9M18.4 18.4l-.9-.9M17.5 6.5l.9-.9M5.6 18.4l.9-.9"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>'
};
function ic(name, size){
  const s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
         (P[name] || '') + '</svg>';
}

/* ==================================================================== state
   MODULES[0] is initialisation — the dialog. PAGES are the eleven that get a
   configuration page of their own. */
const KEY   = 'nebulas.install.v1';
const INIT  = MODULES[0];
const PAGES = MODULES.slice(1);

/* What the pinned menu row calls the initialisation dialog. The PRD's own
   name for the admin page ("Tenant Onboarding") stays on the sub-line either
   way, so this label is free to be whatever reads best. */
const INIT_LABEL = 'Deployment setup';

const state = { id:PAGES[0].id, values:{}, done:{}, density:'comfortable' };

const el  = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify({
      id:state.id, values:state.values, done:state.done,
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
    if(s.id && PAGES.some(m => m.id === s.id)) state.id = s.id;
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
  const rows = PAGES.map(m => {
    const cur  = m.id === state.id;
    const done = !!state.done[m.id];
    return '<button class="row mrow" data-go="' + m.id + '" aria-current="' + cur + '">' +
             '<span class="row__icon">' + ic(m.icon, 15) + '</span>' +
             '<span class="row__main">' +
               '<span class="row__title">' + esc(m.label) + '</span>' +
               '<span class="row__sub">' + esc(m.page) + '</span>' +
             '</span>' +
             (done ? '<span class="mrow__state">' + ic('check', 14) + '</span>' : '') +
           '</button>';
  });

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

  /* Three phases. The order is the dependency order, not a preference. */
  el('menuBody').innerHTML = pinned +
    '<div class="menu__group"><span class="t-eyebrow">Foundation</span></div>' + rows.slice(0,3).join('') +
    '<div class="menu__group"><span class="t-eyebrow">Platform</span></div>'   + rows.slice(3,6).join('') +
    '<div class="menu__group"><span class="t-eyebrow">Operations</span></div>' + rows.slice(6).join('');
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

/* =========================================================== configuration */
function renderConfig(){
  const m = mod(state.id);
  const i = PAGES.indexOf(m);
  const done = !!state.done[m.id];

  el('cfgTitle').textContent = m.label;

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

/* ================================================================= progress
   All twelve modules count — initialisation is a dialog, not an exemption. */
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
  if(!PAGES.some(m => m.id === id)) return;
  state.id = id;
  /* The module is in the hash, so a step is linkable and the back button
     walks the install rather than leaving it. */
  if(location.hash.slice(1) !== id) history.pushState(null, '', '#' + id);
  save();
  renderMenu();
  renderConfig();
}
function step(delta){
  const i = PAGES.indexOf(mod(state.id)) + delta;
  if(i >= 0 && i < PAGES.length) go(PAGES[i].id);
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
  const m = mod(state.id);
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
  state.values = {}; state.done = {}; state.id = PAGES[0].id;
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
  if(e.key === 'ArrowDown'){ e.preventDefault(); step(1); }
  if(e.key === 'ArrowUp'){ e.preventDefault(); step(-1); }
});

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if(id === 'init'){ openWizard(); return; }
  if(PAGES.some(m => m.id === id) && id !== state.id){
    state.id = id; save(); renderMenu(); renderConfig();
  }
});

/* ==================================================================== boot */
load();
/* A hash wins over the stored position — a link should land where it points. */
const hash = location.hash.slice(1);
if(PAGES.some(m => m.id === hash)) state.id = hash;
el('stTheme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light';
render();

/* Nothing to configure until the tenant exists, so the gate opens itself. */
if(!state.done.init || hash === 'init') openWizard();
