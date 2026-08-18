/* ============================================================================
   app — shell routing, section renderers, the results column, simulated turns.
   Plain script (not a module) so the file:// protocol works without a server.
   ========================================================================= */
(function(){
'use strict';

const D = window.DATA;

/* ============================================================== utilities */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const nf = n => n.toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function el(tag, cls, html){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
/* Sidebar items are addressed as "kind:id" so one selection slot per section
   can hold several kinds of thing without a second state field. */
function key(kind, id){ return kind + ':' + id; }
function kindOf(v){ const i = String(v).indexOf(':'); return i < 0 ? '' : v.slice(0, i); }
function idOf(v){ const i = String(v).indexOf(':'); return i < 0 ? v : v.slice(i + 1); }
function find(list, id){ return list.filter(x => x.id === id)[0] || list[0]; }
function plural(n, one, many){ return n + ' ' + (n === 1 ? one : (many || one + 's')); }

/* Minimal markdown: ### heading, - bullet, **bold**, *em*, literal <code>. */
function md(src){
  let out = '', list = null, para = [];
  const flushP = () => { if (para.length){ out += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const flushL = () => { if (list){ out += '<ul>' + list.join('') + '</ul>'; list = null; } };
  src.split('\n').forEach(raw => {
    const l = raw.trim();
    if (!l){ flushP(); flushL(); return; }
    if (l.indexOf('### ') === 0){ flushP(); flushL(); out += '<h3>' + inline(l.slice(4)) + '</h3>'; return; }
    if (l.indexOf('- ') === 0){ flushP(); (list = list || []).push('<li>' + inline(l.slice(2)) + '</li>'); return; }
    flushL(); para.push(l);
  });
  flushP(); flushL();
  return out;
}
function inline(s){
  return esc(s)
    .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function highlight(code){
  return esc(code).split('\n').map(line => {
    if (line.indexOf('-') === 0) return '<span class="del">' + line + '</span>';
    if (line.indexOf('+') === 0) return '<span class="add">' + line + '</span>';
    return line
      .replace(/(#.*)$/, '<span class="c">$1</span>')
      .replace(/\b(import|from|def|return|await|async|try|except|raise|class|self|print|not|in|is|for|if|else|None|True|False)\b/g, '<span class="k">$1</span>')
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="s">$1</span>');
  }).join('\n');
}

/* ==================================================================== icons */
const P = {
  /* rail sections — chat, knowledge, build, cloud, account */
  chat:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.7A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/>',
  cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  build:'<path d="M4 5v14l7.3-6.2a1 1 0 0 0 0-1.6Z"/><path d="M20 5v14l-7.3-6.2a1 1 0 0 1 0-1.6Z"/>',
  cloud:'<path d="M7 18.5a4.2 4.2 0 0 1-.5-8.4 5.6 5.6 0 0 1 10.8 1.2A3.7 3.7 0 0 1 17 18.5Z"/>',
  user:'<circle cx="12" cy="9" r="3.2"/><path d="M5.6 19.6a6.7 6.7 0 0 1 12.8 0"/>',

  /* content kinds */
  library:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M11 4h3.5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11z"/><path d="m18.2 5.4 1.7 13.3"/>',
  agent:'<rect x="4" y="7" width="16" height="12" rx="2.5"/><path d="M12 3v4M8.5 12v1.5M15.5 12v1.5"/>',
  data:'<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  layers:'<path d="m12 3 9 4.8-9 4.8-9-4.8Z"/><path d="m3 13.2 9 4.8 9-4.8"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  folder:'<path d="M3 7.5A2 2 0 0 1 5 5.5h3.4l2 2.4H19a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link:'<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
  /* leaving the page — download, share, and the two audiences a link can have */
  down:'<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M5 20h14"/>',
  share:'<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3.4 9.5h17.2M3.4 14.5h17.2"/><path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z"/>',
  users:'<circle cx="9.5" cy="9" r="3"/><path d="M3.7 19a6.1 6.1 0 0 1 11.6 0"/><path d="M16 6.6a3 3 0 0 1 0 5.8"/><path d="M17.6 19a6.5 6.5 0 0 0-1.4-3.2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.6-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10a2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.6 1Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4"/><path d="M12 17h.01"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  retry:'<path d="M20 11a8 8 0 1 0-2 6.2"/><path d="M20 5v6h-6"/>',
  branch:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="9" r="2.4"/><path d="M6 8.4v7.2M8.4 6H14a2 2 0 0 1 2 2v.6"/>',
  file:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6"/>',
  spark:'<path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9Z"/>',
  chevR:'<path d="m9 6 6 6-6 6"/>',
  chevL:'<path d="m15 6-6 6 6 6"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>',
  tool:'<path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 1.9-1.9a3.5 3.5 0 0 0-4.6-4.6L6.4 14.4l-2-2 8-8Z"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  check:'<path d="m5 13 4 4L19 7"/>',
  play:'<path d="M7 4.5 19 12 7 19.5Z"/>',
  table:'<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 10h18M9 10v9.5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  doc:'<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13 3v6h6M9 13h6M9 17h4"/>',
  diff:'<path d="M6 3v12a3 3 0 0 0 3 3h6"/><path d="M3 6h6M15 15l3 3-3 3"/><path d="M18 21V9a3 3 0 0 0-3-3H9"/>',
  open:'<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',

  /* knowledge-detail tabs */
  files:'<path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h6.6L20 7.9v8.6a1.5 1.5 0 0 1-1.5 1.5H16"/><rect x="4" y="8" width="10" height="12" rx="1.5"/>',
  trend:'<path d="m3 16 5.5-5.5 3.5 3.5L21 5"/><path d="M15 5h6v6"/>',
  pie:'<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M14.5 3.4A9 9 0 0 1 20.6 9.5H14.5Z"/>',
  lock:'<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
  pulse:'<path d="M3 12h3.5l2.2-5.5 3.4 11 2.3-5.5H21"/>',
  sort:'<path d="m8.5 10 3.5-3.5L15.5 10"/><path d="m8.5 14 3.5 3.5L15.5 14"/>',
  code:'<path d="m9.5 8.5-4 3.5 4 3.5"/><path d="m14.5 8.5 4 3.5-4 3.5"/>',
  /* One star, outlined or filled — the filled one is the same path with a fill,
     so the two states cannot drift out of shape. */
  star:'<path d="m12 4.3 2.35 4.9 5.35.75-3.9 3.75.95 5.3-4.75-2.6-4.75 2.6.95-5.3L4.3 9.95l5.35-.75Z"/>',
  starOn:'<path d="m12 4.3 2.35 4.9 5.35.75-3.9 3.75.95 5.3-4.75-2.6-4.75 2.6.95-5.3L4.3 9.95l5.35-.75Z" fill="currentColor"/>',
  trash:'<path d="M4.5 7h15M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',

  /* builder kinds — connector, widget, website template, solution */
  plug:'<path d="M9 3v5M15 3v5"/><path d="M7 8h10v3.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/><path d="M12 16.5V21"/>',
  widget:'<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6.5" y="8" width="7" height="8" rx="1"/><path d="M16 8h1.5M16 11h1.5"/>',
  template:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  pkg:'<path d="m12 3 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/><path d="m8 5 8 4"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',

  /* app glyphs — the identity half of an app tile */
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  filetext:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  dollar:'<path d="M12 3v18"/><path d="M16.5 7.5A3.5 3.5 0 0 0 13 5.5h-1.6a2.9 2.9 0 0 0 0 5.8h1.2a3 3 0 0 1 0 6H11a3.5 3.5 0 0 1-3.2-2"/>',
  checksq:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.2 2.8 2.8L16.5 9.3"/>',
  feather:'<path d="M19.4 4.6a5.5 5.5 0 0 0-7.8 0L5 11.2V19h7.8l6.6-6.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M15.5 8.5 5 19M13 11H8.5M16 8h-3"/>',
  idcard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.1"/><path d="M5.8 16.2a3.6 3.6 0 0 1 6.4 0M15 10h3.5M15 13.5h3.5"/>',
  receipt:'<path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21Z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
  news:'<path d="M4 6h11a1 1 0 0 1 1 1v11H6a2 2 0 0 1-2-2Z"/><path d="M16 9h3a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2h-2"/><path d="M7 9h5M7 12h5M7 15h3"/>',
  note:'<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h7L19 9.5v9A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5Z"/><path d="M13 4v6h6"/><path d="M8.5 13.5h6M8.5 16.5h4"/>',

  /* publishing channels. Drawn on the same 24 grid at the same stroke weight as
     everything else — a channel is identified here, not advertised, so these are
     marks in the interface's own hand rather than three imported logos. */
  facebook:'<rect x="4" y="4" width="16" height="16" rx="3.4"/><path d="M15 8.4h-1.6a2 2 0 0 0-2 2V20"/><path d="M9.6 13h4.6"/>',
  instagram:'<rect x="4" y="4" width="16" height="16" rx="4.6"/><circle cx="12" cy="12" r="3.4"/><path d="M16.6 7.6h.01"/>',
  linkedin:'<rect x="4" y="4" width="16" height="16" rx="3.4"/><path d="M8.2 10.6V16"/><path d="M8.2 8.1h.01"/><path d="M11.6 16v-3.2a2.2 2.2 0 0 1 4.2 0V16"/>'
};
function ic(name, size){
  const s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
         (P[name] || '') + '</svg>';
}
const KIND_ICON = { table:'table', diff:'diff', chart:'chart', doc:'doc' };

/* ==================================================================== state */
const state = {
  section:'chat',
  item:{
    chat:'t1',                 /* thread id · 'assistants' · 'schedule' · 'p:id' */
    knowledge:key('kb','k1'),  /* 'kb:id' · 'ds:id' · 'art:id' */
    /* 'as:id' assistant · 'so:id' solution · 'de:id' design element */
    build:key('as','as1'),
    cloud:'c1',              /* a settings page id, or 'cn:id' for a connector */
    account:'profile'
  },
  busy:false,
  model:D.MODELS[0],
  tokens:0, turns:0, tools:0,
  /* The results column is one store for the whole workspace, so it has nothing
     to scope: `id` is the result being read, null the list itself. */
  art:{ id:null, pane:0 },
  app:null,                    /* the app id open in the sheet, or null */
  /* Knowledge detail: which tab, which rows are picked, how they are sorted.
     The tab survives switching bases — you were looking at Files for a
     reason — but a selection does not. */
  kb:{ tab:'files', sel:[], sort:{ c:'added', d:-1 } },
  asst:{ tab:'All' },          /* which assistant filter is showing */
  /* Build's sidebar is Miller columns: `open` is the kind showing in the second
     column, `last` is where you were in each kind so returning to one puts you
     back, and `scope` filters the second column. Scope starts at All — a filter
     that hides content on arrival reads as missing content. */
  build:{ open:'as', scope:'All', last:{} },
  assistant:null,              /* the assistant bound to the next message */
  /* null means "follow the viewport"; true/false is an explicit choice. The app
     rail is not in here: it never closes. */
  pref:{ list:null, art:null },
  appsWide:false,
  lastApp:null,                /* reopened by the topbar toggle and ⌘] */
  /* True while the results column has been lent to an open app panel, so
     closing the app can hand it back. */
  artYielded:false,
  /* The same loan, made by a project page — which has a panel of its own on the
     left and a box on the right, and needs the width for both. `artBefore` is
     what the reader had chosen before the loan, so leaving gives that back
     rather than a guess. */
  projLoan:false,
  artBefore:null
};
let replyIx = 0, newThreadN = 0;
/* Ids for things made in this session. Fixture ids are hand-written, so a
   counter keeps the two from colliding. */
let madeN = 0;

/* Something happened. With an action attached it is also the way back from it,
   which is what a destructive step needs instead of a dialog asking whether you
   meant it — and it stays up three times as long, because an undo nobody has
   time to read is decoration. */
function toast(msg, action){
  const t = el('div','toast','<span style="display:flex">' +
    ic((action && action.icon) || 'check',13) + '</span><span>' + esc(msg) + '</span>');
  const kill = () => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); };
  if (action){
    const b = el('button','toast__act', esc(action.label));
    b.type = 'button';
    b.onclick = () => { kill(); action.run(); };
    t.append(b);
  }
  $('#toasts').append(t);
  setTimeout(kill, action ? 6000 : 2000);
}

/* ===================================================================== time
   Results are kept in one list across every thread, so they need a real
   timestamp to sort and to name a time of day. Fixtures declare an AGE ("2m",
   "1d") rather than a date, because a hand-written date rots on the shelf; the
   age is turned into a timestamp once, here, and everything shown is derived
   from that. */
const T0 = Date.now();
const AGE_MS = { m:60e3, h:3600e3, d:864e5 };
/* "2m", "1h", "2d 5h" — anything unreadable, including "now", means T0. */
function parseAge(s){
  const re = /(\d+)\s*([mhd])/g;
  let ms = 0, m;
  while ((m = re.exec(String(s || '')))) ms += Number(m[1]) * AGE_MS[m[2]];
  return ms;
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const pad2 = n => (n < 10 ? '0' : '') + n;
function startOfDay(ms){ const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function clockTime(ms){ const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
/* The day a result belongs to, named the way somebody would say it aloud. */
function dayLabel(ms){
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(ms);
  return days < 7 ? DAYS[d.getDay()] : d.getDate() + ' ' + MONTHS[d.getMonth()];
}
/* In the list the day is already a heading above, so a row names the time.
   Something that has only just happened says so instead of reading 14:22. */
function stampShort(ms){ return Date.now() - ms < 90e3 ? 'now' : clockTime(ms); }
function stampFull(ms){
  const d = new Date(ms);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' at ' + clockTime(ms);
}

/* ================================================================= sidebar */
function listRow(opts){
  const b = el('button','row');
  b.setAttribute('aria-current', String(!!opts.current));
  b.innerHTML =
    (opts.lead || '') +
    '<span class="row__main">' +
      '<span class="row__title">' + esc(opts.title) + '</span>' +
      (opts.sub ? '<span class="row__sub">' + esc(opts.sub) + '</span>' : '') +
    '</span>' +
    (opts.meta ? '<span class="row__meta">' + esc(opts.meta) + '</span>' : '');
  b.onclick = opts.onClick;
  return b;
}
/* A group header, optionally with a count and the "+" that creates one of its
   members. The count exists because Build's groups are four rows or sixteen,
   and knowing which before scrolling is the whole point of a label. */
function groupLabel(text, add, count){
  const g = el('div','listcol__group', '<span class="t-eyebrow">' + esc(text) + '</span>');
  if (count != null) g.append(el('span','listcol__count', String(count)));
  if (add){
    const b = el('button','iconbtn iconbtn--xs tip tip--below', ic('plus',12));
    b.setAttribute('data-tip', add.tip);
    b.onclick = add.onClick;
    g.append(b);
  }
  return g;
}
const STATE_DOT = { run:'dot--run is-live', ok:'dot--ok', live:'dot--ok', idle:'', warn:'dot--warn', err:'dot--err', beta:'', draft:'', off:'' };
function dotLead(s){ return '<span class="dot ' + (STATE_DOT[s] || '') + '" style="margin-right:2px"></span>'; }

/* =============================================================== sections */
const SECTIONS = {

  /* ------------------------------------------------------------- chat
     The sidebar the sketch draws: new chat, assistants, schedule, then
     projects, then the threads themselves. */
  chat:{
    label:'Chat & tasks', icon:'chat', listTitle:'Chat / Task',
    list(body){
      const pinned = el('div','listcol__pinned');
      pinned.append(listRow({
        lead:'<span class="row__icon">' + ic('plus',13) + '</span>',
        title:'New chat', onClick:() => newThread()
      }));
      pinned.append(listRow({
        lead:'<span class="row__icon">' + ic('agent',13) + '</span>',
        title:'Assistants', meta:String(D.ASSISTANTS.length),
        current:state.item.chat === 'assistants',
        onClick:() => select('chat','assistants')
      }));
      pinned.append(listRow({
        lead:'<span class="row__icon">' + ic('clock',13) + '</span>',
        title:'Schedule', meta:String(D.SCHEDULE.length),
        current:state.item.chat === 'schedule',
        onClick:() => select('chat','schedule')
      }));
      body.append(pinned);

      /* A project is a container, not an event — its age says nothing useful,
         so the row carries the name, the glyph its owner picked, and one mark:
         whether what you put in it is visible to the workspace. Personal is the
         default, so personal is what goes unmarked. */
      body.append(groupLabel('Projects', { tip:'New project', onClick:() => openProject(null) }));
      D.PROJECTS.forEach(p => {
        const row = listRow({
          lead:'<span class="row__icon">' + ic(p.icon || 'folder',13) + '</span>',
          title:p.name,
          current:state.item.chat === key('p', p.id),
          onClick:() => select('chat', key('p', p.id))
        });
        /* A project that runs on its own is a different kind of thing from a
           folder, and the row is where that difference is cheapest to say. */
        if (p.run) row.insertAdjacentHTML('beforeend',
          '<span class="row__flag tip tip--below" data-tip="Runs ' + esc(p.run.every.toLowerCase()) + '">' +
          ic('clock',12) + '</span>');
        if (p.shared) row.insertAdjacentHTML('beforeend',
          '<span class="row__flag tip tip--below" data-tip="Shared with ' + esc(D.ACCOUNT.org) + '">' +
          ic('users',12) + '</span>');
        body.append(row);
      });

      /* One history, ordered by recency. Splitting it into Today / Earlier
         made two headers out of information the timestamps already carry. */
      body.append(groupLabel('History'));
      D.THREADS.forEach(t => body.append(listRow({
        title:t.title, meta:t.when, current:state.item.chat === t.id,
        onClick:() => select('chat', t.id)
      })));
    },
    head(){
      const v = state.item.chat;
      if (v === 'assistants') return { title:'Assistants', sub:D.ASSISTANTS.length + ' defined' };
      if (v === 'schedule')   return { title:'Schedule', sub:D.SCHEDULE.length + ' tasks' };
      if (kindOf(v) === 'p'){
        const p = find(D.PROJECTS, idOf(v));
        return { title:p.name,
                 sub:(p.shared ? 'Shared · ' : 'Personal · ') +
                     plural(D.THREADS.filter(t => t.project === p.id).length, 'thread') };
      }
      const t = find(D.THREADS, v);
      const turns = t.msgs.length ? plural(t.msgs.length, 'turn') : 'empty';
      /* A thread filed in a project says so here: it is the one place the
         scoping is visible once you are reading the conversation. */
      const p = t.project ? find(D.PROJECTS, t.project) : null;
      return { title:t.title, sub:p ? p.name + ' · ' + turns : turns };
    },
    main(body){
      const v = state.item.chat;
      if (v === 'assistants') return assistantsView(body);
      if (v === 'schedule')   return scheduleView(body);
      if (kindOf(v) === 'p')  return projectView(body, find(D.PROJECTS, idOf(v)));
      return threadView(body, find(D.THREADS, v));
    },
    /* A project page borrows the composer into itself rather than having it
       pinned below (see projectView), but it still needs it un-hidden — except
       in Auto program mode, which has no question to type. */
    composer(){
      const v = state.item.chat;
      if (v === 'assistants' || v === 'schedule') return false;
      if (kindOf(v) === 'p') return projMode !== 'Auto program';
      return true;
    }
  },

  /* -------------------------------------------------------- knowledge
     Knowledge bases, the sources feeding them, and the artifacts the
     model has produced. Artifacts live here because they are reference
     material once the thread that made them has scrolled away. */
  knowledge:{
    label:'Knowledge', icon:'cube', listTitle:'Knowledge',
    list(body){
      body.append(groupLabel('Knowledge bases', { tip:'New knowledge base', onClick:() => toast('New knowledge base — prototype') }));
      D.KBS.forEach(k => body.append(listRow({
        lead:dotLead(k.health), title:k.name, sub:k.docs + ' docs',
        current:state.item.knowledge === key('kb', k.id),
        onClick:() => select('knowledge', key('kb', k.id))
      })));

      body.append(groupLabel('Data sources', { tip:'Connect source', onClick:() => select('cloud','c3') }));
      D.DATASETS.forEach(d => body.append(listRow({
        lead:dotLead(d.health), title:d.name, sub:d.source + ' · ' + d.rows + ' rows',
        current:state.item.knowledge === key('ds', d.id),
        onClick:() => select('knowledge', key('ds', d.id))
      })));

      /* Artifacts are not listed here. They live in the pane that renders
         them and on the turn that produced them — a third address for the
         same object was a list nobody opened. */
    },
    head(){
      const v = state.item.knowledge, id = idOf(v);
      if (kindOf(v) === 'ds'){ const d = find(D.DATASETS, id); return { title:d.name, sub:d.source }; }
      const k = find(D.KBS, id);
      return { title:k.name, sub:k.docs + ' docs' };
    },
    main(body){
      const v = state.item.knowledge, id = idOf(v);
      if (kindOf(v) === 'ds')  return datasetView(body, find(D.DATASETS, id));
      return kbView(body, find(D.KBS, id));
    }
  },

  /* ------------------------------------------------------------ build
     "Build mode" in the sketch, and the section where things are made rather
     than used. Three kinds now: the assistant that answers, the solution that
     ships it, and the design it renders as. Skills are chosen inside an
     assistant rather than authored on a page of their own, and scheduled runs
     are already visible in Chat → Schedule — so neither is a menu entry.

     An assistant is defined here and *chosen* in Chat — one object, two verbs.
     Nothing is duplicated between the two: starring in Chat and editing here
     write to the same record. */
  build:{
    label:'Build', icon:'build', listTitle:'Build', miller:true,
    /* Miller columns: kinds on the left, that kind's items beside them, and the
       pane itself as the last column. Two navigable columns is what the
       structure actually is — a kind and a thing — and a Finder reader already
       knows that the left column narrows and the right one lists. */
    list(body){
      const mill = el('div','miller');
      const kinds = el('div','miller__col miller__col--kinds');
      const items = el('div','miller__col');

      BUILD_GROUPS.forEach(g => {
        const on = state.build.open === g.kind;
        /* No count here: the second column's head carries it for the kind you
           are in, and three counts nobody asked for cost the labels their
           width. The chevron is the Finder signal that this opens a column. */
        const b = el('button','row row--mill',
          '<span class="row__icon">' + ic(g.icon, 13) + '</span>' +
          '<span class="row__main"><span class="row__title">' + esc(g.label) + '</span></span>' +
          '<span class="row__chev">' + ic('chevR', 12) + '</span>');
        b.setAttribute('aria-current', String(on));
        /* Opening a kind lands on whatever you last had open in it, the way
           returning to a folder puts you back where you were. */
        b.onclick = () => {
          const list = g.items();
          const want = state.build.last[g.kind];
          const has = list.filter(x => x.id === want)[0];
          state.build.open = g.kind;
          select('build', key(g.kind, (has || list[0] || {}).id));
        };
        kinds.append(b);
      });

      const g = BUILD_GROUPS.filter(x => x.kind === state.build.open)[0] || BUILD_GROUPS[0];
      const all = g.items();
      const shown = scoped(all, x => state.item.build === key(g.kind, x.id));

      /* The second column's own head: what it is showing, how much of it, and
         the "+" that makes another one of exactly this kind. */
      const head = el('div','miller__head',
        '<span class="t-eyebrow">' + esc(g.label) + '</span>' +
        '<span class="listcol__count">' +
          (shown.length !== all.length ? shown.length + '/' + all.length : String(all.length)) +
        '</span>');
      const add = el('button','iconbtn iconbtn--xs tip tip--below', ic('plus',12));
      add.setAttribute('data-tip', g.addTip);
      add.onclick = g.add;
      head.append(add);
      items.append(head);
      items.append(scopeFilter());

      if (!shown.length){
        items.append(el('div','listcol__note', esc(g.empty)));
      } else {
        shown.forEach(x => items.append(listRow({
          lead:g.lead(x), title:x.name, sub:g.sub(x),
          /* Your own things are not labelled as yours — the absence is the
             signal, and the column stays quiet for the common case. */
          meta:x.owner === 'me' ? '' : x.owner,
          current:state.item.build === key(g.kind, x.id),
          onClick:() => select('build', key(g.kind, x.id))
        })));
      }

      mill.append(kinds, items);
      body.append(mill);
    },
    head(){
      const v = state.item.build, id = idOf(v), k = kindOf(v);
      if (k === 'de'){ const d = find(D.DESIGNS, id); return { title:d.name, sub:d.kind === 'widget' ? 'widget' : 'website template' }; }
      if (k === 'so'){ const s = find(D.SOLUTIONS, id); return { title:s.name, sub:s.version + ' · ' + s.users }; }
      const a = find(D.ASSISTANTS, id);
      return { title:a.name, sub:a.team + ' · ' + a.model };
    },
    main(body){
      const v = state.item.build, id = idOf(v), k = kindOf(v);
      if (k === 'de') return designView(body, find(D.DESIGNS, id));
      if (k === 'so') return packageView(body, find(D.SOLUTIONS, id));
      return assistantBuildView(body, find(D.ASSISTANTS, id));
    }
  },

  /* ------------------------------------------------------------ cloud
     Connectors live here rather than in Build: connecting a system is an
     administrative act, usually by a different person than the one composing an
     assistant, and Connections is where they would look for it. Build grants a
     connector; this section is what makes the grant mean anything. */
  cloud:{
    label:'Cloud & settings', icon:'cloud', listTitle:'Cloud',
    list(body){
      const onConn = kindOf(state.item.cloud) === 'cn';
      D.CLOUD.forEach(c => body.append(listRow({
        title:c.name, sub:c.desc,
        /* A connector is a page under Connections, so Connections stays the
           current row while one is open. */
        current:state.item.cloud === c.id || (onConn && c.id === 'c3'),
        onClick:() => select('cloud', c.id)
      })));
    },
    head(){
      if (kindOf(state.item.cloud) === 'cn'){
        const c = find(D.CONNECTORS, idOf(state.item.cloud));
        return { title:c.name, sub:c.kind };
      }
      const c = find(D.CLOUD, state.item.cloud);
      return { title:c.name, sub:'' };
    },
    main(body){
      if (kindOf(state.item.cloud) === 'cn')
        return connectorView(body, find(D.CONNECTORS, idOf(state.item.cloud)));
      cloudView(body, find(D.CLOUD, state.item.cloud));
    }
  },

  /* ---------------------------------------------------------- account */
  account:{
    label:'Account', icon:'user', listTitle:'Account',
    list(body){
      [['profile','Profile','Name, role and plan'],
       ['members','Members','Who can see and act here'],
       ['sessions','Sessions','Where you are signed in']].forEach(([id, name, sub]) =>
        body.append(listRow({
          title:name, sub:sub, current:state.item.account === id,
          onClick:() => select('account', id)
        })));
    },
    head(){
      const a = D.ACCOUNT;
      return { title:{ profile:'Profile', members:'Members', sessions:'Sessions' }[state.item.account], sub:a.email };
    },
    main(body){ accountView(body, state.item.account); }
  }
};

/* The rail order. Account is placed at the foot separately, as drawn. */
const ORDER = ['chat','knowledge','build','cloud'];

/* ---------------------------------------------------------- build groups
   The three kinds Build makes, as data: one entry adds a group to the sidebar
   with its own "+", its own row shape and its own empty line. */
const BUILD_GROUPS = [
  { kind:'as', label:'Assistants', icon:'agent', addTip:'New assistant', add:() => newAssistant(),
    items:() => D.ASSISTANTS,
    lead:a => dotLead(a.state), sub:a => a.model,
    empty:'No assistant here matches this filter.' },

  { kind:'so', label:'Solutions', icon:'pkg', addTip:'New solution', add:() => newPackage(),
    items:() => D.SOLUTIONS,
    lead:() => '<span class="row__icon">' + ic('pkg',13) + '</span>',
    sub:s => s.version + ' · ' + s.state,
    empty:'No solution here matches this filter.' },

  { kind:'de', label:'Design settings', icon:'widget', addTip:'New design element', add:() => newDesign(),
    items:() => D.DESIGNS,
    lead:d => '<span class="row__icon">' + ic(d.kind === 'widget' ? 'widget' : 'template', 13) + '</span>',
    sub:d => d.kind === 'widget' ? 'widget' : 'website template',
    empty:'No design element here matches this filter.' }
];

/* Ownership scope. Two questions get asked of a list this size — "where is the
   one I made" and "what has the rest of the company built" — so the filter
   answers exactly those two, plus the union. `me` is stored on the record, so
   this needs no notion of the signed-in user beyond the label. */
const SCOPES = ['Mine','Teams','All'];
const isMine = x => x.owner === 'me';
/* `keep` survives the filter: the row you are looking at stays in the list even
   when the scope excludes it, because a selection you cannot see is worse than
   a filter that is one row loose. */
function scoped(list, keep){
  const s = state.build.scope;
  if (s === 'All') return list;
  const pred = s === 'Mine' ? isMine : x => !isMine(x);
  return list.filter(x => pred(x) || (keep && keep(x)));
}
function scopeFilter(){
  const wrap = el('div','listcol__filter');
  const seg = segCtl(SCOPES, state.build.scope, v => { state.build.scope = v; render(); });
  /* segCtl sizes to its content for forms; here it governs the list below it,
     so it takes the column's width. */
  seg.style.width = 'auto';
  wrap.append(seg);
  return wrap;
}

/* ------------------------------------------------------- small builders */
function pageHead(title, desc, trailing){
  const h = el('header','pagehead');
  h.innerHTML =
    '<div class="pagehead__row">' +
      '<h2 class="t-display pagehead__title">' + esc(title) + '</h2>' +
      (trailing || '') +
    '</div>' +
    (desc ? '<p class="pagehead__desc">' + esc(desc) + '</p>' : '');
  return h;
}
function sectionHead(title, trailing){
  const h = el('div','section__head');
  h.innerHTML = '<span class="t-eyebrow">' + esc(title) + '</span>' + (trailing || '');
  return h;
}
function emptyState(icon, title, bodyText){
  const e = el('div','empty');
  e.innerHTML =
    '<div class="empty__icon">' + ic(icon, 18) + '</div>' +
    '<div class="empty__title">' + esc(title) + '</div>' +
    '<div class="empty__body">' + esc(bodyText) + '</div>';
  return e;
}
function statGrid(pairs, small){
  const g = el('div','stat-grid');
  pairs.forEach(([k, v]) => {
    const s = el('div','stat',
      '<div class="stat__k">' + esc(k) + '</div><div class="stat__v">' + esc(v) + '</div>');
    if (small && small.indexOf(k) > -1) $('.stat__v', s).style.fontSize = 'var(--t-15)';
    g.append(s);
  });
  return g;
}
function defList(pairs){
  const d = el('dl','deflist');
  pairs.forEach(([k, v]) => {
    d.append(el('dt', null, esc(k)));
    d.append(el('dd', null, v));
  });
  return d;
}
function tableSection(title, head, rows, trailing){
  const sec = el('section','section');
  sec.append(sectionHead(title, trailing));
  /* A header follows its column: if the cells below are right-aligned
     numbers, so is the label above them. */
  const isNum = i => rows.length > 0 && /class="[^"]*\bnum\b/.test(rows[0][i] || '');
  const t = el('table','table table--rows');
  t.innerHTML = '<thead><tr>' + head.map((h, i) => '<th' + (isNum(i) ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead>' +
                '<tbody>' + rows.map(r => '<tr>' + r.join('') + '</tr>').join('') + '</tbody>';
  const sx = el('div','scroll-x');
  sx.append(t);
  sec.append(sx);
  return sec;
}
function codeCard(code){
  const c = el('div','card');
  c.innerHTML = '<div class="card__body" style="padding:var(--s-3)"><pre class="code">' + highlight(code) + '</pre></div>';
  return c;
}
function banner(kind, html){
  /* A warning marked with a question mark reads as an aside. */
  const glyph = kind === 'info' ? 'help' : 'alert';
  const b = el('div','banner banner--' + kind,
    '<span style="display:flex;margin-top:1px">' + ic(glyph,14) + '</span><span>' + html + '</span>');
  b.style.marginBottom = 'var(--s-6)';
  return b;
}
function field(label, control, help){
  const f = el('div','field');
  f.innerHTML = '<div class="field__label"><span>' + esc(label) + '</span></div>';
  f.append(control);
  if (help) f.append(el('div','field__help', esc(help)));
  return f;
}
function selectCtl(options, value, onChange){
  const s = el('select','select');
  options.forEach(o => {
    const opt = el('option', null, esc(o));
    opt.value = o;
    if (o === value) opt.selected = true;
    s.append(opt);
  });
  s.onchange = () => onChange(s.value);
  return s;
}
function rangeCtl(min, max, step, value, fmt){
  const wrap = el('div');
  const out = el('span','field__value', fmt(value));
  const r = el('input','range');
  Object.assign(r, { type:'range', min:min, max:max, step:step, value:value });
  r.oninput = () => out.textContent = fmt(parseFloat(r.value));
  const row = el('div');
  row.style.cssText = 'display:flex;align-items:center;gap:var(--s-3)';
  row.append(r, out);
  wrap.append(row);
  return wrap;
}
function switchCtl(label, on){
  const l = el('label','switch');
  l.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span>' + esc(label) +
                '</span><span class="switch__track"></span>';
  return l;
}
function segCtl(options, value, onChange){
  const s = el('div','seg');
  s.style.width = 'fit-content';
  options.forEach(o => {
    const b = el('button', null, esc(o));
    b.type = 'button';
    b.setAttribute('aria-selected', String(o === value));
    b.onclick = () => {
      $$('button', s).forEach(x => x.setAttribute('aria-selected', String(x === b)));
      onChange(o);
    };
    s.append(b);
  });
  return s;
}

function inputCtl(value, onChange, placeholder){
  const i = el('input','input');
  i.type = 'text';
  i.value = value || '';
  if (placeholder) i.placeholder = placeholder;
  /* Committed on blur or Enter, not on every keystroke: a re-render per
     character would take the caret with it. */
  const commit = () => { if (i.value !== value) onChange(i.value); };
  i.onblur = commit;
  i.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); i.blur(); } };
  return i;
}
function textareaCtl(value, onChange, placeholder){
  const t = el('textarea','textarea');
  t.value = value || '';
  if (placeholder) t.placeholder = placeholder;
  t.rows = 5;
  t.onblur = () => { if (t.value !== value) onChange(t.value); };
  return t;
}

/* ============================================================= build parts
   Every build surface is the same shape — the thing on the left, an inspector
   on the right — so the shell is written once. */
function buildSplit(){
  const wrap = el('div','build');
  const main = el('div','build__main');
  const side = el('aside','build__side');
  wrap.append(main, side);
  return { wrap:wrap, main:main, side:side };
}
function inspectorHead(side, title, meta){
  side.append(el('div','build__sidehead',
    '<span class="t-eyebrow">' + esc(title) + '</span>' +
    (meta ? '<span class="t-mono">' + esc(meta) + '</span>' : '')));
}
function inspectorActs(side, buttons){
  const acts = el('div','build__acts');
  buttons.forEach(b => acts.append(b));
  side.append(acts);
}
function noteP(text){
  const p = el('p','build__note');
  p.textContent = text;
  return p;
}

/* Selection, not settings: nothing happens until the thing being built is
   saved, so these are checkboxes and the whole row is the target. */
function pickList(items, isOn, onToggle){
  const list = el('div','picklist');
  items.forEach(it => {
    const row = el('label','picklist__row');
    const box = el('input','check');
    box.type = 'checkbox';
    box.checked = isOn(it);
    box.onchange = () => onToggle(it, box.checked);
    row.append(box);
    row.append(el('span','picklist__main',
      '<span class="picklist__nm">' + esc(it.nm) + '</span>' +
      (it.sub ? '<span class="picklist__sub">' + esc(it.sub) + '</span>' : '')));
    if (it.meta) row.append(el('span','picklist__meta', esc(it.meta)));
    list.append(row);
  });
  return list;
}

/* What is still missing, stated as a condition rather than a score. Status
   colour carries it — this is data about state, so the accent stays out. */
function checkList(rows){
  const list = el('div','checklist');
  rows.forEach(r => {
    const row = el('div','checklist__row',
      '<span class="checklist__ico">' + ic(r.ok ? 'check' : 'alert', 14) + '</span>' +
      '<span class="checklist__nm">' + esc(r.nm) + '</span>' +
      '<span class="checklist__val">' + esc(r.val) + '</span>');
    row.dataset.ok = String(!!r.ok);
    list.append(row);
  });
  return list;
}

/* ================================================================ messages */
function traceNode(steps, dur, open){
  const t = el('div','trace');
  t.dataset.open = String(!!open);
  t.innerHTML =
    '<button class="trace__sum" type="button">' +
      '<span class="trace__chev" style="display:flex">' + ic('chevR',12) + '</span>' +
      '<span class="trace__ico">' + ic('spark',13) + '</span>' +
      '<span data-label>Worked through ' + steps.length + ' step' + (steps.length === 1 ? '' : 's') + '</span>' +
      '<span class="trace__dur">' + esc(dur || '') + '</span>' +
    '</button>' +
    '<div class="trace__body">' +
      steps.map(s =>
        '<div class="step"><span class="dot dot--ok"></span>' +
        '<span class="step__name">' + esc(s.n) + '</span>' +
        '<span class="step__detail">' + esc(s.d) + '</span>' +
        '<span class="step__t">' + esc(s.t) + '</span></div>').join('') +
    '</div>';
  $('.trace__sum', t).onclick = () => { t.dataset.open = t.dataset.open === 'true' ? 'false' : 'true'; };
  return t;
}

function citesNode(cites){
  const c = el('div','cites');
  c.append(el('span','cites__label','Sources'));
  cites.forEach(s => {
    const b = el('button','chip', '<span style="display:flex;color:var(--text-4)">' + ic('file',12) + '</span>' +
                                  '<span>' + esc(s.n) + '</span>' +
                                  '<span style="color:var(--text-4)">' + esc(s.s) + '</span>');
    b.type = 'button';
    b.onclick = () => toast('Open ' + s.n + ' — prototype');
    c.append(b);
  });
  return c;
}

/* The artifact itself lives in the right pane. What stays in the thread is
   a one-line reference, so a long answer does not push the next turn off
   the screen. */
/* A result names its own shape rather than reading as the generic "result".
   artType is the name in a list ("Table"); artKind the same word in the mono
   footer, where lowercase is the house style. */
const artGlyph = a => a.kind === 'result' ? (RESULT_ICON[a.shape] || 'file') : (KIND_ICON[a.kind] || 'file');
const artType  = a => a.kind === 'result' ? (RESULT_TYPE[a.shape] || 'Result') : (KIND_TYPE[a.kind] || 'File');
const artKind  = a => artType(a).toLowerCase();

function artRefNode(a){
  const b = el('button','artref msg__ref');
  b.dataset.art = a.id;
  b.setAttribute('aria-current', String(state.art.id === a.id));
  b.innerHTML =
    '<span class="artref__ico">' + ic(artGlyph(a),14) + '</span>' +
    '<span class="artref__title">' + esc(a.title) + '</span>' +
    '<span class="artref__meta">' + esc(artKind(a)) + ' · ' + esc(a.size) + '</span>';
  b.onclick = () => openArtifact(a.id);
  return b;
}
function syncArtRefs(){
  $$('.artref').forEach(b => b.setAttribute('aria-current', String(b.dataset.art === state.art.id)));
}

function actionsNode(role){
  const acts = el('div','msg__actions');
  const defs = role === 'ai'
    ? [['copy','Copy'], ['retry','Retry'], ['branch','Branch from here']]
    : [['copy','Copy'], ['branch','Branch from here']];
  defs.forEach(([k, title]) => {
    const b = el('button','iconbtn iconbtn--xs', ic(k, 13));
    b.title = title;
    b.onclick = () => toast(title === 'Copy' ? 'Copied to clipboard' : title + ' — prototype');
    acts.append(b);
  });
  return acts;
}

function msgNode(m){
  const wrap = el('div','msg');
  wrap.dataset.role = m.role;
  const head = el('div','msg__head');
  head.innerHTML =
    '<span class="msg__who">' + (m.role === 'user' ? 'You' : esc(state.model)) + '</span>' +
    (m.dur ? '<span class="msg__meta" data-dur>' + esc(m.dur) + '</span>' : '');
  head.append(actionsNode(m.role));
  wrap.append(head);

  if (m.role === 'ai' && m.steps && m.steps.length){
    const t = traceNode(m.steps, m.dur);
    t.classList.add('msg__trace');
    wrap.append(t);
  }
  wrap.append(el('div','prose', m.role === 'user' ? '<p>' + inline(m.text) + '</p>' : md(m.md)));
  /* A live widget stays in the thread. Its outcome is what reaches the artifact
     column, and it goes there as a result rather than by moving. */
  if (m.liveId && LIVE[m.liveId]) wrap.append(liveHost(LIVE[m.liveId]));
  if (m.artifactId){
    const a = D.ARTIFACT_BY_ID(m.artifactId);
    if (a) wrap.append(artRefNode(a));
  }
  if (m.cites && m.cites.length) wrap.append(citesNode(m.cites));
  return wrap;
}

/* ========================================================== live widgets
   A turn can hand back something to act on rather than only something to read:
   a form, a questionnaire, a chart to switch, a table to sort, a snippet to
   read. One per turn — two things to act on in one answer and neither gets
   acted on.

   State lives in the instance, never in the DOM, so a widget survives being
   re-rendered — after acting on it, or after leaving the section and coming
   back. What leaves the thread is not the widget but its outcome, filed in the
   results column under a name (see syncResult). */
const LIVE = {};
let liveN = 0;
const WIDGET_ICON = { form:'filetext', quiz:'checksq', chart:'chart', table:'table', code:'code' };

function makeLive(spec, from){
  const w = Object.assign({}, spec, {
    id:'w' + (++liveN),
    from:from,
    answers:{},      /* quiz: question index -> chosen option */
    added:[],        /* form: rows submitted so far */
    series:spec.series, ser:0,
    variant:spec.variants ? Object.keys(spec.variants)[0] : null,
    sort:null,
    told:false       /* whether its first result has been announced */
  });
  LIVE[w.id] = w;
  return w;
}

/* The widget stays in the thread. It is where the question was asked and where
   the acting happens; what leaves it is the OUTCOME, which lands in the
   artifact column as a named result. Nothing is relocated. */
function liveNode(w){
  const wrap = el('section','live');
  wrap.dataset.kind = w.kind;
  wrap.append(el('div','live__head',
    '<span class="live__ico">' + ic(WIDGET_ICON[w.kind] || 'file', 14) + '</span>' +
    '<span class="live__title">' + esc(w.title) + '</span>' +
    '<span class="live__meta">' + esc(w.meta || w.kind) + '</span>'));

  const body = el('div','live__body');
  LIVE_KIND[w.kind](body, w);
  wrap.append(body);

  const foot = liveFoot(w);
  if (foot) wrap.append(foot);
  return wrap;
}
function liveFoot(w){
  let text = '';
  if (w.kind === 'form')  text = w.added.length ? plural(w.added.length, w.done) : w.note || '';
  if (w.kind === 'quiz'){
    const n = Object.keys(w.answers).length;
    text = n === w.questions.length ? 'answered' : n + ' of ' + w.questions.length + ' answered';
  }
  if (w.kind === 'chart') text = w.series[w.ser].n + ' · ' + w.series[w.ser].unit;
  if (w.kind === 'table') text = plural(w.rows.length, 'row') + (w.sort ? ' · sorted by ' + w.cols[w.sort.c] : '');
  if (w.kind === 'code')  text = w.variant;
  return text ? el('div','live__foot', esc(text)) : null;
}

/* --------------------------------------------------------------- the kinds */
const LIVE_KIND = {

  /* A form writes somewhere, so it says where in its own footer and confirms
     each row it accepted rather than only announcing success once. */
  form(body, w){
    const grid = el('div','live__grid');
    const inputs = {};
    w.fields.forEach(f => {
      const wrap = el('label','live__field', '<span class="live__lab">' + esc(f.k) + '</span>');
      const i = el('input','input');
      i.type = 'text';
      i.placeholder = f.ph;
      i.value = w['v_' + f.k] || '';
      i.oninput = () => { w['v_' + f.k] = i.value; sync(); };
      inputs[f.k] = i;
      wrap.append(i);
      grid.append(wrap);
    });
    body.append(grid);

    const row = el('div','live__acts');
    const add = el('button','btn btn--primary btn--sm', ic('plus',13) + esc(w.action));
    const first = w.fields[0].k;
    function sync(){ add.disabled = !(w['v_' + first] || '').trim(); }
    add.onclick = () => {
      w.added.push(w.fields.map(f => (w['v_' + f.k] || '').trim() || '—'));
      w.fields.forEach(f => { delete w['v_' + f.k]; });
      rerender(w);
      toast(w.action + ' — ' + w.added[w.added.length - 1][0]);
    };
    sync();
    row.append(add);
    if (w.added.length){
      const undo = el('button','btn btn--ghost btn--sm','Undo last');
      undo.onclick = () => { w.added.pop(); rerender(w); };
      row.append(undo);
    }
    body.append(row);

    if (w.added.length){
      const list = el('div','artlist');
      list.style.marginTop = 'var(--s-3)';
      w.added.forEach(r => list.append(el('div','artlist__row',
        '<span class="artlist__k">' + esc(r[0]) + '</span>' +
        '<span class="artlist__v">' + esc(r.slice(1).filter(x => x !== '—').join(' · ')) + '</span>')));
      body.append(list);
    }
  },

  /* A questionnaire is only worth answering if answering changes something, so
     the outcome block appears when the last question is answered — and it is
     built from what was chosen, not from a fixed script. */
  quiz(body, w){
    w.questions.forEach((q, i) => {
      const box = el('div','live__q');
      box.append(el('div','live__qt', esc(q.q)));
      const opts = el('div','live__opts');
      q.options.forEach(o => {
        const b = el('button','live__opt', esc(o));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(w.answers[i] === o));
        b.onclick = () => {
          /* Clicking the chosen answer again clears it — an answer you cannot
             take back is an answer you hesitate to give. */
          if (w.answers[i] === o) delete w.answers[i]; else w.answers[i] = o;
          rerender(w);
        };
        opts.append(b);
      });
      box.append(opts);
      body.append(box);
    });

    const done = w.questions.every((q, i) => w.answers[i]);
    if (!done) return;
    const out = w.outcomeBy ? w.outcomeBy[w.answers[0]] : w.outcome;
    if (!out) return;
    const block = el('div','live__out');
    block.append(el('div','live__outt',
      inline(String(out.text).replace(/\{(\d)\}/g, (m, d) => w.answers[Number(d) - 1] || ''))));
    /* A definition list, not the results column's label-against-right-aligned
       value: an outline's keys are "1" and "2" and its text has to start at a
       column, not end at one. */
    if (out.rows) block.append(defList(out.rows.map(r => [r[0], esc(r[1])])));
    body.append(block);
  },

  /* Two series of the same quarter is two answers, so the switch is part of the
     chart rather than a second chart below it. */
  chart(body, w){
    if (w.series.length > 1){
      const seg = segCtl(w.series.map(s => s.n), w.series[w.ser].n, v => {
        w.ser = w.series.map(s => s.n).indexOf(v);
        rerender(w);
      });
      seg.style.marginBottom = 'var(--s-3)';
      body.append(seg);
    }
    const s = w.series[w.ser];
    /* Negative values exist in a variance chart, so the scale is the largest
       magnitude either way and the bar takes the loss colour when it is one. */
    const max = Math.max.apply(null, s.bars.map(b => Math.abs(b[1]))) || 1;
    /* One decimal for the whole series or none for the whole series: $1M beside
       $3.1M reads as a different unit. */
    const dec = s.bars.some(b => b[1] % 1 !== 0) ? 1 : 0;
    const list = el('div','barlist');
    s.bars.forEach(([k, v]) => {
      const neg = v < 0;
      const row = el('div','barlist__row',
        '<span class="barlist__k">' + esc(k) + '</span>' +
        '<span class="meter' + (neg ? ' meter--down' : '') + '">' +
          '<i style="width:' + Math.round(Math.abs(v) / max * 100) + '%"></i></span>' +
        '<span class="barlist__v' + (neg ? ' delta-dn' : '') + '">' +
          esc((neg ? '' : '+') + v.toFixed(dec)) + '</span>');
      list.append(row);
    });
    body.append(list);
  },

  /* Sorting is the interaction a table wants. It sorts numerically when the
     column is numeric, because "412,000" and "96,500" sort backwards as text. */
  table(body, w){
    /* A typographic minus (U+2212) is what a figure written by a human carries,
       and treating it as text is how "−184,000" sorts above "12,400". Both the
       test and the parse normalise it. */
    const plain = v => String(v).replace(/−/g, '-');
    const num = i => w.rows.every(r => /^[-+$\d.,%\s]+$/.test(plain(r[i])));
    const rows = w.sort
      ? w.rows.slice().sort((a, b) => {
          const c = w.sort.c, d = w.sort.d;
          if (num(c)){
            const f = v => parseFloat(plain(v).replace(/[^\d.-]/g,'')) || 0;
            return (f(a[c]) - f(b[c])) * d;
          }
          return String(a[c]).localeCompare(String(b[c])) * d;
        })
      : w.rows;

    const sx = el('div','scroll-x');
    const t = el('table','table table--rows');
    const thead = el('thead');
    const tr = el('tr');
    w.cols.forEach((c, i) => {
      const active = w.sort && w.sort.c === i;
      const glyph = active
        ? ic('chevD',12).replace('<svg','<svg style="rotate:' + (w.sort.d > 0 ? '180deg' : '0deg') + '"')
        : ic('sort',13);
      const th = el('th', num(i) && i ? 'num' : null,
        '<button type="button">' + esc(c) + '<span class="sortic">' + glyph + '</span></button>');
      if (active) th.setAttribute('aria-sort', w.sort.d > 0 ? 'ascending' : 'descending');
      th.firstChild.onclick = () => {
        w.sort = { c:i, d:active ? -w.sort.d : 1 };
        rerender(w);
      };
      tr.append(th);
    });
    thead.append(tr);
    t.append(thead);
    const tb = el('tbody');
    rows.forEach(r => {
      const row = el('tr');
      r.forEach((v, i) => {
        const last = i === r.length - 1;
        const flag = last && /^(real|check|yes)$/.test(String(v));
        row.append(el('td', (num(i) && i ? 'num' : '') + (flag ? ' t-mono' : ''),
          flag ? '<span style="color:var(--warn)">' + esc(v) + '</span>' : esc(v)));
      });
      tb.append(row);
    });
    t.append(tb);
    sx.append(t);
    body.append(sx);
  },

  code(body, w){
    const names = Object.keys(w.variants);
    if (names.length > 1){
      const seg = segCtl(names, w.variant, v => { w.variant = v; rerender(w); });
      seg.style.marginBottom = 'var(--s-3)';
      body.append(seg);
    }
    body.append(el('pre','code', highlight(w.variants[w.variant])));
    const row = el('div','live__acts');
    const copy = el('button','btn btn--secondary btn--sm', ic('copy',13) + 'Copy');
    copy.onclick = () => toast('Copied ' + w.variant + ' to clipboard');
    row.append(copy);
    body.append(row);
  }
};

/* Acting on a widget re-renders it in place and re-derives its result, which is
   the only thing that leaves the thread. */
function rerender(w){
  const host = $('[data-live="' + w.id + '"]');
  if (host){
    host.innerHTML = '';
    host.append(liveNode(w));
  }
  syncResult(w);
}
function liveHost(w){
  const host = el('div','live__host');
  host.dataset.live = w.id;
  host.append(liveNode(w));
  return host;
}

/* ================================================================= results
   ONE store for the whole workspace. A widget is where you work; the moment its
   output is settled — a questionnaire answered, a contact added, a series
   chosen — that output is recorded under a name, next to every other result
   whatever thread produced it. The thread it came from is a property of the
   result, not a filing cabinet: you go looking for the thing you made, and it
   is easier to remember what it was than which conversation it happened in.

   Settled is a real condition, not a timer: an unanswered questionnaire and an
   empty form have no outcome, so they have no result, and clearing them takes
   the result away again. */
const RESULT_ICON = { list:'doc', grid:'table', bars:'chart', doc:'doc', code:'code' };
/* What kind of thing a result is, for the list row, the pane footer and the
   file it downloads as. Results have one pane, so this never shows up as a tab
   label — "Form · 1 row" is what it is for, and "rows · 1 row" was the bug. */
const RESULT_TYPE = { list:'Form', grid:'Table', bars:'Chart', doc:'Document', code:'Source' };
const KIND_TYPE   = { table:'Table', chart:'Chart', doc:'Document', diff:'Diff' };

function liveResult(w){
  if (w.kind === 'form'){
    if (!w.added.length) return null;
    return { shape:'list', size:plural(w.added.length, 'row'),
             rows:w.added.map(r => [r[0], r.slice(1).filter(x => x !== '—').join(' · ')]) };
  }
  if (w.kind === 'quiz'){
    if (!w.questions.every((q, i) => w.answers[i])) return null;
    const out = w.outcomeBy ? w.outcomeBy[w.answers[0]] : w.outcome;
    if (!out) return null;
    const text = String(out.text).replace(/\{(\d)\}/g, (m, d) => w.answers[Number(d) - 1] || '');
    return { shape:'doc', size:plural((out.rows || []).length, 'line'),
             md:[text, ''].concat((out.rows || []).map(r => '- **' + r[0] + '** — ' + r[1])).join('\n') };
  }
  if (w.kind === 'chart'){
    const s = w.series[w.ser];
    return { shape:'bars', size:plural(s.bars.length, 'bar'), unit:s.unit, series:s.n, bars:s.bars };
  }
  if (w.kind === 'table'){
    return { shape:'grid', size:plural(w.rows.length, 'row'), cols:w.cols, rows:w.rows };
  }
  return { shape:'code', size:w.variant, code:w.variants[w.variant] };
}

/* The fixtures are authored with an age; the store runs on timestamps. Done
   once, before anything reads the list. */
function initResults(){
  D.ARTIFACTS.forEach(a => { if (a.at == null) a.at = T0 - parseAge(a.when); });
}
/* Newest first. The store is one list, so this ordering is the whole index. */
function allResults(){ return D.ARTIFACTS.slice().sort((x, y) => y.at - x.at); }

/* Filing something that is not a chat widget — an app panel's extraction, say.
   Same rule as a widget's outcome: kept under a name, and the column opens
   because there is now something in it. Re-filing updates in place, so pressing
   Save twice does not leave two of the same thing. */
function fileResult(rec){
  const prev = D.ARTIFACT_BY_ID(rec.id);
  upsertResult(Object.assign({
    kind:'result',
    at:prev ? prev.at : Date.now(),
    share:prev ? prev.share : null
  }, rec));
  /* The toast says it either way; the column only opens itself if there is room
     for it beside whatever else the reader has open. */
  if (!prev && roomForArt()){ state.pref.art = true; applyPanels(); }
  renderArtifact();
  toast((prev ? 'Result updated — ' : 'Result saved — ') + rec.title);
}

function upsertResult(rec){
  const i = D.ARTIFACTS.map(a => a.id).indexOf(rec.id);
  if (i > -1) D.ARTIFACTS[i] = rec; else D.ARTIFACTS.push(rec);
}
function dropResult(id){
  const i = D.ARTIFACTS.map(a => a.id).indexOf(id);
  if (i < 0) return;
  D.ARTIFACTS.splice(i, 1);
  /* Reading a result that has just stopped existing: fall back to the list. */
  if (state.art.id === id) state.art.id = null;
  /* A column with nothing in it has no claim on the width. Handing the choice
     back to null rather than setting false means the next result opens it. */
  if (!D.ARTIFACTS.length){ state.pref.art = null; applyPanels(); }
}
function syncResult(w){
  const id = 'r-' + w.id;
  const spec = liveResult(w);
  if (!spec){ dropResult(id); renderArtifact(); return; }
  const prev = D.ARTIFACT_BY_ID(id);
  upsertResult(Object.assign({
    id:id, kind:'result', title:w.res || w.title, from:w.from,
    /* When it first settled, not when it was last touched: sorting a table it
       already produced is not a new result, and a list that reshuffles itself
       under the reader is a list nobody trusts. */
    at:prev ? prev.at : Date.now(),
    share:prev ? prev.share : null
  }, spec));
  renderArtifact();
  /* A result appearing where there was none is the moment the column has
     something to show — including after an undo took the last one away. The
     toast is said once per widget: on every row added it would train people to
     ignore it. */
  if (!prev){
    if (roomForArt()){ state.pref.art = true; applyPanels(); }
    if (!w.told){
      w.told = true;
      toast('Result saved — ' + (w.res || w.title));
    }
  }
}

/* ================================================================== views */
/* ------------------------------------------------------------------ hero
   What an empty thread shows instead of saying it is empty. Two modes, and
   starters that write themselves into the composer directly below — the
   moment a reader is deciding what to ask is the moment to offer something.
   Mode is view state, not app state: it dies with the empty thread. */
const STARTERS = {
  'Work':['Documentation','Slide','Visualization','Explanation','Sales insight','CV filter'],
  'Data Discovery':['Profile a table','Find anomalies','Join two sources','Chart a trend','Explain a metric']
};
let heroMode = 'Work';
let heroNew = false;           /* the new-dashboard form is open */

/* The composer is a single node with its listeners already bound, so it MOVES
   between the pages that borrow it and its pinned position rather than being
   rebuilt. Anything that clears #mainBody has to hand it back first or it is
   destroyed — and hand back its placeholder too, since a page that borrows it
   may have relabelled it. */
let COMPOSER_PH = '';
function detachComposer(){
  const c = $('#composerWrap');
  c.classList.remove('composer-wrap--inline');
  $('#composerInput').placeholder = COMPOSER_PH;
  $('.chatpane').append(c);
}
/* Borrowed into the page itself rather than pinned under it: in the hero
   because the box is what the starters write into, in a project because
   starting a conversation there is what the page is for. The placeholder is the
   one thing that changes with the context, so it is the argument. */
function inlineComposer(placeholder){
  const c = $('#composerWrap');
  c.classList.add('composer-wrap--inline');
  if (placeholder) $('#composerInput').placeholder = placeholder;
  return c;
}

function heroNode(){
  const h = el('div','hero');
  if (heroMode === 'Data Discovery') h.classList.add('hero--tall');
  h.append(el('h2','t-display hero__title','How can I help you?'));

  const modes = Object.keys(STARTERS);
  h.append(segCtl(modes, heroMode, m => { heroMode = m; heroNew = false; render(); }));

  /* A starter runs its case rather than typing a word into the box. Half a
     prompt is not an offer — a tester needs a way into a conversation, not a
     head start on writing one. */
  const row = el('div','hero__starters');
  STARTERS[heroMode].forEach(s => {
    const c = D.CASES[s];
    const b = el('button','chip chip--plain', ic('play',11) + '<span>' + esc(s) + '</span>');
    b.type = 'button';
    b.title = c ? c.ask : 'Start a message';
    b.onclick = () => {
      if (!c){
        const i = $('#composerInput');
        i.value = s; autosize();
        $('#sendBtn').disabled = false; i.focus();
        return;
      }
      runCase(s);
    };
    row.append(b);
  });
  h.append(row);
  h.append(el('p','hero__note',
    'Each one runs a worked example. Anything definite it produces is kept in the results column on the right.'));

  /* The input follows the starters, because a starter is a half-written
     message and the place it lands should be the next thing under it. */
  h.append(inlineComposer());

  if (heroMode === 'Data Discovery') h.append(dashboardsNode());
  return h;
}

/* ------------------------------------------------------------- dashboards
   Data Discovery is not only a way to ask questions, so the mode carries the
   thing those questions build: dashboards, each bound to one source. */
function dashboardsNode(){
  const wrap = el('div','hero__dash');

  const head = el('div','hero__dashhead');
  head.innerHTML = '<span class="t-eyebrow">Dashboards</span>' +
                   '<span class="t-mono">' + D.DASHBOARDS.length + '</span>' +
                   '<span style="flex:1"></span>';
  const add = el('button','btn btn--secondary btn--sm', ic('plus',13) + 'New dashboard');
  add.type = 'button';
  add.onclick = () => { heroNew = !heroNew; render(); };
  head.append(add);
  wrap.append(head);

  if (heroNew) wrap.append(newDashNode());

  const grid = el('div','grid-cards');
  D.DASHBOARDS.forEach(db => grid.append(dashCard(db)));
  wrap.append(grid);
  return wrap;
}

function dashCard(db){
  const ds = find(D.DATASETS, db.ds);
  const c = el('article','card card--dash');
  c.innerHTML =
    '<div class="card__head">' +
      '<span class="card__title">' + esc(db.name) + '</span>' +
      '<span style="flex:1"></span>' +
      '<span class="badge badge--mono">' + esc(db.kind) + '</span>' +
    '</div>';
  const b = el('div','card__body');
  b.innerHTML =
    '<div class="dash__tiles">' +
      db.tiles.map(([k, v]) =>
        '<span class="dash__tile"><span class="stat__k">' + esc(k) + '</span>' +
        '<span class="dash__v">' + esc(v) + '</span></span>').join('') +
    '</div>' +
    '<span class="sparkbars dash__spark" style="margin-top:var(--s-3)">' +
      db.bars.map(v => '<i style="height:' + v + '%"></i>').join('') +
    '</span>' +
    '<div class="dash__foot">' +
      '<span class="t-mono">' + esc(ds.name) + '</span>' +
      '<span class="t-mono">' + esc(db.updated) + '</span>' +
    '</div>';
  c.append(b);
  const open = el('button','btn btn--ghost btn--sm','Open');
  open.type = 'button';
  open.onclick = () => toast('Open ' + db.name + ' — prototype');
  c.querySelector('.dash__foot').append(open);
  return c;
}

/* Only sources the user holds a grant on can back a dashboard. The ones they
   cannot use are named rather than hidden — a picker that silently omits them
   reads as a missing source, not as a permission. */
function newDashNode(){
  const usable = D.DATASETS.filter(d => d.grant);
  const blocked = D.DATASETS.filter(d => !d.grant);

  const card = el('section','card card--raised');
  card.style.marginBottom = 'var(--s-3)';
  card.innerHTML = '<div class="card__head"><span class="card__title">New dashboard</span></div>';
  const b = el('div','card__body');

  let name = '', src = usable[0], kind = D.DASH_KINDS[0];

  const nameIn = el('input','input');
  nameIn.placeholder = 'Dashboard name';
  nameIn.oninput = () => { name = nameIn.value; createBtn.disabled = !name.trim(); };
  b.append(field('Name', nameIn));

  /* The option carries the grant, so the picker says what you may do with a
     source rather than only that you may see it. Matched whole, not by prefix
     — one source name can be the start of another. */
  const label = d => d.name + ' · ' + d.grant;
  b.append(field('Source',
    selectCtl(usable.map(label), label(src),
      v => { src = usable.filter(d => label(d) === v)[0] || src; }),
    blocked.length
      ? plural(usable.length, 'source') + ' shared with you. ' +
        blocked.map(d => d.name).join(', ') + ' is not.'
      : 'Every source is shared with you.'));

  b.append(field('View', segCtl(D.DASH_KINDS, kind, v => { kind = v; })));

  const row = el('div');
  row.style.cssText = 'display:flex;gap:var(--s-2);margin-top:var(--s-2)';
  const createBtn = el('button','btn btn--primary btn--sm','Create dashboard');
  createBtn.type = 'button';
  createBtn.disabled = true;
  createBtn.onclick = () => {
    D.DASHBOARDS.unshift({
      id:'db' + (D.DASHBOARDS.length + 1), name:name.trim(), ds:src.id, kind:kind, updated:'just now',
      tiles:[['Rows', src.rows],['Source', src.source]],
      /* A new dashboard has nothing measured yet, so the sparkline is flat
         rather than invented. */
      bars:[8,8,8,8,8,8,8,8]
    });
    heroNew = false;
    toast('Created "' + name.trim() + '" on ' + src.name);
    render();
  };
  const cancel = el('button','btn btn--ghost btn--sm','Cancel');
  cancel.type = 'button';
  cancel.onclick = () => { heroNew = false; render(); };
  row.append(createBtn, cancel);
  b.append(row);

  card.append(b);
  return card;
}

/* The results column is not scoped to the thread, so opening one leaves it
   alone: what you were reading stays open, and the store is the same store. */
function threadView(body, t){
  if (!t.msgs.length){
    /* The hero centres itself in the pane, so it skips the reading measure. */
    body.append(heroNode());
    recount(t);
    return;
  }
  const wrap = el('div','pane__measure');
  t.msgs.forEach(m => wrap.append(msgNode(m)));
  body.append(wrap);
  recount(t);
}

/* ================================================= an assistant, in detail
   A card in the list says enough to choose between two assistants; it does not
   say enough to trust one with a question. So clicking a card opens the whole
   record over the list — what model it runs, what it can do, what to ask it
   first, what it may reach, and the instructions it was given.

   An overlay, not a page, because of why you opened it: to decide whether this
   is the one you want and then get on with asking it something. Clicking an
   example does exactly that in one step — see useExample. */
const ASST_TABS = [
  { id:'config', nm:'Configuration', ico:'copy' },
  { id:'logs',   nm:'Logs',          ico:'files' },
  { id:'act',    nm:'Activity',      ico:'pulse' },
  { id:'access', nm:'Access',        ico:'lock' }
];
let asstOn = null;                 /* the assistant being read */
let asstTab = 'config';

/* Every example this assistant offers, flattened in capability order — the
   shortcut in the identity column, before anything has been read. */
function asstPrompts(a){
  const out = [];
  a.skills.forEach(sk => (a.ex[sk] || []).forEach(x => out.push(x)));
  return out;
}
/* The one line a section heading needs to explain itself. */
const infoTip = text =>
  '<span class="tip" data-tip="' + esc(text) + '" style="display:flex;color:var(--text-4)">' +
  ic('help',13) + '</span>';
/* The same thing at the end of a sentence rather than beside a heading, which
   is a different display value and nothing else. */
const inlineTip = text =>
  '<span class="tip" data-tip="' + esc(text) + '" ' +
  'style="display:inline-flex;vertical-align:-2px;color:var(--text-4)">' + ic('help',13) + '</span>';

function openAssistant(a){
  asstOn = a;
  asstTab = 'config';
  $('#asstGlyph').innerHTML = ic('agent',20);
  $('#asstName').textContent = a.name;
  $('#asstDesc').textContent = a.desc;

  const ep = $('#asstEndpoint'), rec = $('#asstRecord');
  ep.textContent = a.endpointId;
  ep.title = 'Endpoint id — what an API call addresses. Click to copy.';
  ep.onclick = () => copyText(a.endpointId);
  rec.textContent = 'ID: ' + a.recordId;
  rec.title = 'Record id — what a support ticket quotes. Click to copy.';
  rec.onclick = () => copyText(a.recordId);

  /* The examples, up here as well as inside their capabilities: from the list
     you are choosing an assistant BY the question you have. */
  const ex = $('#asstEx');
  ex.innerHTML = '';
  asstPrompts(a).forEach(p => ex.append(exampleChip(a, p)));

  const who = a.owner === 'me' ? D.ACCOUNT.name : a.owner;
  $('#asstMeta').innerHTML =
    '<span style="display:flex;color:var(--text-4)">' + ic('cloud',14) + '</span>' +
    '<span>' + esc(D.ACCOUNT.org) + '</span>' +
    '<span style="color:var(--line-strong)">|</span>' +
    '<span class="initial">' + esc(who.slice(0, 1).toUpperCase()) + '</span>' +
    '<span>' + esc(who) + '</span>' +
    '<span class="badge badge--mono">' + esc(a.team) + '</span>';
  $('#asstUpd').textContent = 'Last updated ' + stampFull(T0 - parseAge(a.upd));

  renderAsstTabs();
  renderAsstBody();
  $('#asstScrim').dataset.open = 'true';
}
function closeAssistant(){
  $('#asstScrim').dataset.open = 'false';
  asstOn = null;
}
function renderAsstTabs(){
  const bar = $('#asstTabs');
  bar.innerHTML = '';
  ASST_TABS.forEach(t => {
    const b = el('button','tab', ic(t.ico,14) + '<span>' + esc(t.nm) + '</span>');
    b.type = 'button';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(asstTab === t.id));
    b.onclick = () => { asstTab = t.id; renderAsstTabs(); renderAsstBody(); };
    bar.append(b);
  });
}

/* An example, as a button. It is the fastest path out of this overlay and into
   a conversation, which is why it appears twice and looks the same both times. */
function exampleChip(a, text){
  const b = el('button','exchip', esc(text));
  b.type = 'button';
  b.title = 'Ask ' + a.name + ' this';
  b.onclick = () => useExample(a, text);
  return b;
}

/* ----------------------------------------------------------- configuration */
function asstConfig(body, a){
  const model = el('section','section');
  model.append(sectionHead('Model configuration'));
  const m = el('div','detrow');
  m.innerHTML =
    '<span class="detrow__ico">' + ic('spark',14) + '</span>' +
    '<span class="detrow__nm">' + esc(a.model) + '</span>' +
    '<span class="detrow__meta">Temperature ' + a.temp.toFixed(1) + '</span>';
  model.append(m);
  /* The three switches that change how an answer is produced, stated rather
     than hidden behind the word "settings". */
  const flags = [
    ['Cites its sources', a.opts.cite],
    ['Confirms before writing anywhere', a.opts.confirm],
    ['Extended thinking', a.opts.think]
  ].filter(f => f[1]).map(f => f[0]);
  if (flags.length) model.append(helpNote(flags.join(' · ')));
  body.append(model);

  const caps = el('section','section');
  caps.append(sectionHead('Capabilities',
    infoTip('What this assistant may call, and what to ask it. Skills are chosen here, never authored.')));
  a.skills.forEach(sk => {
    const c = el('div','capa');
    c.append(el('div','capa__head',
      '<span class="capa__nm">' + esc(sk) + '</span>' +
      '<span class="capa__desc">' + esc(D.SKILL_DESC[sk] || '') + '</span>'));
    const list = a.ex[sk] || [];
    if (list.length){
      const row = el('div','capa__ex');
      list.forEach(x => row.append(exampleChip(a, x)));
      c.append(row);
    }
    caps.append(c);
  });
  body.append(caps);

  const tools = el('section','section');
  tools.append(sectionHead('Tools',
    infoTip('The systems this assistant may reach. Granted here, connected in Cloud.')));
  const conns = (a.conn || []).map(id => byId(D.CONNECTORS, id)).filter(Boolean);
  if (!conns.length){
    tools.append(helpNote('No connectors granted. It answers from its knowledge base and nothing else.'));
  }
  conns.forEach(c => {
    const r = el('div','detrow');
    r.innerHTML =
      '<span class="detrow__ico">' + ic(CONN_ICON[c.kind] || 'plug',14) + '</span>' +
      '<span class="detrow__nm">' + esc(c.name) + '</span>' +
      '<span class="detrow__meta">' + esc(c.writes ? 'read · write' : 'read-only') + '</span>' +
      dotLead(c.state);
    tools.append(r);
  });
  const kb = el('div','detrow');
  kb.style.marginTop = conns.length ? 'var(--s-1)' : 'var(--s-3)';
  kb.innerHTML =
    '<span class="detrow__ico">' + ic('library',14) + '</span>' +
    '<span class="detrow__nm">' + esc(a.kb || 'No knowledge base') + '</span>' +
    '<span class="detrow__meta">knowledge</span>';
  tools.append(kb);
  body.append(tools);

  const inst = el('section','section');
  inst.append(sectionHead('Instructions',
    infoTip('Given to the model before your message, on every turn.')));
  const box = el('pre','code');
  box.style.cssText = 'white-space:pre-wrap;padding:var(--s-3);background:var(--surface);border-radius:var(--r-lg)';
  box.textContent = a.inst;
  inst.append(box);
  body.append(inst);
}

/* ------------------------------------------------------------------- logs
   Simulated the same way every answer in this prototype is, and derived from
   the assistant rather than drawn at random — so the same assistant shows the
   same run twice and the list can be talked about. */
/* Minutes ago, laid out unevenly on purpose: calls seven minutes apart to the
   second are a template, not a log. */
const LOG_AGO = [3, 11, 26, 47, 68, 94, 129, 168];
function asstLogs(body, a){
  const rows = [];
  a.skills.forEach((sk, i) => {
    const rec = D.SKILLS.filter(s => s.name === sk)[0];
    const base = rec ? parseFloat(rec.avg) : 1 + i * 0.8;
    [0, 1].forEach(n => {
      const k = i * 2 + n;
      const at = T0 - LOG_AGO[k % LOG_AGO.length] * 60e3;
      const bad = a.state === 'warn' && k === 0;
      rows.push([
        '<td class="t-mono">' + esc(clockTime(at)) + '</td>',
        '<td class="t-mono">' + esc(sk) + '</td>',
        '<td class="num t-mono">' + (base + (n ? 0.4 : 0)).toFixed(1) + 's</td>',
        '<td>' + (bad ? '<span class="badge badge--warn">retried</span>'
                      : '<span class="badge badge--ok">ok</span>') + '</td>'
      ]);
    });
  });
  const sec = tableSection('Recent calls', ['Time','Capability','Duration','Result'], rows);
  body.append(sec);
  body.append(helpNote('Calls are simulated locally, like every response in this prototype. ' +
                      'A turn’s own trace stays in the thread that produced it.'));
}

/* --------------------------------------------------------------- activity */
function asstActivity(body, a){
  const who = a.owner === 'me' ? D.ACCOUNT.name : a.owner;
  const events = [
    [parseAge(a.upd),                 'Instructions edited', who],
    [parseAge(a.upd) + 3 * 864e5,     'Model set to ' + a.model, who],
    [parseAge(a.upd) + 9 * 864e5,     'Knowledge base bound to ' + (a.kb || '—'), who],
    [parseAge(a.upd) + 21 * 864e5,    'Created', who]
  ];
  const sec = el('section','section');
  sec.append(sectionHead('History'));
  events.forEach(([ago, what, by]) => {
    const at = T0 - ago;
    const r = el('div','detrow');
    r.innerHTML =
      '<span class="detrow__ico">' + ic('clock',14) + '</span>' +
      '<span class="detrow__nm">' + esc(what) + '</span>' +
      '<span class="detrow__meta">' + esc(by + ' · ' + dayLabel(at) + ' ' + clockTime(at)) + '</span>';
    sec.append(r);
  });
  body.append(sec);
  body.append(helpNote(plural(a.threads, 'thread') + ' currently bound to this assistant.'));
}

/* ----------------------------------------------------------------- access */
function asstAccess(body, a){
  const owner = a.owner === 'me' ? D.ACCOUNT.name + ' (you)' : a.owner;
  const rows = [
    ['<td>' + esc(owner) + '</td>', '<td>Owner</td>', '<td>Edit and delete</td>'],
    ['<td>' + esc(a.team + ' team') + '</td>', '<td>Editor</td>', '<td>Edit configuration</td>'],
    ['<td>' + esc(D.ACCOUNT.org) + '</td>', '<td>Viewer</td>', '<td>Bind it to a message</td>']
  ];
  body.append(tableSection('Who can use it', ['Principal','Role','What that allows'], rows));
  body.append(helpNote('An assistant is readable by the workspace and editable by its team. ' +
                      'Changing that is a Cloud → Access setting, not a per-assistant one.'));
}

function renderAsstBody(){
  const a = asstOn;
  if (!a) return;
  const body = $('#asstBody');
  body.innerHTML = '';
  body.scrollTop = 0;
  if (asstTab === 'config') asstConfig(body, a);
  else if (asstTab === 'logs') asstLogs(body, a);
  else if (asstTab === 'act') asstActivity(body, a);
  else asstAccess(body, a);
}

/* An example is a question, and a question belongs in a thread — so this closes
   the overlay, binds the assistant, lands in a conversation and leaves the
   question in the composer with the caret in it. It stops short of sending:
   the point of putting it in the box is that it can be edited first. */
function useExample(a, text){
  closeAssistant();
  state.assistant = a.id;

  const inThread = D.THREADS.some(t => t.id === state.item.chat);
  if (state.section !== 'chat' || !inThread){
    /* Reuse an empty thread rather than stacking up "New chat" rows. */
    const empty = D.THREADS.filter(t => !t.msgs.length)[0];
    if (empty) select('chat', empty.id); else newThread();
  } else {
    select('chat', state.item.chat);
  }

  const input = $('#composerInput');
  input.value = text;
  autosize();
  $('#sendBtn').disabled = state.busy;
  syncAssistantChip();
  input.focus();
  toast(a.name + ' bound — ⌘↵ to send');
}

/* ========================================================== assistants
   There are more of these than anyone reads, so the list is filtered rather
   than scrolled, and the ones you actually use are pinned to a column of their
   own — that column is what the composer offers, so starring an assistant here
   is the same act as putting it within reach of the next message. */
const favourites = () => D.ASSISTANTS.filter(a => a.fav);

function asstTabs(){
  const counts = { All:D.ASSISTANTS.length, Favourites:favourites().length };
  D.ASSISTANT_TEAMS.forEach(t => counts[t] = D.ASSISTANTS.filter(a => a.team === t).length);
  const order = ['All','Favourites'].concat(D.ASSISTANT_TEAMS);

  const bar = el('div','tabs');
  bar.setAttribute('role','tablist');
  order.forEach(t => {
    const b = el('button','tab',
      (t === 'Favourites' ? ic('star',14) : '') +
      '<span>' + esc(t) + '</span>' +
      '<span class="tab__n">' + counts[t] + '</span>');
    b.type = 'button';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(state.asst.tab === t));
    b.onclick = () => { state.asst.tab = t; render(); };
    bar.append(b);
  });
  return bar;
}

function asstCard(a){
  /* The card is the way in to the record. Its own two controls stop the click
     from getting here — see stopPropagation on each. */
  const c = el('article','card card--click');
  c.onclick = () => openAssistant(a);
  c.innerHTML =
    '<div class="card__head">' +
      '<span class="dot ' + (STATE_DOT[a.state] || '') + '"></span>' +
      '<span class="card__title">' + esc(a.name) + '</span>' +
      '<span style="flex:1"></span>' +
      '<span class="t-mono">' + esc(a.threads) + ' threads</span>' +
    '</div>';
  /* Chat chooses an assistant; Build defines it. The card carries the way
     across so the two are one object with two verbs, not two lists. */
  const edit = el('button','iconbtn iconbtn--sm', ic('build',14));
  edit.type = 'button';
  edit.title = 'Edit in Build';
  edit.onclick = e => { e.stopPropagation(); select('build', key('as', a.id)); };
  c.firstChild.append(edit);

  const star = el('button','iconbtn iconbtn--sm star', ic(a.fav ? 'starOn' : 'star', 14));
  star.type = 'button';
  star.setAttribute('aria-pressed', String(a.fav));
  star.title = a.fav ? 'Remove from favourites' : 'Add to favourites — appears in the composer';
  star.onclick = e => {
    e.stopPropagation();
    a.fav = !a.fav;
    toast(a.fav ? a.name + ' added to favourites' : a.name + ' removed from favourites');
    render();
    renderComposer();
  };
  c.firstChild.append(star);

  const b = el('div','card__body');
  b.innerHTML =
    '<div class="t-meta" style="margin-bottom:var(--s-3)">' + esc(a.desc) + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:var(--s-1);margin-bottom:var(--s-3)">' +
      a.skills.map(s => '<span class="chip">' + esc(s) + '</span>').join('') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:var(--s-2)">' +
      '<span class="badge badge--mono">' + esc(a.team) + '</span>' +
      '<span style="flex:1"></span>' +
      '<span class="t-mono">' + esc(a.kb || 'no knowledge base') + '</span>' +
    '</div>';
  c.append(b);
  return c;
}

function assistantsView(body){
  const pad = el('div','pane__pad');
  pad.append(pageHead('Assistants',
    'An assistant is a named binding of a model, a set of skills and one knowledge base. ' +
    'Threads pick one; agents and solutions reuse them.'));

  const split = el('div','asst');
  const left = el('div','asst__main');
  left.append(asstTabs());

  const tab = state.asst.tab;
  const shown = tab === 'All' ? D.ASSISTANTS
              : tab === 'Favourites' ? favourites()
              : D.ASSISTANTS.filter(a => a.team === tab);

  const grid = el('div','grid-cards');
  grid.style.marginTop = 'var(--s-4)';
  if (!shown.length){
    left.append(emptyState('agent','No favourites yet',
      'Star an assistant and it appears here and in the composer, ready to pick for the next message.'));
  } else {
    shown.forEach(a => grid.append(asstCard(a)));
    left.append(grid);
  }
  split.append(left);

  /* The favourites column. Order is the order they were starred, which is the
     order the composer offers them in. */
  const side = el('aside','asst__side');
  const favs = favourites();
  side.innerHTML =
    '<div class="asst__sidehead">' +
      '<span class="t-eyebrow">In the composer</span>' +
      '<span class="t-mono">' + favs.length + '</span>' +
    '</div>' +
    '<p class="asst__note">Favourites appear in the composer’s assistant picker, so you can bind one to a message without leaving the thread.</p>';

  if (!favs.length){
    const none = el('p','asst__note');
    none.textContent = 'Nothing starred yet.';
    none.style.color = 'var(--text-4)';
    side.append(none);
  }
  favs.forEach(a => {
    const r = el('div','asst__fav');
    r.innerHTML =
      '<span class="row__main">' +
        '<span class="row__title">' + esc(a.name) + '</span>' +
        '<span class="row__sub">' + esc(a.model) + '</span>' +
      '</span>';
    /* Same record, same overlay — reached from wherever the name appears. */
    $('.row__main', r).style.cursor = 'pointer';
    $('.row__main', r).onclick = () => openAssistant(a);
    const x = el('button','iconbtn iconbtn--xs', ic('x',11));
    x.type = 'button';
    x.title = 'Remove from favourites';
    x.onclick = () => { a.fav = false; render(); renderComposer(); };
    r.append(x);
    side.append(r);
  });
  split.append(side);

  pad.append(split);
  body.append(pad);
}

function scheduleView(body){
  const pad = el('div','pane__pad');
  pad.append(pageHead('Schedule',
    'Work that runs without anyone asking. Everything here writes into a thread, ' +
    'a knowledge base or a channel — never straight to a person.'));
  const label = { run:'running', ok:'ok', idle:'idle', err:'failed' };
  pad.append(tableSection('Tasks',
    ['Task','Runs','Next','Target','Last','Status'],
    D.SCHEDULE.map(s => [
      '<td style="color:var(--text)">' + esc(s.name) + '</td>',
      '<td style="font-family:var(--mono)">' + esc(s.cron) + '</td>',
      '<td>' + esc(s.next) + '</td>',
      '<td>' + esc(s.target) + '</td>',
      '<td class="num">' + esc(s.last) + '</td>',
      '<td><span style="display:inline-flex;align-items:center;gap:6px">' +
        '<span class="dot ' + (STATE_DOT[s.state] || '') + '"></span>' + label[s.state] + '</span></td>'
    ])));
  body.append(pad);
}

/* ================================================== making a project
   A project is the only container people make for themselves, so making one
   has to cost almost nothing: type a name, press Create, and it is a folder.
   Everything else in the dialog is marked optional and can be set afterwards
   from the same dialog — including the one switch that changes what a project
   *is*, from somewhere you keep things to something that produces a result on
   its own every week.

   One screen rather than a wizard. A wizard implies the answers arrive in an
   order that matters; here only the name is required, and none of the rest is
   a decision you are stuck with. */
const PROJ_ICONS = ['folder','chart','code','users','spark','calendar','doc','dollar','share'];
/* The glyph names a kind of work, which is the cheapest way to say what a
   project is for — a row of nine is a vocabulary, a colour picker is a craft
   project. */
const ICON_NAME = { folder:'General', chart:'Analysis', code:'Engineering', users:'Team',
  spark:'Ideas', calendar:'Planning', doc:'Writing', dollar:'Money', share:'Publishing' };
/* Two audiences, so two buttons rather than two radio rows with a paragraph
   each: the consequence goes in one line under whichever is chosen. */
const PROJ_VIS = ['Personal','Shared'];
const VIS_HELP = {
  'Personal':'Only you can open it, its threads and its results. You can share it later.',
  'Shared':'Anyone in ' + D.ACCOUNT.org + ' can open it and start threads in it.'
};
/* Three cadences. A fourth would be a cron expression, and something that
   needs cron is a scheduled task — Chat → Schedule already holds those. */
const CADENCE = ['Every day','Every week','Every month'];
const CRON_OF = { 'Every day':'daily 07:00', 'Every week':'Mon 07:00', 'Every month':'1st 07:00' };
const NEXT_OF = { 'Every day':'in 14 h', 'Every week':'in 3 d', 'Every month':'in 12 d' };
/* "Every week" is how it is chosen; "Weekly" is how a one-word stat reads. */
const CADENCE_ADJ = { 'Every day':'Daily', 'Every week':'Weekly', 'Every month':'Monthly' };
const runLine = r => CRON_OF[r.every] + ' · next run ' + NEXT_OF[r.every];

let projOn = null;                 /* the project being edited — null while creating */
let projDraft = null;
let projN = D.PROJECTS.length;

/* ------------------------------------------------------------------ hints
   An instruction is worth its space the first time and is furniture after
   that. So each setting can carry one, every one has an ×, and the whole set
   retires once the dialog has been used: seen it, closed it, gone. The `?` in
   the header brings them back for somebody who wants the tour again.

   Retiring them is remembered rather than counted — one flag, so there is no
   "you have opened this four times" bookkeeping to get wrong. */
const HINTS_KEY = 'projHints';
let projHints = load(HINTS_KEY) !== 'off';
const hintGone = {};               /* dismissed this session, by key */

function hint(key, text){
  if (!projHints || hintGone[key]) return null;
  const n = el('div','hint');
  n.dataset.hint = key;
  n.innerHTML = '<span class="hint__ico">' + ic('help',12) + '</span>' +
                '<span class="hint__t">' + esc(text) + '</span>';
  const x = el('button','hint__x', ic('x',11));
  x.type = 'button';
  x.title = 'Hide this hint';
  x.setAttribute('aria-label','Hide this hint');
  x.onclick = e => { e.preventDefault(); hintGone[key] = true; n.remove(); };
  n.append(x);
  return n;
}
/* A field with its instruction under it, when there is one to show. */
function fieldH(label, control, key, text){
  const f = field(label, control);
  const h = hint(key, text);
  if (h) f.append(h);
  return f;
}
function setHints(on){
  projHints = on;
  store(HINTS_KEY, on ? 'on' : 'off');
  if (on) Object.keys(hintGone).forEach(k => delete hintGone[k]);
  if (projDraft) renderProject();
}

/* Bases and datasets are both "things it may read", so the picker is one list
   and each row says which kind it is rather than making two sections of it. */
function knowledgeItems(){
  return D.KBS.map(k => ({ id:'kb:' + k.name, nm:k.name, sub:'Knowledge base', meta:k.docs + ' docs' }))
    .concat(D.DATASETS.map(d => ({ id:'ds:' + d.name, nm:d.name, sub:d.source, meta:d.rows + ' rows' })));
}

/* ------------------------------------------------------------- a fold
   Two of the settings are lists, and a list is tall. Collapsed, the row says
   its name and what is currently chosen — which is the only thing a reader
   needs before deciding whether to open it. Native <details>, so the keyboard
   and the accessibility tree get the behaviour for free. */
function fold(label, summaryOf, build){
  const d = el('details','fold');
  const head = el('summary','fold__head',
    '<span class="fold__chev">' + ic('chevR',13) + '</span>' +
    '<span class="fold__nm">' + esc(label) + '</span>');
  const sum = el('span','fold__sum', esc(summaryOf()));
  head.append(sum);
  const body = el('div','fold__body');
  d.append(head, body);
  /* The summary is only true until the list is touched, so touching it says so. */
  build(body, () => { sum.textContent = summaryOf(); });
  return d;
}

/* The description is written from the settings rather than typed. By the time
   somebody has said what a project reads and who answers in it, they have said
   what it is for; a text field asking again is asking twice. Rewritten on every
   save while it stays automatic, so it cannot describe a project that has since
   changed — and left alone the moment a description arrives from anywhere else. */
function autoDesc(p){
  const reads = (p.kbs || []).concat(p.sources || []);
  const list = reads.length > 2
    ? reads.slice(0, 2).join(', ') + ' and ' + (reads.length - 2) + ' more'
    : reads.join(' and ');
  if (p.run){
    return 'Produces a result ' + p.run.every.toLowerCase() +
           (p.assistant ? ', written by ' + p.assistant : '') +
           (reads.length ? ', from ' + list : '') + '.';
  }
  if (p.assistant){
    return 'Threads here are answered by ' + p.assistant +
           (reads.length ? ', reading ' + list : '') + '.';
  }
  if (reads.length) return 'Threads and results kept together, scoped to ' + list + '.';
  return 'A folder for ' + p.name + ' — threads you start here stay together.';
}
const isBase = it => it.id.slice(0, 2) === 'kb';

function openProject(p){
  projOn = p || null;
  projDraft = p
    ? { name:p.name, icon:p.icon || 'folder', shared:!!p.shared,
        assistant:p.assistant || '', kbs:(p.kbs || []).slice(), sources:(p.sources || []).slice(),
        run:p.run ? { every:p.run.every, ask:p.run.ask, sched:p.run.sched } : null }
    : { name:'', icon:'folder', shared:false, assistant:'',
        kbs:[], sources:[], run:null };
  $('#projIco').innerHTML = ic(p ? 'gear' : 'plus', 15);
  renderProject();
  $('#projScrim').dataset.open = 'true';
  const nm = $('#projNameInput');
  if (nm && !p) nm.focus();
}
function closeProject(){
  $('#projScrim').dataset.open = 'false';
  projOn = null;
  projDraft = null;
  /* Used once, so the instructions retire. The `?` in the header is how they
     come back, which is why they are hidden rather than deleted. */
  if (projHints) setHints(false);
}

function renderProject(){
  const d = projDraft;
  if (!d) return;
  const body = $('#projBody'), foot = $('#projFoot');
  body.innerHTML = ''; foot.innerHTML = '';
  const fresh = !projOn;
  $('#projTitle').textContent = fresh ? 'New project' : 'Project settings';
  $('#projSub').textContent = fresh ? 'A name is all it needs'
    : projOn.name + ' · ' + (d.run ? CADENCE_ADJ[d.run.every].toLowerCase() : 'no schedule');

  $('#projHelp').setAttribute('aria-pressed', String(projHints));

  /* The explanation of what a project is, said once — on the way in, not over
     the shoulder of somebody who already has three of them. It retires with the
     rest of the hints, and has its own × for anyone who is done with it sooner. */
  if (fresh && projHints && !hintGone.concept){
    const b = banner('info',
      'A project keeps one piece of work together: its threads, what it reads, and who ' +
      'answers in it. Leave the rest of this empty and it is a folder. Switch on ' +
      '<strong>a result on a schedule</strong> and it runs by itself.');
    const x = el('button','hint__x', ic('x',11));
    x.type = 'button';
    x.title = 'Hide this';
    x.setAttribute('aria-label','Hide this');
    x.onclick = () => { hintGone.concept = true; b.remove(); };
    b.append(x);
    body.append(b);
  }

  /* Built first, because the name field switches it on as you type. */
  const save = el('button','btn btn--primary', fresh ? 'Create project' : 'Save changes');
  save.type = 'button';
  save.disabled = !d.name.trim();
  save.onclick = saveProject;

  /* Not inputCtl: that commits on blur, and this one has to update the button
     on every keystroke. */
  const nameIn = el('input','input');
  nameIn.id = 'projNameInput';
  nameIn.type = 'text';
  nameIn.value = d.name;
  nameIn.placeholder = 'Q4 planning';
  nameIn.oninput = () => { d.name = nameIn.value; save.disabled = !d.name.trim(); };
  nameIn.onkeydown = e => {
    if (e.key === 'Enter' && d.name.trim()){ e.preventDefault(); saveProject(); }
  };
  body.append(fieldH('Name', nameIn, 'name',
    'The only required answer. Everything else is optional, changeable, and ' +
    'the description is written for you from what you choose.'));

  const icons = el('div','iconpick');
  PROJ_ICONS.forEach(nm => {
    const b = el('button','iconpick__b', ic(nm, 15));
    b.type = 'button';
    b.title = ICON_NAME[nm];
    b.setAttribute('aria-label', ICON_NAME[nm]);
    b.setAttribute('aria-pressed', String(nm === d.icon));
    b.onclick = () => {
      d.icon = nm;
      $$('.iconpick__b', icons).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    };
    icons.append(b);
  });
  const visHint = hint('vis', VIS_HELP[d.shared ? 'Shared' : 'Personal'] +
    ' Either way, this can change afterwards.');
  const setVis = v => {
    d.shared = v === 'Shared';
    if (visHint) $('.hint__t', visHint).textContent =
      VIS_HELP[v] + ' Either way, this can change afterwards.';
  };

  /* Two one-line choices, side by side: stacked, they push the rest of the form
     another 90px down for no gain. */
  const two = el('div');
  two.style.cssText = 'display:flex; gap:var(--s-6); flex-wrap:wrap; margin-bottom:var(--s-4)';
  const visWrap = el('div');
  visWrap.append(segCtl(PROJ_VIS, d.shared ? 'Shared' : 'Personal', setVis));
  two.append(field('Icon', icons), field('Who can see it', visWrap));
  /* The hint under both of them belongs to the choice on the right, so the two
     fields give up their own bottom margin and it carries the gap. */
  $$('.field', two).forEach(f => f.style.marginBottom = '0');
  if (visHint){ two.style.marginBottom = 'var(--s-2)'; visHint.style.margin = '0 0 var(--s-4)'; }
  body.append(two);
  if (visHint) body.append(visHint);

  /* The two list-shaped settings, folded. Closed, each row names what is chosen
     — which is what a reader wants before deciding whether to open it. */
  const readList = () => (d.kbs || []).concat(d.sources || []);
  body.append(fold('Knowledge',
    () => readList().length ? readList().join(' · ') : 'Nothing attached',
    (into, touched) => {
      const list = pickList(knowledgeItems(),
        it => (isBase(it) ? d.kbs : d.sources).indexOf(it.nm) > -1,
        (it, on) => {
          const arr = isBase(it) ? d.kbs : d.sources;
          const i = arr.indexOf(it.nm);
          if (on && i < 0) arr.push(it.nm);
          else if (!on && i > -1) arr.splice(i, 1);
          touched();
        });
      list.classList.add('picklist--scroll');
      into.append(list);
      const h = hint('kb', 'What answers in this project may read. Nothing ticked means it ' +
                           'answers from the model alone.');
      if (h) into.append(h);
    }));

  const NONE = 'No assistant';
  body.append(fold('Assistant',
    () => d.assistant || NONE,
    (into, touched) => {
      into.append(selectCtl([NONE].concat(D.ASSISTANTS.map(a => a.name)), d.assistant || NONE,
        v => { d.assistant = v === NONE ? '' : v; touched(); }));
      const h = hint('as', 'Bound to new threads here. A thread can still pick another one.');
      if (h) into.append(h);
    }));

  /* The switch that decides which of the two things a project is. Everything
     under it only exists while it is on, because a cadence with nothing to
     produce is a setting nobody can act on. */
  const runWrap = el('div');
  const sw = switchCtl('Produce a result on a schedule', !!d.run);
  $('input', sw).onchange = e => {
    d.run = e.target.checked
      ? { every:'Every week', ask:'', sched:(projOn && projOn.run && projOn.run.sched) || null }
      : null;
    renderProject();
  };
  runWrap.append(sw);
  if (d.run){
    const when = el('div','field__help', runLine(d.run));
    when.style.marginTop = 'var(--s-2)';
    const cad = segCtl(CADENCE, d.run.every, v => {
      d.run.every = v;
      when.textContent = runLine(d.run);
    });
    cad.style.marginTop = 'var(--s-3)';
    const ask = el('textarea','textarea textarea--prose');
    ask.rows = 3;
    ask.value = d.run.ask;
    ask.placeholder = 'Summarise what changed this week and list what needs a decision.';
    ask.oninput = () => { d.run.ask = ask.value; };
    ask.style.marginTop = 'var(--s-3)';
    runWrap.append(cad, when, ask);
  }
  body.append(fieldH('Runs by itself', runWrap, 'run',
    d.run ? 'Each run files a result in the results column, timestamped. It is listed in Chat → Schedule too.'
          : 'Off, this project is a folder. On, it produces a result on its own and files it in the results column.'));

  const cancel = el('button','btn btn--ghost','Cancel');
  cancel.type = 'button';
  cancel.onclick = closeProject;
  if (!fresh){
    const del = el('button','btn btn--danger','Delete project');
    del.type = 'button';
    del.onclick = () => deleteProject(projOn);
    foot.append(del);
  }
  foot.append(el('div','dialog__spacer'), cancel, save);
}

/* The schedule row and the project's own `run` are one fact in two places —
   Chat → Schedule lists everything recurring in the workspace, and a project
   that runs is one of those. So saving the project writes the row. */
function syncProjectRun(p, prevSched){
  /* Switching the schedule off leaves nothing on the project pointing at the
     row, so the id it used to have has to be passed in — otherwise the row
     outlives the setting that created it. */
  const id = (p.run && p.run.sched) || prevSched;
  const i = id ? D.SCHEDULE.map(s => s.id).indexOf(id) : -1;
  if (!p.run){
    if (i > -1) D.SCHEDULE.splice(i, 1);
    return;
  }
  if (i > -1){
    /* The row keeps its own name: "Churn watchlist refresh" says more than
       "Churn program run", and renaming it was never what was asked for. */
    Object.assign(D.SCHEDULE[i], { cron:CRON_OF[p.run.every], next:NEXT_OF[p.run.every],
      target:p.name, assistant:p.assistant || '—' });
    return;
  }
  const row = { id:'sc-' + p.id, name:p.name + ' run', cron:CRON_OF[p.run.every],
    next:NEXT_OF[p.run.every], state:'idle', target:p.name,
    assistant:p.assistant || '—', last:'—' };
  p.run.sched = row.id;
  D.SCHEDULE.push(row);
}

function saveProject(){
  const d = projDraft;
  if (!d || !d.name.trim()) return;
  const fresh = !projOn;
  const p = projOn || { id:'p' + (++projN), descAuto:true };
  const prevSched = p.run && p.run.sched;
  Object.assign(p, { name:d.name.trim(), icon:d.icon, shared:d.shared,
    assistant:d.assistant, kbs:d.kbs, sources:d.sources, run:d.run, when:'now' });
  /* Nobody typed a description, so one is written from the settings. A
     hand-written one — the fixtures have them — is left alone. */
  if (p.descAuto || !p.desc){ p.desc = autoDesc(p); p.descAuto = true; }
  syncProjectRun(p, prevSched);
  if (fresh) D.PROJECTS.unshift(p);
  closeProject();
  select('chat', key('p', p.id));
  toast(fresh
    ? 'Created ' + p.name + (p.run ? ' — first run ' + NEXT_OF[p.run.every] : '')
    : 'Saved ' + p.name);
}

/* Threads outlive the folder they were filed in, so deleting a project keeps
   them and says so. Undoable, so it does not need a confirmation dialog —
   the same rule the results column follows. */
function deleteProject(p){
  const i = D.PROJECTS.indexOf(p);
  if (i < 0) return;
  const sid = p.run && p.run.sched;
  const si = sid ? D.SCHEDULE.map(s => s.id).indexOf(sid) : -1;
  const srow = si > -1 ? D.SCHEDULE[si] : null;
  const kept = D.THREADS.filter(t => t.project === p.id);
  D.PROJECTS.splice(i, 1);
  if (si > -1) D.SCHEDULE.splice(si, 1);
  kept.forEach(t => t.project = null);
  closeProject();
  select('chat', D.THREADS.length ? D.THREADS[0].id : 'assistants');
  toast('Deleted ' + p.name + (kept.length ? ' — ' + plural(kept.length, 'thread') + ' kept in History' : ''), {
    label:'Undo',
    icon:'trash',
    run:() => {
      D.PROJECTS.splice(i, 0, p);
      if (srow) D.SCHEDULE.splice(si, 0, srow);
      kept.forEach(t => t.project = p.id);
      select('chat', key('p', p.id));
      toast('Restored ' + p.name);
    }
  });
}

/* What "it runs by itself" looks like when you do not want to wait for Monday.
   The result lands in the store like every other one — timestamped, downloadable,
   shareable — because a project that runs produces results, not notifications. */
function runProject(p){
  const now = Date.now();
  const reads = (p.kbs || []).concat(p.sources || []);
  const n = allResults().filter(a => a.from === p.name).length + 1;
  const md = [
    p.run && p.run.ask ? '**' + p.run.ask + '**' : '**Scheduled run of ' + p.name + '.**',
    '',
    'Ran ' + stampFull(now) + (p.run ? ' · ' + p.run.every.toLowerCase() : ' · on request') + '.',
    '',
    '- **Read** — ' + (reads.length ? reads.join(', ') : 'no knowledge attached'),
    '- **Answered by** — ' + (p.assistant || 'no assistant bound'),
    '- **In scope** — ' + plural(D.THREADS.filter(t => t.project === p.id).length, 'thread'),
    '',
    'The run itself is simulated here, as every answer in this prototype is: a real one ' +
    'would leave the assistant\'s output in this pane.'
  ].join('\n');
  fileResult({ id:'r-' + p.id + '-' + n, title:p.name + ' run ' + n, from:p.name,
    shape:'doc', size:plural(4, 'line'), md:md });
  /* The result opened the results column, so the project is no longer borrowing
     it: leaving should not take back a column the reader has just been given. */
  state.projLoan = false;
  state.artBefore = null;
  p.when = 'now';
  const row = p.run && p.run.sched ? D.SCHEDULE.filter(s => s.id === p.run.sched)[0] : null;
  if (row){ row.state = 'ok'; row.last = '0:12'; }
  render();
}

/* One or two buttons under a block, as a row of their own: an action that acts
   on the block above it belongs with it, not in a bar at the top of the page. */
function rowActs(buttons){
  const r = el('div','rowacts');
  buttons.forEach(b => r.append(b));
  return r;
}

/* ================================================================== channels
   A project that publishes needs somewhere to publish to, and that "somewhere"
   is a credential — which already has a home in Cloud → Connections. So a
   channel here holds no secret and no endpoint: it names the platform, the
   handle it posts as, and the connector row that does hold those. The project
   reports the connection; it does not own it. One fact in one place, the same
   rule the schedule row follows.

   Connecting is offered in both places for the same reason `Run now` is on the
   project page: the person who notices a channel is off is looking at the
   project, not at the admin surface. */
const CH_ICON = { fb:'facebook', ig:'instagram', li:'linkedin' };
const chConn  = c => byId(D.CONNECTORS, c.cn);
const chLive  = c => { const x = chConn(c); return !!x && x.state !== 'off'; };
const chIcon  = c => '<span class="row__icon">' + ic(CH_ICON[c.id] || 'globe', 14) + '</span>';

/* Connecting a channel is the connector's own state change, so it is written
   once here and read everywhere — including by Cloud → Connections, which is
   looking at the same object. */
function connectChannel(c, then){
  const x = chConn(c);
  if (!x) return;
  x.state = 'ok';
  x.last = 'just now';
  x.calls = '0 / 7d';
  if (x.endpoint === '—') x.endpoint = 'graph.' + c.nm.toLowerCase().replace(/\s+/g,'') + '.com/v1';
  if (x.scope === '—') x.scope = '1 account · publish, read insights';
  render();
  toast(c.nm + ' connected as ' + c.handle, { label:'Undo', icon:'plug', run:() => {
    x.state = 'off'; x.last = '—'; x.calls = '—';
    render();
    toast(c.nm + ' disconnected');
  }});
  if (then) then();
}

/* What is written but not out yet. A queue is the honest shape for publishing:
   the writing and the sending are different acts, and the gap between them is
   where a review happens. */
const Q_STATE = { 'draft':'', 'needs review':'warn', 'scheduled':'ok', 'published':'ok' };
const POST_WHEN = ['Today 17:00','Tue 09:00','Tue 17:30','Wed 12:00','Thu 08:30','Next Mon 09:00'];

function projectChannels(panel, p){
  const sec = el('section','section');
  sec.append(sectionHead('Channels',
    infoTip('Where this project posts. The credential and its scope live in Cloud → Connections; ' +
            'this row reports the state of it.')));
  p.channels.forEach(c => {
    const x = chConn(c);
    const live = chLive(c);
    sec.append(listRow({
      lead:chIcon(c),
      title:c.nm,
      sub:live ? c.handle + ' · ' + c.posts : 'not connected — nothing leaves',
      meta:live ? '' : 'off',
      onClick:() => x ? select('cloud', key('cn', x.id)) : openProject(p)
    }));
    /* The one channel that cannot publish gets the action rather than a
       sentence telling somebody else to go and do it. */
    if (!live){
      const go = el('button','btn btn--secondary btn--sm',
        '<span style="display:flex">' + ic('plug',13) + '</span>Connect ' + esc(c.nm));
      go.type = 'button';
      go.onclick = () => connectChannel(c);
      sec.append(rowActs([go]));
    }
  });
  panel.append(sec);
}

function projectQueue(panel, p){
  const sec = el('section','section');
  const waiting = p.queue.filter(q => q.state !== 'published').length;
  sec.append(sectionHead('Queue', waiting
    ? '<span class="t-mono" style="color:var(--text-4)">' + waiting + '</span>' : ''));
  if (!p.queue.length){
    sec.append(helpNote('Nothing written yet. Ask for a post and it arrives here before it ' +
                        'goes anywhere.'));
  } else {
    p.queue.forEach(q => {
      const c = p.channels.filter(x => x.id === q.ch)[0] || { nm:q.ch, id:q.ch };
      sec.append(listRow({
        lead:chIcon(c),
        title:q.title,
        sub:c.nm + ' · ' + q.when,
        meta:q.state === 'scheduled' ? 'queued' : q.state,
        onClick:() => openPost(p, q)
      }));
    });
  }
  panel.append(sec);
}

/* ------------------------------------------------------- a post, before it goes
   Editing a draft is the one thing on this page that is neither a question nor a
   setting, so it gets a dialog: the text as written, which channel it is written
   for, when it leaves, and the button that lets it.

   The primary action depends on the state and on the channel — a post on a
   channel that is not connected cannot be scheduled, so it offers the connection
   instead of a button that would quietly do nothing. */
let postOn = null, postFor = null, postDraft = null;

function openPost(p, q){
  postFor = p; postOn = q;
  postDraft = { text:q.text, when:q.when };
  $('#postIco').innerHTML = ic(CH_ICON[q.ch] || 'globe', 15);
  renderPost();
  $('#postScrim').dataset.open = 'true';
}
function closePost(){
  $('#postScrim').dataset.open = 'false';
  postOn = null; postFor = null; postDraft = null;
}

function renderPost(){
  const p = postFor, q = postOn, d = postDraft;
  if (!p || !q) return;
  const body = $('#postBody'), foot = $('#postFoot');
  body.innerHTML = ''; foot.innerHTML = '';
  const c = p.channels.filter(x => x.id === q.ch)[0] || { nm:q.ch, id:q.ch, handle:'—' };
  const live = chLive(c);

  $('#postTitle').textContent = q.title;
  $('#postSub').textContent = c.nm + ' · ' + c.handle + ' · ' + q.state;

  if (!live) body.append(banner('warn',
    '<strong>' + esc(c.nm) + ' is not connected.</strong> This post can be written and kept ' +
    'here, but nothing leaves until the connection is made.'));

  const ta = el('textarea','textarea textarea--prose');
  ta.rows = 8;
  ta.value = d.text;
  ta.oninput = () => { d.text = ta.value; count.textContent = limitLine(c, ta.value); };
  body.append(field('The post', ta));
  /* Written for one channel, so the count is that channel's limit and not a
     generic one. */
  const count = el('p','field__help', limitLine(c, d.text));
  count.style.marginTop = 'calc(-1 * var(--s-2))';
  body.append(count);

  body.append(field('When it goes out',
    selectCtl(POST_WHEN, d.when, v => { d.when = v; }),
    live ? 'Queued locally. Nothing is posted by this prototype.'
         : 'Kept in the queue with this time on it.'));

  const remove = el('button','btn btn--danger','Remove');
  remove.type = 'button';
  remove.onclick = () => {
    const i = p.queue.indexOf(q);
    p.queue.splice(i, 1);
    closePost();
    render();
    toast('Removed ' + q.title, { label:'Undo', icon:'retry', run:() => {
      p.queue.splice(i, 0, q);
      render();
      toast('Back in the queue');
    }});
  };
  const cancel = el('button','btn btn--ghost','Cancel');
  cancel.type = 'button';
  cancel.onclick = closePost;

  const ask = el('button','btn btn--secondary','Rewrite it in the box');
  ask.type = 'button';
  ask.title = 'Puts the draft in the composer, where it can be changed by asking';
  ask.onclick = () => {
    closePost();
    if (kindOf(state.item.chat) !== 'p' || idOf(state.item.chat) !== p.id) select('chat', key('p', p.id));
    askChip('Rewrite this ' + c.nm + ' post — keep the numbers, lose the adjectives:\n\n' + d.text).click();
  };

  const primary = el('button','btn btn--primary',
    live ? '<span style="display:flex">' + ic('check',13) + '</span>' +
             (q.state === 'scheduled' ? 'Save changes' : 'Approve and queue')
         : '<span style="display:flex">' + ic('plug',13) + '</span>Connect ' + esc(c.nm));
  primary.type = 'button';
  primary.onclick = () => {
    if (!live){ connectChannel(c, renderPost); return; }
    q.text = d.text;
    q.when = d.when;
    const first = q.state !== 'scheduled';
    q.state = 'scheduled';
    closePost();
    render();
    toast(first ? 'Queued for ' + c.nm + ' · ' + q.when : 'Saved · ' + c.nm + ' ' + q.when);
  };

  foot.append(remove, el('div','dialog__spacer'), cancel, ask, primary);
}

/* Each channel takes a different length, and a post written for one of them is
   the only one that can be counted honestly. */
const CH_LIMIT = { fb:63206, ig:2200, li:3000 };
function limitLine(c, text){
  const n = (text || '').length, lim = CH_LIMIT[c.id];
  if (!lim) return n + ' characters';
  const left = lim - n;
  return n + ' of ' + lim.toLocaleString('en-US') + ' characters' +
         (left < 0 ? ' — ' + Math.abs(left) + ' over' : '');
}

/* ============================================== the three ways to use a project
   A project is asked for three different kinds of thing, and each wants a
   different first offer: prose and analysis (Work), the tables it reads (Data),
   and something that runs without being asked (Auto program). The same three
   modes the empty thread's hero has, for the same reason — a mode is a way of
   saying what you are here for before you have written anything.

   Work and Data are the box with different suggestions. Auto program is not a
   question at all, so it replaces the box with the program itself. */
const PROJ_MODES = ['Work','Data','Auto program'];
let projMode = 'Work';
let projModeFor = null;            /* the mode belongs to the project you opened */

/* ---------------------------------------------------- what to ask a project
   Four questions this project in particular could be asked, in the order they
   are worth offering: what it already produces on a schedule, then what its
   assistant is good for, then the sources it can read. Nothing invented — the
   examples are the assistant's own, the ones its record offers. */
function projectPrompts(p){
  const out = [];
  /* A project that publishes is asked for writing before it is asked for
     analysis, and the offer names its own channels — "draft a post" is a
     tutorial, "draft this week's three posts" is the job. */
  if (p.channels && p.channels.length){
    const names = p.channels.map(c => c.nm);
    out.push('Draft this week\'s ' + p.channels.length + ' posts — one for ' +
             names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' — from the retrofit case study.');
    out.push('Rewrite the ' + names[names.length - 1] + ' post for ' + names[1] +
             ': shorter, one hook, no link.');
    const off = p.channels.filter(c => !chLive(c))[0];
    if (off) out.push('What is waiting on ' + off.nm + ', and what happens to it when the channel connects?');
    else out.push('Which of the queued posts is weakest, and what would you change?');
    return out.slice(0, 4);
  }
  if (p.run && p.run.ask) out.push(p.run.ask);
  const a = p.assistant ? D.ASSISTANTS.filter(x => x.name === p.assistant)[0] : null;
  if (a) asstPrompts(a).slice(0, 3).forEach(q => out.push(q));
  const reads = (p.kbs || []).concat(p.sources || []);
  if (reads.length && out.length < 4) out.push('What changed in ' + reads[0] + ' recently?');
  if (!out.length) out.push(
    'Summarise where this project stands.',
    'What should I look at first?',
    'Draft a short update on this for the team.');
  return out.slice(0, 4);
}
/* The same four, for the tables rather than the prose: each one names a source
   this project actually reads, because "profile a table" is a tutorial and
   "profile q3_ledger" is a question. */
function dataPrompts(p){
  const src = p.sources || [];
  const out = [];
  /* On a publishing project the tables are performance, so the questions are the
     ones a channel report is for: what happened, what beat its own average, and
     which of these numbers cannot be trusted. */
  if (p.channels && p.channels.length){
    out.push('Compare reach and engagement rate across ' +
             p.channels.map(c => c.nm.toLowerCase()).join(', ') + ' over the last four weeks.');
    if (src[0]) out.push('Which post beat its channel average, and what did it do differently? Use ' +
                         src[0] + ' and ' + (src[1] || src[0]) + '.');
    out.push('Does posting time explain anything, or is it the format?');
    const stale = (p.sources || []).map(nm => D.DATASETS.filter(x => x.name === nm)[0])
      .filter(x => x && x.health !== 'ok')[0];
    out.push(stale
      ? 'Why is ' + stale.name + ' stale, and what is missing from the weekly report because of it?'
      : 'Which follower growth is real and which is one post?');
    return out.slice(0, 4);
  }
  if (src[0]) out.push('Profile ' + src[0] + ' — columns, ranges, what is missing.');
  if (src[0]) out.push('Chart the trend in ' + src[0] + ' over the last four quarters.');
  if (src[1]) out.push('Join ' + src[0] + ' with ' + src[1] + ' and show what does not match.');
  if (!src.length) out.push(
    'Attach a source to this project and I can profile it.',
    'What data would answer the questions in this project?');
  out.push('Find the anomalies in this project\'s data worth explaining.');
  return out.slice(0, 4);
}

/* A suggestion goes in the box rather than being sent. The point of putting it
   there is that it can be edited first — the same rule the assistant overlay's
   examples follow. */
function askChip(text){
  const b = el('button','exchip', esc(text));
  b.type = 'button';
  b.title = 'Put this in the box';
  b.onclick = () => {
    const i = $('#composerInput');
    i.value = text;
    autosize();
    $('#sendBtn').disabled = state.busy;
    i.focus();
  };
  return b;
}

/* --------------------------------------------------------- the auto program
   Not a question, so not the box: what the project should produce, how often,
   and the two buttons that matter — one to keep it, one to see it now. The same
   three cadences the dialog offers, because a project that needs a fourth needs
   a scheduled task, and Chat → Schedule holds those.

   The draft belongs to the project being looked at, so switching projects does
   not carry a half-written program across. */
let progDraft = null, progFor = null;
function progOf(p){
  if (progFor !== p.id || !progDraft){
    progFor = p.id;
    progDraft = p.run ? { every:p.run.every, ask:p.run.ask || '' }
                      : { every:'Every week', ask:'' };
  }
  return progDraft;
}
function projectProgram(into, p){
  const d = progOf(p);
  const live = !!p.run;

  into.append(el('div','askchips__lead',
    live ? 'This project runs on its own. Change what it produces, or when.'
         : 'Give the project something to produce and a cadence, and it will run ' +
           'without being asked.'));

  const ask = el('textarea','textarea textarea--prose');
  ask.rows = 4;
  ask.value = d.ask;
  ask.placeholder = 'Summarise what changed this week and list what needs a decision.';
  ask.oninput = () => { d.ask = ask.value; };
  into.append(field('What it should produce, each run', ask));

  const when = el('div','field__help', runLine(d));
  when.style.marginTop = 'var(--s-2)';
  const cad = segCtl(CADENCE, d.every, v => { d.every = v; when.textContent = runLine(d); });
  const cadWrap = el('div');
  cadWrap.append(cad, when);
  into.append(field('How often', cadWrap));

  const save = el('button','btn btn--primary btn--sm',
    '<span style="display:flex">' + ic('check',13) + '</span>' +
    (live ? 'Save the program' : 'Create the program'));
  save.type = 'button';
  save.onclick = () => {
    const prevSched = p.run && p.run.sched;
    p.run = { every:d.every, ask:d.ask.trim(), sched:prevSched || null };
    syncProjectRun(p, prevSched);
    if (p.descAuto) p.desc = autoDesc(p);
    p.when = 'now';
    render();
    toast((live ? 'Program saved — next run ' : 'Program created — first run ') + NEXT_OF[d.every]);
  };
  const acts = [save];
  if (live){
    const now = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('play',13) + '</span>Run now');
    now.type = 'button';
    now.onclick = () => runProject(p);
    /* Turning it off is undoable, so it does not need a dialog — the same rule
       the results column and the project bin follow. */
    const off = el('button','btn btn--ghost btn--sm','Turn it off');
    off.type = 'button';
    off.onclick = () => {
      const was = p.run;
      const sid = was && was.sched;
      const si = sid ? D.SCHEDULE.map(s => s.id).indexOf(sid) : -1;
      const srow = si > -1 ? D.SCHEDULE[si] : null;
      p.run = null;
      syncProjectRun(p, sid);
      if (p.descAuto) p.desc = autoDesc(p);
      render();
      toast(p.name + ' no longer runs on its own', {
        label:'Undo', icon:'clock',
        run:() => {
          p.run = was;
          if (srow && D.SCHEDULE.indexOf(srow) < 0) D.SCHEDULE.splice(si, 0, srow);
          if (p.descAuto) p.desc = autoDesc(p);
          render();
          toast('Program restored');
        }
      });
    };
    acts.push(now, off);
  }
  into.append(rowActs(acts));
  if (live) into.append(helpNote('Each run files a result in the results column, ' +
                                 'timestamped. It is listed in Chat → Schedule too.'));
}

/* ------------------------------------------------------------ one project
   A project answers two different questions and one long page answered neither.
   So: a panel on the left carrying what this project *is* — its name, the
   description written for it, who can see it, then the assistant, the knowledge
   and the workflow, then what has happened in it — and the rest of the pane for
   the one thing the page is for, asking it something.

   The panel takes the sidebar's own surface and hairline, because it is the same
   kind of thing: a fixed column of what you are working inside. Read across, the
   shell now goes rail → menu → this project → the conversation.

   Every row in the panel is a door: the assistant opens its record, a base opens
   in Knowledge, a thread opens, a result opens in the results column. A fact you
   can act on is worth more than a fact you can read. */
function projectView(body, p){
  const threads = D.THREADS.filter(t => t.project === p.id);
  const reads = (p.kbs || []).concat(p.sources || []);
  const mine = allResults().filter(a => a.from === p.name);
  /* A mode says what you are here for, and that is a fact about the project you
     opened rather than a preference — so opening another one starts at Work. */
  if (projModeFor !== p.id){ projMode = 'Work'; projModeFor = p.id; }

  const wrap = el('div','projwrap');
  const panel = el('aside','projpanel');
  const main = el('div','projmain');
  wrap.append(panel, main);
  /* The two columns scroll on their own, so the pane body does not. */
  body.classList.add('pane__body--split');
  body.append(wrap);

  /* ------------------------------------------------------------- identity
     Name, the description Nebulas wrote, and who can see it — the three facts
     that are true of the project itself rather than of anything in it. */
  const idb = el('div','projid');
  idb.innerHTML =
    '<div class="projid__top">' +
      '<span class="projid__ico">' + ic(p.icon || 'folder', 16) + '</span>' +
      '<h2 class="projid__name">' + esc(p.name) + '</h2>' +
    '</div>' +
    (p.desc ? '<p class="projid__desc">' + esc(p.desc) +
      (p.descAuto ? ' ' + inlineTip('Written by Nebulas from this project\'s settings, ' +
                                    'and rewritten when they change.') : '') + '</p>' : '');
  /* "Shared" rather than "Shared with Gnomon Digital": the panel is 268px, the
     tooltip has the room to name the audience, and the row is a control. */
  const vis = el('button','projid__vis',
    ic(p.shared ? 'users' : 'lock', 12) +
    '<span>' + esc(p.shared ? 'Shared' : 'Personal') + '</span>');
  vis.type = 'button';
  vis.title = p.shared
    ? 'Anyone in ' + D.ACCOUNT.org + ' can open it — click to change'
    : 'Only you can open it — click to change';
  vis.onclick = () => openProject(p);
  const gear = el('button','iconbtn iconbtn--sm tip tip--below', ic('gear',14));
  gear.type = 'button';
  gear.setAttribute('data-tip','Project settings');
  gear.setAttribute('aria-label','Project settings');
  gear.onclick = () => openProject(p);
  const row = el('div','projid__row');
  row.append(vis, gear);
  idb.append(row);
  panel.append(idb);

  const asst = p.assistant ? D.ASSISTANTS.filter(x => x.name === p.assistant)[0] : null;
  const sec = el('section','section');
  sec.append(sectionHead('Assistant'));
  sec.append(listRow({
    lead:'<span class="row__icon">' + ic('agent',13) + '</span>',
    title:p.assistant || 'None',
    sub:asst ? asst.model : 'Answers come from the model alone',
    onClick:asst ? () => openAssistant(asst) : () => openProject(p)
  }));
  panel.append(sec);

  /* Two kinds of thing it may read, and the row says which: a base is documents,
     a dataset is a table. */
  const know = el('section','section');
  know.append(sectionHead('Knowledge'));
  (p.kbs || []).forEach(nm => {
    const k = D.KBS.filter(x => x.name === nm)[0];
    know.append(listRow({
      lead:'<span class="row__icon">' + ic('library',13) + '</span>',
      title:nm, sub:k ? k.docs + ' documents' : 'Knowledge base', meta:'docs',
      onClick:k ? () => select('knowledge', key('kb', k.id)) : () => openProject(p)
    }));
  });
  (p.sources || []).forEach(nm => {
    const dsx = D.DATASETS.filter(x => x.name === nm)[0];
    know.append(listRow({
      lead:'<span class="row__icon">' + ic('data',13) + '</span>',
      title:nm, sub:dsx ? dsx.source + ' · ' + dsx.rows + ' rows' : 'Source', meta:'table',
      onClick:dsx ? () => select('knowledge', key('ds', dsx.id)) : () => openProject(p)
    }));
  });
  if (!reads.length) know.append(listRow({
    lead:'<span class="row__icon">' + ic('library',13) + '</span>',
    title:'None attached', sub:'Answers here read nothing of yours',
    onClick:() => openProject(p)
  }));
  panel.append(know);

  /* Where it publishes, and what is written but not out yet. Both only exist on
     a project that posts — a project that only reads has neither, and shows
     neither rather than showing two empty headings. */
  if (p.channels && p.channels.length) projectChannels(panel, p);
  if (p.queue) projectQueue(panel, p);

  /* ----------------------------------------------------------- the workflow
     What the project does without being asked: when it runs, and the script it
     runs — which is a sentence, because that is what the model is given. The
     button is there because a weekly project is hard to believe in on a
     Tuesday. */
  const auto = el('section','section');
  auto.append(sectionHead('Workflow',
    infoTip('Nebulas runs this without being asked and files each result in the results column.')));
  if (p.run){
    auto.append(listRow({
      lead:'<span class="row__icon">' + ic('clock',13) + '</span>',
      title:p.run.every, sub:runLine(p.run),
      onClick:() => openProject(p)
    }));
    if (p.run.ask){
      const script = el('pre','projscript');
      script.textContent = p.run.ask;
      auto.append(script);
    }
    const now = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('play',13) + '</span>Run now');
    now.type = 'button';
    now.onclick = () => runProject(p);
    auto.append(rowActs([now]));
  } else {
    auto.append(helpNote('None. This project produces results only when somebody asks it ' +
                         'something.'));
    const set = el('button','btn btn--ghost btn--sm',
      '<span style="display:flex">' + ic('clock',13) + '</span>Set up a schedule');
    set.type = 'button';
    set.onclick = () => openProject(p);
    auto.append(rowActs([set]));
  }
  panel.append(auto);

  const count = n => '<span class="t-mono" style="color:var(--text-4)">' + n + '</span>';
  const hist = el('section','section');
  hist.append(sectionHead('Threads', threads.length ? count(threads.length) : ''));
  if (!threads.length){
    hist.append(helpNote('None yet. The first message you send starts one.'));
  } else {
    threads.forEach(t => hist.append(listRow({
      title:t.title, meta:t.when, onClick:() => select('chat', t.id)
    })));
  }
  panel.append(hist);

  if (mine.length){
    const res = el('section','section');
    res.append(sectionHead('Results', count(mine.length)));
    mine.forEach(a => res.append(listRow({
      lead:'<span class="row__icon">' + ic(artGlyph(a),13) + '</span>',
      title:a.title, meta:stampShort(a.at), sub:artType(a) + ' · ' + a.size,
      onClick:() => openArtifact(a.id)
    })));
    panel.append(res);
  }

  /* ------------------------------------------------------- the right side
     Centred, because it is one column of one thing rather than a page of
     several: the mode, and whatever that mode is for. The modes are the
     project's three uses, and the tabs are the only heading it needs.

     Work and Data are the real composer, borrowed, so what it can do here is
     what it can do anywhere: attach a file, bind an assistant, route a model,
     ⌘↵. Sending opens a thread in this project and puts the message in it — see
     the submit handler in boot. */
  const inner = el('div','projmain__inner');
  main.append(inner);

  const modes = segCtl(PROJ_MODES, projMode, m => { projMode = m; render(); });
  modes.style.margin = '0 auto var(--s-5)';
  inner.append(modes);

  if (projMode === 'Auto program'){
    projectProgram(inner, p);
    return;
  }

  const data = projMode === 'Data';
  const box = el('div','pane__ask');
  box.append(inlineComposer(data ? 'Ask about the data in ' + p.name
                                 : 'Ask anything in ' + p.name));
  inner.append(box);

  inner.append(el('div','askchips__lead',
    data ? 'Or start from one of these — they name this project\'s own sources'
         : 'Or start from one of these'));
  const chips = el('div','askchips');
  (data ? dataPrompts(p) : projectPrompts(p)).forEach(q => chips.append(askChip(q)));
  inner.append(chips);
  if (p.assistant) inner.append(helpNote(p.assistant + ' answers here unless a thread picks another.'));
}

/* ====================================================== knowledge detail
   A base is six kinds of thing at once, so the detail is tabbed rather than
   one long scroll: the files in it, the tables and series extracted from them,
   what the model derived, who may read it, and what has happened to it.
   Base-level facts stay above the tabs, because they belong to the base and
   not to any one view of it. */
const KB_TABS = [
  { id:'files',    label:'Files',       icon:'files' },
  { id:'tables',   label:'Tables',      icon:'table' },
  { id:'series',   label:'Time Series', icon:'trend' },
  { id:'analysis', label:'Analysis',    icon:'pie' },
  { id:'access',   label:'Access',      icon:'lock' },
  { id:'activity', label:'Activity',    icon:'pulse' }
];

function kbView(body, k){
  const pad = el('div','pane__pad');
  pad.append(pageHead(k.name, k.desc,
    k.health === 'warn' ? '<span class="badge badge--warn">Needs attention</span>'
                        : '<span class="badge badge--ok">Healthy</span>'));
  if (k.health === 'warn'){
    pad.append(banner('warn','This base is still on <strong>' + esc(k.embed) +
      '</strong>. Retrieval quality will not match the other bases until the re-embed run clears its quota block.'));
  }
  pad.append(statGrid([
    ['Documents', k.docs], ['Embedding', k.embed], ['Updated', k.updated],
    ['Used by', plural(D.ASSISTANTS.filter(a => a.kb === k.name).length, 'assistant')]
  ], ['Embedding','Updated','Used by']));
  pad.lastChild.style.marginBottom = 'var(--s-6)';

  const bar = el('div','tabs');
  bar.setAttribute('role','tablist');
  KB_TABS.forEach(t => {
    const b = el('button','tab', ic(t.icon, 15) + '<span>' + esc(t.label) + '</span>');
    b.type = 'button';
    b.setAttribute('role','tab');
    b.setAttribute('aria-selected', String(state.kb.tab === t.id));
    b.onclick = () => {
      if (state.kb.tab === t.id) return;
      state.kb.tab = t.id;
      state.kb.sel = [];      /* a selection means nothing in another tab */
      render();
    };
    bar.append(b);
  });
  pad.append(bar);

  const panel = el('div');
  panel.style.marginTop = 'var(--s-4)';
  KB_PANELS[state.kb.tab](panel, k);
  pad.append(panel);
  body.append(pad);
}

/* A sortable header cell. Only the column in force shows a single direction;
   the rest offer both. */
function sortTh(col, label, num){
  const active = state.kb.sort.c === col;
  const dir = state.kb.sort.d;
  /* Ascending points up, descending points down — one glyph, rotated, so the
     two states cannot drift apart. */
  const glyph = active
    ? ic('chevD', 12).replace('<svg', '<svg style="rotate:' + (dir > 0 ? '180deg' : '0deg') + '"')
    : ic('sort', 13);
  const th = el('th', num ? 'num' : null,
    '<button type="button">' + esc(label) + '<span class="sortic">' + glyph + '</span></button>');
  if (active) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
  th.firstChild.onclick = () => {
    state.kb.sort = { c:col, d:active ? -dir : 1 };
    render();
  };
  return th;
}
function sortRows(rows, keyOf){
  const { c, d } = state.kb.sort;
  return rows.slice().sort((a, b) => {
    const x = keyOf(a, c), y = keyOf(b, c);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * d;
    return String(x).localeCompare(String(y)) * d;
  });
}
/* The glyph carries the file's type, so the extension does not have to be read
   to know what a row is. */
const EXT_ICON = {
  xlsx:'table', csv:'table', json:'code', yaml:'code', yml:'code',
  jsonl:'data', parquet:'data', md:'doc', docx:'doc', pdf:'doc'
};
const fileIcon = n => EXT_ICON[String(n).split('.').pop().toLowerCase()] || 'file';

const DOT_FOR = { indexed:'dot--ok', queued:'dot--run is-live', failed:'dot--err',
                  ok:'dot--ok', warn:'dot--warn', err:'dot--err', run:'dot--run is-live' };
function stateCell(s){
  return '<span style="display:inline-flex;align-items:center;gap:6px">' +
         '<span class="dot ' + (DOT_FOR[s] || '') + '"></span>' + esc(s) + '</span>';
}

const KB_PANELS = {
  /* ------------------------------------------------------------- files */
  files(panel, k){
    const sel = state.kb.sel;
    const bar = el('div','toolbar');
    bar.style.marginBottom = 'var(--s-3)';

    if (sel.length){
      bar.innerHTML = '<span class="toolbar__meta">' + plural(sel.length, 'file') + ' selected</span>' +
                      '<div class="toolbar__spacer"></div>';
      const rm = el('button','btn btn--danger btn--sm', ic('trash',13) + 'Remove');
      rm.type = 'button';
      rm.onclick = () => { toast(plural(sel.length,'file') + ' removed — prototype'); state.kb.sel = []; render(); };
      const clear = el('button','btn btn--ghost btn--sm','Clear');
      clear.type = 'button';
      clear.onclick = () => { state.kb.sel = []; render(); };
      bar.append(rm, clear);
    } else {
      bar.innerHTML = '<span class="toolbar__meta">Last updated ' + esc(k.updated) + '</span>' +
                      '<div class="toolbar__spacer"></div>';
      const existing = el('button','btn btn--secondary btn--sm', ic('library',13) + 'Add existing');
      const add = el('button','btn btn--primary btn--sm', ic('plus',13) + 'Add files');
      const refresh = el('button','btn btn--ghost btn--sm', ic('retry',13) + 'Refresh');
      [existing, add, refresh].forEach(b => b.type = 'button');
      existing.onclick = () => toast('Pick from another base — prototype');
      add.onclick = () => toast('Upload — prototype');
      refresh.onclick = () => toast('Re-scanned ' + k.name);
      bar.append(existing, add, refresh);
    }
    panel.append(bar);

    const rows = sortRows(k.files, (f, c) =>
      c === 'size' ? f.b : c === 'added' ? f.ts : c === 'from' ? f.from : c === 'st' ? f.st : f.n);
    const allOn = sel.length === k.files.length && sel.length > 0;

    const sx = el('div','scroll-x');
    const t = el('table','table table--rows');
    const head = el('tr');
    const pickTh = el('th','pick');
    const all = el('input','check');
    all.type = 'checkbox';
    all.checked = allOn;
    all.indeterminate = sel.length > 0 && !allOn;
    all.setAttribute('aria-label','Select all files');
    all.onchange = () => { state.kb.sel = all.checked ? k.files.map(f => f.n) : []; render(); };
    pickTh.append(all);
    head.append(pickTh, sortTh('n','Name'), sortTh('from','From'),
                sortTh('size','Size', true), sortTh('added','Date added'), sortTh('st','Status'));
    const thead = el('thead'); thead.append(head);

    const tbody = el('tbody');
    rows.forEach(f => {
      const tr = el('tr');
      const on = sel.indexOf(f.n) > -1;
      tr.setAttribute('aria-selected', String(on));
      const pick = el('td','pick');
      const cb = el('input','check');
      cb.type = 'checkbox';
      cb.checked = on;
      cb.setAttribute('aria-label','Select ' + f.n);
      cb.onchange = () => {
        state.kb.sel = on ? sel.filter(x => x !== f.n) : sel.concat([f.n]);
        render();
      };
      pick.append(cb);
      tr.append(pick);
      tr.insertAdjacentHTML('beforeend',
        '<td><span style="display:flex;align-items:center;gap:var(--s-2)">' +
          '<span style="display:flex;color:var(--text-4)">' + ic(fileIcon(f.n),14) + '</span>' +
          '<span style="font-family:var(--mono);color:var(--text)">' + esc(f.n) + '</span>' +
        '</span></td>' +
        '<td>' + esc(f.from) + '</td>' +
        '<td class="num">' + esc(f.size) + '</td>' +
        '<td>' + esc(f.added) + '</td>' +
        '<td>' + stateCell(f.st) + '</td>');
      tbody.append(tr);
    });
    t.append(thead, tbody);
    sx.append(t);
    panel.append(sx);
    panel.append(el('p','t-mono','Showing ' + k.files.length + ' of ' + k.docs + ' documents'));
    panel.lastChild.style.marginTop = 'var(--s-3)';
  },

  /* ------------------------------------------------------------ tables */
  tables(panel, k){
    panel.append(tableSection('Extracted tables', ['Table','Rows','Columns','Updated'],
      k.tables.map(r => [
        '<td style="font-family:var(--mono);color:var(--text)">' + esc(r[0]) + '</td>',
        '<td class="num">' + esc(r[1]) + '</td>',
        '<td>' + esc(r[2]) + '</td>',
        '<td>' + esc(r[3]) + '</td>'
      ]),
      '<span class="t-mono">queryable</span>'));
  },

  /* ------------------------------------------------------------ series */
  series(panel, k){
    const card = el('section','card');
    card.innerHTML = '<div class="card__head"><span class="card__title">Time series</span>' +
                     '<span style="flex:1"></span><span class="t-mono">' + k.series.length + '</span></div>';
    const b = el('div','card__body');
    k.series.forEach((s, i) => {
      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:var(--s-4);padding:var(--s-3) 0' +
                          (i ? ';border-top:1px solid var(--line)' : '');
      row.innerHTML =
        '<span style="flex:1;min-width:0">' +
          '<span class="row__title" style="font-family:var(--mono)">' + esc(s.n) + '</span>' +
          '<span class="row__sub">' + esc(s.cadence) + ' · ' + esc(s.span) + '</span>' +
        '</span>' +
        '<span class="sparkbars" style="width:120px;flex:none">' +
          s.bars.map(v => '<i style="height:' + v + '%"></i>').join('') +
        '</span>';
      b.append(row);
    });
    card.append(b);
    panel.append(card);
  },

  /* ---------------------------------------------------------- analysis */
  analysis(panel, k){
    const card = el('section','card');
    card.innerHTML = '<div class="card__head"><span class="card__title">Derived from this base</span></div>';
    const b = el('div','card__body');
    b.style.padding = '0 var(--s-3)';
    k.analysis.forEach(([title, kind, when]) => {
      const r = el('div','artlist__row');
      r.innerHTML =
        '<span class="row__main" style="flex:1">' +
          '<span class="row__title">' + esc(title) + '</span>' +
          '<span class="row__sub">' + esc(kind) + '</span>' +
        '</span>' +
        '<span class="artlist__v">' + esc(when) + '</span>';
      b.append(r);
    });
    card.append(b);
    panel.append(card);
  },

  /* ------------------------------------------------------------ access */
  access(panel, k){
    panel.append(tableSection('Who can read this base', ['Principal','Role','Scope'],
      k.access.map(r => [
        '<td style="color:var(--text)">' + esc(r[0]) + '</td>',
        '<td><span class="badge' + (r[1] === 'No access' ? '' : ' badge--info') + '">' + esc(r[1]) + '</span></td>',
        '<td>' + esc(r[2]) + '</td>'
      ])));
  },

  /* ---------------------------------------------------------- activity */
  activity(panel, k){
    const card = el('section','card');
    card.innerHTML = '<div class="card__head"><span class="card__title">Activity</span></div>';
    const b = el('div','card__body');
    k.activity.forEach(([when, who, what, st]) => {
      const step = el('div','step');
      step.innerHTML =
        '<span class="dot ' + (DOT_FOR[st] || '') + '"></span>' +
        '<span class="step__name">' + esc(who) + '</span>' +
        '<span class="step__detail">' + esc(what) + '</span>' +
        '<span class="step__t">' + esc(when) + '</span>';
      b.append(step);
    });
    card.append(b);
    panel.append(card);
  }
};

function datasetView(body, d){
  const pad = el('div','pane__pad');
  pad.append(pageHead(d.name, d.desc,
    d.health === 'warn' ? '<span class="badge badge--warn">Incomplete</span>'
                        : '<span class="badge badge--ok">Healthy</span>'));
  pad.append(statGrid([
    ['Rows', d.rows], ['Columns', String(d.schema.length)], ['Source', d.source], ['Updated', d.updated]
  ], ['Source','Updated']));
  pad.lastChild.style.marginBottom = 'var(--s-8)';

  if (d.health === 'warn'){
    pad.append(banner('warn','The June backfill is incomplete. Aggregations over Q2 will undercount.'));
  }
  pad.append(tableSection('Schema',
    ['Column','Type','Nullable','Example'],
    d.schema.map(r => [
      '<td style="font-family:var(--mono);color:var(--text)">' + esc(r[0]) + '</td>',
      '<td style="font-family:var(--mono)">' + esc(r[1]) + '</td>',
      '<td>' + esc(r[2]) + '</td>',
      '<td class="t-mono">' + esc(r[3]) + '</td>'
    ])));
  pad.append(tableSection('Preview',
    d.schema.slice(0, d.preview[0].length).map(c => c[0]),
    d.preview.map(r => r.map(v => '<td style="font-family:var(--mono)">' + esc(v) + '</td>')),
    '<span class="t-mono">first ' + d.preview.length + ' rows</span>'));
  body.append(pad);
}

/* ==================================================================== build
   Three kinds of thing are built here, and they point at each other by id: an
   assistant grants connectors, a solution binds an assistant and renders as a
   design element. Strict lookups, not `find()` — `find()` falls back to the
   first item, which would quietly turn "nothing bound" into "the first one". */
const byId = (list, id) => list.filter(x => x.id === id)[0] || null;
/* A glyph per connector kind. Not brand marks: what matters in a list of grants
   is what KIND of system it is, and a logo says which vendor instead. */
const CONN_ICON = { warehouse:'data', drive:'folder', ticketing:'filetext', docs:'doc',
                    repo:'branch', crm:'users', messaging:'chat', payments:'dollar',
                    webhook:'plug', form:'checksq' };
const skillById   = id => byId(D.SKILLS, id);
const connById    = id => byId(D.CONNECTORS, id);
const kbById      = id => byId(D.KBS, id);
const designById  = id => byId(D.DESIGNS, id);
const asstById    = id => byId(D.ASSISTANTS, id);
const surfaceById = id => byId(D.SURFACES, id);

/* Referenced-by is derived, never stored. The builder mutates these objects, so
   a cached list of dependents would be wrong by the second edit. */
function usedBySection(title, entries, emptyText){
  const sec = el('section','section');
  sec.append(sectionHead(title, '<span class="t-mono">' + entries.length + '</span>'));
  if (!entries.length){
    sec.append(emptyState('link','Nothing references this yet', emptyText));
  } else {
    entries.forEach(e => sec.append(listRow({
      lead:'<span class="row__icon">' + ic(e.ic, 13) + '</span>',
      title:e.nm, sub:e.sub, onClick:e.go
    })));
  }
  return sec;
}
/* Who owns it, in the page head next to its state — the same two facts the
   sidebar row carries, so arriving from a filtered list explains itself. */
function ownerBadge(x){
  return '<span class="badge badge--mono">' +
    esc((isMine(x) ? 'You' : x.owner) + ' · ' + (x.team || '—')) + '</span>';
}
function stateBadge(s){
  const badge = { live:'badge--ok', ok:'badge--ok', run:'badge--info', beta:'badge--info',
                  warn:'badge--warn', err:'badge--err', idle:'', draft:'', off:'' }[s] || '';
  const text  = { live:'Live', ok:'Live', run:'Running', beta:'Beta', warn:'Needs attention',
                  err:'Failed', idle:'Idle', draft:'Draft', off:'Not connected' }[s] || s;
  return '<span class="badge ' + badge + '">' + esc(text) + '</span>';
}

/* ------------------------------------------------------- assistant builder
   The same record the chat sidebar lists. Chat picks one; this defines it. */
function assistantBuildView(body, a){
  const pad = el('div','pane__pad');
  pad.append(pageHead(a.name, a.desc, ownerBadge(a) + stateBadge(a.state)));
  const s = buildSplit();

  const pair = el('div','build__pair');
  pair.append(field('Name', inputCtl(a.name, v => { a.name = v.trim() || a.name; render(); })));
  pair.append(field('Team', selectCtl(D.ASSISTANT_TEAMS, a.team, v => { a.team = v; render(); })));
  s.main.append(pair);

  const pair2 = el('div','build__pair');
  /* An assistant can be pinned to a model this workspace does not offer in the
     composer, so the current value is added rather than silently replaced by
     the first option. */
  const models = D.MODELS.indexOf(a.model) > -1 ? D.MODELS : D.MODELS.concat([a.model]);
  pair2.append(field('Model', selectCtl(models, a.model, v => {
    a.model = v; a.opts.think = v.indexOf('extended') > -1; render();
  }), 'A thread can still route a single turn elsewhere.'));
  const kbNames = ['— none —'].concat(D.KBS.map(k => k.name));
  pair2.append(field('Knowledge base', selectCtl(kbNames, a.kb || '— none —', v => {
    a.kb = v === '— none —' ? null : v; render();
  }), 'The only corpus it may cite.'));
  s.main.append(pair2);

  s.main.append(field('Instructions', textareaCtl(a.inst, v => { a.inst = v; render(); },
    'What it must do, and what it must refuse to do.'),
    'Read before every turn. State the refusals — they are the half that holds under pressure.'));

  /* Skills an assistant names but the workspace has not defined are shown as
     such rather than dropped: the gap belongs on screen, not in a filter. */
  const defined = D.SKILLS.map(x => x.name);
  const undef = a.skills.filter(n => defined.indexOf(n) < 0);
  const skillItems = D.SKILLS.map(x => ({ nm:x.name, sub:x.desc, meta:x.avg, id:x.name }))
    .concat(undef.map(n => ({ nm:n, sub:'not defined in this workspace', meta:'—', id:n })));
  const skillSec = el('section','section');
  skillSec.append(sectionHead('Skills', '<span class="t-mono">' + a.skills.length + ' of ' + skillItems.length + '</span>'));
  skillSec.append(pickList(skillItems,
    it => a.skills.indexOf(it.id) > -1,
    (it, on) => {
      a.skills = on ? a.skills.concat([it.id]) : a.skills.filter(n => n !== it.id);
      render();
    }));
  if (undef.length){
    const b = banner('warn', '<strong>' + esc(undef.join(', ')) +
      '</strong> ' + (undef.length === 1 ? 'is named here but has no definition' :
      'are named here but have no definitions') + ' in Skills. Calls to ' +
      (undef.length === 1 ? 'it' : 'them') + ' will fail at run time.');
    b.style.margin = 'var(--s-3) 0 0';
    skillSec.append(b);
  }
  s.main.append(skillSec);

  const connSec = el('section','section');
  connSec.append(sectionHead('Connectors', '<span class="t-mono">' + a.conn.length + '</span>'));
  connSec.append(pickList(
    D.CONNECTORS.map(c => ({
      nm:c.name, sub:c.state === 'off' ? 'not connected — grant it here, connect it in Cloud' : c.scope,
      meta:c.kind, id:c.id
    })),
    it => a.conn.indexOf(it.id) > -1,
    (it, on) => {
      a.conn = on ? a.conn.concat([it.id]) : a.conn.filter(x => x !== it.id);
      render();
    }));
  connSec.append(noteP('A grant is not a connection. Granting one that is not connected is allowed — it states what this assistant will need. Connecting it is done in Cloud \u2192 Connections, usually by someone else.'));
  s.main.append(connSec);

  const optSec = el('section','section');
  optSec.append(sectionHead('Behaviour'));
  const opts = el('div');
  [['cite','Attach a source to every claim'],
   ['confirm','Confirm before writing anything outside the workspace'],
   ['think','Extended thinking']].forEach(([k, label]) => {
    const sw = switchCtl(label, a.opts[k]);
    $('input', sw).onchange = e => { a.opts[k] = e.target.checked; };
    opts.append(sw);
  });
  optSec.append(opts);
  s.main.append(optSec);

  const pkgs = D.SOLUTIONS.filter(p => p.assistant === a.id);
  s.main.append(usedBySection('Shipped in', pkgs.map(p => ({
    ic:'pkg', nm:p.name, sub:p.version + ' · ' + p.state, go:() => select('build', key('so', p.id))
  })), 'Bind it to a solution and it reaches someone other than you.'));

  /* ------------------------------------------------------------ inspector */
  inspectorHead(s.side, 'Becomes', plural(a.threads, 'thread'));
  s.side.append(defList([
    ['State', dotLead(a.state) + esc({ ok:'live', idle:'idle', draft:'draft' }[a.state] || a.state)],
    ['Model', esc(a.model)],
    ['Skills', a.skills.length ? esc(String(a.skills.length)) : '<span style="color:var(--warn)">none</span>'],
    ['Knowledge', esc(a.kb || 'none')],
    ['Connectors', esc(String(a.conn.length))],
    ['In composer', a.fav ? 'yes' : 'no']
  ]));
  s.side.append(noteP('Edits apply as you make them — this prototype keeps no draft and no version history.'));

  const test = el('button','btn btn--primary', ic('play',13) + 'Test in a thread');
  test.onclick = () => {
    state.assistant = a.id;
    renderComposer();
    newThread();
    toast('New thread bound to ' + a.name);
  };
  const star = el('button','btn btn--secondary',
    ic(a.fav ? 'starOn' : 'star', 13) + (a.fav ? 'In the composer' : 'Add to composer'));
  star.onclick = () => { a.fav = !a.fav; render(); renderComposer(); };
  const dup = el('button','btn btn--ghost', ic('copy',13) + 'Duplicate');
  dup.onclick = () => {
    const c = Object.assign({}, a, {
      id:'as-n' + (++madeN), name:a.name + ' copy', state:'draft', fav:false, threads:0,
      skills:a.skills.slice(), conn:a.conn.slice(), opts:Object.assign({}, a.opts)
    });
    D.ASSISTANTS.push(c);
    select('build', key('as', c.id));
    toast('Duplicated as ' + c.name);
  };
  inspectorActs(s.side, [test, star, dup]);

  pad.append(s.wrap);
  body.append(pad);
}

/* Anything made here is yours, which is what puts it under Mine in the filter
   without anyone having to say so. */
function newAssistant(){
  const a = {
    id:'as-n' + (++madeN), name:'Untitled assistant', state:'draft', model:D.MODELS[0],
    team:D.ASSISTANT_TEAMS[0], owner:'me', fav:false, threads:0,
    desc:'No description yet.', skills:[], kb:null, conn:[],
    opts:{ cite:true, confirm:true, think:false }, inst:''
  };
  D.ASSISTANTS.push(a);
  select('build', key('as', a.id));
}

function newDesign(){
  const d = {
    id:'de-n' + (++madeN), name:'Untitled widget', kind:'widget', shape:'kpi',
    state:'draft', owner:'me', team:D.ASSISTANT_TEAMS[0],
    desc:'A new metric tile. Everything about it is set in the inspector.',
    cfg:{ title:'Untitled', sub:'', accent:'Nebulas', radius:'Soft', theme:'Follow',
          width:'Narrow', header:true, credit:true,
          value:'—', delta:'', cap:'' }
  };
  D.DESIGNS.push(d);
  select('build', key('de', d.id));
}

/* -------------------------------------------------------------- connectors
   A connector is a credential and a scope. It never holds data, which is why
   this page has no preview — there is nothing to look at, only what it may
   reach and who may reach through it. */
function connectorView(body, c){
  const pad = el('div','pane__pad');
  /* A connector is a page *under* Connections, so it carries the way back up.
     The sidebar keeps Connections marked current, but a page one level down
     should not depend on the sidebar being open to be escapable. */
  const up = el('button','btn btn--ghost btn--sm', ic('chevL',12) + 'All connections');
  up.style.marginBottom = 'var(--s-3)';
  up.onclick = () => select('cloud','c3');
  pad.append(up);
  pad.append(pageHead(c.name, c.desc, stateBadge(c.state)));

  if (c.state === 'off'){
    pad.append(banner('info','<strong>Not connected.</strong> Assistants can already be granted this connector — ' +
      'the grant says what they will need. Nothing reaches it until the connection is made.'));
  } else if (c.note){
    pad.append(banner('warn', esc(c.note) + ' Anything aggregating that period will undercount.'));
  }

  pad.append(statGrid([
    ['Auth', c.auth], ['Calls', c.calls], ['Last sync', c.last],
    ['Writes', c.writes ? 'allowed, with confirmation' : 'read-only']
  ], ['Auth','Calls','Last sync','Writes']));
  pad.lastChild.style.marginBottom = 'var(--s-6)';

  const s = buildSplit();
  s.main.append(field('Endpoint', inputCtl(c.endpoint, v => { c.endpoint = v; render(); }),
    'Host only. Credentials are held by the platform and never shown here.'));
  const pair = el('div','build__pair');
  pair.append(field('Authentication', selectCtl(D.CONNECTOR_AUTHS, c.auth, v => { c.auth = v; render(); })));
  pair.append(field('Scope', inputCtl(c.scope, v => { c.scope = v; render(); })));
  s.main.append(pair);

  const wr = switchCtl('Allow writes through this connector', c.writes);
  $('input', wr).onchange = e => { c.writes = e.target.checked; render(); };
  s.main.append(wr);
  s.main.append(noteP('Writes always ask for confirmation at the point of writing, whatever this says. ' +
    'Turning it off removes the option; it does not make the confirmation optional.'));

  const grants = D.ASSISTANTS.filter(a => a.conn.indexOf(c.id) > -1).map(a => ({
    ic:'agent', nm:a.name, sub:a.team + ' · ' + a.model, go:() => select('build', key('as', a.id))
  }));
  const inPkgs = D.SOLUTIONS.filter(p => p.conn.indexOf(c.id) > -1).map(p => ({
    ic:'pkg', nm:p.name, sub:p.version + ' · ' + p.state, go:() => select('build', key('so', p.id))
  }));
  s.main.append(usedBySection('Granted to', grants.concat(inPkgs),
    'No assistant or solution reaches through this connector.'));

  /* ------------------------------------------------------------ inspector */
  inspectorHead(s.side, 'Connection', c.kind);
  s.side.append(defList([
    ['State', dotLead(c.state) + esc(c.state === 'off' ? 'not connected' : c.state === 'warn' ? 'degraded' : 'live')],
    ['Auth', esc(c.auth)],
    ['Direction', esc(c.writes ? 'read and write' : 'read only')],
    ['Granted to', esc(String(grants.length + inPkgs.length))],
    ['Last sync', esc(c.last)]
  ]));

  const acts = [];
  if (c.state === 'off'){
    const conn = el('button','btn btn--primary', ic('plug',13) + 'Connect');
    conn.onclick = () => {
      c.state = 'ok'; c.last = 'just now'; c.calls = '0 / 7d';
      if (c.endpoint === '—') c.endpoint = c.name.toLowerCase().replace(/\s+/g,'') + '.example.com';
      if (c.scope === '—') c.scope = 'not scoped yet — narrow it before granting';
      render();
      toast(c.name + ' connected');
    };
    acts.push(conn);
  } else {
    const test = el('button','btn btn--primary', ic('retry',13) + 'Test connection');
    test.onclick = () => { c.last = 'just now'; render(); toast(c.name + ' reachable · ' + c.auth); };
    acts.push(test);
    const off = el('button','btn btn--danger', ic('x',13) + 'Disconnect');
    off.onclick = () => {
      const n = grants.length + inPkgs.length;
      c.state = 'off'; c.last = '—'; c.calls = '—';
      render();
      toast(n ? c.name + ' disconnected — ' + plural(n, 'grant') + ' now unreachable'
              : c.name + ' disconnected');
    };
    acts.push(off);
  }
  inspectorActs(s.side, acts);
  s.side.append(noteP(c.state === 'off'
    ? 'Connecting here does not grant anything. Grants are made per assistant.'
    : 'Disconnecting leaves every grant in place. They stop working; they do not disappear.'));

  pad.append(s.wrap);
  body.append(pad);
}

/* --------------------------------------------------- design elements
   What the answer looks like once it leaves the workspace. The canvas is on the
   left and the inspector on the right, which is where anyone who has used a
   design tool looks for it.

   Inside the canvas a second accent exists — the customer's brand. It is
   confined to the frame and never touches our chrome, which is the same rule
   the app tiles follow: colour as identity, not as emphasis. */
const RADII  = { Square:'var(--r-xs)', Soft:'var(--r-lg)', Round:'var(--r-2xl)' };
const accentVar = name => (D.DESIGN_ACCENTS.filter(x => x[0] === name)[0] || ['','var(--accent)'])[1];
const deltaCls  = v => /^-/.test(String(v)) ? 'delta-dn' : 'delta-up';
const commaList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

function designCanvas(d){
  const stage = el('div','canvas');
  const frame = el('div','canvas__frame');
  frame.dataset.w = String(d.cfg.width).toLowerCase();
  frame.style.setProperty('--wgt-a', accentVar(d.cfg.accent));
  frame.style.setProperty('--wgt-r', RADII[d.cfg.radius] || 'var(--r-lg)');
  /* Follow means inherit the page; the other two re-declare the palette for
     this subtree only — see the scoped block in tokens.css. */
  if (d.cfg.theme === 'Light' || d.cfg.theme === 'Dark') frame.dataset.theme = d.cfg.theme.toLowerCase();
  frame.append(d.kind === 'widget' ? widgetNode(d) : templateNode(d));
  stage.append(frame);
  return stage;
}

function widgetNode(d){
  const c = d.cfg, w = el('div','wgt');
  if (c.header){
    w.append(el('div','wgt__head',
      '<span class="wgt__mark"></span>' +
      '<span class="wgt__title">' + esc(c.title) + '</span>' +
      (c.sub ? '<span class="wgt__sub">' + esc(c.sub) + '</span>' : '')));
  }
  const b = el('div','wgt__body');

  if (d.shape === 'kpi'){
    b.innerHTML =
      '<div class="wgt__kpirow">' +
        '<span class="wgt__kpi">' + esc(c.value) + '</span>' +
        (c.delta ? '<span class="wgt__delta ' + deltaCls(c.delta) + '">' + esc(c.delta) + '</span>' : '') +
      '</div>' +
      (c.cap ? '<div class="wgt__cap">' + esc(c.cap) + '</div>' : '');

  } else if (d.shape === 'chart'){
    b.innerHTML =
      '<div class="wgt__kpirow" style="margin-bottom:var(--s-3)">' +
        '<span class="wgt__kpi">' + esc(c.value) + '</span>' +
        (c.delta ? '<span class="wgt__delta ' + deltaCls(c.delta) + '">' + esc(c.delta) + '</span>' : '') +
      '</div>' +
      '<div class="sparkbars wgt__spark">' +
        (d.bars || []).map(v => '<i style="height:' + v + '%"></i>').join('') +
      '</div>' +
      (c.cap ? '<div class="wgt__cap">' + esc(c.cap) + '</div>' : '');

  } else if (d.shape === 'ask'){
    b.innerHTML =
      '<div class="wgt__ask"><span>' + esc(c.placeholder) + '</span>' +
        '<span class="wgt__send">' + ic('chevR',13) + '</span></div>' +
      '<div class="wgt__starters">' +
        commaList(c.starters).map(x => '<span class="wgt__starter">' + esc(x) + '</span>').join('') +
      '</div>';

  } else {
    b.innerHTML =
      '<div class="wgt__rows">' +
        (d.rows || []).map(r =>
          '<div class="wgt__row">' +
            '<div class="wgt__rowtop"><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>' +
            '<div class="wgt__bar"><i style="width:' + r[2] + '%"></i></div>' +
          '</div>').join('') +
      '</div>' +
      (c.cap ? '<div class="wgt__cap" style="margin-top:var(--s-3)">' + esc(c.cap) + '</div>' : '');
  }
  w.append(b);
  if (c.credit) w.append(el('div','wgt__foot','Answered by Nebulas · sources attached'));
  return w;
}

/* A template preview is a wireframe on purpose: bars where the text goes, so
   the layout is judged rather than the placeholder prose. */
function lineRow(widths, cls){
  return widths.map(w => '<div class="tpl__line ' + (cls || '') + '" style="width:' + w + '%"></div>').join('');
}
function templateNode(d){
  const c = d.cfg, t = el('div','tpl');
  const nav = commaList(c.nav);
  if (c.header){
    t.append(el('div','tpl__bar',
      '<span class="tpl__logo"></span><span class="tpl__nm">' + esc(c.title) + '</span>' +
      '<span class="tpl__navs">' + nav.map(n => '<span>' + esc(n) + '</span>').join('') + '</span>'));
  }

  if (d.shape === 'portal'){
    const cols = el('div','tpl__cols');
    /* One nav item is where you are; the rest are where you could go. Branding
       all of them would say every page is the current one. */
    cols.append(el('div','tpl__side', lineRow([90], 'tpl__line--on') + lineRow([70,80,60,75,85])));
    const main = el('div','tpl__main');
    main.innerHTML =
      '<div>' + lineRow([46], 'tpl__line--h') + '</div>' +
      '<div class="tpl__grid">' +
        [0,1,2,3].map(() =>
          '<div class="tpl__cell"><span class="tpl__dot"></span>' + lineRow([80,55]) + '</div>').join('') +
      '</div>';
    cols.append(main);
    t.append(cols);

  } else if (d.shape === 'landing'){
    t.append(el('div','tpl__hero',
      '<div class="tpl__h1">' + esc(c.title) + '</div>' +
      '<div class="tpl__sub">' + esc(c.sub) + '</div>' +
      '<span class="tpl__btn">' + esc(c.cta) + '</span>'));
    const pad = el('div','tpl__pad');
    pad.innerHTML = '<div class="tpl__grid tpl__grid--3">' +
      [0,1,2].map(() => '<div class="tpl__cell"><span class="tpl__dot"></span>' +
        lineRow([85,65,40]) + '</div>').join('') + '</div>';
    t.append(pad);

  } else {
    const cols = el('div','tpl__cols tpl__cols--docs');
    cols.append(el('div','tpl__side', nav.map((n, i) =>
      '<div class="tpl__line ' + (i === 1 ? 'tpl__line--on' : '') + '" style="width:' +
      (95 - i * 8) + '%"></div>').join('')));
    const main = el('div','tpl__main');
    main.innerHTML =
      '<div>' + lineRow([58], 'tpl__line--h') + '</div>' +
      '<div style="display:grid;gap:6px">' + lineRow([100,96,88,100,72]) + '</div>' +
      '<div style="display:grid;gap:6px">' + lineRow([40], 'tpl__line--on') + lineRow([100,92,64]) + '</div>';
    cols.append(main);
    cols.append(el('div','tpl__toc', lineRow([100,80,90,70])));
    t.append(cols);
  }
  return t;
}

function embedSnippet(d){
  if (d.kind === 'widget'){
    return [
      '<div id="nebulas-' + d.id + '"></div>',
      '<script src="https://embed.nebulas.app/v1.js"',
      '        data-element="' + d.id + '"',
      '        data-token="pk_live_9f2c…"></script>'
    ].join('\n');
  }
  return [
    'nebulas deploy ' + d.id + ' --domain help.example.com',
    '  built 3 routes · tokens inlined · 41 kB'
  ].join('\n');
}

function designView(body, d){
  const c = d.cfg;
  const pad = el('div','pane__pad');
  pad.append(pageHead(d.name, d.desc,
    '<span class="badge badge--mono">' + (d.kind === 'widget' ? 'Widget' : 'Website template') + '</span>' +
    ownerBadge(d) + stateBadge(d.state)));

  const s = buildSplit();
  s.main.append(designCanvas(d));

  const emb = el('section','section');
  emb.style.marginTop = 'var(--s-6)';
  /* A widget's meta is whose theme wins, because it lands in a page we do not
     control. A template IS the page, so its meta is how many routes it has. */
  emb.append(sectionHead(d.kind === 'widget' ? 'Embed' : 'Deploy',
    '<span class="t-mono">' + esc(d.kind === 'widget'
      ? (c.theme === 'Follow' ? 'inherits the host page' : c.theme.toLowerCase() + ', fixed')
      : plural(commaList(c.nav).length, 'route')) + '</span>'));
  emb.append(codeCard(embedSnippet(d)));
  emb.append(noteP(d.kind === 'widget'
    ? 'The widget ships its own tokens, so it looks like this inside a page whose CSS we have never seen.'
    : 'A template is a hosted page. The routes come from the nav; the palette comes from the accent chosen here.'));
  s.main.append(emb);

  const pkgs = D.SOLUTIONS.filter(p => p.design === d.id);
  s.main.append(usedBySection('Rendered by', pkgs.map(p => ({
    ic:'pkg', nm:p.name, sub:p.version + ' · ' + p.state, go:() => select('build', key('so', p.id))
  })), 'No solution renders as this yet, so nobody has seen it.'));

  /* --------------------------------------------------- inspector = config */
  inspectorHead(s.side, 'Design', d.shape);
  const up = () => render();

  s.side.append(field(d.kind === 'widget' ? 'Title' : 'Brand name',
    inputCtl(c.title, v => { c.title = v; up(); })));

  if (d.shape === 'kpi' || d.shape === 'chart'){
    const p = el('div','build__pair');
    p.append(field('Value', inputCtl(c.value, v => { c.value = v; up(); })));
    p.append(field('Delta', inputCtl(c.delta, v => { c.delta = v; up(); })));
    s.side.append(p);
    s.side.append(field('Caption', inputCtl(c.cap, v => { c.cap = v; up(); })));
  } else if (d.shape === 'ask'){
    s.side.append(field('Placeholder', inputCtl(c.placeholder, v => { c.placeholder = v; up(); })));
    s.side.append(field('Starters', inputCtl(c.starters, v => { c.starters = v; up(); }),
      'Comma separated. Three is the most anyone reads.'));
  } else if (d.shape === 'rows'){
    s.side.append(field('Caption', inputCtl(c.cap, v => { c.cap = v; up(); })));
  }
  if (d.kind === 'template'){
    if (d.shape === 'landing'){
      s.side.append(field('Sub-headline', inputCtl(c.sub, v => { c.sub = v; up(); })));
      s.side.append(field('Call to action', inputCtl(c.cta, v => { c.cta = v; up(); })));
    }
    s.side.append(field('Navigation', inputCtl(c.nav, v => { c.nav = v; up(); }),
      'Comma separated. Each one becomes a route.'));
  }

  s.side.append(field('Brand colour', selectCtl(D.DESIGN_ACCENTS.map(x => x[0]), c.accent,
    v => { c.accent = v; up(); }),
    'The customer\'s colour, confined to the canvas. It never reaches our chrome.'));
  s.side.append(field('Corners', segCtl(['Square','Soft','Round'], c.radius, v => { c.radius = v; up(); })));
  s.side.append(field('Theme', segCtl(['Follow','Light','Dark'], c.theme, v => { c.theme = v; up(); }),
    'Follow takes the host page\'s theme. The other two are a decision.'));
  s.side.append(field('Width', segCtl(['Narrow','Medium','Wide'], c.width, v => { c.width = v; up(); })));

  const hd = switchCtl('Show header', c.header);
  $('input', hd).onchange = e => { c.header = e.target.checked; up(); };
  const cr = switchCtl('Nebulas credit', c.credit);
  $('input', cr).onchange = e => { c.credit = e.target.checked; up(); };
  s.side.append(hd, cr);

  /* Already live is a state, not an action, so the button stops being primary
     rather than being a greyed-out primary pretending it could still be one. */
  const live = d.state === 'live';
  const pub = el('button','btn ' + (live ? 'btn--secondary' : 'btn--primary'),
    ic('check',13) + (live ? 'Published' : 'Publish element'));
  pub.disabled = live;
  pub.onclick = () => { d.state = 'live'; render(); toast(d.name + ' published'); };
  const copy = el('button','btn btn--secondary', ic('copy',13) + (d.kind === 'widget' ? 'Copy embed' : 'Copy command'));
  copy.onclick = () => toast('Copied — prototype');
  inspectorActs(s.side, [pub, copy]);

  pad.append(s.wrap);
  body.append(pad);
}

/* --------------------------------------------------------------- solutions
   A solution is the shipping unit: an assistant, the skills it may call, the
   knowledge it may cite, the connectors it needs, what it renders as, and where
   it reaches. Everything is an id, so it cannot claim a part that does not
   exist — and the checklist below is what "ready" actually means. */
function packageChecks(p){
  const a  = asstById(p.assistant);
  const kb = kbById(p.kb);
  const de = designById(p.design);
  const conns   = p.conn.map(connById).filter(Boolean);
  const offline = conns.filter(c => c.state === 'off');
  const surf    = p.surfaces.map(surfaceById).filter(Boolean);
  const renders = surf.filter(x => x.renders);
  const skills  = p.skills.map(skillById).filter(Boolean);
  const orphan  = skills.filter(x => !a || a.skills.indexOf(x.name) < 0);

  return [
    { nm:'Assistant', ok:!!a, val:a ? a.name : 'nothing to answer with' },
    { nm:'Skills',
      ok:skills.length > 0 && !orphan.length,
      val:!skills.length ? 'none enabled'
        : orphan.length ? orphan.map(x => x.name).join(', ') + ' not on ' + (a ? a.name : 'the assistant')
        : plural(skills.length, 'skill') + ' enabled' },
    { nm:'Knowledge', ok:!!kb, val:kb ? kb.name : 'model only, nothing to cite' },
    { nm:'Connectors',
      ok:!offline.length,
      val:offline.length ? offline.map(c => c.name).join(', ') + ' not connected'
        : conns.length ? plural(conns.length, 'connector') + ' live' : 'none needed' },
    { nm:'Design element',
      ok:!renders.length || !!de,
      val:de ? de.name
        : renders.length ? renders.map(x => x.name).join(' and ') + ' need one'
        : 'not required by these surfaces' },
    { nm:'Surface', ok:surf.length > 0,
      val:surf.length ? surf.map(x => x.name).join(', ') : 'nowhere to ship' }
  ];
}
function bumpMinor(v){
  const n = String(v).split('.').map(Number);
  return [n[0] || 0, (n[1] || 0) + 1, 0].join('.');
}

function packageView(body, p){
  const pad = el('div','pane__pad');
  pad.append(pageHead(p.name, p.desc,
    '<span class="badge badge--mono">' + esc(p.version) + '</span>' +
    ownerBadge(p) + stateBadge(p.state)));

  const s = buildSplit();
  const a = asstById(p.assistant);

  const pair = el('div','build__pair');
  pair.append(field('Name', inputCtl(p.name, v => { p.name = v.trim() || p.name; render(); })));
  pair.append(field('Audience', inputCtl(p.audience, v => { p.audience = v; render(); })));
  s.main.append(pair);

  const pair2 = el('div','build__pair');
  const asstNames = ['— none —'].concat(D.ASSISTANTS.map(x => x.name));
  pair2.append(field('Assistant', selectCtl(asstNames, a ? a.name : '— none —', v => {
    const picked = D.ASSISTANTS.filter(x => x.name === v)[0];
    p.assistant = picked ? picked.id : null;
    render();
  }), 'The solution answers as this assistant.'));
  const kbNames = ['— none —'].concat(D.KBS.map(k => k.name));
  const curKb = kbById(p.kb);
  pair2.append(field('Knowledge base', selectCtl(kbNames, curKb ? curKb.name : '— none —', v => {
    const picked = D.KBS.filter(k => k.name === v)[0];
    p.kb = picked ? picked.id : null;
    render();
  })));
  s.main.append(pair2);

  /* Skills are a subset of the assistant's, not a free choice: enabling one it
     does not have would ship a call that cannot resolve. Shown, not hidden. */
  const skSec = el('section','section');
  skSec.append(sectionHead('Skills enabled', '<span class="t-mono">' + p.skills.length + '</span>'));
  skSec.append(pickList(D.SKILLS.map(x => ({
    nm:x.name,
    sub:a && a.skills.indexOf(x.name) > -1 ? x.desc : 'not on ' + (a ? a.name : 'the bound assistant'),
    meta:x.avg, id:x.id
  })), it => p.skills.indexOf(it.id) > -1, (it, on) => {
    p.skills = on ? p.skills.concat([it.id]) : p.skills.filter(x => x !== it.id);
    render();
  }));
  s.main.append(skSec);

  const cnSec = el('section','section');
  cnSec.append(sectionHead('Connectors required', '<span class="t-mono">' + p.conn.length + '</span>'));
  cnSec.append(pickList(D.CONNECTORS.map(c => ({
    nm:c.name, sub:c.state === 'off' ? 'not connected' : c.scope, meta:c.kind, id:c.id
  })), it => p.conn.indexOf(it.id) > -1, (it, on) => {
    p.conn = on ? p.conn.concat([it.id]) : p.conn.filter(x => x !== it.id);
    render();
  }));
  s.main.append(cnSec);

  const surSec = el('section','section');
  surSec.append(sectionHead('Surfaces', '<span class="t-mono">' + p.surfaces.length + '</span>'));
  surSec.append(pickList(D.SURFACES.map(x => ({
    nm:x.name, sub:x.desc, meta:x.renders ? 'renders' : 'no UI', id:x.id
  })), it => p.surfaces.indexOf(it.id) > -1, (it, on) => {
    p.surfaces = on ? p.surfaces.concat([it.id]) : p.surfaces.filter(x => x !== it.id);
    render();
  }));
  surSec.append(noteP('A surface that renders needs a design element. One that answers in JSON does not — which is why the checklist asks for a design element only sometimes.'));
  s.main.append(surSec);

  /* The design element, chosen here and previewed here: this page is where
     someone decides what the answer looks like, so it should not have to be
     imagined from a name. */
  const deSec = el('section','section');
  deSec.append(sectionHead('Renders as'));
  const deNames = ['— none —'].concat(D.DESIGNS.map(x => x.name));
  const de = designById(p.design);
  deSec.append(field('Design element', selectCtl(deNames, de ? de.name : '— none —', v => {
    const picked = D.DESIGNS.filter(x => x.name === v)[0];
    p.design = picked ? picked.id : null;
    render();
  })));
  if (de){
    deSec.append(designCanvas(de));
    const openDe = el('button','btn btn--ghost btn--sm', ic('open',13) + 'Configure ' + de.name);
    openDe.style.marginTop = 'var(--s-2)';
    openDe.onclick = () => select('build', key('de', de.id));
    deSec.append(openDe);
  } else {
    deSec.append(emptyState('widget','No design element',
      'Pick a widget or a website template, or drop every surface that renders.'));
  }
  s.main.append(deSec);

  /* ------------------------------------------------------------ inspector */
  const checks = packageChecks(p);
  const blocked = checks.filter(c => !c.ok);
  inspectorHead(s.side, 'Ready to ship', (checks.length - blocked.length) + '/' + checks.length);
  s.side.append(checkList(checks));

  const ver = el('div');
  ver.style.marginTop = 'var(--s-4)';
  ver.append(field('Version', inputCtl(p.version, v => { p.version = v.trim() || p.version; render(); })));
  s.side.append(ver);

  const publish = el('button','btn btn--primary', ic('check',13) +
    (p.state === 'live' ? 'Publish ' + bumpMinor(p.version) : 'Publish'));
  publish.disabled = !!blocked.length;
  publish.title = blocked.length ? blocked[0].nm + ': ' + blocked[0].val : 'Publish to ' +
    p.surfaces.map(x => (surfaceById(x) || {}).name).join(', ');
  publish.onclick = () => {
    p.version = bumpMinor(p.version);
    p.state = 'live';
    render();
    toast(p.name + ' ' + p.version + ' published to ' +
      p.surfaces.map(x => (surfaceById(x) || {}).name).join(', '));
  };
  const open = el('button','btn btn--secondary', ic('play',13) + 'Open');
  const app = D.APPS.filter(x => x.name === p.name)[0];
  open.disabled = !app;
  open.title = app ? 'Open ' + p.name + ' in the app rail' : 'Not installed on the app rail';
  open.onclick = () => { if (app) openApp(app); };
  inspectorActs(s.side, [publish, open]);
  s.side.append(noteP(blocked.length
    ? 'Publishing is blocked until every line above is met. The list is the specification, not a score.'
    : 'Publishing bumps the minor version and pushes to every surface listed.'));

  pad.append(s.wrap);
  body.append(pad);
}

function newPackage(){
  const p = {
    id:'so-n' + (++madeN), name:'Untitled solution', state:'draft', app:'', users:'—', version:'0.1.0',
    owner:'me', team:D.ASSISTANT_TEAMS[0],
    desc:'Nothing bound yet. The checklist in the inspector is the shortest description of what a solution needs.',
    assistant:null, skills:[], kb:null, conn:[], design:null, surfaces:[], audience:'—'
  };
  D.SOLUTIONS.push(p);
  select('build', key('so', p.id));
}

function cloudView(body, c){
  const pad = el('div','pane__pad');
  pad.append(pageHead(c.name, c.desc));
  const form = el('div');
  form.style.maxWidth = '440px';

  if (c.id === 'c1'){
    form.append(field('Default model', selectCtl(D.MODELS, state.model, v => {
      state.model = v; syncStatus(); renderComposer(); toast('Default model set to ' + v);
    }), 'Threads and assistants can override this.'));
    form.append(field('Temperature', rangeCtl(0, 1, 0.05, 0.3, v => v.toFixed(2))));
    form.append(field('Max output tokens', rangeCtl(512, 16384, 512, 4096, v => nf(v))));

  } else if (c.id === 'c2'){
    D.SKILLS.forEach(s => form.append(switchCtl(s.name, s.state === 'ok')));
    const b = banner('warn','Skills that write outside the workspace always ask for confirmation, even when enabled here.');
    b.style.marginBottom = '0';
    b.style.marginTop = 'var(--s-4)';
    form.append(b);

  } else if (c.id === 'c3'){
    /* An index, not a report: every row opens the connector it names, because
       the reason to read this list is to change something in it. Connected and
       available are one list — hiding what you could connect turns a decision
       into a discovery problem. */
    form.style.maxWidth = '640px';
    const connRow = x => listRow({
      lead:dotLead(x.state),
      title:x.name,
      sub:x.state === 'off' ? 'not connected · ' + x.desc.split('.')[0] : x.endpoint,
      meta:x.kind,
      current:idOf(state.item.cloud) === x.id,
      onClick:() => select('cloud', key('cn', x.id))
    });
    const live = D.CONNECTORS.filter(x => x.state !== 'off');
    const avail = D.CONNECTORS.filter(x => x.state === 'off');

    const secA = el('section','section');
    secA.append(sectionHead('Connected', '<span class="t-mono">' + live.length + '</span>'));
    live.forEach(x => secA.append(connRow(x)));
    form.append(secA);

    if (avail.length){
      const secB = el('section','section');
      secB.append(sectionHead('Available', '<span class="t-mono">' + avail.length + '</span>'));
      avail.forEach(x => secB.append(connRow(x)));
      form.append(secB);
    }
    form.append(banner('info','A connector is the credential and the scope, never the data. ' +
      'An assistant is <em>granted</em> one in Build; connecting it is this page\'s job.'));
    form.lastChild.style.margin = '0';

  } else if (c.id === 'c4'){
    form.append(field('Region', selectCtl(['eu-west-1 · Ireland','eu-central-1 · Frankfurt','us-east-1 · Virginia'],
      'eu-west-1 · Ireland', v => toast('Region set to ' + v)),
      'Data stays in region. Changing it re-embeds every knowledge base.'));
    form.append(switchCtl('Allow egress to public endpoints', false));
    form.append(switchCtl('Pin solutions to a fixed model version', true));
    form.append(field('Model endpoint', selectCtl(['managed · nebula-pro-2026-08','dedicated · gd-prod-01'],
      'managed · nebula-pro-2026-08', v => toast('Endpoint set to ' + v))));

  } else if (c.id === 'c5'){
    form.append(field('Theme', segCtl(['Light','Dark'],
      document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light',
      v => setTheme(v.toLowerCase()))));
    form.append(field('Density', segCtl(['Compact','Comfortable','Roomy'], densityLabel(),
      v => setDensity(v.toLowerCase() === 'comfortable' ? '' : v.toLowerCase())),
      'Density is a single token. Every gap in the interface derives from it.'));

  } else {
    form.style.maxWidth = '640px';
    form.append(statGrid([['This month','$1,284'], ['Tokens','86.4M'], ['Cap','$2,000'], ['Projection','$1,610']],
      ['Projection']));
    form.lastChild.style.marginBottom = 'var(--s-8)';
    form.append(tableSection('By surface',
      ['Surface','Tokens','Share','Cost'],
      [['Chat threads','41.2M','48%','$610'],
       ['Solutions / apps','28.9M','33%','$428'],
       ['Agents','12.1M','14%','$179'],
       ['Embedding','4.2M','5%','$67']].map(r => [
        '<td style="color:var(--text)">' + esc(r[0]) + '</td>',
        '<td class="num">' + esc(r[1]) + '</td>',
        '<td class="num">' + esc(r[2]) + '</td>',
        '<td class="num">' + esc(r[3]) + '</td>'
      ])));
  }
  pad.append(form);
  body.append(pad);
}

function accountView(body, view){
  const a = D.ACCOUNT;
  const pad = el('div','pane__pad');

  if (view === 'members'){
    pad.append(pageHead('Members','Who can see and act in this workspace.'));
    pad.append(tableSection('Members',
      ['Member','Role','Last active'],
      a.members.map(r => [
        '<td style="color:var(--text)">' + esc(r[0]) + '</td>',
        '<td>' + esc(r[1]) + '</td>',
        '<td class="num">' + esc(r[2]) + '</td>'
      ])));

  } else if (view === 'sessions'){
    pad.append(pageHead('Sessions','Every device currently holding a token for this account.'));
    pad.append(tableSection('Active sessions',
      ['Device','Platform','Last seen'],
      a.sessions.map(r => [
        '<td style="color:var(--text)">' + esc(r[0]) + '</td>',
        '<td>' + esc(r[1]) + '</td>',
        '<td class="num">' + esc(r[2]) + '</td>'
      ])));
    const b = el('button','btn btn--danger');
    b.textContent = 'Sign out everywhere else';
    b.onclick = () => toast('Signed out other sessions — prototype');
    pad.append(b);

  } else {
    pad.append(pageHead(a.name, a.email, '<span class="badge">' + esc(a.role) + '</span>'));
    const card = el('div','card');
    card.innerHTML = '<div class="card__head"><span class="card__title">Workspace</span></div>';
    const cb = el('div','card__body');
    cb.append(defList([
      ['Organisation', esc(a.org)],
      ['Plan', esc(a.plan)],
      ['Seats', esc(a.seats)],
      ['Role', esc(a.role)]
    ]));
    card.append(cb);
    pad.append(card);
  }
  body.append(pad);
}

/* ============================================================== leaving here
   A result that can only be looked at is a screenshot. Three ways out: a file,
   a link, and the bin.

   Every serialiser below works off ONE reading of the result — what is tabular
   about it, or what its text is — rather than off five shapes each. That is why
   adding a format is a row in FORMATS and not a branch in five places. */
const CODE_EXT = { Python:'py', 'Node.js':'js', SQL:'sql', 'cURL':'sh' };
const CODE_LANG = { Python:'python', 'Node.js':'js', SQL:'sql', 'cURL':'bash' };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'result';
const shapeOf = a => a.kind === 'result' ? a.shape : a.kind;
const isDocResult = a => shapeOf(a) === 'doc';

/* Whatever is tabular about a result, as one shape: head + rows. Null when
   there is nothing tabular in it. */
function resultTable(a){
  const t = shapeOf(a);
  const trim = rows => rows.map(r => r.slice(0, a.cols.length));
  if (t === 'grid' || t === 'chart') return { head:a.cols, rows:trim(a.rows) };
  if (t === 'list' || t === 'table')  return { head:['Label','Value'], rows:a.rows };
  if (t === 'bars') return { head:['Label', a.unit || 'Value'], rows:a.bars.map(b => [b[0], b[1]]) };
  return null;
}
const metaLine = a => artType(a) + ' · ' + a.size + ' · ' + stampFull(a.at) + ' · from ' + a.from;

/* ------------------------------------------------------------ serialisers */
function csvCell(v){
  /* U+2212 is a typographic minus and belongs in prose, not in a column a
     spreadsheet is about to parse. Same normalisation the sort uses. */
  const s = String(v == null ? '' : v).replace(/−/g, '-');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(head, rows){
  return [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}
function mdTable(head, rows){
  const cell = v => String(v == null ? '' : v).replace(/\|/g, '\\|');
  return ['| ' + head.map(cell).join(' | ') + ' |',
          '|' + head.map(() => '---').join('|') + '|']
         .concat(rows.map(r => '| ' + head.map((h, i) => cell(r[i])).join(' | ') + ' |'))
         .join('\n');
}
/* Columns padded to their widest cell: the point of a text table is that it
   still lines up in a mail client with no CSS. */
function tableLines(tab){
  const w = tab.head.map((h, i) =>
    Math.max(String(h).length, ...tab.rows.map(r => String(r[i] == null ? '' : r[i]).length)));
  const line = cells => cells.map((c, i) => {
    const s = String(c == null ? '' : c);
    return s + ' '.repeat(Math.max(0, w[i] - s.length));
  }).join('  ').replace(/\s+$/, '');
  return [line(tab.head), w.map(n => '-'.repeat(n)).join('  ')]
         .concat(tab.rows.map(line));
}
/* Markdown out of a document, with its markers taken off. Headings keep their
   text and lose their hashes: this is the plain-text reading of it. */
function docLines(md){
  return String(md).split('\n').map(l => {
    const h = /^#{1,6}\s*(.*)$/.exec(l);
    /* Emphasis markers, code ticks, and the few inline tags the prose renderer
       would have swallowed — none of them are text. */
    const t = (h ? h[1] : l)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<\/?(code|strong|em|b|i)>/g, '');
    return (h ? '\x01' : '') + t;      /* \x01 = set in bold where that exists */
  });
}
/* The lines a text rendering is made of, headings marked. Shared by .txt and
   the PDF writer so the two can never drift apart. */
function plainLines(a){
  const out = ['\x01' + a.title, metaLine(a), ''];
  const tab = resultTable(a);
  if (tab){
    const t = tableLines(tab);
    out.push('\x01' + t[0]);
    for (let i = 1; i < t.length; i++) out.push(t[i]);
  } else if (isDocResult(a)){
    docLines(a.md).forEach(l => out.push(l));
  } else {
    String(a.code).split('\n').forEach(l => out.push(l));
  }
  return out;
}
const unbold = l => l.charCodeAt(0) === 1 ? l.slice(1) : l;
const txtOf = a => plainLines(a).map(unbold).join('\n') + '\n';

function mdOf(a){
  const head = '# ' + a.title + '\n\n_' + metaLine(a) + '_\n\n';
  const tab = resultTable(a);
  if (tab) return head + mdTable(tab.head, tab.rows) + '\n';
  if (isDocResult(a)) return head + a.md + '\n';
  return head + '```' + (CODE_LANG[a.size] || '') + '\n' + a.code + '\n```\n';
}
function jsonOf(a){
  const o = { title:a.title, type:artType(a).toLowerCase(), from:a.from,
              at:new Date(a.at).toISOString() };
  const tab = resultTable(a);
  if (tab) o.rows = tab.rows.map(r => {
    const row = {};
    tab.head.forEach((h, i) => { row[h] = r[i] == null ? '' : r[i]; });
    return row;
  });
  else if (isDocResult(a)) o.markdown = a.md;
  else o.source = a.code;
  return JSON.stringify(o, null, 2) + '\n';
}

/* ---------------------------------------------------------------- as a PDF
   There are no dependencies here, so this writes the file itself: PDF 1.4, one
   text object per page, and an xref whose offsets are counted as the string is
   assembled. Courier, because a table that loses its column alignment is not a
   table any more, and Courier-Bold for the title and the header row.

   Bytes are WinAnsi. The typographic characters this workspace actually uses
   (— · € " ') have slots there; anything else becomes '?', which is honest and
   the alternative is an embedded font. */
const PDF = { w:595.28, h:841.89, m:48, size:9.5, lead:13 };   /* A4, 48pt */
const WINANSI = {
  '—':0x97, '–':0x96, '‘':0x91, '’':0x92, '“':0x93,
  '”':0x94, '€':0x80, '…':0x85, '•':0x95, '·':0xb7,
  '−':0x2d, '→':0x3e, '↑':0x5e, '↓':0x76
};
function pdfText(s){
  let out = '';
  const src = String(s);
  for (let i = 0; i < src.length; i++){
    const ch = src[i];
    const code = src.charCodeAt(i);
    let b = WINANSI[ch] != null ? WINANSI[ch] : code;
    if (b > 0xff){ out += '?'; continue; }
    const g = String.fromCharCode(b);
    out += (g === '(' || g === ')' || g === '\\') ? '\\' + g : g;
  }
  return out;
}
function pdfDate(){
  const d = new Date();
  const p = n => (n < 10 ? '0' : '') + n;
  return 'D:' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
/* Hard-wrap at the column count Courier gives us, indenting continuations so a
   wrapped table row still reads as one row. */
function wrapLine(s, max){
  if (s.length <= max) return [s];
  const out = [];
  let rest = s;
  while (rest.length > max){
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut));
    rest = '  ' + rest.slice(cut).replace(/^\s+/, '');
  }
  out.push(rest);
  return out;
}
function pdfStream(lines){
  const x = PDF.m.toFixed(2), y = (PDF.h - PDF.m - PDF.size).toFixed(2);
  let s = 'BT\n/F1 ' + PDF.size + ' Tf\n' + PDF.lead + ' TL\n' + x + ' ' + y + ' Td\n';
  lines.forEach(l => {
    const bold = l.charCodeAt(0) === 1;
    if (bold) s += '/F2 ' + PDF.size + ' Tf\n';
    s += '(' + pdfText(bold ? l.slice(1) : l) + ') Tj\n';
    if (bold) s += '/F1 ' + PDF.size + ' Tf\n';
    s += 'T*\n';
  });
  return s + 'ET';
}
function pdfBytes(a){
  const cols = Math.floor((PDF.w - PDF.m * 2) / (PDF.size * 0.6));
  const lines = [];
  plainLines(a).forEach(l => {
    const bold = l.charCodeAt(0) === 1;
    wrapLine(bold ? l.slice(1) : l, cols)
      .forEach((part, i) => lines.push((bold && i === 0 ? '\x01' : '') + part));
  });
  const per = Math.floor((PDF.h - PDF.m * 2) / PDF.lead);
  const pages = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  if (!pages.length) pages.push(['']);

  /* 1 catalog · 2 page tree · 3 Courier · 4 Courier-Bold · 5 info, then a page
     and a content stream per page. */
  const objs = [];
  const kids = pages.map((p, i) => (6 + i * 2) + ' 0 R');
  objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
  objs[2] = '<</Type/Pages/Count ' + pages.length + '/Kids[' + kids.join(' ') + ']>>';
  objs[3] = '<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>';
  objs[4] = '<</Type/Font/Subtype/Type1/BaseFont/Courier-Bold/Encoding/WinAnsiEncoding>>';
  objs[5] = '<</Title(' + pdfText(a.title) + ')/Producer(Nebulas prototype)' +
            '/CreationDate(' + pdfDate() + ')>>';
  pages.forEach((ls, i) => {
    const stream = pdfStream(ls);
    objs[6 + i * 2] = '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' +
      PDF.w.toFixed(2) + ' ' + PDF.h.toFixed(2) + ']' +
      '/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ' + (7 + i * 2) + ' 0 R>>';
    objs[7 + i * 2] = '<</Length ' + stream.length + '>>\nstream\n' + stream + '\nendstream';
  });

  let out = '%PDF-1.4\n';
  const offs = [];
  for (let n = 1; n < objs.length; n++){
    offs[n] = out.length;
    out += n + ' 0 obj\n' + objs[n] + '\nendobj\n';
  }
  const xref = out.length;
  const pad10 = n => ('0000000000' + n).slice(-10);
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let n = 1; n < objs.length; n++) out += pad10(offs[n]) + ' 00000 n \n';
  out += 'trailer\n<</Size ' + objs.length + '/Root 1 0 R/Info 5 0 R>>\n' +
         'startxref\n' + xref + '\n%%EOF\n';

  /* One byte per character, which is also what /Length was counted in. */
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/* ------------------------------------------------------------- the formats
   Offered by CONTENT, not by a fixed list: a questionnaire answer has no CSV
   worth the name, and a table has no reason to leave as a .py. The first entry
   is the one the result already is. */
function formatsFor(a){
  const list = [];
  const tab = resultTable(a);
  if (tab){
    list.push({ nm:'Spreadsheet', sub:'comma-separated, opens in Excel',
                ext:'csv', mime:'text/csv', make:() => csv(tab.head, tab.rows) });
    list.push({ nm:'Markdown', sub:'a table you can paste into a doc',
                ext:'md', mime:'text/markdown', make:() => mdOf(a) });
    list.push({ nm:'Plain text', sub:'columns padded, no spreadsheet needed',
                ext:'txt', mime:'text/plain', make:() => txtOf(a) });
    list.push({ nm:'JSON', sub:'one object per row, for code',
                ext:'json', mime:'application/json', make:() => jsonOf(a) });
  } else if (isDocResult(a)){
    list.push({ nm:'Markdown', sub:'the source, headings and all',
                ext:'md', mime:'text/markdown', make:() => mdOf(a) });
    list.push({ nm:'Plain text', sub:'markers stripped',
                ext:'txt', mime:'text/plain', make:() => txtOf(a) });
  } else {
    const ext = shapeOf(a) === 'diff' ? 'diff' : (CODE_EXT[a.size] || 'txt');
    list.push({ nm:'Source', sub:'as written' + (CODE_EXT[a.size] ? ', in ' + a.size : ''),
                ext:ext, mime:'text/plain', make:() => a.code + '\n' });
    if (ext !== 'txt') list.push({ nm:'Plain text', sub:'the same lines, as .txt',
                ext:'txt', mime:'text/plain', make:() => txtOf(a) });
  }
  list.push({ nm:'PDF', sub:'laid out for reading and printing',
              ext:'pdf', mime:'application/pdf', make:() => pdfBytes(a) });
  return list;
}
/* The file is assembled in the page and handed to the browser. Nothing is
   uploaded, and no format needs a library that is not here. */
function downloadResult(a, fmt){
  const f = fmt || formatsFor(a)[0];
  const body = f.make();
  const type = f.mime + (typeof body === 'string' ? ';charset=utf-8' : '');
  const url = URL.createObjectURL(new Blob([body], { type:type }));
  const name = slug(a.title) + '.' + f.ext;
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Downloaded ' + name);
}
function downloadMenu(a, anchor){
  openMenu(anchor, formatsFor(a).map(f => ({
    nm:f.nm, sub:f.sub, meta:'.' + f.ext, run:() => downloadResult(a, f)
  })));
}

/* ------------------------------------------------------------------- a menu
   Anchored to the button that opened it and positioned fixed, because the pane
   it lives in clips its own overflow — a menu that has to fit inside a 380px
   column is a menu with two words per row. */
let menuNode = null;
function closeMenu(){
  if (!menuNode) return;
  menuNode.remove();
  menuNode = null;
  document.removeEventListener('mousedown', menuOutside, true);
  document.removeEventListener('keydown', menuKey, true);
}
function menuOutside(e){ if (!e.target.closest('.popmenu')) closeMenu(); }
function menuKey(e){
  if (e.key === 'Escape'){
    /* Taken here so Escape closes the menu and not the app panel behind it. */
    e.stopPropagation();
    e.preventDefault();
    closeMenu();
  }
}
function openMenu(anchor, items){
  closeMenu();
  const m = el('div','popmenu');
  m.setAttribute('role','menu');
  items.forEach(it => {
    const b = el('button','popmenu__item',
      '<span class="popmenu__main"><span class="popmenu__nm">' + esc(it.nm) + '</span>' +
      (it.sub ? '<span class="popmenu__sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
      (it.meta ? '<span class="popmenu__meta">' + esc(it.meta) + '</span>' : ''));
    b.type = 'button';
    b.setAttribute('role','menuitem');
    b.onclick = () => { closeMenu(); it.run(); };
    m.append(b);
  });
  document.body.append(m);
  /* Reading the width settles the layout, which is also what lets the open
     state animate rather than appearing mid-transition. */
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
  m.dataset.open = 'true';
  menuNode = m;
  document.addEventListener('mousedown', menuOutside, true);
  document.addEventListener('keydown', menuKey, true);
  return m;
}

/* --------------------------------------------------------------- the bin
   A store you cannot delete from is a store that fills with mistakes. So a
   result can go — immediately, with the toast that says so carrying the way
   back. A confirmation dialog would ask the reader to be certain about
   something they can already undo; a shared result says what deleting it costs.

   A result a live widget still produces will come back the next time that
   widget changes, because the widget is its source. That is the honest
   behaviour: the record is derived, and deleting a derivation does not delete
   what derives it. */
function deleteResult(a){
  const wasOpen = state.art.id === a.id;
  const shared = !!a.share;
  dropResult(a.id);
  renderArtifact();
  syncArtRefs();
  toast('Deleted ' + a.title + (shared ? ' — the shared link no longer opens' : ''), {
    label:'Undo',
    icon:'trash',
    run:() => {
      upsertResult(a);
      if (!isOpen('art') && roomForArt()){ state.pref.art = true; applyPanels(); }
      if (wasOpen) state.art.id = a.id;
      renderArtifact();
      syncArtRefs();
      toast('Restored ' + a.title);
    }
  });
}

/* ------------------------------------------------------------------- share
   Access first, link second. The three audiences are the ones that actually
   differ in consequence — nobody, the workspace, the internet — and the link
   is not minted until one of them has been chosen. */
const ACCESS = [
  { id:'private', ico:'lock',  nm:'Only you',
    sub:'The link opens for nobody else, inside the workspace or out.' },
  { id:'org',     ico:'users', nm:'People in ' + D.ACCOUNT.org,
    sub:'Anyone signed in to the workspace can open it.' },
  { id:'link',    ico:'globe', nm:'Anyone with the link',
    sub:'No sign-in required. Treat the link as public.' }
];
const accessOf = id => ACCESS.filter(x => x.id === id)[0] || ACCESS[1];
const PERMS = ['Can view','Can comment'];
const EXPIRES = ['24 hours','7 days','Never'];

/* Derived from the id, not drawn at random: reopening the dialog on the same
   result has to show the same link, or the one already sent is a lie. */
function shareCode(id){
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  return (h | 0x100000).toString(16).slice(-6);
}
const shareUrl = a => 'https://nebulas.app/r/' + shareCode(a.id);
/* One line saying who can open it and until when, for the strip in the pane. */
function shareLine(s){
  return accessOf(s.access).nm + ' · ' + s.perm.toLowerCase() +
         (s.expires === 'Never' ? ' · no expiry' : ' · expires in ' + s.expires);
}

function copyText(text){
  const ok = () => toast('Link copied');
  const fail = () => toast('Could not copy — the link is selected, use ⌘C');
  const legacy = () => {
    /* file:// is not a secure context in every browser, so the clipboard API
       may not exist at all. This path is the reason the input is real. */
    const t = el('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.append(t);
    t.select();
    let done = false;
    try{ done = document.execCommand('copy'); }catch(e){}
    t.remove();
    done ? ok() : fail();
  };
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(ok, legacy);
      return;
    }
  }catch(e){}
  legacy();
}

/* Exclusive choice, so a radio — a checkbox where only one may be ticked lies
   about what is going to happen. Same rows as pickList, one icon wider. */
function radioList(items, value, onPick){
  const list = el('div','picklist');
  items.forEach(it => {
    const row = el('label','picklist__row');
    const box = el('input','check check--radio');
    box.type = 'radio';
    box.name = 'share-access';
    box.checked = it.id === value;
    box.onchange = () => { if (box.checked) onPick(it.id); };
    row.append(box);
    row.append(el('span','picklist__ico', ic(it.ico, 14)));
    row.append(el('span','picklist__main',
      '<span class="picklist__nm">' + esc(it.nm) + '</span>' +
      '<span class="picklist__sub">' + esc(it.sub) + '</span>'));
    list.append(row);
  });
  return list;
}

let shareOn = null;                 /* the result the dialog is editing */
let shareDraft = null;              /* the choice made before a link exists */

function openShare(a){
  shareOn = a;
  shareDraft = { access:'org', perm:PERMS[0], expires:EXPIRES[1] };
  $('#shareIco').innerHTML = ic('share',15);
  $('#shareSub').textContent = a.title + ' · ' + artKind(a) + ' · ' + a.size;
  renderShare();
  $('#shareScrim').dataset.open = 'true';
}
function closeShare(){
  $('#shareScrim').dataset.open = 'false';
  shareOn = null;
}
function renderShare(){
  const a = shareOn;
  if (!a) return;
  const body = $('#shareBody'), foot = $('#shareFoot');
  body.innerHTML = ''; foot.innerHTML = '';
  const live = !!a.share;                       /* is there a link already */
  const s = a.share || shareDraft;
  $('#shareTitle').textContent = live ? 'Shared as a web page' : 'Share result';

  /* Public means public. Said before the link, not under it. */
  if (live && s.access === 'link')
    body.append(banner('warn','Anyone holding this link can open the result without signing in. ' +
                              'It carries data from <strong>' + esc(a.from) + '</strong>.'));

  body.append(field('Who can open it',
    radioList(ACCESS, s.access, v => { s.access = v; renderShare(); if (live) renderArtifact(); }),
    live ? 'Changes apply to the link that already exists.' : null));

  /* Two narrow choices side by side: stacked, they push the link itself below
     the fold, and the link is what the dialog is for. */
  const two = el('div');
  two.style.cssText = 'display:flex;gap:var(--s-6);flex-wrap:wrap';
  two.append(
    field('They can',
      segCtl(PERMS, s.perm, v => { s.perm = v; if (live){ renderArtifact(); renderShare(); } })),
    field('Link expires',
      segCtl(EXPIRES, s.expires, v => { s.expires = v; if (live){ renderArtifact(); renderShare(); } })));
  body.append(two);

  if (live){
    const row = el('div','linkrow');
    const input = el('input','input');
    input.type = 'text';
    input.readOnly = true;
    input.value = s.url;
    input.onclick = () => input.select();
    const copy = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('copy',13) + '</span>Copy');
    copy.type = 'button';
    copy.onclick = () => { input.select(); copyText(s.url); };
    row.append(input, copy);
    body.append(field('Link', row,
      'Shared by ' + s.by + ' · ' + stampFull(s.at) +
      (s.expires === 'Never' ? '' : ' · expires in ' + s.expires)));

    const stop = el('button','btn btn--danger','Stop sharing');
    stop.type = 'button';
    stop.onclick = () => {
      a.share = null;
      renderArtifact();
      renderShare();
      toast('Sharing stopped — the link no longer opens');
    };
    const done = el('button','btn btn--primary','Done');
    done.type = 'button';
    done.onclick = closeShare;
    foot.append(stop, el('div','dialog__spacer'), done);
  } else {
    const cancel = el('button','btn btn--ghost','Cancel');
    cancel.type = 'button';
    cancel.onclick = closeShare;
    const make = el('button','btn btn--primary',
      '<span style="display:flex">' + ic('link',13) + '</span>Create link');
    make.type = 'button';
    make.onclick = () => {
      a.share = { access:s.access, perm:s.perm, expires:s.expires,
                  at:Date.now(), by:D.ACCOUNT.name, url:shareUrl(a) };
      renderArtifact();
      renderShare();
      copyText(a.share.url);
    };
    foot.append(el('div','dialog__spacer'), cancel, make);
  }
}

/* ========================================================= results column
   Panes per kind. A table gets its result and its source; a chart adds the
   data behind it, because a bar nobody can check is decoration. A result from a
   widget has one pane: it IS the outcome. */
function artTableNode(a){
  const sx = el('div','scroll-x');
  const t = el('table','table');
  t.innerHTML =
    '<thead><tr>' + a.cols.map((c, i) => '<th' + (i ? ' class="num"' : '') + '>' + esc(c) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + a.rows.map(r => {
      const dir = r[a.cols.length];
      return '<tr>' + a.cols.map((c, i) => {
        const last = i === a.cols.length - 1;
        const cls = (i ? 'num' : '') + (last && (dir === 'up' || dir === 'dn') ? ' delta-' + dir : '');
        return '<td' + (cls ? ' class="' + cls.trim() + '"' : '') + '>' + esc(r[i]) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
  sx.append(t);
  return sx;
}
/* A table artifact in the pane: label against one muted value, no headers.
   With two columns a header row only names what the rows already say. The
   chart's Data pane keeps the full table above — that one has columns worth
   labelling. */
function artListNode(a){
  const wrap = el('div','artlist');
  a.rows.forEach(r => wrap.append(el('div','artlist__row',
    '<span class="artlist__k">' + esc(r[0]) + '</span>' +
    '<span class="artlist__v">' + esc(r[1]) + '</span>')));
  return wrap;
}
function artBarsNode(a){
  const wrap = el('div','barlist');
  a.bars.forEach(([k, pct]) => {
    const row = el('div','barlist__row',
      '<span class="barlist__k">' + esc(k) + '</span>' +
      '<span class="meter"><i style="width:' + pct + '%"></i></span>' +
      '<span class="barlist__v">' + pct + '</span>');
    wrap.append(row);
  });
  return wrap;
}
function artCodeNode(code){
  return el('pre','code', highlight(code));
}
function artProseNode(src){
  return el('div','prose', md(src));
}
/* A result is one pane: it IS the outcome, and there is no source behind a
   questionnaire or a form. */
function resBarsNode(a){
  const max = Math.max.apply(null, a.bars.map(b => Math.abs(b[1]))) || 1;
  const dec = a.bars.some(b => b[1] % 1 !== 0) ? 1 : 0;
  const wrap = el('div','barlist');
  a.bars.forEach(([k, v]) => {
    const neg = v < 0;
    wrap.append(el('div','barlist__row',
      '<span class="barlist__k">' + esc(k) + '</span>' +
      '<span class="meter' + (neg ? ' meter--down' : '') + '">' +
        '<i style="width:' + Math.round(Math.abs(v) / max * 100) + '%"></i></span>' +
      '<span class="barlist__v' + (neg ? ' delta-dn' : '') + '">' +
        esc((neg ? '' : '+') + v.toFixed(dec)) + '</span>'));
  });
  return wrap;
}
function artPanes(a){
  if (a.kind === 'result'){
    const render = { list:() => artListNode(a), grid:() => artTableNode(a),
                     bars:() => resBarsNode(a), doc:() => artProseNode(a.md),
                     code:() => artCodeNode(a.code) }[a.shape];
    return [{ label:artType(a), render:render }];
  }
  if (a.kind === 'table') return [
    { label:'Result', render:() => artListNode(a) },
    { label:'Source', render:() => artCodeNode(a.code) }
  ];
  if (a.kind === 'chart') return [
    { label:'Chart',  render:() => artBarsNode(a) },
    { label:'Data',   render:() => artTableNode(a) },
    { label:'Source', render:() => artCodeNode(a.code) }
  ];
  if (a.kind === 'diff') return [{ label:'Diff', render:() => artCodeNode(a.code) }];
  return [{ label:'Document', render:() => artProseNode(a.md) }];
}

function openArtifact(id, quiet){
  /* Reference cards outlive the record they point at — deleting a result does
     not rewrite the turn that produced it. */
  if (!D.ARTIFACT_BY_ID(id)) return toast('That result has been deleted');
  state.art.id = id;
  state.art.pane = 0;
  if (!quiet){ state.pref.art = true; applyPanels(); }
  renderArtifact();
  syncArtRefs();
}
/* Back to the list. The pane is a store first and a viewer second. */
function closeResult(){
  state.art.id = null;
  renderArtifact();
  syncArtRefs();
}

function renderArtifact(){
  const a = state.art.id ? D.ARTIFACT_BY_ID(state.art.id) : null;
  const tabs = $('#artTabs'), body = $('#artBody'), foot = $('#artFoot');
  tabs.innerHTML = ''; body.innerHTML = ''; foot.innerHTML = '';
  $('#artBack').hidden = !a;
  /* Both act on the result being read, so neither exists in the list. */
  $('#artDl').hidden = !a;
  $('#artShare').hidden = !a;

  /* ------------------------------------------------------------- the index
     With no result open the pane lists everything the workspace has produced,
     newest first, under the day it happened on. This is the pane's resting
     state: it is a store, so the names come first and a detail is one click
     away. */
  if (!a){
    const list = allResults();
    $('#artIcon').innerHTML = ic('library',14);
    $('#artTitle').textContent = 'Results';

    if (!list.length){
      body.append(emptyState('library','No results yet',
        'When an answer settles on something definite — a table, a chart, a document, a filled form — it is kept here under a name, whichever thread it came from.'));
    } else {
      let day = null;
      list.forEach(r => {
        const d = dayLabel(r.at);
        if (d !== day){ body.append(el('div','artday', esc(d))); day = d; }
        const row = listRow({
          lead:'<span class="row__icon">' + ic(artGlyph(r),14) + '</span>',
          current:false,
          /* Type, then where it came from: in one global list the thread is the
             thing that tells two similar tables apart. The size is in the
             detail, where it is about to matter. */
          title:r.title, sub:artType(r) + ' · from ' + r.from, meta:stampShort(r.at),
          onClick:() => openArtifact(r.id)
        });
        row.title = r.title + ' — ' + stampFull(r.at);
        /* Shared is a property of the row, not a second list. */
        if (r.share){
          const flag = el('span','row__flag', ic('link',12));
          flag.title = 'Shared · ' + shareLine(r.share);
          row.insertBefore(flag, $('.row__meta', row));
        }
        /* The row is a button, so its delete cannot live inside it — nested
           buttons are neither valid nor clickable. It is a sibling, and the
           line around the two carries the hover. */
        const line = el('div','rowline');
        const del = el('button','row__act', ic('trash',13));
        del.type = 'button';
        del.title = 'Delete ' + r.title;
        del.setAttribute('aria-label','Delete ' + r.title);
        del.onclick = () => deleteResult(r);
        line.append(row, del);
        body.append(line);
      });
    }
    const shared = list.filter(r => r.share).length;
    foot.innerHTML = '<span class="t-mono">' + plural(list.length, 'result') + '</span>' +
                     '<span style="flex:1"></span>' +
                     (shared ? '<span style="color:var(--text-4)">' + shared + ' shared</span>' : '');
    return;
  }

  /* ------------------------------------------------------------ the detail
     Here the header names the result. The index no longer does the naming once
     it has been left behind, and a pane whose header says "Artifact" while you
     are reading one of six results is a pane you get lost in. */
  $('#artIcon').innerHTML = ic(artGlyph(a),14);
  $('#artTitle').textContent = a.title;
  $('#artShare').setAttribute('aria-pressed', String(!!a.share));
  $('#artShare').title = a.share ? 'Shared — ' + shareLine(a.share) : 'Share…';
  $('#artDl').title = 'Download… (' + formatsFor(a).map(f => f.ext).join(' · ') + ')';

  /* Who can open this, said where the result is read. */
  if (a.share){
    const bar = el('div','sharebar',
      '<span class="sharebar__ico">' + ic('link',13) + '</span>' +
      '<span class="sharebar__txt">' + esc(shareLine(a.share)) + '</span>');
    bar.dataset.public = String(a.share.access === 'link');
    const manage = el('button','btn btn--ghost btn--sm','Manage');
    manage.type = 'button';
    manage.onclick = () => openShare(a);
    bar.append(manage);
    body.append(bar);
  }

  const panes = artPanes(a);
  if (state.art.pane >= panes.length) state.art.pane = 0;
  if (panes.length > 1){
    panes.forEach((p, i) => {
      const b = el('button', null, esc(p.label));
      b.type = 'button';
      b.setAttribute('aria-selected', String(i === state.art.pane));
      b.onclick = () => { state.art.pane = i; renderArtifact(); };
      tabs.append(b);
    });
  }
  body.append(panes[state.art.pane].render());

  /* Type, size, and when it was made — the three things a stored file says
     about itself. The day is spelled out on hover, not in 40px of footer. */
  const when = el('span', null, dayLabel(a.at) + ' ' + clockTime(a.at));
  when.title = stampFull(a.at);
  when.style.cssText = 'white-space:nowrap;flex:none';
  const spacer = el('span');
  spacer.style.flex = '1';
  foot.innerHTML = '<span class="t-mono">' + esc(artKind(a)) + ' · ' + esc(a.size) + '</span>';
  foot.append(when, spacer);
  /* Not everything is produced by a thread — an app panel files results too, so
     the origin is only a link when there is somewhere for it to go. */
  const thread = D.THREADS.filter(x => x.title === a.from)[0];
  const from = el(thread ? 'button' : 'span', null, 'from ' + esc(a.from));
  from.style.cssText = 'color:var(--text-4);font-size:var(--t-11);min-width:0;' +
                       'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  if (thread){
    from.onmouseenter = () => from.style.color = 'var(--text-2)';
    from.onmouseleave = () => from.style.color = 'var(--text-4)';
    from.onclick = () => select('chat', thread.id);
  }
  foot.append(from);
  /* Deleting belongs with the record's own facts, not up beside Close where a
     mis-click is expensive. Quiet until you go looking for it, and undoable
     when you find it. */
  const del = el('button','iconbtn iconbtn--sm artpane__del', ic('trash',13));
  del.type = 'button';
  del.title = 'Delete this result';
  del.setAttribute('aria-label','Delete this result');
  del.onclick = () => deleteResult(a);
  foot.append(del);
}

/* The artifact boundary is movable, which is what the dashed line in the
   sketch was asking for. The width is stored, not recomputed per session. */
function initResize(){
  const app = $('#app'), grip = $('#artGrip'), pane = $('#artpane');
  const clamp = px => {
    const cs = getComputedStyle(document.documentElement);
    const min = parseInt(cs.getPropertyValue('--art-w-min'), 10) || 320;
    const max = Math.min(parseInt(cs.getPropertyValue('--art-w-max'), 10) || 720,
                         window.innerWidth - 520 - (state.app ? sheetTarget() : 0));
    return Math.max(min, Math.min(max, px));
  };
  const setW = px => {
    const w = clamp(px);
    app.style.setProperty('--art-w-user', w + 'px');
    store('artw', String(w));
  };

  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    app.dataset.resizing = 'true';
    const right = pane.getBoundingClientRect().right;
    const move = ev => setW(right - ev.clientX);
    const up = () => {
      app.removeAttribute('data-resizing');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  grip.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setW(pane.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 24 : -24));
  });

  const saved = load('artw');
  if (saved) app.style.setProperty('--art-w-user', saved + 'px');
}

/* ================================================================ app rail */
function renderApps(){
  const body = $('#appsBody');
  body.innerHTML = '';

  D.APPS.forEach(app => {
    const b = el('button','approw');
    /* Native title, not the styled tooltip: the rail scrolls, and a styled
       tooltip cannot escape a scroll container to reach open space. */
    b.title = app.name + (app.state === 'live' ? '' : ' · ' + app.state) + ' — ' + app.desc;
    /* The rail marks which app is open in the panel, not which solution the
       Build section happens to be showing. */
    b.setAttribute('aria-current', String(state.app === app.id));
    b.innerHTML =
      '<span class="apptile" data-state="' + app.state + '" style="--app-c:var(--app-' + app.c + ')">' +
        ic(app.icon, 16) +
      '</span>' +
      '<span class="approw__name">' + esc(app.name) + '</span>' +
      (app.state === 'live' ? '' : '<span class="badge">' + esc(app.state) + '</span>');
    b.onclick = () => openApp(app);
    body.append(b);
  });
}
/* ============================================================== app panel
   Seven apps, six surfaces, every one assembled from components that already
   exist elsewhere: an app is a new arrangement, not a new vocabulary.

   Everything the reader can change lives in APP_STATE — not in the fixture and
   not in the DOM. Ticking a todo, typing a note or marking a headline read has
   to survive switching apps and leaving the section, and a panel that forgets
   is one nobody trusts with a sentence longer than a line. */
const APP_STATE = {};
function appState(app){
  if (!APP_STATE[app.id]){
    const p = D.APP_PANELS[app.id] || {};
    const s = {};
    if (p.items) s.items = p.items.map(i => ({ t:i.t, due:i.due, done:!!i.done }));
    if (p.notes){ s.notes = p.notes.slice(); s.note = 0; }
    if (p.s === 'news') s.read = p.rows.map(r => !r[3]);
    APP_STATE[app.id] = s;
  }
  return APP_STATE[app.id];
}
/* Repaint the open app in place: head and footer do not change, so only the
   body is rebuilt. Same move as rerender(w) for a widget. */
function repaintApp(app){
  const body = $('#appSheetBody');
  const top = body.scrollTop;
  body.innerHTML = '';
  appSurface(app).forEach(n => body.append(n));
  body.scrollTop = top;
}

/* A titled block, optionally with one control on its right. */
function appCard(title, trailing){
  const card = el('section','card');
  const head = el('div','card__head', '<span class="card__title">' + esc(title) + '</span>');
  if (trailing){ head.append(el('span','toolbar__spacer')); head.append(trailing); }
  const body = el('div','card__body');
  card.append(head, body);
  return { card:card, body:body, head:head };
}
/* A caption under something: the line that says what to do with what is above
   it, or what it costs. Used by the app panel and the assistant overlay. */
function helpNote(text){
  const p = el('div','field__help', esc(text));
  p.style.marginTop = 'var(--s-2)';
  return p;
}
const FILE_ICON = { csv:'table', sql:'code', pdf:'doc', deck:'layers', image:'pie' };

/* -------------------------------------------------------------- agenda
   The month is generated from the clock and the fixture marks days by their
   OFFSET from today, so the calendar is never wrong about what "today" is.
   Monday-first, which is what the marks assume. */
function appMonth(marks){
  const now = new Date(T0);
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const days = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();          /* 0 = Sunday */
  const offset = (first + 6) % 7;                    /* → Monday-first */
  /* Offsets become dates, and anything falling into next month is dropped
     rather than drawn on the wrong day. */
  const byDay = {};
  Object.keys(marks).forEach(k => {
    const d = today + Number(k);
    if (d >= 1 && d <= days) byDay[d] = marks[k];
  });

  const c = appCard(MONTHS[m] + ' ' + y);
  const grid = el('div','cal');
  ['M','T','W','T','F','S','S'].forEach(d => grid.append(el('div','cal__wd', d)));
  for (let i = 0; i < offset; i++) grid.append(el('div','cal__d cal__d--pad','0'));
  for (let d = 1; d <= days; d++){
    const cls = 'cal__d' + (byDay[d] ? ' cal__d--mark' : '') + (d === today ? ' cal__d--today' : '');
    const cell = el('div', cls, String(d));
    if (byDay[d]) cell.title = MONTHS[m] + ' ' + d + ' — ' + byDay[d];
    grid.append(cell);
  }
  c.body.append(grid);
  return c.card;
}
function appAgenda(app, p){
  const nodes = [appMonth(p.marks)];
  const c = appCard('Today');
  c.body.style.padding = '0 var(--s-3)';
  p.rows.forEach(([time, title, meta]) => {
    const r = el('div','artlist__row');
    r.innerHTML =
      '<span class="t-mono" style="flex:none;color:var(--text-4);font-size:var(--t-11)">' + esc(time) + '</span>' +
      '<span class="row__main" style="flex:1">' +
        '<span class="row__title">' + esc(title) + '</span>' +
        '<span class="row__sub">' + esc(meta) + '</span>' +
      '</span>';
    c.body.append(r);
  });
  nodes.push(c.card);
  return nodes;
}

/* ------------------------------------------------------------- extract
   A document read into fields. Two things make it honest: a field the model
   guessed is marked as needing a look, and the outcome can be FILED — an
   extraction is exactly the kind of definite result the store is for. */
function appExtract(app, p){
  const nodes = [];
  const src = appCard('Source');
  src.body.style.padding = 'var(--s-3)';
  src.body.append(el('div', null,
    '<span style="display:flex;align-items:center;gap:var(--s-2)">' +
      '<span style="display:flex;color:var(--text-4)">' + ic('doc',14) + '</span>' +
      '<span style="font-size:var(--t-12);color:var(--text)">' + esc(p.file) + '</span>' +
    '</span>' +
    '<div class="field__help" style="margin-top:4px">' + esc(p.pages) + '</div>'));
  nodes.push(src.card);

  const f = appCard('Fields', el('span','badge badge--ok', String(p.fields.length) + ' read'));
  f.body.append(defList(p.fields.map(([k, v, flag]) => [k,
    esc(v) + (flag === 'check' ? ' <span class="badge badge--warn">check</span>' : '')])));
  nodes.push(f.card);

  if (p.chips){
    const c = appCard(p.chipsLabel || 'Found');
    const wrap = el('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s-2)';
    p.chips.forEach(s => wrap.append(el('span','chip','<span>' + esc(s) + '</span>')));
    c.body.append(wrap);
    nodes.push(c.card);
  }
  if (p.check) nodes.push(banner('info', esc(p.check)));
  if (p.note)  nodes.push(banner('warn', esc(p.note)));

  if (p.queue){
    const q = appCard(p.queueLabel || 'Queue');
    q.body.style.padding = '0 var(--s-3)';
    p.queue.forEach(([nm, sub, st]) => {
      const r = el('div','artlist__row');
      r.innerHTML = dotLead(st) +
        '<span class="row__main" style="flex:1">' +
          '<span class="row__title">' + esc(nm) + '</span>' +
          '<span class="row__sub">' + esc(sub) + '</span>' +
        '</span>';
      q.body.append(r);
    });
    nodes.push(q.card);
  }

  /* The one action worth having here: put the fields where every other outcome
     in the workspace is kept, under a name. */
  const acts = el('div','live__acts');
  const save = el('button','btn btn--primary btn--sm', ic('check',13) + 'Save to results');
  save.type = 'button';
  save.onclick = () => fileResult({
    id:'r-' + app.id, title:p.res, from:app.name, shape:'list',
    size:plural(p.fields.length, 'field'),
    rows:p.fields.map(([k, v]) => [k, v])
  });
  acts.append(save);
  nodes.push(acts);
  return nodes;
}

/* --------------------------------------------------------------- files
   Clicking a file attaches it to the next message. That is the whole reason
   this app is beside the composer rather than a page of its own. */
function appFiles(app, p){
  const c = appCard('Uploads');
  c.body.style.padding = 'var(--s-1) var(--s-2)';
  p.rows.forEach(([nm, kind, size, when]) => {
    const row = listRow({
      lead:'<span class="row__icon">' + ic(FILE_ICON[kind] || 'file',14) + '</span>',
      title:nm, sub:kind + ' · ' + size, meta:when,
      onClick:() => attachFile(nm)
    });
    row.title = 'Attach ' + nm + ' to the next message';
    c.body.append(row);
  });
  return [c.card, helpNote('Click a file to attach it to your next message.')];
}

/* ---------------------------------------------------------------- news
   Headlines wrap rather than truncate: the headline IS the content. Clicking
   one marks it read and asks the thread about it. */
function appNews(app, p){
  const st = appState(app);
  const unread = st.read.filter(x => !x).length;
  const c = appCard('Feed', el('span','badge' + (unread ? ' badge--info' : ''),
    unread ? unread + ' unread' : 'all read'));
  c.body.style.padding = 'var(--s-1) var(--s-2)';
  p.rows.forEach(([title, src, when], i) => {
    const row = listRow({
      lead:'<span class="dot ' + (st.read[i] ? 'dot--read' : 'dot--unread') + '"></span>',
      title:title, sub:src, meta:when,
      onClick:() => {
        st.read[i] = true;
        repaintApp(app);
        askAbout(title, src);
      }
    });
    row.classList.add('row--wrap');
    row.title = 'Ask about this in the thread';
    c.body.append(row);
  });
  return [c.card, helpNote('Clicking a headline marks it read and writes the question into the composer.')];
}

/* ---------------------------------------------------------------- note
   The one app that is a text editor, so it is the one that proves the panel
   holds state: what you type survives switching apps, sections and threads.

   A note is one string and its first line is its title, which is why there is
   no title field — a second control for text that is already on screen. */
const noteTitle = b => (String(b).split('\n').filter(l => l.trim())[0] || '').trim().slice(0, 48) || 'Empty note';
function noteWords(b){
  const n = b.trim() ? b.trim().split(/\s+/).length : 0;
  return plural(n, 'word');
}
function appNoteSurface(app){
  const st = appState(app);
  const add = el('button','btn btn--ghost btn--sm', ic('plus',12) + 'New');
  add.type = 'button';
  add.onclick = () => { st.notes.unshift(''); st.note = 0; repaintApp(app); };
  const c = appCard('Notes', add);
  c.body.style.padding = 'var(--s-1) var(--s-2)';

  let open = null;                  /* the row of the note being edited */
  st.notes.forEach((b, i) => {
    const row = listRow({
      title:noteTitle(b), sub:noteWords(b), current:i === st.note,
      onClick:() => { st.note = i; repaintApp(app); }
    });
    if (i === st.note) open = row;
    c.body.append(row);
  });

  const ta = el('textarea','textarea textarea--prose');
  ta.value = st.notes[st.note];
  ta.rows = 10;
  ta.placeholder = 'First line is the title…';
  /* Saved on every keystroke, into the instance. The row above is patched by
     hand rather than re-rendered: a repaint per character would take the caret
     with it. */
  ta.oninput = () => {
    st.notes[st.note] = ta.value;
    if (open){
      $('.row__title', open).textContent = noteTitle(ta.value);
      $('.row__sub', open).textContent = noteWords(ta.value);
    }
  };
  return [c.card, ta];
}

/* ---------------------------------------------------------------- todo
   Ticking a box has to mean something, so it does: the count and the meter in
   the card head move with it, and done items grey out in place rather than
   jumping to the bottom under the reader's cursor. */
function appTodo(app){
  const st = appState(app);
  const done = st.items.filter(i => i.done).length;
  const c = appCard('Items', el('span','badge' + (done === st.items.length ? ' badge--ok' : ''),
    done + ' of ' + st.items.length + ' done'));
  c.body.style.padding = '0';

  const meter = el('span','meter');
  meter.style.margin = 'var(--s-3) var(--s-3) var(--s-2)';
  meter.innerHTML = '<i style="width:' + Math.round(done / st.items.length * 100) + '%"></i>';
  c.body.append(meter);

  const list = el('div','picklist');
  list.style.cssText = 'border:0;border-radius:0';
  st.items.forEach(it => {
    const row = el('label','picklist__row');
    row.dataset.done = String(it.done);
    const box = el('input','check');
    box.type = 'checkbox';
    box.checked = it.done;
    box.onchange = () => { it.done = box.checked; repaintApp(app); };
    row.append(box);
    row.append(el('span','picklist__main','<span class="picklist__nm">' + esc(it.t) + '</span>'));
    if (it.due) row.append(el('span','badge' + (it.due === 'today' ? ' badge--warn' : ''), esc(it.due)));
    list.append(row);
  });
  c.body.append(list);

  const add = el('form');
  add.style.cssText = 'display:flex;gap:var(--s-2)';
  const input = el('input','input');
  input.type = 'text';
  input.placeholder = 'Add an item…';
  const go = el('button','btn btn--secondary btn--sm','Add');
  go.type = 'submit';
  add.append(input, go);
  add.onsubmit = e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    st.items.unshift({ t:v, due:'', done:false });
    repaintApp(app);
  };
  return [c.card, add];
}

function appSurface(app){
  const p = D.APP_PANELS[app.id];
  if (!p) return [emptyState('cube', app.name, app.desc)];
  if (p.s === 'agenda')  return appAgenda(app, p);
  if (p.s === 'extract') return appExtract(app, p);
  if (p.s === 'files')   return appFiles(app, p);
  if (p.s === 'news')    return appNews(app, p);
  if (p.s === 'note')    return appNoteSurface(app);
  if (p.s === 'todo')    return appTodo(app);
  return [emptyState('cube', app.name, app.desc)];
}

/* Two things an app in this column can do to the thread beside it. Both are
   the reason the panel is a column and not a page: the composer is still on
   screen when they happen. */
function attachFile(name){
  const c = el('div','chip chip--removable',
    '<span style="display:flex;color:var(--text-4)">' + ic('file',12) + '</span><span>' + esc(name) + '</span>');
  const x = el('button','chip__x', ic('x',11));
  x.type = 'button';
  x.onclick = () => c.remove();
  c.append(x);
  $('#composerChips').append(c);
  toast('Attached ' + name);
}
function askAbout(title, src){
  const input = $('#composerInput');
  input.value = 'What does this mean for us? "' + title + '" (' + src + ')';
  autosize();
  $('#sendBtn').disabled = state.busy;
  if (state.section === 'chat') input.focus();
  else toast('Written into the composer — open Chat to send it');
}

/* ------------------------------------------------------- room to think
   Four columns can be open at once and only one of them is the conversation.
   A panel that takes width has to know what it is taking it from, so these
   answer one question — what would the conversation be left with — before
   anything animates. A grid column's target width is not measurable until its
   transition has finished, which is why these are computed rather than read. */
const CHAT_MIN = 560;
const cssPx = (n, el) => parseFloat(getComputedStyle(el || document.documentElement).getPropertyValue(n)) || 0;
/* Mirrors --sheet-w-open and the 34vw cap in tokens.css / layout.css. */
function sheetTarget(){ return Math.min(cssPx('--sheet-w-open'), window.innerWidth * 0.34); }
function artTarget(){ return cssPx('--art-w-user', $('#app')) || 440; }
function chatRoom(art, sheet){
  return window.innerWidth
    - $('#rail').offsetWidth
    - $('.listcol').offsetWidth          /* 0 when closed, so no condition */
    - $('#apprail').offsetWidth
    - (art ? artTarget() : 0)
    - (sheet ? sheetTarget() : 0);
}
/* Is there room to open the results column as well as whatever is open now? */
function roomForArt(){ return chatRoom(true, !!state.app) >= CHAT_MIN; }

/* An app opens into the column beside the rail rather than over the page.
   Clicking the app that is already open closes it, so the tile is a toggle. */
function openApp(app){
  if (state.app === app.id) return closeApp();
  state.app = app.id;
  state.lastApp = app.id;

  /* On a laptop these two cannot both have their width. The results column is
     the one that yields — it is the one panel with a way back from the content
     itself — and it is put back when the app closes, so the yield is a loan
     rather than a decision made on the reader's behalf. */
  if (isOpen('art') && chatRoom(true, true) < CHAT_MIN){
    state.artYielded = true;
    state.pref.art = false;
    toast('Results hidden to make room — ⌘. brings it back');
  }
  const p = D.APP_PANELS[app.id];

  const tile = $('#appSheetTile');
  tile.style.setProperty('--app-c', 'var(--app-' + app.c + ')');
  tile.innerHTML = ic(app.icon, 16);
  $('#appSheetName').textContent = app.name;
  $('#appSheetSub').textContent = (p && p.sub) || app.desc;
  $('#appSheetState').innerHTML = app.state === 'live' ? ''
    : '<span class="badge badge--' + (app.state === 'warn' ? 'warn' : 'info') + '">' + esc(app.state) + '</span>';

  repaintApp(app);
  $('#appSheetBody').scrollTop = 0;
  /* The footer carries a fact the header does not — where the data comes from,
     or what happens to it. With nothing to add it stays out of the way. */
  const foot = (p && p.foot) || '';
  $('#appSheetFoot').innerHTML = foot ? '<span>' + esc(foot) + '</span>' : '';
  $('#appSheetFoot').hidden = !foot;

  $('#appSheet').setAttribute('aria-hidden','false');
  $('#app').dataset.sheet = 'open';
  $('#appsBtn').setAttribute('aria-pressed','true');
  applyPanels();
  renderApps();
}
function closeApp(){
  state.app = null;
  $('#appSheet').setAttribute('aria-hidden','true');
  $('#app').dataset.sheet = 'closed';
  $('#appsBtn').setAttribute('aria-pressed','false');
  /* Give back what was borrowed, and only what was borrowed. */
  const back = state.artYielded;
  state.artYielded = false;
  if (back) state.pref.art = true;
  applyPanels();
  renderApps();
}
/* The topbar toggle and ⌘] reopen whichever app you had last: the rail is
   always there, so what the shortcut is for is the panel. */
function toggleAppPanel(){
  if (state.app) return closeApp();
  const app = D.APPS.filter(a => a.id === state.lastApp)[0] || D.APPS[0];
  openApp(app);
}

/* ================================================================ routing */
function select(section, itemId){
  /* Row selections belong to the thing they were made in, so moving off it
     drops them rather than carrying them somewhere they mean nothing. */
  if (itemId != null && itemId !== state.item[section]) state.kb.sel = [];
  state.section = section;
  if (itemId != null) state.item[section] = itemId;
  /* Landing on a build item from anywhere — the palette, a cross-link, a
     duplicate — expands the group it belongs to. A selected row inside a
     collapsed group is a selection you cannot see. */
  if (section === 'build' && itemId != null){
    state.build.open = kindOf(itemId);
    state.build.last[kindOf(itemId)] = idOf(itemId);
  }
  syncProjectLoan();
  render();
}

/* A project page is already two columns — its own panel and its own box — so
   the results column is the third one too many, and it is the one with a way
   back from the content itself (⌘. or a filed result). Arriving borrows it;
   leaving returns exactly what was borrowed. The same loan an open app makes. */
function syncProjectLoan(){
  const onProject = state.section === 'chat' && kindOf(state.item.chat) === 'p';
  if (onProject && !state.projLoan){
    if (isOpen('art')){
      state.projLoan = true;
      state.artBefore = state.pref.art;
      state.pref.art = false;
      applyPanels();
    }
  } else if (!onProject && state.projLoan){
    state.projLoan = false;
    state.pref.art = state.artBefore;
    state.artBefore = null;
    applyPanels();
  }
}

/* A thread's own words, cut to a row's worth. Its first message is the only
   thing that can name it, and quoting it is more use than paraphrasing it. */
function threadTitle(text){
  const one = text.replace(/\s+/g, ' ').trim();
  const cut = one.length > 48 ? one.slice(0, 47).replace(/\s\S*$/, '') + '…' : one;
  return cut.replace(/[.,;:!?]+$/, '') || 'New chat';
}

/* Started from a project, a thread belongs to it — that is what a project is
   for. Called straight from an onClick elsewhere, so the argument is checked
   rather than trusted: an event object is not a project id. */
function newThread(projectId){
  const pid = typeof projectId === 'string' ? projectId : null;
  const t = { id:'n' + (++newThreadN), title:'New chat', when:'now', group:'Today', project:pid, msgs:[] };
  D.THREADS.unshift(t);
  /* The project's assistant answers in the project, unless the thread is later
     bound to another one. */
  const p = pid ? find(D.PROJECTS, pid) : null;
  if (p && p.assistant){
    const a = D.ASSISTANTS.filter(x => x.name === p.assistant)[0];
    if (a) state.assistant = a.id;
  }
  select('chat', t.id);
  syncAssistantChip();
  $('#composerInput').focus();
}

/* The sidebar on its own. A turn that renames the thread it is in has to be
   able to redraw the row without rebuilding the pane it is streaming into. */
function renderList(){
  const S = SECTIONS[state.section];
  const lb = $('#listBody');
  /* Miller columns scroll per column, so the body stops being the scroller. */
  lb.classList.toggle('listcol__body--miller', !!S.miller);
  lb.innerHTML = '';
  S.list(lb);
}

function render(){
  const S = SECTIONS[state.section];

  $$('.rail__btn[data-nav], .rail__foot[data-nav]').forEach(b =>
    b.setAttribute('aria-current', b.dataset.nav === state.section ? 'page' : 'false'));

  $('#listTitle').textContent = S.listTitle;
  $('#listIco').innerHTML = ic(S.icon, 15);
  /* The section is on the shell, so a section can widen the sidebar by
     redefining --list-w rather than by anything here knowing a pixel. */
  $('#app').dataset.section = state.section;
  renderList();

  const head = S.head();
  $('#mainTitle').textContent = head.title;
  $('#mainSub').textContent = head.sub || '';
  const mb = $('#mainBody');
  /* The hero borrows the composer. Take it back before clearing, or emptying
     the pane would delete it along with its listeners. */
  detachComposer();
  mb.innerHTML = '';
  /* A view may take the pane's scrolling away from it — the project page scrolls
     its two columns separately. Reset it here so the modifier belongs to the
     view that asked for it and not to whatever is rendered next. */
  mb.className = 'pane__body';
  S.main(mb);

  const wantsComposer = typeof S.composer === 'function' ? S.composer() : !!S.composer;
  $('#composerWrap').hidden = !wantsComposer;
  mb.scrollTop = 0;

  renderApps();
  syncArtRefs();
  syncStatus();
}

/* ================================================================= status */
function recount(thread){
  state.turns = thread.msgs.length;
  state.tools = thread.msgs.reduce((a, m) => a + (m.steps ? m.steps.length : 0), 0);
  state.tokens = thread.msgs.length ? 3200 + thread.msgs.length * 2400 + state.tools * 640 : 0;
}
function syncStatus(){
  const pct = Math.min(100, state.tokens / 2000);
  $('#stTokens').textContent = nf(state.tokens) + ' / 200k';
  $('#stBar').style.width = pct + '%';
  $('#stBar').parentNode.classList.toggle('meter--warn', pct > 80);
  $('#stCost').textContent = '$' + (state.tokens * 0.0000148).toFixed(3);
  /* #stModel is the platform and never changes — the routed model is shown in
     the composer, next to the message it governs. */
  $('#stState').textContent = state.busy ? 'generating' : 'ready';
  $('#stDot').className = 'dot ' + (state.busy ? 'dot--run is-live' : 'dot--ok');
}

/* ================================================== simulated assistant turn */
function scrollDown(){
  const s = $('#mainBody');
  if (s.scrollHeight - s.scrollTop - s.clientHeight < 260)
    s.scrollTo({ top:s.scrollHeight, behavior:'instant' });
}

/* Run one of the scripted cases. The thread takes the case's title, because a
   worked example that leaves the sidebar saying "New chat" is a tester's
   problem three clicks later. */
function runCase(label){
  const c = D.CASES[label];
  if (!c) return;
  const t = find(D.THREADS, state.item.chat);
  if (t && !t.msgs.length){
    t.title = c.title;
    t.when = 'now';
    syncHead();
    syncListcol();
  }
  runTurn(c.ask, c);
}
/* The sidebar and the topbar can be rebuilt without touching the pane, which
   matters mid-turn: render() would wipe the answer being streamed into it. */
function syncListcol(){
  const lb = $('#listBody');
  lb.innerHTML = '';
  SECTIONS[state.section].list(lb);
}
function syncHead(){
  const h = SECTIONS[state.section].head();
  $('#mainTitle').textContent = h.title;
  $('#mainSub').textContent = h.sub || '';
}

async function runTurn(userText, script){
  if (state.busy) return;
  state.busy = true;
  $('#sendBtn').disabled = true;
  syncStatus();

  /* The thread this turn belongs to, resolved before anything is appended so
     the turn can be written into it at the end. */
  const thread = state.section === 'chat' ? find(D.THREADS, state.item.chat) : null;

  /* An empty thread is showing the hero, which is centred and therefore not a
     reading column. The first turn replaces it with one. */
  let inner = $('.pane__measure', $('#mainBody'));
  if (!inner){
    detachComposer();          /* the hero has it — see render() */
    $('#mainBody').innerHTML = '';
    inner = el('div','pane__measure');
    $('#mainBody').append(inner);
  }
  const emptyNode = $('.empty', inner);
  if (emptyNode) emptyNode.remove();

  inner.append(msgNode({ role:'user', text:userText }));
  scrollDown();

  /* A scripted case supplies its own turn; anything typed cycles the canned
     replies as before. */
  const reply = script || D.REPLIES[replyIx++ % D.REPLIES.length];

  const wrap = el('div','msg');
  wrap.dataset.role = 'ai';
  const head = el('div','msg__head');
  /* A bound assistant answers under its own name — that is what binding one
     means. The model it routes to is still in the composer. */
  head.innerHTML = '<span class="msg__who">' +
    esc(state.assistant ? find(D.ASSISTANTS, state.assistant).name : state.model) +
                   '</span><span class="msg__meta" data-dur>thinking...</span>';
  wrap.append(head);

  const trace = traceNode([], '', true);
  trace.classList.add('msg__trace');
  const tbody = $('.trace__body', trace);
  tbody.innerHTML = '';
  $('[data-label]', trace).textContent = 'Working...';
  wrap.append(trace);
  inner.append(wrap);
  scrollDown();

  let elapsed = 0;
  for (const s of reply.steps){
    const step = el('div','step',
      '<span class="dot dot--run is-live"></span>' +
      '<span class="step__name">' + esc(s.n) + '</span>' +
      '<span class="step__detail">' + esc(s.d) + '</span>' +
      '<span class="step__t"></span>');
    tbody.append(step);
    scrollDown();
    await sleep(parseFloat(s.t) * 620);
    $('.dot', step).className = 'dot dot--ok';
    $('.step__t', step).textContent = s.t;
    elapsed += parseFloat(s.t);
    state.tools++;
    state.tokens += 420;
    syncStatus();
  }
  const dur = elapsed.toFixed(1) + 's';
  $('[data-label]', trace).textContent = 'Worked through ' + reply.steps.length + ' steps';
  $('.trace__dur', trace).textContent = dur;
  trace.dataset.open = 'false';
  $('[data-dur]', head).textContent = 'responding...';

  /* Build the full markup, empty every text node, then refill progressively.
     Nothing reflows because the layout already exists. */
  const body = el('div','prose is-streaming');
  body.innerHTML = md(reply.md);
  wrap.append(body);

  const nodes = [];
  const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) nodes.push({ node:n, full:n.nodeValue });
  nodes.forEach(x => { x.node.nodeValue = ''; });

  const topOf = node => {
    let e = node.parentNode;
    while (e && e.parentNode && e.parentNode !== body) e = e.parentNode;
    return e;
  };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches){
    nodes.forEach(x => { x.node.nodeValue = x.full; topOf(x.node).classList.add('is-revealed'); });
  } else {
    let caret = null;
    for (const x of nodes){
      const top = topOf(x.node);
      top.classList.add('is-revealed');
      if (caret !== top){
        if (caret) caret.classList.remove('has-caret');
        top.classList.add('has-caret');
        caret = top;
      }
      const parts = x.full.split(/(\s+)/);
      for (let i = 0; i < parts.length; i += 2){
        x.node.nodeValue += parts.slice(i, i + 2).join('');
        state.tokens += 2;
        if (i % 8 === 0){ syncStatus(); scrollDown(); }
        await sleep(11 + (i % 3) * 6);
      }
    }
    if (caret) caret.classList.remove('has-caret');
  }
  body.classList.remove('is-streaming');
  $$('.is-revealed', body).forEach(e => e.classList.remove('is-revealed'));

  /* The artifact lands in the pane, and the thread keeps the reference. */
  if (reply.artifactId){
    const a = D.ARTIFACT_BY_ID(reply.artifactId);
    if (a){ wrap.append(artRefNode(a)); openArtifact(a.id); }
  }
  /* The widget stays in the thread. What it has settled on is registered as a
     named result in the artifact column — immediately for a table, a chart or a
     snippet, and only once acted on for a form or a questionnaire. */
  let w = null;
  if (reply.w){
    w = makeLive(reply.w, thread ? thread.title : 'this thread');
    wrap.append(liveHost(w));
    syncResult(w);
  }
  if (reply.cites) wrap.append(citesNode(reply.cites));
  $('[data-dur]', head).textContent = dur;
  head.append(actionsNode('ai'));

  /* The turn is written into the thread, so navigating away and back rebuilds
     it — including whatever has been typed into or chosen in the widget, which
     lives in the instance rather than in these nodes. */
  if (thread){
    const ai = {
      role:'ai', dur:dur, steps:reply.steps, md:reply.md, cites:reply.cites,
      artifactId:reply.artifactId || null, liveId:w ? w.id : null
    };
    if (!ai.artifactId) delete ai.artifactId;
    /* A thread still called "New chat" has not been named at all, and its first
       message is the only thing that can name it. Checked before the push, so
       "first message" means what it says. */
    const naming = thread.title === 'New chat' && !thread.msgs.length;
    thread.msgs.push({ role:'user', text:userText }, ai);
    if (naming){
      thread.title = threadTitle(userText);
      renderList();
    }
    if (w) w.msg = ai;
    /* The topbar counted turns before this one existed. */
    syncHead();
  }

  state.turns += 2;
  state.busy = false;
  $('#sendBtn').disabled = !$('#composerInput').value.trim();
  syncStatus();
  scrollDown();
}

/* =============================================================== composer */
function renderComposer(){
  $('#modelLabel').textContent = state.model;
  /* The button counts what it can offer, so an empty picker is visible before
     it is opened. */
  const n = favourites().length;
  $('#assistCount').textContent = n ? String(n) : '';
  syncAssistantChip();
}

/* The assistant bound to the next message. It rides in the composer's chip row
   next to the attachments, because it governs the message rather than the
   thread — the same reason model routing lives there. */
function syncAssistantChip(){
  const row = $('#composerChips');
  const old = $('[data-asst]', row);
  if (old) old.remove();
  if (!state.assistant) return;
  const a = find(D.ASSISTANTS, state.assistant);
  const c = el('div','chip chip--removable', '<span style="display:flex;color:var(--accent)">' +
    ic('agent',12) + '</span><span>' + esc(a.name) + '</span>');
  c.dataset.asst = a.id;
  const x = el('button','chip__x', ic('x',11));
  x.type = 'button';
  x.onclick = () => { state.assistant = null; syncAssistantChip(); };
  c.append(x);
  row.prepend(c);
}

function assistantPicker(){
  const pop = $('#assistPop');
  if (pop.dataset.open === 'true') return closeAssistantPicker();

  pop.innerHTML = '';
  const favs = favourites();
  if (!favs.length){
    pop.append(el('div','pop__empty','No favourites yet. Star an assistant to put it here.'));
  }
  favs.forEach(a => {
    const b = el('button','pop__item',
      '<span style="display:flex;color:var(--text-4)">' + ic('agent',13) + '</span>' +
      '<span class="pop__nm">' + esc(a.name) + '</span>' +
      '<span class="pop__sub">' + esc(a.team) + '</span>');
    b.type = 'button';
    b.setAttribute('aria-current', String(state.assistant === a.id));
    b.onclick = () => {
      state.assistant = state.assistant === a.id ? null : a.id;
      closeAssistantPicker();
      syncAssistantChip();
      $('#composerInput').focus();
    };
    pop.append(b);
  });
  const manage = el('button','pop__item pop__item--foot', ic('open',13) + '<span>Manage assistants</span>');
  manage.type = 'button';
  manage.onclick = () => { closeAssistantPicker(); select('chat','assistants'); };
  pop.append(manage);

  pop.dataset.open = 'true';
  /* One-shot outside click, bound after this click finishes bubbling. */
  setTimeout(() => document.addEventListener('mousedown', outsideAssistant), 0);
}
function closeAssistantPicker(){
  $('#assistPop').dataset.open = 'false';
  document.removeEventListener('mousedown', outsideAssistant);
}
function outsideAssistant(e){
  if (!e.target.closest('#assistPop') && !e.target.closest('#assistBtn')) closeAssistantPicker();
}
function autosize(){
  const i = $('#composerInput');
  i.style.height = 'auto';
  i.style.height = Math.min(i.scrollHeight, 200) + 'px';
}

/* ================================================================ palette */
let palItems = [], palIx = 0;

function palRender(q){
  const ql = q.toLowerCase().trim();
  const items = [];
  const hit = s => !ql || String(s).toLowerCase().indexOf(ql) > -1;
  const hitOnly = s => ql && String(s).toLowerCase().indexOf(ql) > -1;

  D.THREADS.forEach(t => { if (hit(t.title))
    items.push({ g:'Threads', nm:t.title, sub:t.when, run:() => select('chat', t.id) }); });

  D.APPS.forEach(a => { if (hit(a.name))
    items.push({ g:'Apps', nm:a.name, sub:a.short, run:() => openApp(a) }); });

  ORDER.concat(['account']).forEach(k => { if (hit(SECTIONS[k].label))
    items.push({ g:'Go to', nm:SECTIONS[k].label, sub:'', run:() => select(k) }); });

  D.PROJECTS.forEach(p => { if (hitOnly(p.name))
    items.push({ g:'Projects', nm:p.name, sub:p.assistant, run:() => select('chat', key('p', p.id)) }); });
  /* An assistant is defined in Build, so the palette lands on the definition —
     the chat list is one click from there and is reached by name anyway. */
  D.ASSISTANTS.forEach(a => { if (hitOnly(a.name))
    items.push({ g:'Assistants', nm:a.name, sub:a.model, run:() => select('build', key('as', a.id)) }); });
  D.KBS.forEach(k => { if (hitOnly(k.name))
    items.push({ g:'Knowledge', nm:k.name, sub:k.docs + ' docs', run:() => select('knowledge', key('kb', k.id)) }); });
  D.DATASETS.forEach(d => { if (hitOnly(d.name))
    items.push({ g:'Sources', nm:d.name, sub:d.source, run:() => select('knowledge', key('ds', d.id)) }); });
  /* One store, so the palette group is the store's name. */
  allResults().forEach(a => { if (hitOnly(a.title))
    items.push({ g:'Results', nm:a.title, sub:artKind(a), run:() => openArtifact(a.id) }); });
  /* Skills are chosen inside an assistant rather than authored, so the palette
     lands on the assistants that hold one. */
  D.CONNECTORS.forEach(c => { if (hitOnly(c.name))
    items.push({ g:'Connectors', nm:c.name, sub:c.state === 'off' ? 'not connected' : c.kind,
                 run:() => select('cloud', key('cn', c.id)) }); });
  D.DESIGNS.forEach(d => { if (hitOnly(d.name))
    items.push({ g:'Design settings', nm:d.name, sub:d.kind, run:() => select('build', key('de', d.id)) }); });
  D.SOLUTIONS.forEach(s => { if (hitOnly(s.name))
    items.push({ g:'Solutions', nm:s.name, sub:s.version + ' · ' + s.state,
                 run:() => select('build', key('so', s.id)) }); });

  COMMANDS.forEach(c => { if (hit(c.nm)) items.push(c); });

  palItems = items;
  palIx = 0;
  const list = $('#palList');

  if (!items.length){
    list.innerHTML = '<div class="empty" style="padding:var(--s-8)"><div class="empty__body">' +
                     'No matches for "' + esc(q) + '"</div></div>';
    return;
  }
  list.innerHTML = '';
  let lastG = null;
  items.forEach((it, i) => {
    if (it.g !== lastG){ list.append(el('div','palette__group', esc(it.g))); lastG = it.g; }
    const b = el('button','palette__item',
      '<span class="nm">' + esc(it.nm) + '</span>' + (it.sub ? '<span class="sub">' + esc(it.sub) + '</span>' : ''));
    b.dataset.ix = i;
    b.onmousemove = () => palHi(i);
    b.onclick = () => { palClose(); it.run(); };
    list.append(b);
  });
  palHi(0);
}
function palHi(i){
  palIx = i;
  const rows = $$('.palette__item', $('#palList'));
  rows.forEach(b => { b.dataset.active = String(Number(b.dataset.ix) === i); });
  if (rows[i]) rows[i].scrollIntoView({ block:'nearest' });
}
function palOpen(){
  $('#scrim').dataset.open = 'true';
  $('#palInput').value = '';
  palRender('');
  $('#palInput').focus();
}
function palClose(){
  $('#scrim').dataset.open = 'false';
  $('#palInput').blur();
}

const COMMANDS = [
  { g:'Actions', nm:'New chat', sub:'', run:() => newThread() },
  { g:'Actions', nm:'New project', sub:'', run:() => openProject(null) },
  { g:'Actions', nm:'Toggle theme', sub:'⌘J', run:() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
  { g:'Actions', nm:'Toggle sidebar', sub:'⌘\\', run:() => setPanel('list') },
  { g:'Actions', nm:'Toggle results column', sub:'⌘.', run:() => setPanel('art') },
  { g:'Actions', nm:'Toggle app panel', sub:'⌘]', run:toggleAppPanel },
  { g:'Actions', nm:'Density: compact', sub:'', run:() => setDensity('compact') },
  { g:'Actions', nm:'Density: comfortable', sub:'', run:() => setDensity('') },
  { g:'Actions', nm:'Density: roomy', sub:'', run:() => setDensity('roomy') },
  { g:'Actions', nm:'Export thread as Markdown', sub:'', run:() => toast('Exported — prototype') }
];

/* ============================================================ preferences */
function store(k, v){ try{ localStorage.setItem('nebulas.' + k, v); }catch(e){} }
function load(k){ try{ return localStorage.getItem('nebulas.' + k); }catch(e){ return null; } }

function setTheme(t){
  document.documentElement.dataset.theme = t;
  $('#stTheme').textContent = t === 'dark' ? 'Dark' : 'Light';
  store('theme', t);
}
function densityLabel(){
  const d = document.documentElement.dataset.density;
  return d === 'compact' ? 'Compact' : d === 'roomy' ? 'Roomy' : 'Comfortable';
}
function setDensity(d){
  if (d) document.documentElement.dataset.density = d;
  else delete document.documentElement.dataset.density;
  store('density', d || '');
  $('#stDensity').textContent = densityLabel();
}

/* ---------------------------------------------------- panel management
   Six columns want more width than a laptop has. Each collapsible one has the
   width below which it stops being worth the space it takes; an explicit choice
   overrides that, and null hands control back to the viewport. The app rail is
   not in here — it never collapses — and the app panel is not either: it is
   opened deliberately, and what it takes is width from the conversation. */
const BREAK = { list:1120, art:1400 };

/* The results column is the one panel that has to earn its width: with no
   explicit choice it stays shut while the store is empty, and the first result
   filed opens it (see syncResult). An explicit choice still wins both ways —
   the toggle can open an empty column, which is where the empty state is. */
function isOpen(kind){
  if (state.pref[kind] !== null) return state.pref[kind];
  if (kind === 'art' && !D.ARTIFACTS.length) return false;
  return window.innerWidth >= BREAK[kind];
}
function applyPanels(){
  const app = $('#app');
  const list = isOpen('list'), art = isOpen('art');
  app.dataset.list = list ? 'open' : 'closed';
  app.dataset.art  = art  ? 'open' : 'closed';
  /* The rail is always open; "wide" only decides whether it shows names. */
  app.dataset.apps = state.appsWide ? 'wide' : 'open';
  $('#artBtn').setAttribute('aria-pressed', String(art));
  $('#appsMore').setAttribute('aria-label', state.appsWide ? 'Hide app names' : 'Show app names');
}
function setPanel(kind, value){
  state.pref[kind] = value === undefined ? !isOpen(kind) : value;
  /* Asking for the results column yourself ends either loan: closing the app,
     or leaving the project, should not undo what you just asked for. */
  if (kind === 'art'){ state.artYielded = false; state.projLoan = false; }
  applyPanels();
}

/* =================================================================== boot */
function boot(){
  /* The markup's own placeholder is the default one, so a page that relabels the
     composer has something to hand back. */
  COMPOSER_PH = $('#composerInput').placeholder;
  const rail = $('#rail');
  ORDER.forEach(k => {
    const b = el('button','rail__btn tip', ic(SECTIONS[k].icon, 17));
    b.dataset.nav = k;
    b.setAttribute('data-tip', SECTIONS[k].label);
    b.onclick = () => select(k);
    rail.append(b);
  });
  rail.append(el('div','rail__spacer'));
  rail.append(el('div','rail__rule'));
  const acct = el('button','rail__foot tip', ic('user',17));
  acct.dataset.nav = 'account';
  acct.setAttribute('data-tip', D.ACCOUNT.name + ' · Account');
  acct.onclick = () => select('account');
  rail.append(acct);

  /* composer */
  const input = $('#composerInput');
  input.addEventListener('input', () => {
    autosize();
    $('#sendBtn').disabled = !input.value.trim() || state.busy;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || state.busy) return;
    input.value = '';
    autosize();
    $('#sendBtn').disabled = true;
    /* Attachments were for that message; the assistant binding survives it,
       so it is put back after the row is cleared. */
    $('#composerChips').innerHTML = '';
    /* Typed on a project page, where there is no thread yet: one is opened in
       the project, which is also what binds its assistant, and the turn lands
       there. Every other surface already has the thread it belongs to. */
    if (state.section === 'chat' && kindOf(state.item.chat) === 'p')
      newThread(idOf(state.item.chat));
    syncAssistantChip();
    runTurn(v);
  });

  let attachN = 0;
  $('#attachBtn').onclick = () => {
    const names = ['q4_forecast.csv','notes.md','schema.sql','dashboard.png'];
    const name = names[attachN++ % names.length];
    const c = el('div','chip chip--removable', '<span style="display:flex;color:var(--text-4)">' + ic('file',12) + '</span><span>' + name + '</span>');
    const x = el('button','chip__x', ic('x',11));
    x.type = 'button';
    x.onclick = () => c.remove();
    c.append(x);
    $('#composerChips').append(c);
  };
  $('#assistBtn').onclick = assistantPicker;
  $('#modelBtn').onclick = () => {
    const i = D.MODELS.indexOf(state.model);
    state.model = D.MODELS[(i + 1) % D.MODELS.length];
    renderComposer();
    syncStatus();
    toast('Routed to ' + state.model);
  };

  /* chrome */
  $('#searchBtn').onclick = palOpen;
  $('#artBtn').onclick  = () => setPanel('art');
  $('#appsBtn').onclick = toggleAppPanel;
  $('#artClose').onclick = () => setPanel('art', false);
  $('#artBack').onclick = closeResult;
  $('#artDl').onclick = () => {
    const a = D.ARTIFACT_BY_ID(state.art.id);
    if (a) downloadMenu(a, $('#artDl'));
  };
  $('#artShare').onclick = () => { const a = D.ARTIFACT_BY_ID(state.art.id); if (a) openShare(a); };
  $('#appsMore').onclick = () => { state.appsWide = !state.appsWide; applyPanels(); store('appswide', state.appsWide ? '1' : ''); };
  $('#mainMore').onclick = () => toast('Thread menu — prototype');
  $('#appSheetClose').onclick = closeApp;

  /* palette */
  const pi = $('#palInput');
  pi.addEventListener('input', e => palRender(e.target.value));
  pi.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); palHi(Math.min(palIx + 1, palItems.length - 1)); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); palHi(Math.max(palIx - 1, 0)); }
    else if (e.key === 'Enter'){ e.preventDefault(); const it = palItems[palIx]; if (it){ palClose(); it.run(); } }
    else if (e.key === 'Escape'){ palClose(); }
  });
  $('#scrim').addEventListener('mousedown', e => { if (e.target === $('#scrim')) palClose(); });

  /* assistant overlay */
  $('#asstClose').onclick = closeAssistant;
  $('#asstScrim').addEventListener('mousedown', e => { if (e.target === $('#asstScrim')) closeAssistant(); });

  /* share dialog */
  $('#shareClose').onclick = closeShare;
  $('#shareScrim').addEventListener('mousedown', e => { if (e.target === $('#shareScrim')) closeShare(); });

  /* project dialog */
  $('#projClose').onclick = closeProject;
  $('#projHelp').onclick = () => setHints(!projHints);
  $('#projScrim').addEventListener('mousedown', e => { if (e.target === $('#projScrim')) closeProject(); });
  $('#postClose').onclick = closePost;
  $('#postScrim').addEventListener('mousedown', e => { if (e.target === $('#postScrim')) closePost(); });

  /* status bar */
  $('#stThemeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#stDensityBtn').onclick = () => {
    const order = ['compact','','roomy'];
    const cur = document.documentElement.dataset.density || '';
    setDensity(order[(order.indexOf(cur) + 1) % order.length]);
  };

  /* global keys */
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      $('#scrim').dataset.open === 'true' ? palClose() : palOpen();
    } else if (mod && e.key === '\\'){
      e.preventDefault(); setPanel('list');
    } else if (mod && e.key === '.'){
      e.preventDefault(); setPanel('art');
    } else if (mod && e.key === ']'){
      e.preventDefault(); toggleAppPanel();
    } else if (mod && e.key.toLowerCase() === 'j'){
      e.preventDefault(); setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    } else if (e.key === 'Escape' && $('#asstScrim').dataset.open === 'true'){
      closeAssistant();
    } else if (e.key === 'Escape' && $('#shareScrim').dataset.open === 'true'){
      /* Opened last, so it takes Escape first. */
      closeShare();
    } else if (e.key === 'Escape' && $('#postScrim').dataset.open === 'true'){
      /* Opened from the project page, so it is above everything on it. */
      closePost();
    } else if (e.key === 'Escape' && $('#projScrim').dataset.open === 'true'){
      closeProject();
    } else if (e.key === 'Escape' && $('#scrim').dataset.open === 'true'){
      palClose();
    } else if (e.key === 'Escape' && state.app){
      /* The palette is above the sheet, so it gets Escape first. */
      closeApp();
    } else if (!mod && e.key === '/' && document.activeElement === document.body){
      const S = SECTIONS[state.section];
      const wants = typeof S.composer === 'function' ? S.composer() : !!S.composer;
      if (wants){ e.preventDefault(); $('#composerInput').focus(); }
    }
  });
  addEventListener('resize', applyPanels);

  /* restore preferences */
  setTheme(load('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  setDensity(load('density') || '');
  state.appsWide = load('appswide') === '1';

  /* Before applyPanels, which asks whether there is anything to show, and
     before renderArtifact, which sorts on the timestamps this writes. */
  initResults();

  initResize();
  applyPanels();
  renderComposer();
  renderArtifact();

  /* Open on an empty chat rather than on the last conversation: a workspace
     should be ready for the next question, and the history is one click away
     in the sidebar. This is also the state the design draws. */
  newThread();
}

document.addEventListener('DOMContentLoaded', boot);
})();
