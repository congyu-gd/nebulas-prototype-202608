/* ============================================================================
   app — shell routing, section renderers, the artifact pane, simulated turns.
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

  /* app glyphs — the identity half of an app tile */
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  filetext:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  dollar:'<path d="M12 3v18"/><path d="M16.5 7.5A3.5 3.5 0 0 0 13 5.5h-1.6a2.9 2.9 0 0 0 0 5.8h1.2a3 3 0 0 1 0 6H11a3.5 3.5 0 0 1-3.2-2"/>',
  checksq:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12.2 2.8 2.8L16.5 9.3"/>',
  feather:'<path d="M19.4 4.6a5.5 5.5 0 0 0-7.8 0L5 11.2V19h7.8l6.6-6.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M15.5 8.5 5 19M13 11H8.5M16 8h-3"/>'
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
    build:key('sk','sk1'),     /* 'sk:id' · 'ag:id' · 'so:id' */
    cloud:'c1',
    account:'profile'
  },
  busy:false,
  model:D.MODELS[0],
  tokens:0, turns:0, tools:0,
  art:{ id:'a1', pane:0 },
  app:null,                    /* the app id open in the sheet, or null */
  /* null means "follow the viewport"; true/false is an explicit choice. */
  pref:{ list:null, art:null, apps:null },
  appsWide:false
};
let replyIx = 0, newThreadN = 0;

function toast(msg){
  const t = el('div','toast','<span style="display:flex">' + ic('check',13) + '</span><span>' + esc(msg) + '</span>');
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); }, 2000);
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
/* A group header, optionally with the "+" that creates one of its members. */
function groupLabel(text, add){
  const g = el('div','listcol__group', '<span class="t-eyebrow">' + esc(text) + '</span>');
  if (add){
    const b = el('button','iconbtn iconbtn--xs tip tip--below', ic('plus',12));
    b.setAttribute('data-tip', add.tip);
    b.onclick = add.onClick;
    g.append(b);
  }
  return g;
}
const STATE_DOT = { run:'dot--run is-live', ok:'dot--ok', live:'dot--ok', idle:'', warn:'dot--warn', err:'dot--err', beta:'', draft:'' };
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
        title:'New chat', onClick:newThread
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
         so the row carries only the name. */
      body.append(groupLabel('Projects', { tip:'New project', onClick:() => toast('New project — prototype') }));
      D.PROJECTS.forEach(p => body.append(listRow({
        lead:'<span class="row__icon">' + ic('folder',13) + '</span>',
        title:p.name,
        current:state.item.chat === key('p', p.id),
        onClick:() => select('chat', key('p', p.id))
      })));

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
        return { title:p.name, sub:plural(D.THREADS.filter(t => t.project === p.id).length, 'thread') };
      }
      const t = find(D.THREADS, v);
      return { title:t.title, sub:t.msgs.length ? plural(t.msgs.length, 'turn') : 'empty' };
    },
    main(body){
      const v = state.item.chat;
      if (v === 'assistants') return assistantsView(body);
      if (v === 'schedule')   return scheduleView(body);
      if (kindOf(v) === 'p')  return projectView(body, find(D.PROJECTS, idOf(v)));
      return threadView(body, find(D.THREADS, v));
    },
    composer(){ const v = state.item.chat; return v !== 'assistants' && v !== 'schedule' && kindOf(v) !== 'p'; }
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

      body.append(groupLabel('Artifacts'));
      D.ARTIFACTS.forEach(a => body.append(listRow({
        lead:'<span class="row__icon">' + ic(KIND_ICON[a.kind] || 'file',13) + '</span>',
        title:a.title, meta:a.when,
        current:state.item.knowledge === key('art', a.id),
        onClick:() => { select('knowledge', key('art', a.id)); openArtifact(a.id); }
      })));
    },
    head(){
      const v = state.item.knowledge, id = idOf(v);
      if (kindOf(v) === 'ds'){ const d = find(D.DATASETS, id); return { title:d.name, sub:d.source }; }
      if (kindOf(v) === 'art'){ const a = find(D.ARTIFACTS, id); return { title:a.title, sub:a.kind }; }
      const k = find(D.KBS, id);
      return { title:k.name, sub:k.docs + ' docs' };
    },
    main(body){
      const v = state.item.knowledge, id = idOf(v);
      if (kindOf(v) === 'ds')  return datasetView(body, find(D.DATASETS, id));
      if (kindOf(v) === 'art') return artifactMetaView(body, find(D.ARTIFACTS, id));
      return kbView(body, find(D.KBS, id));
    }
  },

  /* ------------------------------------------------------------ build
     "Build mode" in the sketch. Skills compose into assistants, agents
     run them on a schedule, solutions package the result as an app. */
  build:{
    label:'Build', icon:'build', listTitle:'Build',
    list(body){
      body.append(groupLabel('Skills', { tip:'New skill', onClick:() => toast('New skill — prototype') }));
      D.SKILLS.forEach(s => body.append(listRow({
        lead:dotLead(s.state), title:s.name, sub:s.calls,
        current:state.item.build === key('sk', s.id),
        onClick:() => select('build', key('sk', s.id))
      })));

      body.append(groupLabel('Agents', { tip:'New agent', onClick:() => toast('New agent — prototype') }));
      D.AGENTS.forEach(a => body.append(listRow({
        lead:dotLead(a.state), title:a.name, sub:a.schedule,
        current:state.item.build === key('ag', a.id),
        onClick:() => select('build', key('ag', a.id))
      })));

      body.append(groupLabel('Solutions', { tip:'New solution', onClick:() => toast('New solution — prototype') }));
      D.SOLUTIONS.forEach(s => body.append(listRow({
        lead:'<span class="row__icon">' + ic('layers',13) + '</span>',
        title:s.name, sub:s.users,
        current:state.item.build === key('so', s.id),
        onClick:() => select('build', key('so', s.id))
      })));
    },
    head(){
      const v = state.item.build, id = idOf(v);
      if (kindOf(v) === 'ag'){ const a = find(D.AGENTS, id); return { title:a.name, sub:a.owner }; }
      if (kindOf(v) === 'so'){ const s = find(D.SOLUTIONS, id); return { title:s.name, sub:s.users }; }
      const s = find(D.SKILLS, id);
      return { title:s.name, sub:s.avg + ' avg' };
    },
    main(body){
      const v = state.item.build, id = idOf(v);
      if (kindOf(v) === 'ag') return agentView(body, find(D.AGENTS, id));
      if (kindOf(v) === 'so') return solutionView(body, find(D.SOLUTIONS, id));
      return skillView(body, find(D.SKILLS, id));
    }
  },

  /* ------------------------------------------------------------ cloud */
  cloud:{
    label:'Cloud & settings', icon:'cloud', listTitle:'Cloud',
    list(body){
      D.CLOUD.forEach(c => body.append(listRow({
        title:c.name, sub:c.desc, current:state.item.cloud === c.id,
        onClick:() => select('cloud', c.id)
      })));
    },
    head(){ const c = find(D.CLOUD, state.item.cloud); return { title:c.name, sub:'' }; },
    main(body){ cloudView(body, find(D.CLOUD, state.item.cloud)); }
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
  const b = el('div','banner banner--' + kind,
    '<span style="display:flex;margin-top:1px">' + ic('help',14) + '</span><span>' + html + '</span>');
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
function artRefNode(a){
  const b = el('button','artref msg__ref');
  b.dataset.art = a.id;
  b.setAttribute('aria-current', String(state.art.id === a.id));
  b.innerHTML =
    '<span class="artref__ico">' + ic(KIND_ICON[a.kind] || 'file',14) + '</span>' +
    '<span class="artref__title">' + esc(a.title) + '</span>' +
    '<span class="artref__meta">' + esc(a.kind) + ' · ' + esc(a.size) + '</span>';
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
  if (m.artifactId){
    const a = D.ARTIFACT_BY_ID(m.artifactId);
    if (a) wrap.append(artRefNode(a));
  }
  if (m.cites && m.cites.length) wrap.append(citesNode(m.cites));
  return wrap;
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

function heroNode(){
  const h = el('div','hero');
  h.append(el('h2','t-display hero__title','How can I help you?'));

  const modes = Object.keys(STARTERS);
  h.append(segCtl(modes, heroMode, m => { heroMode = m; render(); }));

  const row = el('div','hero__starters');
  STARTERS[heroMode].forEach(s => {
    const b = el('button','chip chip--plain', '<span>' + esc(s) + '</span>');
    b.type = 'button';
    b.onclick = () => {
      const i = $('#composerInput');
      i.value = s;
      autosize();
      $('#sendBtn').disabled = false;
      i.focus();
    };
    row.append(b);
  });
  h.append(row);
  return h;
}

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

  /* Opening a thread restores the last artifact it produced — the pane is
     supposed to hold the thing you were just reading. */
  const last = t.msgs.filter(m => m.artifactId).pop();
  if (last) openArtifact(last.artifactId, true);
}

function assistantsView(body){
  const pad = el('div','pane__pad');
  pad.append(pageHead('Assistants',
    'An assistant is a named binding of a model, a set of skills and one knowledge base. ' +
    'Threads pick one; agents and solutions reuse them.'));
  const grid = el('div','grid-cards');
  D.ASSISTANTS.forEach(a => {
    const c = el('article','card');
    c.innerHTML =
      '<div class="card__head">' +
        '<span class="dot ' + (STATE_DOT[a.state] || '') + '"></span>' +
        '<span class="card__title">' + esc(a.name) + '</span>' +
        '<span style="flex:1"></span>' +
        '<span class="t-mono">' + esc(a.threads) + ' threads</span>' +
      '</div>' +
      '<div class="card__body">' +
        '<div class="t-meta" style="margin-bottom:var(--s-3)">' + esc(a.desc) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:var(--s-1);margin-bottom:var(--s-3)">' +
          a.skills.map(s => '<span class="chip">' + esc(s) + '</span>').join('') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:var(--s-2)">' +
          '<span class="badge">' + esc(a.model) + '</span>' +
          '<span style="flex:1"></span>' +
          '<span class="t-mono">' + esc(a.kb) + '</span>' +
        '</div>' +
      '</div>';
    c.style.cursor = 'pointer';
    c.onclick = () => toast('Open ' + a.name + ' — prototype');
    grid.append(c);
  });
  pad.append(grid);
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

function projectView(body, p){
  const pad = el('div','pane__pad');
  pad.append(pageHead(p.name, p.desc));
  const threads = D.THREADS.filter(t => t.project === p.id);
  pad.append(statGrid([
    ['Threads', String(threads.length)],
    ['Assistant', p.assistant],
    ['Sources', String(p.sources.length)],
    ['Updated', p.when]
  ], ['Assistant','Updated']));
  pad.lastChild.style.marginBottom = 'var(--s-8)';

  const sec = el('section','section');
  sec.append(sectionHead('Threads'));
  if (!threads.length){
    sec.append(emptyState('chat','No threads in this project','Threads you start from here are scoped to the project\'s sources and assistant.'));
  } else {
    threads.forEach(t => {
      const r = listRow({ title:t.title, meta:t.when, onClick:() => select('chat', t.id) });
      sec.append(r);
    });
  }
  pad.append(sec);

  pad.append(tableSection('Sources',
    ['Source','Type','Rows','Updated'],
    p.sources.map(n => {
      const d = D.DATASETS.filter(x => x.name === n)[0];
      return d ? [
        '<td style="font-family:var(--mono);color:var(--text)">' + esc(d.name) + '</td>',
        '<td>' + esc(d.source) + '</td>',
        '<td class="num">' + esc(d.rows) + '</td>',
        '<td>' + esc(d.updated) + '</td>'
      ] : ['<td>' + esc(n) + '</td>','<td>—</td>','<td class="num">—</td>','<td>—</td>'];
    })));
  body.append(pad);
}

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
  pad.lastChild.style.marginBottom = 'var(--s-8)';

  const statusCell = s => {
    const cls = { indexed:'dot--ok', queued:'dot--run is-live', failed:'dot--err' }[s] || '';
    return '<td><span style="display:inline-flex;align-items:center;gap:6px">' +
           '<span class="dot ' + cls + '"></span>' + esc(s) + '</span></td>';
  };
  pad.append(tableSection('Documents',
    ['File','Type','Size','Status'],
    k.files.map(f => [
      '<td style="font-family:var(--mono);color:var(--text)">' + esc(f[0]) + '</td>',
      '<td>' + esc(f[1]) + '</td>',
      '<td class="num">' + esc(f[2]) + '</td>',
      statusCell(f[3])
    ]),
    '<span class="t-mono">' + k.files.length + ' of ' + k.docs + '</span>'));
  body.append(pad);
}

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

function artifactMetaView(body, a){
  const pad = el('div','pane__pad');
  pad.append(pageHead(a.title,
    'Produced by a turn in "' + a.from + '". The artifact itself is open in the pane on the right.',
    '<span class="badge">' + esc(a.kind) + '</span>'));
  pad.append(statGrid([
    ['Kind', a.kind], ['Size', a.size], ['From', a.from], ['Created', a.when]
  ], ['Kind','Size','From','Created']));
  pad.lastChild.style.marginBottom = 'var(--s-6)';

  const row = el('div');
  row.style.cssText = 'display:flex;gap:var(--s-2)';
  const open = el('button','btn btn--secondary', ic('open',13) + 'Open in pane');
  open.onclick = () => openArtifact(a.id);
  const goto = el('button','btn btn--ghost', ic('chat',13) + 'Go to thread');
  goto.onclick = () => gotoThreadByTitle(a.from);
  row.append(open, goto);
  pad.append(row);
  body.append(pad);
}

function skillView(body, s){
  const pad = el('div','pane__pad');
  const badge = { ok:'badge--ok', warn:'badge--warn', err:'badge--err' }[s.state] || '';
  const text  = { ok:'Enabled', warn:'Asks first', err:'Blocked' }[s.state];
  pad.append(pageHead(s.name, s.desc, '<span class="badge ' + badge + '">' + text + '</span>'));

  const sig = el('div','card');
  sig.innerHTML = '<div class="card__head"><span class="card__title">Signature</span></div>' +
                  '<div class="card__body" style="padding:var(--s-3)"><pre class="code">' + esc(s.sig) + '</pre></div>';
  sig.style.marginBottom = 'var(--s-6)';
  pad.append(sig);

  pad.append(statGrid([['Calls', s.calls], ['Average', s.avg], ['State', text]], ['Calls','Average','State']));
  pad.lastChild.style.marginBottom = 'var(--s-8)';

  const sec = el('section','section');
  sec.append(sectionHead('Definition'));
  sec.append(codeCard(s.code));
  pad.append(sec);
  body.append(pad);
}

function agentView(body, a){
  const pad = el('div','pane__pad');
  const badge = { run:'badge--info', ok:'badge--ok', idle:'', err:'badge--err' }[a.state] || '';
  const text  = { run:'Running', ok:'Healthy', idle:'Idle', err:'Failed' }[a.state];
  pad.append(pageHead(a.name, a.desc, '<span class="badge ' + badge + '">' + text + '</span>'));

  if (a.state === 'err'){
    pad.append(banner('err','<strong>Last run failed.</strong> ' + esc(a.log[a.log.length - 1].m) +
      ' Runs are paused until this is cleared.'));
  }
  pad.append(tableSection('Recent runs',
    ['Started','Result','Items','Duration'],
    a.runs.map(r => {
      const label = { run:'running', ok:'ok', err:'failed' }[r.state];
      return [
        '<td style="font-family:var(--mono)">' + esc(r.started) + '</td>',
        '<td><span style="display:inline-flex;align-items:center;gap:6px">' +
          '<span class="dot ' + (STATE_DOT[r.state] || '') + '"></span>' + label + '</span></td>',
        '<td>' + esc(r.items) + '</td>',
        '<td class="num">' + esc(r.dur) + '</td>'
      ];
    })));

  const logSec = el('section','section');
  logSec.append(sectionHead('Live log'));
  const lvlColor = { info:'var(--text-3)', warn:'var(--warn)', err:'var(--err)' };
  const card = el('div','card');
  card.innerHTML = '<div class="card__body" style="padding:var(--s-3)"><pre class="code">' +
    a.log.map(l =>
      '<span class="c">' + esc(l.t) + '</span>  ' +
      '<span style="color:' + lvlColor[l.lvl] + '">' + l.lvl.padEnd(4) + '</span>  ' +
      esc(l.m)).join('\n') + '</pre></div>';
  logSec.append(card);
  pad.append(logSec);
  body.append(pad);
}

function solutionView(body, s){
  const pad = el('div','pane__pad');
  const badge = { live:'badge--ok', beta:'badge--info', draft:'' }[s.state] || '';
  pad.append(pageHead(s.name, s.desc,
    '<span class="badge ' + badge + '">' + esc(s.state) + '</span>'));

  const card = el('div','card');
  card.innerHTML = '<div class="card__head"><span class="card__title">Composition</span></div>';
  const cb = el('div','card__body');
  cb.append(defList([
    ['Assistant', esc(s.parts.assistant)],
    ['Skills', s.parts.skills.map(x => '<span class="chip" style="margin-right:4px">' + esc(x) + '</span>').join('')],
    ['Knowledge', esc(s.parts.kb)],
    ['Surface', esc(s.parts.surface)],
    ['Reach', esc(s.users)]
  ]));
  card.append(cb);
  card.style.marginBottom = 'var(--s-6)';
  pad.append(card);

  const row = el('div');
  row.style.cssText = 'display:flex;gap:var(--s-2)';
  const open = el('button','btn btn--secondary', ic('play',13) + 'Open ' + esc(s.name));
  open.onclick = () => toast('Launch ' + s.name + ' — prototype');
  row.append(open);
  pad.append(row);
  body.append(pad);
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
    form.style.maxWidth = '640px';
    form.append(tableSection('Connections',
      ['Kind','Endpoint','Status','Scope'],
      D.CONNECTIONS.map(r => [
        '<td style="font-family:var(--mono);color:var(--text)">' + esc(r[0]) + '</td>',
        '<td>' + esc(r[1]) + '</td>',
        '<td><span style="display:inline-flex;align-items:center;gap:6px">' +
          '<span class="dot ' + (STATE_DOT[r[2]] || '') + '"></span>' + esc(r[2]) + '</span></td>',
        '<td class="t-mono">' + esc(r[3]) + '</td>'
      ])));

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

/* ========================================================== artifact pane
   Panes per kind. A table gets its result and its source; a chart adds the
   data behind it, because a bar nobody can check is decoration. */
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
function artPanes(a){
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
  state.art.id = id;
  state.art.pane = 0;
  if (!quiet){ state.pref.art = true; applyPanels(); }
  renderArtifact();
  syncArtRefs();
}

function renderArtifact(){
  const a = state.art.id ? D.ARTIFACT_BY_ID(state.art.id) : null;
  const tabs = $('#artTabs'), body = $('#artBody'), foot = $('#artFoot');
  tabs.innerHTML = ''; body.innerHTML = ''; foot.innerHTML = '';

  /* The header names the pane, not the artifact: the artifact says what it is
     through its content, and the thread it came from is in the footer. */
  if (!a){
    $('#artIcon').innerHTML = '';
    body.append(emptyState('library','Nothing open',
      'Long output — tables, diffs, charts, documents — opens here instead of inlining, and stays put across turns.'));
    return;
  }

  $('#artIcon').innerHTML = ic(KIND_ICON[a.kind] || 'file',14);

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

  foot.innerHTML = '<span class="t-mono">' + esc(a.kind) + ' · ' + esc(a.size) + '</span>' +
                   '<span style="flex:1"></span>';
  const from = el('button', null, 'from ' + esc(a.from));
  from.style.cssText = 'color:var(--text-4);font-size:var(--t-11)';
  from.onmouseenter = () => from.style.color = 'var(--text-2)';
  from.onmouseleave = () => from.style.color = 'var(--text-4)';
  from.onclick = () => gotoThreadByTitle(a.from);
  foot.append(from);
}

function gotoThreadByTitle(title){
  const t = D.THREADS.filter(x => x.title === title)[0];
  if (t) select('chat', t.id);
  else toast('That thread is no longer in the list');
}

/* The artifact boundary is movable, which is what the dashed line in the
   sketch was asking for. The width is stored, not recomputed per session. */
function initResize(){
  const app = $('#app'), grip = $('#artGrip'), pane = $('#artpane');
  const clamp = px => {
    const cs = getComputedStyle(document.documentElement);
    const min = parseInt(cs.getPropertyValue('--art-w-min'), 10) || 320;
    const max = Math.min(parseInt(cs.getPropertyValue('--art-w-max'), 10) || 720,
                         window.innerWidth - 520);
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
    /* The rail marks which app is open in the sheet, not which solution the
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
/* ============================================================== app sheet
   Six surfaces cover ten apps. Each is built from components that already
   exist elsewhere in the system — an app is a new arrangement, not a new
   vocabulary. */
function sheetStats(pairs){
  const g = el('div','stat-grid');
  /* The sheet is narrower than the auto-fit minimum, so three tiles would
     wrap 2 + 1. In a fixed-width panel the column count is known. */
  g.style.gridTemplateColumns = 'repeat(' + Math.min(pairs.length, 3) + ',minmax(0,1fr))';
  pairs.forEach(([k, v]) => g.append(el('div','stat',
    '<div class="stat__k">' + esc(k) + '</div>' +
    '<div class="stat__v" style="font-size:var(--t-18)">' + esc(v) + '</div>')));
  return g;
}
/* One row shape for both the ledger and the queue: name, one line of why,
   and a trailing value whose state colours it. */
function sheetRows(rows, title){
  const card = el('section','card');
  card.innerHTML = '<div class="card__head"><span class="card__title">' + esc(title) + '</span></div>';
  const body = el('div','card__body');
  body.style.padding = '0 var(--s-3)';
  rows.forEach(([nm, sub, val, st]) => {
    const r = el('div','artlist__row');
    r.innerHTML =
      '<span class="row__main" style="flex:1">' +
        '<span class="row__title">' + esc(nm) + '</span>' +
        '<span class="row__sub">' + esc(sub) + '</span>' +
      '</span>' +
      (st ? '<span class="badge badge--' + st + '">' + esc(val) + '</span>'
          : '<span class="artlist__v">' + esc(val) + '</span>');
    body.append(r);
  });
  card.append(body);
  return card;
}
function sheetMeters(meters){
  const card = el('section','card');
  card.innerHTML = '<div class="card__head"><span class="card__title">Signals</span></div>';
  const body = el('div','card__body');
  const list = el('div','barlist');
  meters.forEach(([k, pct, st]) => list.append(el('div','barlist__row',
    '<span class="barlist__k">' + esc(k) + '</span>' +
    '<span class="meter' + (st === 'warn' ? ' meter--warn' : '') + '"><i style="width:' + pct + '%"></i></span>' +
    '<span class="barlist__v">' + pct + '%</span>')));
  body.append(list);
  card.append(body);
  return card;
}
function sheetSources(rows, title){
  const card = el('section','card');
  card.innerHTML = '<div class="card__head"><span class="card__title">' + esc(title) + '</span></div>';
  const body = el('div','card__body');
  body.style.padding = '0 var(--s-3)';
  rows.forEach(([nm, sub, st]) => {
    const r = el('div','artlist__row');
    r.innerHTML = dotLead(st) +
      '<span class="row__main" style="flex:1">' +
        '<span class="row__title" style="font-family:var(--mono);font-size:var(--t-11)">' + esc(nm) + '</span>' +
      '</span>' +
      '<span class="artlist__v">' + esc(sub) + '</span>';
    body.append(r);
  });
  card.append(body);
  return card;
}
/* A month, with the marked days carrying the value that put them there. */
function sheetCalendar(p){
  const card = el('section','card');
  card.innerHTML = '<div class="card__head"><span class="card__title">' + esc(p.month) + '</span></div>';
  const body = el('div','card__body');
  const grid = el('div','cal');
  ['M','T','W','T','F','S','S'].forEach(d => grid.append(el('div','cal__wd', d)));
  for (let i = 0; i < p.offset; i++) grid.append(el('div','cal__d cal__d--pad','0'));
  for (let d = 1; d <= p.days; d++){
    const cls = 'cal__d' + (p.marks[d] ? ' cal__d--mark' : '') + (d === p.today ? ' cal__d--today' : '');
    const cell = el('div', cls, String(d));
    if (p.marks[d]) cell.title = 'Renewing ' + p.marks[d];
    grid.append(cell);
  }
  body.append(grid);
  card.append(body);
  return card;
}
function sheetSearch(p){
  const wrap = el('div');
  const input = el('input','input');
  input.placeholder = p.placeholder;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); toast('Search — prototype'); }
  });
  wrap.append(input);
  const list = sheetRows(p.rows.map(([a, b, c]) => [a, b, c, '']), 'Recent');
  list.style.marginTop = 'var(--s-4)';
  wrap.append(list);
  return wrap;
}

function appSurface(app){
  const p = D.APP_PANELS[app.id];
  const nodes = [];
  if (!p) return [emptyState('cube', app.name, app.desc)];

  if (p.s === 'ledger' || p.s === 'queue'){
    if (p.stats) nodes.push(sheetStats(p.stats));
    nodes.push(sheetRows(p.rows, p.s === 'queue' ? 'Queue' : 'Breakdown'));
  } else if (p.s === 'health'){
    nodes.push(sheetMeters(p.meters));
    nodes.push(sheetSources(p.rows, 'Sources'));
  } else if (p.s === 'calendar'){
    nodes.push(sheetCalendar(p));
    nodes.push(sheetRows(p.rows.map(([d, nm, m]) => [nm, d, m, '']), 'Next up'));
  } else if (p.s === 'note'){
    const card = el('section','card');
    card.innerHTML = '<div class="card__head"><span class="card__title">Draft</span></div>';
    const b = el('div','card__body');
    b.append(el('div','prose', md(p.md)));
    b.firstChild.style.fontSize = 'var(--t-13)';
    card.append(b);
    nodes.push(card);
  } else if (p.s === 'search'){
    nodes.push(sheetSearch(p));
  }
  return nodes;
}

/* An app opens beside the rail rather than replacing the page. Clicking the
   app that is already open closes it, so the tile is a toggle. */
function openApp(app){
  if (state.app === app.id) return closeApp();
  state.app = app.id;
  const p = D.APP_PANELS[app.id];

  const tile = $('#appSheetTile');
  tile.style.setProperty('--app-c', 'var(--app-' + app.c + ')');
  tile.innerHTML = ic(app.icon, 16);
  $('#appSheetName').textContent = app.name;
  $('#appSheetSub').textContent = (p && p.sub) || app.desc;
  $('#appSheetState').innerHTML = app.state === 'live' ? ''
    : '<span class="badge badge--' + (app.state === 'warn' ? 'warn' : 'info') + '">' + esc(app.state) + '</span>';

  const body = $('#appSheetBody');
  body.innerHTML = '';
  appSurface(app).forEach(n => body.append(n));
  body.scrollTop = 0;

  /* The solution behind the app is still reachable — the app is its front
     end, not a replacement for it. */
  const foot = $('#appSheetFoot');
  foot.innerHTML = '<span>' + esc(app.desc) + '</span><span style="flex:1"></span>';
  const sol = D.SOLUTIONS.filter(s => s.app === app.short)[0];
  if (sol){
    const b = el('button','btn btn--ghost btn--sm', 'Open in Build');
    b.type = 'button';
    b.onclick = () => { closeApp(); select('build', key('so', sol.id)); };
    foot.append(b);
  }

  const sheet = $('#appSheet');
  sheet.dataset.open = 'true';
  sheet.setAttribute('aria-hidden','false');
  renderApps();
}
function closeApp(){
  state.app = null;
  const sheet = $('#appSheet');
  sheet.dataset.open = 'false';
  sheet.setAttribute('aria-hidden','true');
  renderApps();
}

/* ================================================================ routing */
function select(section, itemId){
  state.section = section;
  if (itemId != null) state.item[section] = itemId;
  render();
}

function newThread(){
  const t = { id:'n' + (++newThreadN), title:'New chat', when:'now', group:'Today', project:null, msgs:[] };
  D.THREADS.unshift(t);
  select('chat', t.id);
  $('#composerInput').focus();
}

function render(){
  const S = SECTIONS[state.section];

  $$('.rail__btn[data-nav], .rail__foot[data-nav]').forEach(b =>
    b.setAttribute('aria-current', b.dataset.nav === state.section ? 'page' : 'false'));

  $('#listTitle').textContent = S.listTitle;
  $('#listIco').innerHTML = ic(S.icon, 15);
  const lb = $('#listBody');
  lb.innerHTML = '';
  S.list(lb);

  const head = S.head();
  $('#mainTitle').textContent = head.title;
  $('#mainSub').textContent = head.sub || '';
  const mb = $('#mainBody');
  mb.innerHTML = '';
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

async function runTurn(userText){
  if (state.busy) return;
  state.busy = true;
  $('#sendBtn').disabled = true;
  syncStatus();

  /* An empty thread is showing the hero, which is centred and therefore not a
     reading column. The first turn replaces it with one. */
  let inner = $('.pane__measure', $('#mainBody'));
  if (!inner){
    $('#mainBody').innerHTML = '';
    inner = el('div','pane__measure');
    $('#mainBody').append(inner);
  }
  const emptyNode = $('.empty', inner);
  if (emptyNode) emptyNode.remove();

  inner.append(msgNode({ role:'user', text:userText }));
  scrollDown();

  const reply = D.REPLIES[replyIx++ % D.REPLIES.length];

  const wrap = el('div','msg');
  wrap.dataset.role = 'ai';
  const head = el('div','msg__head');
  head.innerHTML = '<span class="msg__who">' + esc(state.model) +
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
  if (reply.cites) wrap.append(citesNode(reply.cites));
  $('[data-dur]', head).textContent = dur;
  head.append(actionsNode('ai'));

  state.turns += 2;
  state.busy = false;
  $('#sendBtn').disabled = !$('#composerInput').value.trim();
  syncStatus();
  scrollDown();
}

/* =============================================================== composer */
function renderComposer(){
  $('#modelLabel').textContent = state.model;
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
  D.ASSISTANTS.forEach(a => { if (hitOnly(a.name))
    items.push({ g:'Assistants', nm:a.name, sub:a.model, run:() => select('chat','assistants') }); });
  D.KBS.forEach(k => { if (hitOnly(k.name))
    items.push({ g:'Knowledge', nm:k.name, sub:k.docs + ' docs', run:() => select('knowledge', key('kb', k.id)) }); });
  D.DATASETS.forEach(d => { if (hitOnly(d.name))
    items.push({ g:'Sources', nm:d.name, sub:d.source, run:() => select('knowledge', key('ds', d.id)) }); });
  D.ARTIFACTS.forEach(a => { if (hitOnly(a.title))
    items.push({ g:'Artifacts', nm:a.title, sub:a.kind, run:() => { select('knowledge', key('art', a.id)); openArtifact(a.id); } }); });
  D.SKILLS.forEach(s => { if (hitOnly(s.name))
    items.push({ g:'Skills', nm:s.name, sub:s.calls, run:() => select('build', key('sk', s.id)) }); });
  D.AGENTS.forEach(a => { if (hitOnly(a.name))
    items.push({ g:'Agents', nm:a.name, sub:a.schedule, run:() => select('build', key('ag', a.id)) }); });
  D.SOLUTIONS.forEach(s => { if (hitOnly(s.name))
    items.push({ g:'Solutions', nm:s.name, sub:s.state, run:() => select('build', key('so', s.id)) }); });

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
  { g:'Actions', nm:'New chat', sub:'', run:newThread },
  { g:'Actions', nm:'Toggle theme', sub:'⌘J', run:() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
  { g:'Actions', nm:'Toggle sidebar', sub:'⌘\\', run:() => setPanel('list') },
  { g:'Actions', nm:'Toggle artifact pane', sub:'⌘.', run:() => setPanel('art') },
  { g:'Actions', nm:'Toggle app rail', sub:'⌘]', run:() => setPanel('apps') },
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
   Four columns want more width than a laptop has. Each one has the width
   below which it stops being worth the space it takes; an explicit choice
   overrides that, and null hands control back to the viewport. */
const BREAK = { apps:900, list:1120, art:1400 };

function isOpen(kind){
  return state.pref[kind] === null ? window.innerWidth >= BREAK[kind] : state.pref[kind];
}
function applyPanels(){
  const app = $('#app');
  const list = isOpen('list'), art = isOpen('art'), apps = isOpen('apps');
  app.dataset.list = list ? 'open' : 'closed';
  app.dataset.art  = art  ? 'open' : 'closed';
  app.dataset.apps = apps ? (state.appsWide ? 'wide' : 'open') : 'closed';
  $('#artBtn').setAttribute('aria-pressed', String(art));
  $('#appsBtn').setAttribute('aria-pressed', String(apps));
  $('#appsMore').setAttribute('aria-label', state.appsWide ? 'Hide app names' : 'Show app names');
}
function setPanel(kind, value){
  state.pref[kind] = value === undefined ? !isOpen(kind) : value;
  applyPanels();
}

/* =================================================================== boot */
function boot(){
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
    $('#composerChips').innerHTML = '';
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
  $('#assistBtn').onclick = () => select('chat','assistants');
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
  $('#appsBtn').onclick = () => setPanel('apps');
  $('#artClose').onclick = () => setPanel('art', false);
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
      e.preventDefault(); setPanel('apps');
    } else if (mod && e.key.toLowerCase() === 'j'){
      e.preventDefault(); setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
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
