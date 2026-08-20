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
  /* One pass with alternation, not three in sequence: a later rule run over the
     output of an earlier one matches inside the markup it inserted — the keyword
     `class` is in every <span class="…">, so every comment line came out
     mangled. A single replace consumes each match, so nothing is re-entered.
     Comment first: a keyword inside a comment is still a comment. */
  return esc(code).split('\n').map(line => {
    if (line.indexOf('-') === 0) return '<span class="del">' + line + '</span>';
    if (line.indexOf('+') === 0) return '<span class="add">' + line + '</span>';
    return line.replace(
      /(#.*)$|(&quot;[^&]*&quot;)|\b(import|from|def|return|await|async|try|except|raise|class|self|print|not|in|is|for|if|else|None|True|False)\b/g,
      (m, c, s, k) =>
        c ? '<span class="c">' + c + '</span>' :
        s ? '<span class="s">' + s + '</span>' :
            '<span class="k">' + k + '</span>');
  }).join('\n');
}

/* Icons live in js/icons.js — one set for every page. `ic(name, size)` and
   the `P` map are globals from there. */
const KIND_ICON = { table:'table', diff:'diff', chart:'chart', doc:'doc' };

/* ==================================================================== state */
const state = {
  section:'chat',
  item:{
    chat:'t1',                 /* thread id · 'assistants' · 'schedule' · 'p:id' */
    knowledge:key('kb','k1'),  /* 'kb:id' · 'ds:id' · 'art:id' */
    /* 'as:id' assistant · 'pj:id' project · 'wg:id' widget · 'tp:id' template */
    build:key('as','as1'),
    cloud:'c1',              /* a settings page id, or 'cn:id' for a connector */
    account:'profile'
  },
  busy:false,
  model:D.MODELS[0],
  tokens:0, turns:0, tools:0,
  accent:'',                   /* '' default · a preset name · a custom hue */
  /* The results column is one store for the whole workspace, so it has nothing
     to scope: `id` is the result being read, null the list itself. */
  art:{ id:null, pane:0 },
  app:null,                    /* the app id open in the sheet, or null */
  /* Knowledge detail: which tab, which rows are picked, how they are sorted.
     The tab survives switching bases — you were looking at Files for a
     reason — but a selection does not. */
  kb:{ tab:'files', sel:[], sort:{ c:'added', d:-1 } },
  /* Which classification tab the assistants page is on. */
  asst:{ tab:'All' },
  /* Build's sidebar is Miller columns: `open` is the kind showing in the second
     column, `last` is where you were in each kind so returning to one puts you
     back. */
  build:{ open:'as', last:{} },
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
         so the row carries the name, the glyph it was given, and one mark:
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
        /* Pages are the other switch that makes a folder more: the flag is the
           whole announcement, the same way the clock announces the program. */
        if ((p.pages || []).length) row.insertAdjacentHTML('beforeend',
          '<span class="row__flag tip tip--below" data-tip="Publishes ' +
          esc(plural(p.pages.length, 'page')) + '">' + ic('code',12) + '</span>');
        if (p.shared || (p.people || []).length) row.insertAdjacentHTML('beforeend',
          '<span class="row__flag tip tip--below" data-tip="Shared with ' +
          esc(p.shared ? D.ACCOUNT.org : plural(p.people.length, 'coworker')) + '">' +
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
      if (v === 'schedule'){
        const jn = D.SCHEDULE.filter(s => s.steps && s.steps.length).length;
        return { title:'Schedule', sub:jn + ' jobs · ' + (D.SCHEDULE.length - jn) + ' tasks' };
      }
      if (kindOf(v) === 'p'){
        const p = find(D.PROJECTS, idOf(v));
        return { title:p.name,
                 sub:(p.shared ? 'Shared · ' : 'Personal · ') +
                     plural(D.THREADS.filter(t => t.project === p.id).length, 'thread') };
      }
      const t = find(D.THREADS, v);
      const turns = t.msgs.length ? plural(t.msgs.length, 'turn') : 'empty';
      /* A thread filed in a project says so here: it is the one place the
         scoping is visible once you are reading the conversation. A maker
         thread says what it built, the same way. */
      const p = t.project ? find(D.PROJECTS, t.project) : null;
      if (t.build){
        const rec = byId(makerStore(kindOf(t.build)), idOf(t.build));
        return { title:t.title, sub:(rec ? rec.name + ' · Build · ' : 'Build · ') + turns };
      }
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
      /* Auto program replaces the box with the program; an open chat and the
         two asking modes all carry the composer, borrowed into the page. */
      if (kindOf(v) === 'p') return !!projThread || projMode === 'Work' || projMode === 'Data';
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
     than used. Four kinds now: the assistant that answers, the project that
     organises work (and what it reaches outside), the widget that embeds,
     and the template a page or a PDF is laid out by. Skills are chosen inside
     an assistant rather than authored on a page of their own, and scheduled
     runs are already visible in Chat → Schedule — so neither is a menu entry.

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
      const shown = g.items();

      /* The second column's own head: what it is showing, how much of it, and
         the "+" that makes another one of exactly this kind. */
      const head = el('div','miller__head',
        '<span class="t-eyebrow">' + esc(g.label) + '</span>' +
        '<span class="listcol__count">' + shown.length + '</span>');
      const add = el('button','iconbtn iconbtn--xs tip tip--below', ic('plus',12));
      add.setAttribute('data-tip', g.addTip);
      add.onclick = g.add;
      head.append(add);
      items.append(head);

      if (!shown.length){
        items.append(el('div','listcol__note', esc(g.empty)));
      } else {
        shown.forEach(x => items.append(listRow({
          lead:g.lead(x), title:x.name, sub:g.sub(x),
          current:state.item.build === key(g.kind, x.id),
          onClick:() => select('build', key(g.kind, x.id))
        })));
      }

      mill.append(kinds, items);
      body.append(mill);
    },
    head(){
      const v = state.item.build, id = idOf(v), k = kindOf(v);
      if (k === 'wg' || k === 'tp'){
        const d = find(D.DESIGNS, id);
        return { title:d.name, sub:d.kind === 'widget' ? 'widget · ' + d.shape
          : (d.shape === 'pdf' ? 'PDF result template' : 'web result template · ' + d.shape) };
      }
      if (k === 'pj'){
        const p = find(D.PROJECTS, id);
        return { title:p.name, sub:(p.shared ? 'shared' : 'personal') +
          (p.run ? ' · runs ' + p.run.every.toLowerCase() : '') +
          (p.pages.length ? ' · publishes ' + plural(p.pages.length, 'page') : '') };
      }
      const a = find(D.ASSISTANTS, id);
      return { title:a.name, sub:a.team + ' · ' + a.model };
    },
    main(body){
      const v = state.item.build, id = idOf(v), k = kindOf(v);
      if (k === 'wg' || k === 'tp') return designView(body, find(D.DESIGNS, id));
      if (k === 'pj') return projectBuildView(body, find(D.PROJECTS, id));
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
       ['usage','Usage','Tokens spent, today and before'],
       ['appearance','Appearance','Theme, density and the accent'],
       ['members','Members','Who can see and act here'],
       ['sessions','Sessions','Where you are signed in']].forEach(([id, name, sub]) =>
        body.append(listRow({
          title:name, sub:sub, current:state.item.account === id,
          onClick:() => select('account', id)
        })));
    },
    head(){
      const a = D.ACCOUNT;
      return { title:{ profile:'Profile', usage:'Usage', appearance:'Appearance',
        members:'Members', sessions:'Sessions' }[state.item.account], sub:a.email };
    },
    main(body){ accountView(body, state.item.account); }
  }
};

/* The rail order. Account is placed at the foot separately, as drawn. */
const ORDER = ['chat','knowledge','build','cloud'];

/* ---------------------------------------------------------- build groups
   The four kinds Build makes, as data: one entry adds a group to the sidebar
   with its own "+", its own row shape and its own empty line. The four are
   the maker's whole vocabulary — an assistant that answers, a project that
   organises work (including what external systems it reaches), a widget
   that embeds, and a template a page or a PDF is laid out by. */
const BUILD_GROUPS = [
  { kind:'as', label:'Assistants', icon:'agent', addTip:'New assistant — describe it', add:() => openMaker('as'),
    items:() => D.ASSISTANTS,
    lead:a => dotLead(a.state), sub:a => a.model,
    empty:'No assistants yet — the plus above makes one.' },

  { kind:'pj', label:'Projects', icon:'folder', addTip:'New project — describe it', add:() => openMaker('pj'),
    items:() => D.PROJECTS,
    lead:p => '<span class="row__icon">' + ic(p.icon, 13) + '</span>',
    sub:p => (p.shared ? 'shared' : 'personal') + (p.run ? ' · runs' : '') +
             ((p.pages || []).length ? ' · pages' : ''),
    empty:'No projects yet — the plus above makes one.' },

  { kind:'wg', label:'Widgets', icon:'widget', addTip:'New widget — describe it', add:() => openMaker('wg'),
    items:() => D.DESIGNS.filter(d => d.kind === 'widget'),
    lead:() => '<span class="row__icon">' + ic('widget', 13) + '</span>',
    sub:d => d.shape,
    empty:'No widgets yet — the plus above makes one.' },

  { kind:'tp', label:'Result templates', icon:'template', addTip:'New result template — describe it', add:() => openMaker('tp'),
    items:() => D.DESIGNS.filter(d => d.kind === 'template'),
    lead:() => '<span class="row__icon">' + ic('template', 13) + '</span>',
    sub:d => d.shape === 'pdf' ? 'PDF' : 'web · ' + d.shape,
    empty:'No result templates yet — the plus above makes one.' }
];

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
  /* The same tile the usage views use, in its --auto row: as many as fit. */
  const g = el('div','kpis kpis--auto');
  pairs.forEach(([k, v]) => {
    const s = el('div','kpi',
      '<span class="kpi__l">' + esc(k) + '</span>' +
      '<span class="kpi__v' + (small && small.indexOf(k) > -1 ? ' kpi__v--sm' : '') + '">' +
      esc(v) + '</span>');
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
const artGlyph = a => a.kind === 'result' ? (RESULT_ICON[a.shape] || 'file')
  : a.kind === 'channel' ? (CH_ICON[a.ch] || 'globe')
  : a.kind === 'page' ? 'template'
  : a.kind === 'form' ? 'clist' : (KIND_ICON[a.kind] || 'file');
const artType  = a => a.kind === 'result' ? (RESULT_TYPE[a.shape] || 'Result') : (KIND_TYPE[a.kind] || 'File');
const artKind  = a => artType(a).toLowerCase();

/* Under the reference, the act that belongs to it: filing the result into the
   project this conversation is part of. A weak button, not a second card —
   the card above is the thing. It only exists when there is a project to file
   into, and it reads as its own undo once filed. */
function artFileRow(a){
  const fp = artFileTarget(a);
  if (!fp) return null;
  const filed = a.pj === fp.id;
  const b = el('button','btn btn--ghost btn--sm',
    '<span style="display:flex">' + ic(filed ? 'check' : 'folder',13) + '</span>' +
    (filed ? 'In ' + esc(fp.name) + '’s results' : 'Add to ' + esc(fp.name) + '’s results'));
  b.type = 'button';
  b.style.marginTop = 'var(--s-1)';
  b.title = filed ? 'Click to take it back out' : 'List this in ' + fp.name + '’s results too';
  b.onclick = () => toggleArtFile(a, fp);
  return b;
}
function toggleArtFile(a, fp){
  if (a.pj === fp.id){ delete a.pj; toast('Removed from ' + fp.name + '’s results'); }
  else { a.pj = fp.id; toast('Added to ' + fp.name + '’s results'); }
  render();
  renderArtifact();
}

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
    if (a){
      wrap.append(artRefNode(a));
      const file = artFileRow(a);
      if (file) wrap.append(file);
    }
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
const WIDGET_ICON = { form:'filetext', quiz:'checksq', chart:'chart', table:'table', code:'code', program:'clock', element:'widget' };

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
  if (w.kind === 'program') text = w.created
    ? 'created · in Chat → Schedule'
    : (w.trigger ? 'on ' + w.trigger : (w.cron || CRON_OF[w.every])) +
      ' · not created yet — nothing runs until you press Create';
  if (w.kind === 'element') text = w.created
    ? 'created · in Build → Design elements'
    : w.shape + ' widget · not created yet — nothing ships until you press Create';
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
        '<span class="barlist__v' + (neg ? ' delta--down' : '') + '">' +
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
    /* The real clipboard, not a toast pretending to be one — the same helper
       every other copy affordance uses. */
    copy.onclick = () => copyText(w.variants[w.variant], w.variant);
    row.append(copy);
    body.append(row);
  },

  /* A routine, drafted as a program. Everything is still editable here — the
     cadence, every step's wording, the step count — because the parse is a
     guess about what was meant, and the person who meant it is looking at it.
     The one action writes a real row into Chat → Schedule; until then nothing
     exists anywhere, which the footer says out loud. Created, the widget
     freezes into a record of what was made and a door to where it lives now —
     the row is the fact, and two editable copies of one program would drift. */
  program(body, w){
    if (w.created){
      body.append(defList([
        w.trigger ? ['Runs', 'on ' + esc(w.trigger)]
                  : ['Cadence', esc(w.cron || CRON_OF[w.every])],
        ['Steps', w.steps.map(esc).join(' → ')],
        ['Produces', esc(w.out)]
      ]));
      const row = el('div','live__acts');
      const go = el('button','btn btn--secondary btn--sm',
        '<span style="display:flex">' + ic('clock',13) + '</span>Open in Chat → Schedule');
      go.type = 'button';
      go.onclick = () => select('chat','schedule');
      row.append(go);
      body.append(row);
      return;
    }

    /* An event-driven workflow asks WHEN, not how often — the trigger is a
       sentence fragment, editable like everything else here. A time-driven
       program keeps the cadence seg. */
    if (w.trigger){
      body.append(field('When',
        inputCtl(w.trigger, v => { if (v.trim()) w.trigger = v.trim(); rerender(w); }),
        'on ' + (w.trigger || '…') + ' · runs each time it fires'));
    } else {
      const once = w.every === 'One time';
      body.append(field('How often',
        segCtl(PROG_CADENCE, w.every, v => {
          w.every = v;
          /* The parsed clock belonged to the sentence; picking a cadence by hand
             makes the seg the truth, so the override goes. */
          delete w.cron;
          rerender(w);
        }),
        once
          ? (w.cron || 'as soon as it is created') + ' · runs once, then it is done'
          : (w.cron || CRON_OF[w.every]) + ' · first run ' + NEXT_OF[w.every]));
    }

    const stepsWrap = el('div', null);
    stepsWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--s-2);margin-bottom:var(--s-3)';
    stepsWrap.append(el('div','field__label','<span>Steps, in order</span>'));
    w.steps.forEach((name, i) => {
      const r = el('div', null);
      r.style.cssText = 'display:flex;align-items:center;gap:var(--s-2)';
      r.append(el('span','t-mono', String(i + 1)));
      const inp = inputCtl(name, v => {
        if (v.trim()) w.steps[i] = v.trim();
        rerender(w);
      });
      inp.style.flex = '1';
      r.append(inp);
      if (w.steps.length > 1){
        const x = el('button','iconbtn iconbtn--sm', ic('x',12));
        x.type = 'button';
        x.title = 'Remove this step';
        x.onclick = () => { w.steps.splice(i, 1); rerender(w); };
        r.append(x);
      }
      stepsWrap.append(r);
    });
    const add = el('button','btn btn--ghost btn--sm',
      '<span style="display:flex">' + ic('plus',13) + '</span>Add a step');
    add.type = 'button';
    add.style.alignSelf = 'flex-start';
    add.onclick = () => { w.steps.push('New step'); rerender(w); };
    stepsWrap.append(add);
    body.append(stepsWrap);

    body.append(el('div','field__help', 'Each run produces ' + esc(lc1(w.out)) + '.'));

    const row = el('div','live__acts');
    const make = el('button','btn btn--primary btn--sm','Create the program');
    make.type = 'button';
    make.onclick = () => createProgram(w);
    row.append(make);
    body.append(row);
  },

  /* A web widget, drafted where it was asked for and previewed with the same
     canvas Build uses — the preview IS the element, not a picture of it. The
     one editable thing here is the name: Build's inspector already edits
     everything else, and two editors of one element would drift. Created, the
     door leads there. */
  element(body, w){
    const stage = designCanvas({ kind:'widget', shape:w.shape, cfg:w.cfg,
                                 bars:w.bars, rows:w.rows });
    stage.style.marginBottom = 'var(--s-3)';
    body.append(stage);

    if (w.created){
      body.append(defList([
        ['Shape', esc(w.shape)],
        ['Lives in', 'Build → Design elements, as a draft'],
        ['Embed', 'the snippet is on its Build page']
      ]));
      const row = el('div','live__acts');
      const go = el('button','btn btn--secondary btn--sm',
        '<span style="display:flex">' + ic('widget',13) + '</span>Open in Build');
      go.type = 'button';
      go.onclick = () => select('build', key('wg', w.created));
      row.append(go);
      body.append(row);
      return;
    }

    body.append(field('Name', inputCtl(w.name, v => {
      if (v.trim()){ w.name = v.trim(); w.cfg.title = w.name; }
      rerender(w);
    }), 'Everything else — accent, theme, width, the values — is set in Build’s inspector.'));

    const row = el('div','live__acts');
    const make = el('button','btn btn--primary btn--sm','Create in Build');
    make.type = 'button';
    make.onclick = () => createElement(w);
    row.append(make);
    body.append(row);
  }
};

/* "A short briefing" reads wrong mid-sentence; this is only for that seam. */
const lc1 = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

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
const KIND_TYPE   = { table:'Table', chart:'Chart', doc:'Document', diff:'Diff', channel:'Channel', page:'Page', form:'Form' };

function liveResult(w){
  /* A program's outcome is the schedule row it creates, and an element's is
     the design record in Build — filing a document about either would put the
     same fact in two stores. (Also a crash guard: the fallback below reads
     w.variants, which neither has.) */
  if (w.kind === 'program' || w.kind === 'element') return null;
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
  'Data Discovery':['Profile a table','Find anomalies','Join two sources','Chart a trend','Explain a metric'],
  'Auto program':['Morning briefing','Friday expense sweep','Daily LinkedIn post','Sunday meal plan',
                 'Photo tidy script','Step-count widget','Ticket triage workflow']
};
let heroMode = 'Work';
let heroNew = false;           /* the new-dashboard form is open */

/* What each mode is for, said once under its starters. */
const HERO_NOTE = {
  'Work':'Each one runs a worked example. Anything definite it produces is kept in the results column on the right.',
  'Data Discovery':'Each one runs a worked example. Anything definite it produces is kept in the results column on the right.',
  'Auto program':'Describe what should exist — a routine, a when-this-then-that workflow, a script, or a web widget. The reply drafts it: programs and workflows land in Chat → Schedule, scripts in the results column, widgets in Build. Nothing runs until you press Create.'
};
/* The best documentation of the grammar is an instance of it. */
const AUTO_PH = 'Every morning, check the weather and my calendar, then write me a briefing';

/* ------------------------------------------------------------ the parser
   A routine, read out of a sentence. Heuristics, not understanding — which is
   fine, because the widget it feeds is editable and nothing runs until the
   person who wrote the sentence approves the reading of it.

   Cadence: a month word beats a week word beats the default of daily, because
   "every monday morning" is a weekly routine that happens to name a morning.
   The clock is kept separately as a free-text cron override — the schedule
   already accepts those — and is discarded the moment the cadence is chosen
   by hand in the widget. */
const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
function parseRoutine(text){
  const low = ' ' + text.toLowerCase() + ' ';
  const day = WEEKDAYS.filter(d => low.indexOf(d) > -1)[0];
  /* Recurrence has to be said — "every", "each", "daily" and kin. A plain
     imperative ("water the plants", "on friday email the landlord") is a
     one-time ask, and assuming daily would create work nobody ordered. */
  const recurring = /\b(every|each|daily|weekly|monthly|hourly)\b/.test(low);
  const every = !recurring ? 'One time'
              : /month/.test(low) ? 'Every month'
              : (day || /week/.test(low)) ? 'Every week'
              : 'Every day';

  /* The clock: a stated time wins; a time of day is read as one; a weekday
     carries its name into the cron so "every friday" does not print Mon. */
  const tm = low.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  let clock = null;
  if (tm){
    let hh = Number(tm[1]) % 24;
    if (tm[3] === 'pm' && hh < 12) hh += 12;
    if (hh < 24) clock = String(hh).padStart(2, '0') + ':' + (tm[2] || '00');
  }
  else if (/morning/.test(low)) clock = '08:00';
  else if (/noon|lunch/.test(low)) clock = '12:00';
  else if (/evening|night/.test(low)) clock = '18:00';
  let cron = null;
  const dayName = day ? day.slice(0, 1).toUpperCase() + day.slice(1, 3) : null;
  if (day) cron = (every === 'One time' ? 'once ' : '') + dayName + ' ' + (clock || '07:00');
  else if (clock) cron = (every === 'One time' ? 'once '
                        : every === 'Every day' ? 'daily '
                        : every === 'Every week' ? 'Mon ' : '1st ') + clock;

  /* The steps: drop the cadence clause — the words about WHEN, kept tight so a
     sentence with no comma after them ("every month prepare the summary") does
     not lose its work to the clause — then split on the joins people actually
     say. */
  const body = text
    .replace(/\b(every|each)\s+(morning|day|evening|night|week|weekday|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(\s+(morning|evening|night|afternoon))?\s*[,;]?\s*/i, '')
    /* One-time WHEN-words and bare cadence adverbs go the same way: they say
       when, not what. */
    .replace(/\b(tomorrow|tonight|today|once|daily|weekly|monthly|hourly)\b(\s+(morning|evening|night|afternoon))?\s*[,;]?\s*/i, '')
    .replace(/\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*[,;]?\s*/i, '')
    .replace(/\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/ig, '');
  const steps = splitSteps(body, text);

  const named = nameFromSteps(steps);
  return { title:named.noun ? CADENCE_ADJ[every] + ' ' + named.noun : named.last,
           every:every, cron:cron, steps:steps, out:named.out };
}

/* Split on the joins people actually say. Fragments too short to be work are
   noise from the split; nothing splitting at all falls back to the whole
   sentence as one step. Shared by every maker that reads steps out of prose. */
function splitSteps(body, whole){
  const steps = body.split(/\s*(?:;|,|\bthen\b|\band\b)\s*/i)
    .map(s => s.trim().replace(/^[-–—.\s]+|[.\s]+$/g, '').replace(/\s{2,}/g, ' '))
    .filter(s => s.length > 2)
    .slice(0, 5)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
  if (!steps.length && whole && whole.trim())
    steps.push(whole.trim().charAt(0).toUpperCase() + whole.trim().slice(1));
  return steps;
}

/* The name and the product both come from the last step — the thing the work
   exists to end on. A step that MAKES something ("write me a briefing") names
   it after its artifact; a step that just does something ("email my
   accountant") is already the best name it will get. */
function nameFromSteps(steps){
  const last = steps[steps.length - 1] || '';
  const made = last.match(/^(write|draft|make|prepare|plan|post|build|compose)\s+(?:me\s+|my\s+|us\s+|a\s+|an\s+|the\s+)*(.+)$/i);
  const noun = made ? made[2].trim().toLowerCase() : null;
  return { last:last, noun:noun,
           out:noun ? (/^[aeiou]/i.test(noun) ? 'An ' : 'A ') + noun + ', in this chat'
                    : 'A note in this chat when it is done' };
}

/* Which maker a sentence is asking for. The workflow clause is anchored at the
   start, so "a widget…, updated whenever I walk" stays a widget; "script" is
   explicit; "card" is deliberately NOT a widget word, because "card statement"
   is in the expense starter's own vocabulary. Everything else is a routine. */
function detectIntent(text){
  if (/^\s*(when|whenever|each time|every time|as soon as)\b/i.test(text)) return 'workflow';
  const low = ' ' + text.toLowerCase() + ' ';
  if (/\b(script|bash|shell|python|\.sh|\.py|command line|cli)\b/.test(low)) return 'script';
  if (/\b(widget|tile|dashboard|embed|kpi)\b/.test(low)) return 'element';
  return 'program';
}

/* One sentence, four makers. autoScript is the dispatcher; each *Turn wraps
   its parse as a scripted turn — a short trace that says what was read, one
   honest paragraph, and a widget whose Create action writes into the thing's
   own home. No cites anywhere — none of these read a corpus, and inventing
   one would lie. */
function autoScript(text){
  const kind = detectIntent(text);
  return kind === 'script' ? scriptTurn(text)
       : kind === 'element' ? elementTurn(text)
       : kind === 'workflow' ? workflowTurn(text)
       : programTurn(text);
}

function programTurn(text){
  const r = parseRoutine(text);
  return {
    steps:[
      { n:'routine.parse', d:r.every.toLowerCase() + ' · ' + plural(r.steps.length, 'step'), t:'0.6s' },
      { n:'program.draft', d:r.title, t:'0.5s' }
    ],
    md:'Here is your routine, read as a program: **' + r.title + '**, ' +
       r.every.toLowerCase() + (r.cron ? ' at ' + r.cron.replace(/^\S+\s*/, '') : '') +
       ', in ' + plural(r.steps.length, 'step') + '.\n\n' +
       'Check the reading below — every step is editable, and the cadence is a choice, not a fact I extracted. ' +
       'Nothing runs until you press **Create the program**; then it lives in Chat → Schedule with the rest of what runs by itself.',
    w:{ kind:'program', title:r.title, meta:plural(r.steps.length, 'step'),
        every:r.every, cron:r.cron, steps:r.steps, out:r.out }
  };
}

/* ------------------------------------------------------------ the script maker
   "A script that renames my photos by date" cannot be really written here —
   every answer in this prototype is simulated — so what is generated is an
   honest skeleton: each parsed step becomes a function whose body says TODO,
   main() calls them in order, and the header quotes the ask so the file
   remembers where it came from. Two runtimes, because the choice of Python or
   Bash is the reader's, not the parser's. The code widget files it in the
   results column by itself (liveResult's fallback), where it downloads as
   .py or .sh — so the widget needs no Save button. */
function parseScript(text){
  const ask = text.trim();
  const body = ask
    .replace(/^\s*(?:write|make|build|create|give)?\s*(?:me\s+|us\s+)?(?:a|an|the)?\s*(?:\w+[- ])?script\s+(?:that|to|which)\s*/i, '')
    .replace(/\b(every|each)\s+(morning|day|evening|night|week|weekday|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*[,;]?\s*/i, '');
  const steps = splitSteps(body, ask);
  const r = parseRoutine(text);           /* for the scheduler comment only */
  /* A script is named for what it chiefly does — its first step — where a
     routine is named for what it ends on. */
  const named = nameFromSteps(steps);
  const title = (named.noun || steps[0] || 'automation')
    .replace(/^./, c => c.toUpperCase());
  return { ask:ask, title:title, steps:steps,
           recurring:r.every !== 'One time', cron:r.cron || CRON_OF[r.every] };
}

const snakeCase = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'step';

function buildScript(r){
  const when = r.recurring
    ? '# Meant to recur — ' + r.cron + '. Wire it into cron or launchd once it does something.'
    : '# Run it by hand until it earns a schedule.';
  const py =
    '"""' + r.title + ' — a skeleton, not a program.\n\n' +
    'Generated from: "' + r.ask + '"\n' +
    'Each step is a named hole. Fill them in the order main() calls them.\n' +
    '"""\n' + when + '\n\n' +
    r.steps.map(s =>
      'def ' + snakeCase(s) + '():\n' +
      '    """' + s + '"""\n' +
      '    # TODO: this is where "' + s.toLowerCase() + '" happens\n' +
      '    pass\n').join('\n') +
    '\ndef main():\n' +
    r.steps.map(s => '    ' + snakeCase(s) + '()').join('\n') + '\n\n' +
    'if __name__ == "__main__":\n    main()\n';
  const sh =
    '#!/usr/bin/env bash\n' +
    '# ' + r.title + ' — a skeleton, not a program.\n' +
    '# Generated from: "' + r.ask + '"\n' +
    when + '\n' +
    'set -euo pipefail\n\n' +
    r.steps.map(s =>
      snakeCase(s) + '() {\n' +
      '  # TODO: this is where "' + s.toLowerCase() + '" happens\n' +
      '  :\n' +
      '}\n').join('\n') +
    '\nmain() {\n' +
    r.steps.map(s => '  ' + snakeCase(s)).join('\n') + '\n}\n\nmain "$@"\n';
  return { Python:py, Bash:sh };
}

function scriptTurn(text){
  const r = parseScript(text);
  return {
    steps:[
      { n:'script.read',  d:plural(r.steps.length, 'step') + ' to automate', t:'0.6s' },
      { n:'script.write', d:'2 runtimes · skeleton', t:'0.7s' }
    ],
    md:'Here is **' + r.title + '** as a script skeleton — Python and Bash, each parsed step a ' +
       'named function with a TODO where the work goes, because a real run is more than this ' +
       'prototype can honestly claim.\n\n' +
       'It is already filed in the results column, where it downloads as `.py` or `.sh` depending ' +
       'on the runtime showing. Copy takes the one on screen.',
    w:{ kind:'code', title:r.title, meta:'2 runtimes', res:r.title + ' — skeleton',
        variants:buildScript(r) }
  };
}

/* ---------------------------------------------------------- the workflow maker
   "When a ticket arrives, triage it, then post the summary to #support" — an
   event, then work. The when-clause is consumed by the match, so it cannot
   leak into the steps; what remains splits like any routine. The trigger is
   free text because the schedule's cron column always was — a fixture has run
   'on webhook' since before this mode existed. */
function parseWorkflow(text){
  const m = text.match(/^\s*(?:when|whenever|each time|every time|as soon as)\s+([^,;]+?)\s*(?:[,;]|\bthen\b)\s*(.*)$/i);
  const trigger = m ? m[1].trim() : text.trim();
  const rest = m ? m[2] : '';
  const steps = splitSteps(rest, rest || text);
  const named = nameFromSteps(steps);
  /* Named for its artifact when a step makes one; else for its trigger — a
     "ticket workflow" says more than the verb that handles it. A pronoun is
     nobody's name, so "someone stars the repo" names itself after the repo. */
  const trigWords = trigger.replace(/^(a|an|the|any|new|every)\s+/i, '').split(/\s+/);
  const trigNoun = (/^(someone|somebody|anyone|anybody|i|we|you|it)$/i.test(trigWords[0])
    ? trigWords[trigWords.length - 1].replace(/[^\w#-]/g, '')
    : trigWords[0]) || 'event';
  const title = named.noun
    ? named.noun.replace(/^./, c => c.toUpperCase())
    : trigNoun.replace(/^./, c => c.toUpperCase()) + ' workflow';
  return { title:title, trigger:trigger, steps:steps,
           out:named.noun ? named.out : 'A note in this chat each time it fires' };
}

function workflowTurn(text){
  const r = parseWorkflow(text);
  return {
    steps:[
      { n:'routine.parse', d:'on ' + r.trigger + ' · ' + plural(r.steps.length, 'step'), t:'0.6s' },
      { n:'program.draft', d:r.title, t:'0.5s' }
    ],
    md:'Here is your workflow: **' + r.title + '**, running each time **' + r.trigger + '** — ' +
       plural(r.steps.length, 'step') + ', in order.\n\n' +
       'The trigger and every step are editable below. An event has no computable next run, so the ' +
       'schedule will say *when it fires* rather than guess a time. Nothing runs until you press ' +
       '**Create the program**.',
    w:{ kind:'program', title:r.title, meta:plural(r.steps.length, 'step'),
        trigger:r.trigger, steps:r.steps, out:r.out }
  };
}

/* ----------------------------------------------------------- the element maker
   "A widget showing my daily step count" becomes a design element draft: shape
   read from the words (a trend is a chart, a question is an ask box, a list is
   rows, a number is a tile), a cfg seeded with exactly the keys Build's
   inspector edits, and placeholder values that say they are placeholders. The
   sample series exists so the preview has a body — the inspector is where it
   becomes real. */
function parseElement(text){
  const low = ' ' + text.toLowerCase() + ' ';
  const shape = /\b(trend|chart|graph|over time|history|by (day|week|month))\b/.test(low) ? 'chart'
              : /\b(ask|search|question|answer)\b/.test(low) ? 'ask'
              : /\b(list|watch|top|ranked|queue|feed)\b/.test(low) ? 'rows'
              : 'kpi';
  /* The name: what follows the widget word — "a widget showing my daily step
     count" names itself. */
  const m = text.match(/\b(?:widget|tile|dashboard|kpi|embed)\b\s*([^,.;]+)/i);
  const name = (m && m[1] ? m[1].trim() : 'New widget')
    /* "dashboard tile for open tickets" — a second widget word, connectors and
       articles are all preamble; strip until the words are the subject's own. */
    .replace(/^(?:(?:a|an|the|my|our)\s+|(?:widget|tile|dashboard|kpi|embed)\s+|(?:showing|for|of|that shows|with|tracking|to show|to)\s+)+/i, '')
    /* The thing measured, not the sentence about it: a comparison clause
       ("against a 10,000-step goal") belongs to the caption, not the name. */
    .replace(/\s+(against|versus|vs\.?|compared to|towards?)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ').replace(/^./, c => c.toUpperCase()) || 'New widget';

  const cfg = { title:name, sub:'', accent:'Nebulas', radius:'Soft', theme:'Follow',
                width:shape === 'kpi' ? 'Narrow' : 'Medium', header:true, credit:true };
  const w = { kind:'element', title:name, meta:shape + ' widget', shape:shape, name:name, cfg:cfg };
  if (shape === 'kpi' || shape === 'chart'){
    cfg.value = '—'; cfg.delta = ''; cfg.cap = 'Bound to a source in Build';
  }
  if (shape === 'chart') w.bars = [35, 52, 44, 60, 48, 66, 58, 72];
  if (shape === 'ask'){ cfg.placeholder = 'Ask about ' + name.toLowerCase() + '…'; cfg.starters = ''; }
  if (shape === 'rows'){
    cfg.cap = 'Bound to a source in Build';
    w.rows = [['Item one','—',70],['Item two','—',45],['Item three','—',20]];
  }
  return w;
}

function elementTurn(text){
  const w = parseElement(text);
  return {
    steps:[
      { n:'element.read',  d:w.shape + ' · ' + w.name.toLowerCase(), t:'0.6s' },
      { n:'element.draft', d:'previewed with Build’s own canvas', t:'0.5s' }
    ],
    md:'Here is **' + w.name + '** as a ' + w.shape + ' widget, previewed with the same canvas ' +
       'Build uses — the values are placeholders until it is bound to a source.\n\n' +
       'Name it below and press **Create in Build**; everything else — accent, theme, width, the ' +
       'numbers — is set in Build’s inspector, because two editors of one element would drift.',
    w:w
  };
}

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
  h.append(el('p','hero__note', HERO_NOTE[heroMode]));

  /* The input follows the starters, because a starter is a half-written
     message and the place it lands should be the next thing under it. */
  h.append(inlineComposer(heroMode === 'Auto program' ? AUTO_PH : null));

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
        '<span class="dash__tile"><span class="kpi__l">' + esc(k) + '</span>' +
        '<span class="dash__v">' + esc(v) + '</span></span>').join('') +
    '</div>' +
    '<span class="spark spark--bars dash__spark" style="margin-top:var(--s-3)">' +
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
  ep.onclick = () => copyText(a.endpointId, 'Endpoint id');
  rec.textContent = 'ID: ' + a.recordId;
  rec.title = 'Record id — what a support ticket quotes. Click to copy.';
  rec.onclick = () => copyText(a.recordId, 'Record id');

  /* The examples, up here as well as inside their capabilities: from the list
     you are choosing an assistant BY the question you have. */
  const ex = $('#asstEx');
  ex.innerHTML = '';
  asstPrompts(a).forEach(p => ex.append(exampleChip(a, p)));

  const who = D.ACCOUNT.name;
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
  const who = D.ACCOUNT.name;
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
  const owner = D.ACCOUNT.name + ' (you)';
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

  /* Asked from inside a project, the question stays inside the project: the
     box below is the same composer, and sending it opens the thread in the
     project's own chat column — never a new chat outside. Only Auto program
     has no box, so that one mode steps back to Work. */
  const cur = state.item.chat;
  if (state.section === 'chat' && kindOf(cur) === 'p' && byId(D.PROJECTS, idOf(cur))){
    if (projMode === 'Auto program'){ projMode = 'Work'; render(); }
  } else {
    const inThread = D.THREADS.some(t => t.id === cur);
    if (state.section !== 'chat' || !inThread){
      /* Reuse an empty thread rather than stacking up "New chat" rows. */
      const empty = D.THREADS.filter(t => !t.msgs.length)[0];
      if (empty) select('chat', empty.id); else newThread();
    } else {
      select('chat', cur);
    }
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

function asstTabs(list){
  /* Every count is a count of what is actually on the page. A tab that would
     show nothing is not offered: a dead filter reads as missing content. */
  const counts = {
    All:list.length,
    Recommended:list.filter(a => a.rec).length,
    Favourites:list.filter(a => a.fav).length
  };
  D.ASSISTANT_TEAMS.forEach(t => counts[t] = list.filter(a => a.team === t).length);
  const order = ['All','Recommended','Favourites'].concat(D.ASSISTANT_TEAMS)
    .filter(t => t === 'All' || counts[t] > 0);

  const bar = el('div','tabs');
  bar.style.flexWrap = 'wrap';
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
  /* The card is deliberately quiet: state, name, star, what it does, whose
     team it is. Everything else — skills, knowledge, threads, the way into
     Build — lives in the record the card opens; repeating it here made every
     card the same size as the overlay it stood for. */
  const c = el('article','card card--click');
  c.onclick = () => openAssistant(a);
  c.innerHTML =
    '<div class="card__head">' +
      '<span class="dot ' + (STATE_DOT[a.state] || '') + '"></span>' +
      '<span class="card__title">' + esc(a.name) + '</span>' +
      '<span style="flex:1"></span>' +
    '</div>';

  const star = el('button','iconbtn iconbtn--sm star', ic(a.fav ? 'starOn' : 'star', 14));
  star.type = 'button';
  star.setAttribute('aria-pressed', String(a.fav));
  star.title = a.fav ? 'Remove from favourites' : 'Add to favourites — it appears in the input box';
  star.onclick = e => {
    e.stopPropagation();
    a.fav = !a.fav;
    toast(a.fav ? a.name + ' added to favourites — it is now in the input box' : a.name + ' removed from favourites');
    render();
    renderComposer();
  };
  c.firstChild.append(star);

  const b = el('div','card__body');
  b.innerHTML =
    '<div class="t-meta" style="margin-bottom:var(--s-3)">' + esc(a.desc) + '</div>' +
    '<div style="display:flex;align-items:center;gap:var(--s-2)">' +
      '<span class="badge badge--mono">' + esc(a.team) + '</span>' +
      (a.rec ? '<span class="badge badge--info">Recommended</span>' : '') +
    '</div>';
  c.append(b);
  return c;
}

function assistantsView(body){
  const pad = el('div','pane__pad');
  pad.append(pageHead('Assistants',
    'An assistant is a named binding of a model, a set of skills and one knowledge base. ' +
    'Threads pick one; projects and agents reuse them.'));

  const split = el('div','asst');
  const left = el('div','asst__main');

  /* Everything here is yours — the tabs classify, nothing gates. */
  const all = D.ASSISTANTS;
  left.append(asstTabs(all));

  const tab = state.asst.tab;
  const shown = tab === 'All' ? all
              : tab === 'Recommended' ? all.filter(a => a.rec)
              : tab === 'Favourites' ? all.filter(a => a.fav)
              : all.filter(a => a.team === tab);

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
      '<span class="t-eyebrow">My favourites</span>' +
      '<span class="t-mono">' + favs.length + '</span>' +
    '</div>' +
    '<p class="asst__note">These appear in the input box — the assistant picker under the message you are writing — ready to answer your next message.</p>';

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

/* Two kinds of row, two tables: a task is one piece of work on a cron, a job
   is the workflow of its schedule — steps that run in order each time it
   fires. Jobs lead, and their table is the tree: the twist folds the steps out
   underneath. Which jobs are open survives a re-render but not a reload — an
   unfolded row is a reading posture, not a setting.

   The Chat column is a door: a row that writes into a conversation names it and
   clicking goes there. A row that feeds a corpus or a channel has no chat, so
   the cell says where the work goes instead of pretending there is one. */
const SCHED_LABEL = { run:'running', ok:'ok', idle:'idle', err:'failed', off:'stopped' };
const schedOpen = {};
const isJob = s => !!(s.steps && s.steps.length);
const schedProduced = s =>
  s.history && s.history.length ? s.history[0].out : 'nothing yet';

function schedStatusCell(state){
  return '<td><span style="display:inline-flex;align-items:center;gap:6px">' +
    '<span class="dot ' + (STATE_DOT[state] || '') + '"></span>' +
    (SCHED_LABEL[state] || state) + '</span></td>';
}
function schedChatCell(s){
  const t = s.thread ? byId(D.THREADS, s.thread) : null;
  return t
    ? '<td><button type="button" class="linkbtn" data-chat="' + esc(t.id) + '" ' +
      'title="Open this chat">' + esc(t.title) + '</button></td>'
    : '<td style="color:var(--text-3)">' + esc(s.target) + '</td>';
}

/* One table, given its rows. The two tables share everything but their first
   header and whether a row can fold, so the differences are arguments rather
   than a second implementation. */
function schedTable(pad, title, list, tree){
  if (!list.length) return;
  const rows = [];
  list.forEach(s => {
    const open = tree && !!schedOpen[s.id];
    /* The name never wraps — a table that breaks its subject over three lines
       to spare a scrollbar has its priorities backwards. The Produced column
       is the one that wraps; the table sits in a .scroll-x for the rest. */
    rows.push('<tr data-sched="' + s.id + '" style="cursor:pointer" title="Run history">' +
      '<td style="color:var(--text);white-space:nowrap">' +
        (tree
          ? '<span style="display:inline-flex;align-items:center;gap:var(--s-2)">' +
            '<button type="button" class="table__twist" data-twist="' + s.id + '" ' +
              'aria-expanded="' + open + '" aria-label="' +
              (open ? 'Collapse' : 'Expand') + ' ' + esc(s.name) + '">' + ic('chevR', 12) + '</button>' +
            esc(s.name) +
            '<span class="badge badge--mono">' + s.steps.length + ' steps</span></span>'
          : esc(s.name)) + '</td>' +
      '<td style="font-family:var(--mono)">' + esc(s.cron) + '</td>' +
      '<td>' + esc(s.next) + '</td>' +
      schedChatCell(s) +
      '<td style="color:var(--text-3)">' + esc(schedProduced(s)) + '</td>' +
      '<td class="num">' + esc(s.last) + '</td>' +
      schedStatusCell(s.state) + '</tr>');
    if (open) s.steps.forEach((st, i) => {
      rows.push('<tr class="table__step" data-sched="' + s.id + '" style="cursor:pointer">' +
        '<td style="white-space:nowrap">' + esc(st.name) + '</td>' +
        '<td style="font-family:var(--mono)">step ' + (i + 1) + '</td>' +
        '<td>—</td>' +
        '<td style="color:var(--text-3)">' + esc(st.target) + '</td>' +
        '<td></td>' +
        '<td class="num">' + esc(st.last) + '</td>' +
        schedStatusCell(st.state) + '</tr>');
    });
  });

  const sec = el('section','section');
  sec.append(sectionHead(title, '<span class="t-mono">' + list.length + '</span>'));
  const t = el('table','table table--rows');
  t.innerHTML =
    '<thead><tr><th>' + esc(tree ? 'Job' : 'Task') + '</th><th>Runs</th><th>Next</th>' +
    '<th>Chat</th><th>Produced</th><th class="num">Last</th><th>Status</th></tr></thead>' +
    '<tbody>' + rows.join('') + '</tbody>';
  /* One listener for all three gestures, most specific first: the chat cell
     goes to the conversation, the twist folds, everywhere else opens the run
     history — a step row opens its job's, since a step has no runs of its own. */
  t.addEventListener('click', e => {
    const ch = e.target.closest('[data-chat]');
    if (ch){ select('chat', ch.dataset.chat); return; }
    const tw = e.target.closest('[data-twist]');
    if (tw){ schedOpen[tw.dataset.twist] = tw.getAttribute('aria-expanded') !== 'true'; render(); return; }
    const tr = e.target.closest('tr[data-sched]');
    if (tr) openSched(byId(D.SCHEDULE, tr.dataset.sched));
  });
  const sx = el('div','scroll-x');
  sx.append(t);
  sec.append(sx);
  pad.append(sec);
}

function scheduleView(body){
  const pad = el('div','pane__pad');
  pad.append(pageHead('Schedule',
    'Work that runs without anyone asking. Everything here writes into a chat, ' +
    'a knowledge base or a channel — never straight to a person. Any row opens ' +
    'its run history.'));
  schedTable(pad, 'Jobs', D.SCHEDULE.filter(isJob), true);
  schedTable(pad, 'Tasks', D.SCHEDULE.filter(s => !isJob(s)), false);
  body.append(pad);
}

/* ------------------------------------------------------------- run history
   The overlay is the row's whole story: every run on a timeline, newest first,
   what each produced, and a door to the result — read here, inside the
   overlay, so the results column stays where the reader left it. A run that
   wrote into a channel or a corpus has nothing to open, so the entry says
   where the work went — which is the honest version of a link. The footer
   holds the two things you can do to the row itself: stop it, or delete it. */
let schedOn = null;                /* the row being read */
let schedArt = null;               /* a result being read inside the overlay */

function openSched(s){
  if (!s) return;
  schedOn = s;
  schedArt = null;
  renderSched();
  $('#schedScrim').dataset.open = 'true';
}
function closeSched(){
  $('#schedScrim').dataset.open = 'false';
  schedOn = null; schedArt = null;
}

function renderSched(){
  const s = schedOn;
  if (!s) return;
  const h = s.history || [];
  $('#schedIco').innerHTML = ic(isJob(s) ? 'branch' : 'clock', 16);
  $('#schedTitle').textContent = s.name;
  $('#schedSub').textContent =
    (isJob(s) ? 'job · ' + s.steps.length + ' steps · ' : 'task · ') +
    s.cron + (s.next === '—' ? '' : ' · next ' + s.next);

  const b = $('#schedBody');
  b.innerHTML = '';
  if (schedArt) schedArtBody(b);
  else schedRunsBody(b, s, h);
  schedFoot(s);
}

function schedRunsBody(b, s, h){
  if (!h.length){
    b.append(emptyState('clock','No runs yet',
      'This row has never fired. Its first run will appear here, with what it produced.'));
    return;
  }
  const ok = h.filter(r => r.state === 'ok').length;
  const done = h.filter(r => r.state !== 'run').length;
  const labels = ['Runs kept','Succeeded','Last duration','Next run'];
  const g = statGrid([
    ['Runs kept', String(h.length)],
    ['Succeeded', done ? ok + ' of ' + done : '—'],
    ['Last duration', s.last],
    ['Next run', s.next]
  ], labels);
  /* One line: in a dialog the stats are a header, not the content, and four
     large tiles wrapping 3+1 pushed the timeline below the fold. */
  g.className = 'kpis kpis--row';
  g.style.marginBottom = 'var(--s-5)';
  b.append(g);

  const ul = el('ul','timeline');
  h.forEach((r, ix) => {
    const li = el('li','timeline__item');
    const openable = r.art && D.ARTIFACT_BY_ID(r.art);
    li.innerHTML =
      '<span class="timeline__rail"><span class="dot ' + (STATE_DOT[r.state] || '') + '"></span></span>' +
      '<div class="timeline__main">' +
        '<div class="timeline__head">' +
          '<span class="timeline__when">' + esc(r.when) + '</span>' +
          '<span class="timeline__meta">' + esc(r.dur) +
            (r.manual ? ' · on request' : '') + '</span>' +
          (openable ? '<button type="button" class="btn btn--sm btn--ghost" data-art="' +
            esc(r.art) + '" style="margin-left:auto">Open result</button>' : '') +
        '</div>' +
        '<div class="timeline__out">' + esc(r.out) + '</div>' +
        /* The generated thing itself — the post as written, with its image. A
           failed run has none, because nothing was made. The image is trusted
           fixture SVG, drawn from the page's own tokens. */
        (r.md || r.img ? '<div class="timeline__product">' +
          (r.img ? '<figure class="timeline__img">' + r.img + '</figure>' : '') +
          (r.md ? md(r.md) : '') + '</div>' : '') +
        /* Under the product, acting on it: copy takes the text as writable
           into the platform's own composer — markdown marks stripped. */
        (r.md ? '<div class="timeline__acts">' +
          '<button type="button" class="iconbtn iconbtn--sm" data-copy="' + ix + '" ' +
          'title="Copy the text" aria-label="Copy the text">' + ic('copy', 13) + '</button></div>' : '') +
        (r.steps && s.steps ? '<div class="timeline__steps">' + r.steps.map((st, i) =>
          '<span class="timeline__step">' +
            '<span class="dot ' + (STATE_DOT[st[1]] || '') + '"></span>' +
            esc(s.steps[i] ? s.steps[i].name : 'step ' + (i + 1)) +
            '<span class="timeline__meta">' + esc(st[0]) + '</span></span>').join('') +
          '</div>' : '') +
      '</div>';
    ul.append(li);
  });
  /* The result opens here, in place of the timeline — the overlay is where the
     reader already is, and the results column keeps whatever state it had. */
  ul.addEventListener('click', e => {
    const cp = e.target.closest('[data-copy]');
    if (cp){
      const r = h[+cp.dataset.copy];
      copyText(r.md.replace(/\*\*?/g, ''), 'Post text');
      return;
    }
    const btn = e.target.closest('[data-art]');
    if (!btn) return;
    schedArt = btn.dataset.art;
    renderSched();
  });
  b.append(ul);
}

/* A result, read inside the overlay: the way back first, then the record's own
   panes stacked under their names — the same renderers the results column uses,
   because a result does not change shape with the room it is read in. */
function schedArtBody(b){
  const a = D.ARTIFACT_BY_ID(schedArt);
  if (!a){ schedArt = null; renderSched(); return; }
  const back = el('button','btn btn--ghost btn--sm',
    '<span style="display:flex">' + ic('chevL',13) + '</span>Back to runs');
  back.type = 'button';
  back.onclick = () => { schedArt = null; renderSched(); };
  const head = el('div', null);
  head.style.cssText = 'display:flex;align-items:center;gap:var(--s-3);margin-bottom:var(--s-4)';
  head.append(back);
  head.append(el('span','t-meta', esc(a.title) + ' · ' + esc(a.size)));
  b.append(head);
  artPanes(a).forEach(p => {
    const sec = el('section','section');
    sec.append(sectionHead(p.label));
    sec.append(p.render());
    b.append(sec);
  });
}

/* Stop is reversible in both senses — Resume undoes it, and nothing is lost
   while stopped — so it acts at once. Delete is destructive, so the toast
   carries the way back instead of a dialog asking twice. Deleting a project's
   program row turns the program off too: the row and the project's `run` are
   one fact, and killing one half would leave the other lying. */
function schedFoot(s){
  const foot = $('#schedFoot');
  foot.innerHTML = '';
  foot.hidden = !!schedArt;
  if (schedArt) return;

  const del = el('button','btn btn--danger','Delete');
  del.type = 'button';
  del.onclick = () => {
    const i = D.SCHEDULE.indexOf(s);
    if (i < 0) return;
    const p = D.PROJECTS.filter(x => x.run && x.run.sched === s.id)[0];
    const run = p ? p.run : null;
    D.SCHEDULE.splice(i, 1);
    if (p){ p.run = null; if (p.descAuto){ p.desc = autoDesc(p); } }
    closeSched();
    render();
    toast('Deleted ' + s.name + (p ? ' — ' + p.name + ' no longer runs on its own' : ''), {
      label:'Undo', icon:'trash',
      run:() => {
        D.SCHEDULE.splice(Math.min(i, D.SCHEDULE.length), 0, s);
        if (p){ p.run = run; if (p.descAuto){ p.desc = autoDesc(p); } }
        render();
        toast('Restored ' + s.name);
      }
    });
  };

  const stopped = s.state === 'off';
  const stop = el('button','btn btn--secondary', stopped
    ? '<span style="display:flex">' + ic('play',13) + '</span>Resume'
    : '<span style="display:flex">' + ic('x',13) + '</span>Stop');
  stop.type = 'button';
  stop.onclick = () => {
    if (stopped){
      const r = s.resume || { state:'idle', next:'—' };
      s.state = r.state; s.next = r.next;
      delete s.resume;
      toast('Resumed ' + s.name + (s.next === '—' ? '' : ' — next run ' + s.next));
    } else {
      s.resume = { state:s.state, next:s.next };
      s.state = 'off'; s.next = '—';
      toast('Stopped ' + s.name + ' — its history is kept');
    }
    render();
    renderSched();
  };

  foot.append(del, el('div','dialog__spacer'), stop);

  /* Chat-authored programs get a Run now, because a fresh one's overlay would
     otherwise say "No runs yet" until the cron fires — which, in a prototype,
     is never. Fixture rows keep their authored histories instead. */
  if (s.id.slice(0, 4) === 'sc-n' && s.state !== 'off'){
    const now = el('button','btn btn--secondary',
      '<span style="display:flex">' + ic('play',13) + '</span>Run now');
    now.type = 'button';
    now.onclick = () => schedRunNow(s);
    foot.append(now);
  }
}

/* A manual run of a chat-authored program. The program promised its product
   "in this chat", so a run KEEPS that promise: the product is posted into the
   thread the row points at, as a turn — the schedule's history quotes it, but
   the chat is where it is delivered. Simulated, as every answer in this
   prototype is, and the turn says so. */
function schedRunNow(s){
  const dur = '0:' + String(10 + ((s.history || []).length * 7) % 40).padStart(2, '0');
  const product =
    '**' + s.name + '** — run on request, ' + dur + '.\n\n' +
    (s.steps && s.steps.length
      ? s.steps.map((st, i) => '- **' + st.name + '** — done, 0:0' + ((i + 3) % 10)).join('\n') + '\n\n'
      : '') +
    (s.produces || 'The result') + ' would follow here: the run is simulated, as every ' +
    'answer in this prototype is — a real one would leave its product in this turn.';

  (s.history || (s.history = [])).unshift({
    when:'Just now', dur:dur, state:'ok', manual:true,
    out:(s.produces || 'Run complete') + ' → ' + (s.thread ? 'its chat' : 'this chat'),
    md:product,
    steps:s.steps && s.steps.map((st, i) => ['0:0' + ((i + 3) % 10), 'ok'])
  });
  if (s.steps) s.steps.forEach((st, i) => { st.state = 'ok'; st.last = '0:0' + ((i + 3) % 10); });
  s.state = 'ok';
  s.last = dur;
  /* A one-time program that has run is done: there is no next. The row stays,
     because its history is the record of what it did. */
  if (s.once) s.next = '—';

  /* The delivery. The thread keeps the turn, so it is there whenever the chat
     is opened — the run happened whether or not anyone was watching. */
  const t = s.thread ? byId(D.THREADS, s.thread) : null;
  if (t){
    t.msgs.push({ role:'ai', dur:dur, md:product });
    t.when = 'now';
    renderList();
  }

  renderSched();
  render();
  toast(s.name + ' ran' + (t ? ' — the result is in ' + t.title : ' — its history has the product'),
    t ? { label:'Open the chat', icon:'chat',
          run:() => { closeSched(); select('chat', t.id); } }
      : undefined);
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
/* Three cadences. A fourth would be a cron expression, and something that
   needs cron is a scheduled task — Chat → Schedule already holds those. */
const CADENCE = ['Every day','Every week','Every month'];
/* The program widget offers one more: a routine that is not a routine. Only
   there — a project that "runs by itself" is recurring by definition, so the
   project surfaces keep the three. The extra lookup keys are harmless to them,
   since they iterate CADENCE. */
const PROG_CADENCE = ['One time'].concat(CADENCE);
const CRON_OF = { 'One time':'once', 'Every day':'daily 07:00', 'Every week':'Mon 07:00', 'Every month':'1st 07:00' };
const NEXT_OF = { 'One time':'in 1 h', 'Every day':'in 14 h', 'Every week':'in 3 d', 'Every month':'in 12 d' };
/* "Every week" is how it is chosen; "Weekly" is how a one-word stat reads. */
const CADENCE_ADJ = { 'One time':'One-time', 'Every day':'Daily', 'Every week':'Weekly', 'Every month':'Monthly' };
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
  if ((p.pages || []).length){
    return 'Publishes ' + plural(p.pages.length, 'page') + ' built on preset code' +
           (p.run ? ', rebuilt ' + p.run.every.toLowerCase() : '') +
           (reads.length ? ', reading ' + list : '') + '.';
  }
  if (p.run){
    return 'Produces a result ' + p.run.every.toLowerCase() +
           (p.assistant ? ', written by ' + p.assistant : '') +
           (reads.length ? ', from ' + list : '') + '.';
  }
  if (p.assistant){
    const others = (p.assistants || []).length - 1;
    return 'Threads here are answered by ' + p.assistant +
           (others > 0 ? ' and ' + plural(others, 'other assistant') : '') +
           (reads.length ? ', reading ' + list : '') + '.';
  }
  if (reads.length) return 'Threads and results kept together, scoped to ' + list + '.';
  return 'A folder for ' + p.name + ' — threads you start here stay together.';
}
/* Every popup that changes what a project is rewrites the description, as the
   dialog used to — while it stays automatic. A hand-written one is left alone. */
function refreshDesc(p){
  if (p.descAuto || !p.desc){ p.desc = autoDesc(p); p.descAuto = true; }
}

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
  $('#projSub').textContent = fresh ? 'A name and an icon — everything else is set on the project page'
    : projOn.name + ' · ' + (d.run ? CADENCE_ADJ[d.run.every].toLowerCase() : 'no schedule');

  $('#projHelp').setAttribute('aria-pressed', String(projHints));

  /* The explanation of what a project is, said once — on the way in, not over
     the shoulder of somebody who already has three of them. It retires with the
     rest of the hints, and has its own × for anyone who is done with it sooner. */
  if (fresh && projHints && !hintGone.concept){
    const b = banner('info',
      'A project keeps one piece of work together: its threads, what it reads, and who ' +
      'answers in it. Created, it is a folder — its knowledge, assistant, connections ' +
      'and schedule are all switched on from the project page itself.');
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
    'The only required answer. The description is written for you from what the ' +
    'project is later given.'));

  /* Name and icon are the whole form: everything a project does — knowledge,
     assistant, connections, the schedule — is switched on from the project
     page's own panel, each setting behind the row that reports it. Creation
     stays free; configuration happens where its consequences are visible. */
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
  body.append(field('Icon', icons));

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
  /* The dialog stays basic on purpose: code and pages are Build's, so a fresh
     project starts with the empty arrays and nothing here ever touches them. */
  const p = projOn || { id:'p' + (++projN), descAuto:true, conn:[], code:[], pages:[], assistants:[] };
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
/* The program widget's one action: the draft becomes a row in Chat → Schedule.
   Multi-step → a job (the first job app.js has ever authored — until now steps
   existed only in fixtures); one step → a task. The row's thread points back at
   the conversation that described it, so the schedule's Chat cell is a door to
   where the words were said. Undoable from the toast, which also re-arms the
   widget — the draft and the row are one fact, so both come back together. */
let schedN = 0;
function createProgram(w){
  const steps = w.steps.map(s => s.trim()).filter(Boolean);
  if (!steps.length) return;
  const trig = w.trigger ? w.trigger.trim() : null;
  const once = !trig && w.every === 'One time';
  const row = {
    id:'sc-n' + (++schedN), name:w.title,
    /* An event row's next run is not a time anyone can compute — saying one
       would be a guess wearing a clock. */
    cron:trig ? 'on ' + trig : (w.cron || CRON_OF[w.every]),
    next:trig ? 'when it fires' : NEXT_OF[w.every],
    once:once,
    state:'idle', last:'—', target:w.out, produces:w.out,
    thread:w.thread || null, assistant:'—',
    history:[]
  };
  if (steps.length > 1) row.steps = steps.map(n =>
    ({ name:n, target:'—', assistant:'—', last:'—', state:'idle' }));
  D.SCHEDULE.push(row);
  w.created = row.id;
  /* Not a full render(): the reader is mid-thread and the pane must not
     rebuild under them. The sidebar count is the one thing that changed. */
  rerender(w);
  renderList();
  toast('Created ' + w.title + (trig ? ' — runs each time ' + trig
      : (once ? ' — runs ' : ' — first run ') + NEXT_OF[w.every]), {
    label:'Undo', icon:'clock',
    run:() => {
      const i = D.SCHEDULE.indexOf(row);
      if (i > -1) D.SCHEDULE.splice(i, 1);
      w.created = null;
      rerender(w);
      renderList();
      toast('Removed ' + w.title + ' — the draft is back');
    }
  });
}

/* The element widget's one action: the draft becomes a design record in Build,
   under the same id scheme as one made in Build itself
   (newDesign is the precedent). No navigation — the reader is mid-thread and
   the widget now carries the door. Undo takes the record back and re-arms the
   draft: one fact, both halves together. */
function createElement(w){
  const d = {
    id:'de-n' + (++madeN), name:w.name, kind:'widget', shape:w.shape,
    state:'draft', team:D.ASSISTANT_TEAMS[0],
    desc:'Drafted in chat. Everything about it is set in the inspector.',
    cfg:Object.assign({}, w.cfg, { title:w.name })
  };
  if (w.bars) d.bars = w.bars.slice();
  if (w.rows) d.rows = w.rows.map(r => r.slice());
  D.DESIGNS.push(d);
  w.created = d.id;
  rerender(w);
  toast('Created ' + w.name + ' — a draft in Build → Design elements', {
    label:'Undo', icon:'widget',
    run:() => {
      const i = D.DESIGNS.indexOf(d);
      if (i > -1) D.DESIGNS.splice(i, 1);
      w.created = null;
      rerender(w);
      toast('Removed ' + w.name + ' — the draft is back');
    }
  });
}

function runProject(p){
  const now = Date.now();
  const reads = (p.kbs || []).concat(p.sources || []);
  const n = allResults().filter(a => a.from === p.name).length + 1;
  const report = [
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
    shape:'doc', size:plural(4, 'line'), md:report });
  /* The result opened the results column, so the project is no longer borrowing
     it: leaving should not take back a column the reader has just been given. */
  state.projLoan = false;
  state.artBefore = null;
  p.when = 'now';
  const row = p.run && p.run.sched ? D.SCHEDULE.filter(s => s.id === p.run.sched)[0] : null;
  if (row){
    row.state = 'ok'; row.last = '0:12';
    /* The run history is the same fact: a manual run is a run, its product is
       what it wrote, and the result it filed is the one its entry opens. */
    (row.history || (row.history = [])).unshift({
      when:'Just now', dur:'0:12', state:'ok', manual:true,
      out:p.name + ' run ' + n, art:'r-' + p.id + '-' + n, md:report });
  }
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
  renderArtifact();
  toast(c.nm + ' connected as ' + c.handle, { label:'Undo', icon:'plug', run:() => {
    x.state = 'off'; x.last = '—'; x.calls = '—';
    render();
    renderArtifact();
    toast(c.nm + ' disconnected');
  }});
  if (then) then();
}

/* What is written but not out yet lives with its channel: the writing and the
   sending are different acts, and the gap between them — where a review
   happens — is shown on the channel's own tab. */
const POST_WHEN = ['Today 17:00','Tue 09:00','Tue 17:30','Wed 12:00','Thu 08:30','Next Mon 09:00'];

function projectChannels(panel, p){
  const sec = panelSec(p, 'Channels', { shut:true, count:p.channels.length,
    trailing:infoTip('Where this project posts. Each row opens the channel\'s day in the results column — ' +
            'the numbers, what went out, and what is written but not out yet.') });
  p.channels.forEach(c => {
    const live = chLive(c);
    const waiting = (c.drafts || []).length;
    sec.append(listRow({
      lead:chIcon(c),
      title:c.nm,
      sub:(live ? c.handle + ' · ' + c.posts : 'not connected — nothing leaves') +
          (waiting ? ' · ' + waiting + ' prepared' : ''),
      meta:live ? '' : 'off',
      onClick:() => openArtifact(c.art)
    }));
  });
  panel.append(sec);
}

/* --------------------------------------------------------- a channel's day
   One channel's day, in reading order: whether it can post at all, the
   numbers, what went out (and what has not yet), and what is written and
   waiting. Rendered inside the results column — a channel's day is a reading
   of this project, so it lives with the rest of what the project produced.
   The prepared rows stay doors to the post dialog; the pane's second tab is
   the page of prepared content as it will read. */
function channelDayNode(p, c){
  const wrap = el('div');
  const live = chLive(c);
  if (!live){
    const b = banner('warn', '<strong>' + esc(c.nm) + ' is not connected.</strong> Posts are ' +
      'written and kept; nothing leaves and nothing is measured until the connection is made.');
    const go = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('plug',13) + '</span>Connect ' + esc(c.nm));
    go.type = 'button';
    go.onclick = () => connectChannel(c);
    wrap.append(b, rowActs([go]));
  }

  const t = c.today || {};
  const today = el('section','section');
  today.append(sectionHead('Today', '<span class="t-mono">' + esc(c.handle) + '</span>'));
  today.append(statGrid([
    ['Reach', t.reach || '—'], ['Engagement', t.eng || '—'],
    ['New follows', t.follows || '—'], ['Posted', t.posted || '—']
  ], ['Posted']));
  wrap.append(today);

  const sent = el('section','section');
  sent.append(sectionHead('Today\'s posts', (c.sent || []).length
    ? '<span class="t-mono">' + c.sent.length + '</span>' : ''));
  if (!(c.sent || []).length){
    sent.append(helpNote(live ? 'Nothing went out today.'
      : 'Nothing went out today — the channel is not connected.'));
  } else {
    c.sent.forEach(sp => sent.append(listRow({
      lead:dotLead(sp.state === 'sent' ? 'ok' : 'warn'),
      title:sp.title, meta:sp.when,
      sub:sp.state === 'sent' ? 'sent' : 'scheduled — not sent yet'
    })));
  }
  wrap.append(sent);

  const prep = el('section','section');
  prep.append(sectionHead('Prepared', (c.drafts || []).length
    ? '<span class="t-mono">' + c.drafts.length + '</span>' : ''));
  if (!(c.drafts || []).length){
    prep.append(helpNote('Nothing written for ' + c.nm + ' yet. Ask for a post in Work and ' +
      'it arrives here before it goes anywhere.'));
  } else {
    c.drafts.forEach(q => prep.append(listRow({
      lead:chIcon(c),
      title:q.title, sub:q.when,
      meta:q.state === 'scheduled' ? 'queued' : q.state,
      onClick:() => openPost(p, c, q)
    })));
  }
  wrap.append(prep);
  return wrap;
}

/* ------------------------------------------------------- a post, before it goes
   Editing a draft is the one thing on this page that is neither a question nor a
   setting, so it gets a dialog: the text as written, which channel it is written
   for, when it leaves, and the button that lets it.

   The primary action depends on the state and on the channel — a post on a
   channel that is not connected cannot be scheduled, so it offers the connection
   instead of a button that would quietly do nothing. */
let postOn = null, postFor = null, postCh = null, postDraft = null;

function openPost(p, c, q){
  postFor = p; postCh = c; postOn = q;
  postDraft = { text:q.text, when:q.when };
  $('#postIco').innerHTML = ic(CH_ICON[c.id] || 'globe', 15);
  renderPost();
  $('#postScrim').dataset.open = 'true';
}
function closePost(){
  $('#postScrim').dataset.open = 'false';
  postOn = null; postFor = null; postCh = null; postDraft = null;
}

function renderPost(){
  const p = postFor, c = postCh, q = postOn, d = postDraft;
  if (!p || !q) return;
  const body = $('#postBody'), foot = $('#postFoot');
  body.innerHTML = ''; foot.innerHTML = '';
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
    const i = c.drafts.indexOf(q);
    c.drafts.splice(i, 1);
    closePost();
    render();
    renderArtifact();
    toast('Removed ' + q.title, { label:'Undo', icon:'retry', run:() => {
      c.drafts.splice(i, 0, q);
      render();
      renderArtifact();
      toast('Back with ' + c.nm);
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
    renderArtifact();
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
let projThread = null;             /* the chat open in the project's own chat area */

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

/* Which panel sections are folded shut, per project — a reading preference,
   so it survives re-renders but not a reload. Keyed p.id:title. */
const projSecShut = {};

/* A panel section that folds: native <details>, the head as its summary, the
   chevron as the affordance. Every setting still edits through the popup
   behind the head's gear — stopPropagation keeps the gear from toggling the
   fold it sits in. Rows appended to the returned element land in the body. */
function panelSec(p, title, opts){
  opts = opts || {};
  const k = p.id + ':' + title;
  const d = el('details','section section--fold');
  /* Configuration sections ship folded (`shut`) — the count says what is
     inside without opening anything. A toggle is remembered for the session
     and outranks the default. */
  d.open = projSecShut[k] === undefined ? !opts.shut : !projSecShut[k];
  const sum = el('summary','section__head');
  /* The chevron leads — the fold's own affordance, to the left of the heading
     the way the fold and the trace draw theirs — then the title, then the
     count, always: a folded section owes the reader its size. */
  sum.innerHTML =
    '<span class="section__chev">' + ic('chevR',12) + '</span>' +
    '<span class="t-eyebrow">' + esc(title) + '</span>' +
    (opts.count != null
      ? '<span class="t-mono" style="color:var(--text-4)">' + opts.count + '</span>' : '') +
    (opts.trailing || '');
  /* One small plus at the right of the head — the same slot the sidebar's
     group label and Build's lane head give their "+". It adds and it changes:
     both verbs open the section's own popup. */
  if (opts.edit){
    const b = el('button','iconbtn iconbtn--xs tip tip--below', ic('plus',12));
    b.type = 'button';
    b.style.marginLeft = 'auto';
    b.setAttribute('data-tip', opts.tip);
    b.setAttribute('aria-label', opts.tip);
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); opts.edit(); };
    sum.append(b);
  }
  d.append(sum);
  /* Recorded on the click, not the toggle event: the event fires a task later,
     and a re-render inside the same task would read yesterday's state. At
     click time `open` still holds the pre-toggle value — which is exactly
     "shut after this click". The gear stops propagation, so it never lands. */
  sum.addEventListener('click', () => { projSecShut[k] = d.open; });
  return d;
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
  /* What the project produced, plus what was filed here by hand: a chat's
     output lives in the global store, and filing lists it here as well. */
  const mine = allResults().filter(a => a.from === p.name || a.pj === p.id);
  /* A mode says what you are here for, and that is a fact about the project you
     opened rather than a preference — so opening another one starts at Work. */
  if (projModeFor !== p.id){ projMode = 'Work'; projThread = null; projModeFor = p.id; }

  const wrap = el('div','projwrap');
  const panel = el('aside','projpanel');
  /* The panel's two zones: what the project IS (scrolls, takes what is left)
     and what has HAPPENED (pinned at the foot, fixed height, its own scroll —
     expanding an option above never moves the record below). */
  const opts = el('div','projpanel__opts');
  const plog = el('div','projpanel__log');
  panel.append(opts, plog);
  const main = el('div','projmain');
  wrap.append(panel, main);
  /* The two columns scroll on their own, so the pane body does not. */
  body.classList.add('pane__body--split');
  body.append(wrap);

  /* ------------------------------------------------------------- identity
     Name, glyph, the description Nebulas wrote, and who can see it — the
     panel runs to the top of the pane now, so this is the one place the
     project names itself. */
  const idb = el('div','projid');
  const top = el('div','projid__top');
  top.innerHTML =
    '<span class="projid__ico">' + ic(p.icon || 'folder', 16) + '</span>' +
    '<h2 class="projid__name">' + esc(p.name) + '</h2>';
  /* Two small acts beside the name: share it, or change what it is called.
     Visibility is a fact about sharing, so it lives in the share dialog now
     rather than as a label the panel repeats on every visit. */
  const shareB = el('button','iconbtn iconbtn--xs tip tip--below', ic('share',13));
  shareB.type = 'button';
  shareB.style.marginLeft = 'auto';
  shareB.setAttribute('data-tip','Share with coworkers');
  shareB.setAttribute('aria-label','Share with coworkers');
  shareB.onclick = () => editPjShare(p);
  const penB = el('button','iconbtn iconbtn--xs tip tip--below', ic('feather',13));
  penB.type = 'button';
  penB.setAttribute('data-tip','Rename & icon');
  penB.setAttribute('aria-label','Rename & icon');
  penB.onclick = () => editPjAbout(p);
  top.append(shareB, penB);
  idb.append(top);
  if (p.desc) idb.insertAdjacentHTML('beforeend',
    '<p class="projid__desc">' + esc(p.desc) +
    (p.descAuto ? ' ' + inlineTip('Written by Nebulas from this project\'s settings, ' +
                                  'and rewritten when they change.') : '') + '</p>');
  opts.append(idb);

  /* The architecture, the same for every project: the four basic options —
     Assistant, Knowledge, Connections, Schedule — folded shut with their
     counts on the head, then what the project makes of them (Pages, Channels,
     also folded), then a full divider, and below it what has happened:
     Results and Chat History, open, because activity is what you came for. */
  const asstNames = p.assistants || (p.assistant ? [p.assistant] : []);
  const sec = panelSec(p, 'Assistants', { shut:true, count:asstNames.length,
    edit:() => editPjAsst(p), tip:'Add assistants' });
  asstNames.forEach((nm, i) => {
    const a = D.ASSISTANTS.filter(x => x.name === nm)[0];
    sec.append(listRow({
      lead:'<span class="row__icon">' + ic('agent',13) + '</span>',
      title:nm,
      sub:a ? a.model : 'Answers come from the model alone',
      /* The first one is who a new thread gets; worth saying only once there
         is a second to be told apart from. */
      meta:i === 0 && asstNames.length > 1 ? 'answers' : undefined,
      onClick:a ? () => openAssistant(a) : () => editPjAsst(p)
    }));
  });
  opts.append(sec);

  /* Two kinds of thing it may read, and the row says which: a base is documents,
     a dataset is a table. */
  const know = panelSec(p, 'Knowledge', { shut:true, count:reads.length,
    edit:() => editPjKnow(p), tip:'Add knowledge' });
  (p.kbs || []).forEach(nm => {
    const k = D.KBS.filter(x => x.name === nm)[0];
    know.append(listRow({
      lead:'<span class="row__icon">' + ic('library',13) + '</span>',
      title:nm, sub:k ? k.docs + ' documents' : 'Knowledge base', meta:'docs',
      onClick:k ? () => peekKb(k) : () => editPjKnow(p)
    }));
  });
  (p.sources || []).forEach(nm => {
    const dsx = D.DATASETS.filter(x => x.name === nm)[0];
    know.append(listRow({
      lead:'<span class="row__icon">' + ic('data',13) + '</span>',
      title:nm, sub:dsx ? dsx.source + ' · ' + dsx.rows + ' rows' : 'Source', meta:'table',
      onClick:dsx ? () => peekDs(dsx) : () => editPjKnow(p)
    }));
  });
  opts.append(know);

  /* The external systems it is granted — a row answers in a modal, like every
     row in this panel; the connection itself is still managed in Cloud. */
  const cx = panelSec(p, 'Connections', { shut:true, count:(p.conn || []).length,
    edit:() => editPjConn(p), tip:'Grant a connection' });
  (p.conn || []).forEach(id => {
    const cn = connById(id);
    if (!cn) return;
    cx.append(listRow({
      lead:dotLead(cn.state),
      title:cn.name, sub:cn.state === 'off' ? 'not connected' : cn.scope, meta:cn.kind,
      onClick:() => peekCn(cn)
    }));
  });
  opts.append(cx);

  /* What the project does without being asked: when it runs, and the script it
     runs — which is a sentence, because that is what the model is given. The
     button is there because a weekly project is hard to believe in on a
     Tuesday. */
  const auto = panelSec(p, 'Schedule', { shut:true, count:p.run ? 1 : 0,
    edit:() => editPjRun(p), tip:'Set the schedule',
    trailing:infoTip('Nebulas runs this without being asked and files each result in the results column.') });
  if (p.run){
    auto.append(listRow({
      lead:'<span class="row__icon">' + ic('clock',13) + '</span>',
      title:p.run.every, sub:runLine(p.run),
      onClick:() => editPjRun(p)
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
  }
  opts.append(auto);

  /* Pages are not a panel section: a page IS a result of the project, so it
     lives in Results below — a `page` artifact rendered live from the record,
     authored in Build. */

  /* Where it publishes. Only a project that posts has it; the writing that is
     not out yet lives inside each channel's own tab, not in a panel list. */
  if (p.channels && p.channels.length) projectChannels(opts, p);

  /* The line between IS and HAPPENED is the log zone's own top border. */
  const res = panelSec(p, 'Results', { count:mine.length });
  if (!mine.length){
    res.append(helpNote('None yet. Results the project produces land here.'));
  } else {
    mine.forEach(a => res.append(listRow({
      lead:'<span class="row__icon">' + ic(artGlyph(a),13) + '</span>',
      title:a.title, meta:stampShort(a.at), sub:artType(a) + ' · ' + a.size,
      onClick:() => openArtifact(a.id)
    })));
  }
  /* A project with a customer-facing widget designs it from here — beside the
     forms it feeds. Design only: the popup restyles, never restructures. */
  if (p.widget){
    const wb = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('widget',13) + '</span>Widget design');
    wb.type = 'button';
    wb.onclick = () => editPjWidget(p);
    res.append(rowActs([wb]));
  }
  plog.append(res);

  /* A chat opened here opens HERE: the row swaps the right-hand column to the
     conversation instead of leaving the project for the main chat. The current
     one is marked, the way the sidebar marks the thread you are in. */
  const hist = panelSec(p, 'Chat History', { count:threads.length });
  if (!threads.length){
    hist.append(helpNote('None yet. The first message you send starts one.'));
  } else {
    threads.forEach(t => hist.append(listRow({
      title:t.title, meta:t.when, current:projThread === t.id,
      onClick:() => { projThread = t.id; render(); }
    })));
  }
  plog.append(hist);

  /* ------------------------------------------------------- the right side
     Centred, because it is one column of one thing rather than a page of
     several: the mode, and whatever that mode is for. The modes are the
     project's three uses, and the tabs are the only heading it needs.

     Work and Data are the real composer, borrowed, so what it can do here is
     what it can do anywhere: attach a file, bind an assistant, route a model,
     ⌘↵. Sending opens a thread in this project and puts the message in it — see
     the submit handler in boot. */
  /* The chat column's own bar: the shell's topbar withdraws on a project (the
     panel runs to the top instead), so the two panel toggles it carried live
     here, wired to the same acts. The title names the act — a new chat or
     task starts in the box below — and becomes the thread's own title the
     moment one is opened, because sending navigates to the thread. */
  const openT = projThread ? byId(D.THREADS, projThread) : null;
  if (!openT) projThread = null;

  const bar = el('header','projmain__bar');
  if (openT){
    /* Reading a chat: the bar carries its title and the way back to a new one. */
    const back = el('button','iconbtn iconbtn--sm tip tip--below', ic('chevL',14));
    back.type = 'button';
    back.setAttribute('data-tip','Back to New Chat / Task');
    back.setAttribute('aria-label','Back to New Chat / Task');
    back.onclick = () => { projThread = null; render(); };
    bar.append(back);
  }
  bar.append(el('h2','projmain__bartitle', openT ? openT.title : 'New Chat / Task'));
  const artB = el('button','iconbtn tip tip--below',
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M15 4.5v15"/></svg>');
  artB.type = 'button';
  artB.setAttribute('data-tip','Results  ⌘.');
  artB.setAttribute('aria-label','Toggle results column');
  artB.onclick = () => setPanel('art');
  const appsB = el('button','iconbtn tip tip--below',
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/></svg>');
  appsB.type = 'button';
  appsB.setAttribute('data-tip','App panel  ⌘]');
  appsB.setAttribute('aria-label','Toggle app panel');
  appsB.onclick = toggleAppPanel;
  bar.append(artB, appsB);
  main.append(bar);

  /* An open chat replaces the mode surface: the conversation in the reading
     measure, the composer borrowed beneath it — sticky, so a long chat still
     has its box — and every turn recorded on the thread it belongs to. */
  if (openT){
    const conv = el('div','pane__measure');
    conv.style.width = '100%';
    openT.msgs.forEach(m => conv.append(msgNode(m)));
    if (!openT.msgs.length) conv.append(helpNote('Nothing said yet. The box below starts it.'));
    main.append(conv);
    /* The box is a sibling of the message column, not its last child: a turn
       streams into the column's end, and nothing may stream under the box. */
    const box = el('div','pane__ask');
    box.style.cssText = 'position:sticky;bottom:0;width:100%;max-width:var(--measure);' +
      'background:var(--bg);padding:var(--s-3) var(--s-6) var(--s-6)';
    box.append(inlineComposer('Reply in this chat…'));
    main.append(box);
    recount(openT);
    return;
  }

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
  if (p.assistant) inner.append(helpNote(p.assistant + ' answers here unless a thread picks another' +
    ((p.assistants || []).length > 1 ? ' — ' + (p.assistants.length - 1) + ' more on call in the panel' : '') + '.'));
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
        '<span class="spark spark--bars" style="width:120px;flex:none">' +
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
   Four kinds of thing are built here. Assistants and widgets point at other
   records by id; projects bind their assistant and knowledge by NAME — the
   project dialog's convention, kept rather than doubled. Strict lookups, not
   `find()` — `find()` falls back to the first item, which would quietly turn
   "nothing bound" into "the first one". */
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
function stateBadge(s){
  const badge = { live:'badge--ok', ok:'badge--ok', run:'badge--info', beta:'badge--info',
                  warn:'badge--warn', err:'badge--err', idle:'', draft:'', off:'' }[s] || '';
  const text  = { live:'Live', ok:'Live', run:'Running', beta:'Beta', warn:'Needs attention',
                  err:'Failed', idle:'Idle', draft:'Draft', off:'Not connected' }[s] || s;
  return '<span class="badge ' + badge + '">' + esc(text) + '</span>';
}

/* ----------------------------------------------------------- edit dialog
   One dialog for every setting on the assistant page. A row opens it with a
   staged copy of the values it names; the controls write only the copy, and
   the record changes when Save says so — the one place in Build where an edit
   waits for a confirmation, because the page around it is for reading. */
let editOn = null;   /* { staged, apply, title } */
function openEdit(spec){
  editOn = { staged:spec.staged, apply:spec.apply, title:spec.title, read:!!spec.read };
  $('#editIco').innerHTML = ic(spec.ico || 'gear', 16);
  $('#editTitle').textContent = spec.title;
  $('#editSub').textContent = spec.sub || '';
  /* A peek is this same dialog read-only: nothing is staged, so the foot
     withdraws and × or Escape is the whole way out. */
  $('#editScrim .dialog').classList.toggle('dialog--wide', !!spec.wide);
  $('#editScrim .dialog__foot').style.display = spec.read ? 'none' : '';
  const body = $('#editBody');
  body.innerHTML = '';
  const stack = el('div');
  stack.style.cssText = 'display:grid;gap:var(--s-4)';
  spec.build(stack, spec.staged);
  body.append(stack);
  $('#editScrim').dataset.open = 'true';
  const first = $('input:not([type=checkbox]), textarea, select', body);
  if (first) first.focus();
}
function closeEdit(){
  editOn = null;
  $('#editScrim').dataset.open = 'false';
}
function saveEdit(){
  if (!editOn || editOn.read) return;
  editOn.apply(editOn.staged);
  const what = editOn.title;
  closeEdit();
  render();
  toast(what + ' saved');
}

/* The setting editors. Each stages only the fields its rows name. */
function editAbout(a){
  openEdit({ title:'About', sub:a.name, ico:'agent',
    staged:{ name:a.name, team:a.team, desc:a.desc },
    build(body, st){
      body.append(field('Name', inputCtl(st.name, v => { st.name = v; })));
      body.append(field('Team', selectCtl(D.ASSISTANT_TEAMS, st.team, v => { st.team = v; })));
      body.append(field('Description', textareaCtl(st.desc, v => { st.desc = v; },
        'One sentence on what it is for.')));
    },
    apply(st){ a.name = st.name.trim() || a.name; a.team = st.team; a.desc = st.desc; } });
}
function editModel(a){
  /* An assistant can be pinned to a model this workspace does not offer in the
     composer, so the current value is added rather than silently replaced by
     the first option. */
  const models = D.MODELS.indexOf(a.model) > -1 ? D.MODELS : D.MODELS.concat([a.model]);
  openEdit({ title:'Model', sub:a.name, ico:'cube',
    staged:{ model:a.model, temp:a.temp },
    build(body, st){
      body.append(field('Model', selectCtl(models, st.model, v => { st.model = v; }),
        'A thread can still route a single turn elsewhere.'));
      const row = el('div');
      row.style.cssText = 'display:flex;align-items:center;gap:var(--s-3)';
      const r = el('input','range');
      r.type = 'range'; r.min = '0'; r.max = '1'; r.step = '0.1';
      r.value = String(st.temp);
      const v = el('span','t-mono', st.temp.toFixed(1));
      r.oninput = () => { st.temp = parseFloat(r.value); v.textContent = st.temp.toFixed(1); };
      row.append(r, v);
      body.append(field('Temperature', row,
        'Low repeats itself, high explores. Analysis wants it cold.'));
    },
    apply(st){
      a.model = st.model; a.temp = st.temp;
      a.opts.think = st.model.indexOf('extended') > -1;
    } });
}
function editKb(a){
  const kbNames = ['— none —'].concat(D.KBS.map(k => k.name));
  openEdit({ title:'Knowledge base', sub:a.name, ico:'library',
    staged:{ kb:a.kb },
    build(body, st){
      body.append(field('Knowledge base', selectCtl(kbNames, st.kb || '— none —', v => {
        st.kb = v === '— none —' ? null : v;
      }), 'The only corpus it may cite.'));
    },
    apply(st){ a.kb = st.kb; } });
}
function editInst(a){
  openEdit({ title:'Instructions', sub:a.name, ico:'filetext',
    staged:{ inst:a.inst },
    build(body, st){
      body.append(field('Instructions', textareaCtl(st.inst, v => { st.inst = v; },
        'What it must do, and what it must refuse to do.'),
        'Read before every turn. State the refusals — they are the half that holds under pressure.'));
    },
    apply(st){ a.inst = st.inst; } });
}
function editSkills(a){
  /* Skills an assistant names but the workspace has not defined are shown as
     such rather than dropped: the gap belongs on screen, not in a filter. */
  const defined = D.SKILLS.map(x => x.name);
  const undef = a.skills.filter(n => defined.indexOf(n) < 0);
  const items = D.SKILLS.map(x => ({ nm:x.name, sub:x.desc, meta:x.avg, id:x.name }))
    .concat(undef.map(n => ({ nm:n, sub:'not defined in this workspace', meta:'—', id:n })));
  openEdit({ title:'Skills', sub:a.name, ico:'tool',
    staged:{ skills:a.skills.slice() },
    build(body, st){
      body.append(pickList(items,
        it => st.skills.indexOf(it.id) > -1,
        (it, on) => {
          st.skills = on ? st.skills.concat([it.id]) : st.skills.filter(n => n !== it.id);
        }));
      if (undef.length){
        body.append(banner('warn', '<strong>' + esc(undef.join(', ')) +
          '</strong> ' + (undef.length === 1 ? 'is named here but has no definition' :
          'are named here but have no definitions') + ' in Skills. Calls to ' +
          (undef.length === 1 ? 'it' : 'them') + ' will fail at run time.'));
      }
    },
    apply(st){ a.skills = st.skills; } });
}
function editConn(a){
  openEdit({ title:'Connectors', sub:a.name, ico:'plug',
    staged:{ conn:a.conn.slice() },
    build(body, st){
      body.append(pickList(
        D.CONNECTORS.map(c => ({
          nm:c.name, sub:c.state === 'off' ? 'not connected — grant it here, connect it in Cloud' : c.scope,
          meta:c.kind, id:c.id
        })),
        it => st.conn.indexOf(it.id) > -1,
        (it, on) => {
          st.conn = on ? st.conn.concat([it.id]) : st.conn.filter(x => x !== it.id);
        }));
      body.append(noteP('A grant is not a connection. Granting one that is not connected is allowed — it states what this assistant will need. Connecting it is done in Cloud → Connections, usually by someone else.'));
    },
    apply(st){ a.conn = st.conn; } });
}
function editOpts(a){
  openEdit({ title:'Behaviour', sub:a.name, ico:'gear',
    staged:{ cite:a.opts.cite, confirm:a.opts.confirm, think:a.opts.think },
    build(body, st){
      [['cite','Attach a source to every claim'],
       ['confirm','Confirm before writing anything outside the workspace'],
       ['think','Extended thinking']].forEach(([k, label]) => {
        const sw = switchCtl(label, st[k]);
        $('input', sw).onchange = e => { st[k] = e.target.checked; };
        body.append(sw);
      });
    },
    apply(st){ a.opts.cite = st.cite; a.opts.confirm = st.confirm; a.opts.think = st.think; } });
}

/* A setting shown as a fact: label, current value, and the chevron that says
   the row itself is the editor's door. */
function setRow(label, value, onClick){
  const b = el('button','setrow');
  b.type = 'button';
  b.innerHTML =
    '<span class="setrow__k">' + esc(label) + '</span>' +
    '<span class="setrow__v">' + value + '</span>' +
    '<span class="setrow__go">' + ic('chevR',13) + '</span>';
  b.onclick = onClick;
  return b;
}

/* ------------------------------------------------------------ test bench
   The right column of the assistant page: a conversation with the record as
   configured. Its thread is a scratch object per assistant — it survives
   re-renders but never enters History, because a rehearsal is not work. */
const testThreads = {};
function testThread(a){
  if (!testThreads[a.id]) testThreads[a.id] = { title:'test', msgs:[] };
  return testThreads[a.id];
}
/* The reply runs the question through the actual configuration — the steps
   name what is bound, the answer names what each binding did — so changing a
   setting on the left visibly changes the next answer on the right. */
function testScript(text, a){
  const steps = [{ n:'inst.read', d:'reading the instructions', t:'0.3s' }];
  if (a.opts.think) steps.push({ n:'think', d:'extended thinking', t:'1.1s' });
  if (a.kb) steps.push({ n:'kb.search', d:'searching ' + a.kb, t:'0.8s' });
  const low = ' ' + text.toLowerCase() + ' ';
  const sk = a.skills.filter(n =>
    n.split(/[._]/).some(w => w.length > 3 && low.indexOf(w) >= 0))[0] || a.skills[0];
  if (sk) steps.push({ n:sk, d:'called with your question', t:'0.9s' });
  steps.push({ n:'compose', d:'drafting the answer', t:'0.4s' });

  const lines = ['Answering as **' + a.name + '** — the real configuration, simulated output.', ''];
  lines.push(a.kb
    ? '- Drawn only from **' + a.kb + '**. A claim that corpus cannot back would be named as missing, not filled in.'
    : '- No knowledge base is bound, so this leans on the model alone — bind one on the left if it should cite a corpus.');
  if (sk) lines.push('- `' + sk + '` did the work the corpus could not.');
  if (a.opts.confirm) lines.push('- Anything that writes outside the workspace stops here and asks first.');
  if (!a.opts.cite && a.kb) lines.push('- Sources are not attached — that is the *cite* switch, currently off.');
  const reply = { steps:steps, md:lines.join('\n') };
  if (a.opts.cite && a.kb) reply.cites = [{ n:a.kb, s:'knowledge' }];
  return reply;
}

/* The bench itself, shared by the assistant and project pages — the same
   pane parameterised, the way runTurn is one engine with many hosts. Returns
   {try} so the page's own example chips can run a prompt in it. */
function testBench(side, cfg){
  const th = cfg.th;
  const bh = el('div','build__sidehead',
    '<span class="t-eyebrow">Try it</span>' +
    '<span class="t-mono">' + (th.msgs.length ? plural(th.msgs.length / 2, 'turn') : '') + '</span>');
  if (th.msgs.length){
    const reset = el('button','iconbtn iconbtn--xs tip', ic('undo',12));
    reset.setAttribute('data-tip','Start over');
    reset.onclick = () => { th.msgs.length = 0; render(); };
    bh.append(reset);
  }
  side.append(bh);

  const log = el('div','testbench__log');
  log.id = 'testLog';
  const submit = () => {
    const v = input.value.trim();
    if (!v || state.busy) return;
    input.value = '';
    runTurn(v, cfg.script(v), {
      host:log, thread:th, who:cfg.who,
      scroll:() => log.scrollTo({ top:log.scrollHeight, behavior:'instant' }),
      busy:on => {
        send.disabled = on; input.disabled = on;
        if (!on){
          input.focus();
          /* The head's count is drawn at render; keep it true between them. */
          $('.t-mono', bh).textContent = plural(th.msgs.length / 2, 'turn');
        }
      }
    });
  };
  if (!th.msgs.length){
    const hint = emptyState('play','Try it before you ship it', cfg.hint);
    const chips = el('div');
    chips.style.cssText = 'display:flex;flex-direction:column;gap:var(--s-2);margin-top:var(--s-4);align-items:center';
    cfg.starters.forEach(t => {
      const c = el('button','chip','<span>' + esc(t) + '</span>');
      c.type = 'button';
      c.onclick = () => { input.value = t; submit(); };
      chips.append(c);
    });
    hint.append(chips);
    log.append(hint);
  } else {
    th.msgs.forEach(m => log.append(msgNode(m)));
    log.scrollTop = log.scrollHeight;
  }
  side.append(log);

  const ask = el('div','testbench__ask');
  const input = el('textarea','textarea');
  input.id = 'testInput';
  input.rows = 2;
  input.placeholder = cfg.placeholder;
  const send = el('button','btn btn--primary btn--sm','Send');
  send.type = 'button';
  send.onclick = submit;
  input.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); submit(); }
  };
  ask.append(input, send);
  side.append(ask);
  side.append(noteP('A test stays here — it never enters History, and it never edits the record.'));
  return { try:t => { input.value = t; submit(); } };
}

/* ------------------------------------------------------- assistant builder
   The same record the chat sidebar lists. Read first, test beside, edit
   through a dialog: the left column states the configuration as facts, the
   right column talks to it, and a row's dialog is where changes wait for
   Save. */
function assistantBuildView(body, a){
  /* Pinned to the pane like the project page: the panels scroll, the page
     does not, and the bench keeps the screen while the facts are read. */
  body.classList.add('pane__body--split');
  const s = buildSplit();
  s.wrap.classList.add('build--test');

  /* ------------------------------------------------ the record, as facts
     No page head — the name and description are facts like the rest, so the
     About rows carry them and the topbar already says where you are. */
  const connName = id => find(D.CONNECTORS, id).name;
  const onSwitches = [a.opts.cite && 'cites sources', a.opts.confirm && 'confirms writes',
                      a.opts.think && 'extended thinking'].filter(Boolean).join(' · ');

  const about = el('section','section');
  about.append(sectionHead('About', stateBadge(a.state)));
  const l1 = el('div','setlist');
  l1.append(setRow('Name', esc(a.name), () => editAbout(a)));
  l1.append(setRow('Team', esc(a.team), () => editAbout(a)));
  l1.append(setRow('Description', esc(a.desc), () => editAbout(a)));
  about.append(l1);
  s.main.append(about);

  const engine = el('section','section');
  engine.append(sectionHead('Model & knowledge'));
  const l2 = el('div','setlist');
  l2.append(setRow('Model', esc(a.model), () => editModel(a)));
  l2.append(setRow('Temperature',
    a.temp.toFixed(1) + (a.temp <= 0.1 ? ' — deterministic' : a.temp >= 0.5 ? ' — exploratory' : ' — steady'),
    () => editModel(a)));
  l2.append(setRow('Knowledge base',
    a.kb ? esc(a.kb) : '<span style="color:var(--warn)">none — it answers from the model alone</span>',
    () => editKb(a)));
  l2.append(setRow('Instructions', esc(a.inst || '—'), () => editInst(a)));
  engine.append(l2);
  s.main.append(engine);

  /* Each skill is stated with what it does and its worked examples — and an
     example is a button: it runs in the bench, because trying the capability
     is what an example next to a test bench is for. */
  const caps = el('section','section');
  caps.append(sectionHead('Capabilities'));
  const l3 = el('div','setlist');
  if (!a.skills.length){
    l3.append(setRow('Skills',
      '<span style="color:var(--warn)">none — it can only talk</span>', () => editSkills(a)));
  }
  a.skills.forEach(n => {
    const sk = D.SKILLS.filter(x => x.name === n)[0];
    const wrap = el('div','caprow');
    const head = el('button','caprow__head');
    head.type = 'button';
    head.innerHTML =
      '<span class="caprow__nm">' + esc(n) + '</span>' +
      '<span class="caprow__desc">' + esc(sk ? sk.desc : 'not defined in this workspace') + '</span>' +
      '<span class="setrow__go">' + ic('chevR',13) + '</span>';
    head.onclick = () => editSkills(a);
    wrap.append(head);
    const exs = (a.ex && a.ex[n]) || [];
    if (exs.length){
      const chips = el('div','caprow__chips');
      exs.forEach(t => {
        const c = el('button','chip','<span>' + esc(t) + '</span>');
        c.type = 'button';
        c.onclick = () => bench.try(t);
        chips.append(c);
      });
      wrap.append(chips);
    }
    l3.append(wrap);
  });
  l3.append(setRow('Connectors',
    a.conn.length ? esc(a.conn.map(connName).join(' · ')) : 'none granted',
    () => editConn(a)));
  l3.append(setRow('Behaviour', onSwitches ? esc(onSwitches) : 'defaults — nothing switched on',
    () => editOpts(a)));
  caps.append(l3);
  /* Skills the record names but the workspace has not defined: the gap belongs
     on the page, not only inside the dialog. */
  const undef = a.skills.filter(n => D.SKILLS.map(x => x.name).indexOf(n) < 0);
  if (undef.length){
    const b = banner('warn', '<strong>' + esc(undef.join(', ')) +
      '</strong> ' + (undef.length === 1 ? 'is named here but has no definition' :
      'are named here but have no definitions') + ' in Skills. Calls to ' +
      (undef.length === 1 ? 'it' : 'them') + ' will fail at run time.');
    b.style.margin = 'var(--s-3) 0 0';
    caps.append(b);
  }
  s.main.append(caps);

  /* Projects bind assistants BY NAME (the project dialog's convention). */
  const pjs = D.PROJECTS.filter(p => (p.assistants || []).indexOf(a.name) > -1 || p.assistant === a.name);
  s.main.append(usedBySection('Answers in', pjs.map(p => ({
    ic:p.icon, nm:p.name, sub:p.shared ? 'shared project' : 'personal project',
    go:() => select('build', key('pj', p.id))
  })), 'Bind it to a project and it answers for everyone working there.'));

  const star = el('button','btn btn--secondary',
    ic(a.fav ? 'starOn' : 'star', 13) + (a.fav ? 'In the composer' : 'Add to composer'));
  star.onclick = () => { a.fav = !a.fav; render(); renderComposer(); };
  const opt = el('button','btn btn--secondary', ic('spark',13) + 'Optimize in chat');
  opt.onclick = () => openMaker('as', a);
  const open = el('button','btn btn--ghost', ic('chat',13) + 'Open in a thread');
  open.onclick = () => {
    state.assistant = a.id;
    renderComposer();
    newThread();
    toast('New thread bound to ' + a.name);
  };
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
  const acts = el('div');
  acts.style.cssText = 'display:flex;gap:var(--s-2);flex-wrap:wrap;margin-top:var(--s-6)';
  acts.append(opt, star, open, dup);
  s.main.append(acts);

  /* ------------------------------------------------------------ the bench */
  const bench = testBench(s.side, {
    th:testThread(a), who:a.name,
    placeholder:'Ask ' + a.name + '…',
    hint:'Ask what a user would ask. The reply runs through the configuration on the left — change a setting and the next answer changes with it.',
    starters:asstPrompts(a).slice(0, 2),
    script:v => testScript(v, a)
  });

  body.append(s.wrap);
}

/* The draft* functions make the record and nothing else — the maker overlay
   drafts without navigating — and the new* pair adds the navigation Build's
   own flows want. */
function draftAssistant(){
  const a = {
    id:'as-n' + (++madeN), name:'Untitled assistant', state:'draft', model:D.MODELS[0],
    team:D.ASSISTANT_TEAMS[0], fav:false, threads:0, temp:0.2,
    desc:'No description yet.', skills:[], kb:null, conn:[],
    opts:{ cite:true, confirm:true, think:false }, inst:''
  };
  D.ASSISTANTS.push(a);
  return a;
}
function newAssistant(){
  select('build', key('as', draftAssistant().id));
}

function draftDesign(kind, shape){
  const tpl = kind === 'template';
  const d = tpl ? {
    id:'de-n' + (++madeN), name:'Untitled result template', kind:'template', shape:shape || 'landing',
    state:'draft', team:D.ASSISTANT_TEAMS[0],
    desc:'A new result template. Everything about it is set in the inspector.',
    cfg:{ title:'Untitled', sub:'', cta:'Get started', nav:'Home, Docs, Pricing',
          sections:'Summary, Detail, Actions', footer:'',
          accent:'Nebulas', radius:'Soft', theme:'Follow', width:'Wide',
          header:true, credit:true }
  } : {
    id:'de-n' + (++madeN), name:'Untitled widget', kind:'widget', shape:shape || 'kpi',
    state:'draft', team:D.ASSISTANT_TEAMS[0],
    desc:'A new metric tile. Everything about it is set in the inspector.',
    cfg:{ title:'Untitled', sub:'', accent:'Nebulas', radius:'Soft', theme:'Follow',
          width:'Narrow', header:true, credit:true,
          value:'—', delta:'', cap:'', placeholder:'', starters:'' }
  };
  D.DESIGNS.push(d);
  return d;
}
function newDesign(kind){
  const d = draftDesign(kind);
  select('build', key(kind === 'template' ? 'tp' : 'wg', d.id));
  return d;
}

function draftProject(){
  const p = {
    id:'p' + (++projN), name:'Untitled project', icon:'folder', shared:false,
    desc:'No description yet.', descAuto:true,
    assistant:null, kbs:[], sources:[], conn:[], run:null,
    code:[], pages:[], when:'now'
  };
  D.PROJECTS.unshift(p);
  return p;
}

/* No `kind` field anywhere: a project is basic until code and pages are
   switched on, the same way `run` makes it an application. The word exists
   only so prose can say it. */
const projKind = p => (p.pages && p.pages.length) ? 'advanced' : 'basic';
/* A page's parts, resolved: the preset copy it runs and the template it is
   laid out on. Either can be missing — a deleted preset, an unpicked layout —
   and the callers say so instead of hiding the row. */
const pageLogic = (p, pg) => (p.code || []).filter(c => c.id === pg.logic)[0] || null;
const pageTemplate = pg => D.DESIGNS.filter(d => d.id === pg.template && d.kind === 'template')[0] || null;

/* --------------------------------------------------------- project builder
   The same record the chat sidebar lists — Build defines it, the project page
   works in it. Projects bind their assistant, knowledge and tables BY NAME
   (the project dialog's convention, kept rather than doubled), and external
   systems by connector id — the same grant-not-connection language an
   assistant uses. */
/* --------------------------------------------------- project as facts too
   The assistant page's structure, applied: facts on the left, the bench on
   the right, dialogs that stage and Save. The record is still the sidebar's
   own project — one store, no twin. */
function editPjAbout(p){
  openEdit({ title:'About', sub:p.name, ico:'folder',
    staged:{ name:p.name, icon:p.icon },
    build(body, st){
      body.append(field('Name', inputCtl(st.name, v => { st.name = v; })));
      body.append(field('Icon', selectCtl(PROJ_ICONS, st.icon, v => { st.icon = v; }),
        'Named after the kind of work, in the sidebar.'));
    },
    apply(st){
      const nm = st.name.trim() || p.name;
      /* The schedule row keeps its own name, but it targets this project. */
      const row = p.run && p.run.sched && find(D.SCHEDULE, p.run.sched);
      if (row) row.target = nm;
      p.name = nm; p.icon = st.icon;
      refreshDesc(p);
    } });
}

/* Sharing: named coworkers by email, or the whole workspace with one switch.
   Nothing is sent — like every outward act here, it is simulated — but the
   list is real state, so the sidebar flag and the Build page report it. */
function editPjShare(p){
  openEdit({ title:'Share', sub:p.name, ico:'share',
    staged:{ people:(p.people || []).slice(), shared:!!p.shared },
    build(body, st){
      const list = el('div');
      list.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s-2)';
      const draw = () => {
        list.innerHTML = '';
        st.people.forEach(em => {
          const c = el('span','chip chip--removable', esc(em));
          const x = el('button','chip__x', ic('x',11));
          x.type = 'button';
          x.setAttribute('aria-label','Remove ' + em);
          x.onclick = () => { st.people = st.people.filter(v => v !== em); draw(); };
          c.append(x);
          list.append(c);
        });
        if (!st.people.length) list.append(el('span','field__help','No one yet.'));
      };
      const row = el('div');
      row.style.cssText = 'display:flex;gap:var(--s-2)';
      const inp = el('input','input');
      inp.type = 'email';
      inp.placeholder = 'coworker@' + (D.ACCOUNT.email.split('@')[1] || 'example.com');
      const add = el('button','btn btn--secondary','Invite');
      add.type = 'button';
      const commit = () => {
        const v = inp.value.trim();
        if (!v) return;
        if (v.indexOf('@') < 1) return toast('That is not an email address');
        if (st.people.indexOf(v) < 0) st.people.push(v);
        inp.value = '';
        draw();
      };
      add.onclick = commit;
      inp.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); commit(); } };
      row.append(inp, add);
      body.append(field('Invite by email', row,
        'They can open the project, its threads and its results.'));
      body.append(list);
      draw();
      const sw = switchCtl('Share with everyone at ' + D.ACCOUNT.org, st.shared);
      $('input', sw).onchange = e => { st.shared = e.target.checked; };
      body.append(sw);
      body.append(noteP('Invitations are simulated here, like everything that would leave the page.'));
    },
    apply(st){ p.people = st.people; p.shared = st.shared; } });
}
function editPjAsst(p){
  /* Pick as many as the work needs — the list is a checklist like Knowledge,
     not a dropdown, and there is no cap. The staging concat keeps the order
     they were picked in, and the first one answers by default. */
  openEdit({ title:'Assistants', sub:p.name, ico:'agent',
    staged:{ assistants:(p.assistants || []).slice() },
    build(body, st){
      body.append(pickList(
        D.ASSISTANTS.map(a => ({ nm:a.name, sub:a.desc, meta:a.team, id:a.name })),
        it => st.assistants.indexOf(it.id) > -1,
        (it, on) => {
          st.assistants = on ? st.assistants.concat([it.id])
                             : st.assistants.filter(n => n !== it.id);
        }));
      body.append(noteP('As many as you like. The first one picked answers new threads unless a thread picks another.'));
    },
    apply(st){
      p.assistants = st.assistants;
      p.assistant = st.assistants[0] || null;
      /* The schedule row names its assistant; keep it true. */
      if (p.run) syncProjectRun(p, p.run.sched);
      refreshDesc(p);
    } });
}
function editPjKnow(p){
  openEdit({ title:'Knowledge', sub:p.name, ico:'library',
    staged:{ kbs:(p.kbs || []).slice(), sources:(p.sources || []).slice() },
    build(body, st){
      body.append(pickList(
        D.KBS.map(k => ({ nm:k.name, sub:k.docs + ' documents', meta:'docs', id:k.name }))
          .concat(D.DATASETS.map(t => ({ nm:t.name, sub:t.desc, meta:'table', id:t.name }))),
        it => st.kbs.indexOf(it.id) > -1 || st.sources.indexOf(it.id) > -1,
        (it, on) => {
          const list = D.KBS.some(k => k.name === it.id) ? st.kbs : st.sources;
          const i = list.indexOf(it.id);
          if (on && i < 0) list.push(it.id);
          if (!on && i > -1) list.splice(i, 1);
        }));
      body.append(noteP('Bases it cites and tables it reads, both by name.'));
    },
    apply(st){ p.kbs = st.kbs; p.sources = st.sources; refreshDesc(p); } });
}
function editPjConn(p){
  openEdit({ title:'Connections', sub:p.name, ico:'plug',
    staged:{ conn:(p.conn || []).slice() },
    build(body, st){
      body.append(pickList(
        D.CONNECTORS.map(c => ({
          nm:c.name, sub:c.state === 'off' ? 'not connected — grant it here, connect it in Cloud' : c.scope,
          meta:c.kind, id:c.id
        })),
        it => st.conn.indexOf(it.id) > -1,
        (it, on) => {
          const i = st.conn.indexOf(it.id);
          if (on && i < 0) st.conn.push(it.id);
          if (!on && i > -1) st.conn.splice(i, 1);
        }));
      body.append(noteP('A grant is not a connection. Granting one that is not connected is allowed — ' +
        'it states what this project will need. Connecting it is done in Cloud → Connections.'));
    },
    apply(st){ p.conn = st.conn; refreshDesc(p); } });
}

/* --------------------------------------------------------------- peeks
   A row under a project subheading answers here, in this modal, instead of
   leaving the project: the panel reads what the project has, and the thing
   itself is still managed on its own page. Read-only, so no foot. */
function peekKb(k){
  openEdit({ title:k.name, sub:k.docs + ' documents · updated ' + k.updated,
    ico:'library', read:true, wide:true, staged:{},
    build(body){
      if (k.desc) body.append(noteP(k.desc));
      if (k.health === 'warn'){
        body.append(banner('warn','This base is still on <strong>' + esc(k.embed) +
          '</strong>. Retrieval will not match the other bases until the re-embed clears.'));
        body.lastChild.style.marginBottom = '0';
      }
      body.append(defList([
        ['Embedding', '<span class="t-mono">' + esc(k.embed) + '</span>'],
        ['Used by', esc(plural(D.ASSISTANTS.filter(a => a.kb === k.name).length, 'assistant'))]
      ]));
      body.append(tableSection('Files', ['Name','From','Size','Status'],
        k.files.map(f => [
          '<td><span style="display:flex;align-items:center;gap:var(--s-2)">' +
            '<span style="display:flex;color:var(--text-4)">' + ic(fileIcon(f.n),14) + '</span>' +
            esc(f.n) + '</span></td>',
          '<td>' + esc(f.from) + '</td>',
          '<td class="t-mono">' + esc(f.size) + '</td>',
          '<td>' + stateCell(f.st) + '</td>'
        ])));
    } });
}
function peekDs(d){
  openEdit({ title:d.name, sub:d.source + ' · ' + d.rows + ' rows · updated ' + d.updated,
    ico:'data', read:true, wide:true, staged:{},
    build(body){
      if (d.desc) body.append(noteP(d.desc));
      if (d.health === 'warn'){
        body.append(banner('warn','The June backfill is incomplete. Aggregations over Q2 will undercount.'));
        body.lastChild.style.marginBottom = '0';
      }
      body.append(defList([
        ['Columns', esc(String(d.schema.length))],
        ['Access', esc(d.grant)]
      ]));
      body.append(tableSection('Schema', ['Column','Type','Example'],
        d.schema.map(r => [
          '<td style="font-family:var(--mono);color:var(--text)">' + esc(r[0]) + '</td>',
          '<td style="font-family:var(--mono)">' + esc(r[1]) + '</td>',
          '<td class="t-mono">' + esc(r[3]) + '</td>'
        ])));
      body.append(tableSection('Preview',
        d.schema.slice(0, d.preview[0].length).map(c => c[0]),
        d.preview.map(r => r.map(v => '<td style="font-family:var(--mono)">' + esc(v) + '</td>')),
        '<span class="t-mono">first ' + d.preview.length + ' rows</span>'));
    } });
}
function peekCn(c){
  openEdit({ title:c.name, sub:c.kind + ' · ' + (c.state === 'off' ? 'not connected' : 'last used ' + c.last),
    ico:'plug', read:true, staged:{},
    build(body){
      if (c.desc) body.append(noteP(c.desc));
      if (c.note){
        body.append(banner('warn', esc(c.note)));
        body.lastChild.style.marginBottom = '0';
      }
      body.append(defList([
        ['State', stateBadge(c.state)],
        ['Endpoint', '<span class="t-mono" style="word-break:break-all">' + esc(c.endpoint) + '</span>'],
        ['Auth', esc(c.auth)],
        ['Scope', esc(c.scope)],
        ['Writes', c.writes ? 'allowed' : 'read only'],
        ['Calls', '<span class="t-mono">' + esc(c.calls) + '</span>']
      ]));
      body.append(noteP('The connection itself is managed in Cloud → Connections.'));
    } });
}

/* The widget's design dialog: a live preview above the controls that change
   it — logo, tone, the fixed lines. The tones are the workspace accent
   schemes worn via data-accent, so every colour in the preview is a token.
   Nothing here reaches the widget's data structure: the fields and where the
   entries land are the forms', and the note says so. */
function chatWidgetNode(w){
  const n = el('div','chatwig');
  n.setAttribute('data-accent', w.tone || 'nebula');
  n.innerHTML =
    '<div class="chatwig__head">' +
      '<span class="chatwig__logo">' + esc(w.logo || 'GD') + '</span>' +
      '<span class="chatwig__title">' + esc(w.title || 'Support') + '</span>' +
      '<span class="dot dot--ok"></span>' +
    '</div>' +
    '<div class="chatwig__body">' +
      '<div class="chatwig__msg">' + esc(w.greet || 'Hi — how can I help?') + '</div>' +
      '<div class="chatwig__msg chatwig__msg--user">Where do I find my invoices?</div>' +
      '<div class="chatwig__msg">Billing → Invoices lists every one; each row downloads as a PDF.</div>' +
    '</div>' +
    '<div class="chatwig__ask">' + esc(w.placeholder || 'Type your question…') + '</div>';
  return n;
}
function editPjWidget(p){
  const TONES = ['nebula','ocean','forest','ember','plum'];
  openEdit({ title:'Widget design', sub:p.name, ico:'widget', wide:true,
    staged:Object.assign({}, p.widget),
    build(body, st){
      const prev = el('div');
      const draw = () => { prev.innerHTML = ''; prev.append(chatWidgetNode(st)); };
      draw();
      body.append(field('Preview', prev, 'Redrawn as you type — this is the widget as customers meet it.'));
      /* Live controls: oninput repaints only the preview, so the caret is
         safe — the staged copy still saves or discards as one act. */
      const live = (ctl, put) => {
        ctl.oninput = () => { put(ctl.value); draw(); };
        return ctl;
      };
      body.append(field('Logo',
        live(inputCtl(st.logo, () => {}), v => { st.logo = v.slice(0, 2).toUpperCase(); }),
        'Up to two letters, worn in the widget’s corner.'));
      const row = el('div');
      row.style.cssText = 'display:flex;gap:var(--s-2)';
      const paint = () => $$('.swatch', row).forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.tone === st.tone)));
      TONES.forEach(tn => {
        const b = el('button','swatch');
        b.type = 'button';
        b.dataset.tone = tn;
        b.setAttribute('data-accent', tn);
        b.title = tn;
        b.setAttribute('aria-label', tn);
        b.onclick = () => { st.tone = tn; paint(); draw(); };
        row.append(b);
      });
      paint();
      body.append(field('Colour', row, 'The workspace accent schemes — the widget wears one.'));
      body.append(field('Title', live(inputCtl(st.title, () => {}), v => { st.title = v; })));
      body.append(field('Greeting', live(textareaCtl(st.greet, () => {}), v => { st.greet = v; })));
      body.append(field('Input placeholder', live(inputCtl(st.placeholder, () => {}), v => { st.placeholder = v; })));
      body.append(noteP('Design only. The questions it asks, the fields it records and where ' +
        'entries land are the widget’s data structure, and it does not change here.'));
    },
    apply(st){ p.widget = st; } });
}

function editPjRun(p){
  openEdit({ title:'Auto program', sub:p.name, ico:'clock',
    staged:{ on:!!p.run, every:(p.run && p.run.every) || 'Every week',
             ask:(p.run && p.run.ask) || 'Summarise what changed in ' + p.name + '.' },
    build(body, st){
      const sw = switchCtl('Produce a result on a schedule', st.on);
      $('input', sw).onchange = e => { st.on = e.target.checked; };
      body.append(sw);
      const cad = el('div');
      cad.append(segCtl(CADENCE, st.every, v => { st.every = v; }));
      body.append(field('How often', cad));
      body.append(field('What it produces', textareaCtl(st.ask, v => { st.ask = v; },
        'What should each run make?')));
      body.append(noteP('Each run files its result in the results column and appears in Chat → Schedule.'));
    },
    apply(st){
      const prev = p.run && p.run.sched;
      p.run = st.on ? { every:st.every, ask:st.ask, sched:prev } : null;
      syncProjectRun(p, prev);
      refreshDesc(p);
    } });
}

/* ------------------------------------------------------------- preset code
   Granting copies the library row onto the project; the copy is what a page
   runs and what Build may edit. The library is never edited from here — the
   same one-way street as a connector grant, except the copy then lives its
   own life. Ungranting removes the copy; a page left pointing at nothing says
   so on the page rather than being cleaned up silently. */
function editPjCodeGrant(p){
  openEdit({ title:'Preset code', sub:p.name, ico:'code',
    staged:{ from:(p.code || []).map(c => c.from) },
    build(body, st){
      body.append(pickList(
        D.SNIPPETS.map(sn => ({ nm:sn.name, sub:sn.desc, meta:sn.lang, id:sn.id })),
        it => st.from.indexOf(it.id) > -1,
        (it, on) => {
          st.from = on ? st.from.concat([it.id]) : st.from.filter(x => x !== it.id);
        }));
      body.append(noteP('A preset is platform code. Granting one copies it into this project, ' +
        'where each row below becomes editable; the library copy stays as it ships.'));
    },
    apply(st){
      p.code = (p.code || []).filter(c => st.from.indexOf(c.from) > -1);
      st.from.forEach(id => {
        if (p.code.some(c => c.from === id)) return;
        const sn = find(D.SNIPPETS, id);
        p.code.push({ id:'pc-n' + (++madeN), from:sn.id, edited:false,
                      name:sn.name, lang:sn.lang, desc:sn.desc, code:sn.code });
      });
      refreshDesc(p);
    } });
}
function editPjCode(p, c){
  const shipped = D.SNIPPETS.filter(s => s.id === c.from)[0];
  openEdit({ title:c.name, sub:p.name + ' · preset code', ico:'code',
    staged:{ code:c.code },
    build(body, st){
      const t = el('textarea','textarea textarea--code');
      t.value = st.code;
      t.rows = 10;
      /* The preview is the honest half of the pair: what the page will read is
         shown highlighted as it is typed, not after. */
      const prev = codeCard(st.code);
      t.oninput = () => {
        st.code = t.value;
        $('pre', prev).innerHTML = highlight(st.code);
      };
      body.append(field('The code', t,
        'This project\'s own copy. Pages here that pick ' + c.name + ' run exactly this.'));
      body.append(prev);
      if (shipped){
        const back = el('button','btn btn--ghost btn--sm', ic('undo',13) + 'Restore the library copy');
        back.type = 'button';
        back.onclick = () => { st.code = shipped.code; t.value = shipped.code;
                               $('pre', prev).innerHTML = highlight(shipped.code); };
        body.append(rowActs([back]));
      }
    },
    apply(st){
      c.code = st.code;
      c.edited = !shipped || st.code !== shipped.code;
    } });
}

/* -------------------------------------------------------------- the pages
   A page is three bindings: a result template for the layout, one of the
   project's presets for the logic, and the tables the logic reads. The logic
   list offers only what this project has granted — requirements change by
   changing which preset the page picks, not by editing the page. */
function editPjPage(p, pg){
  const fresh = !pg;
  if (!pg) pg = { id:'pg-n' + (++madeN), name:'Untitled page', template:null,
                  logic:(p.code[0] || {}).id || null, sources:[], state:'draft' };
  const tpls = D.DESIGNS.filter(d => d.kind === 'template');
  openEdit({ title:fresh ? 'New page' : pg.name, sub:p.name + ' · output page', ico:'template',
    staged:{ name:pg.name, template:pg.template, logic:pg.logic,
             sources:pg.sources.slice(), live:pg.state === 'live' },
    build(body, st){
      body.append(field('Name', inputCtl(st.name, v => { st.name = v; })));
      const tplNames = ['— none —'].concat(tpls.map(t => t.name));
      const tplCur = (tpls.filter(t => t.id === st.template)[0] || {}).name || '— none —';
      body.append(field('Layout', selectCtl(tplNames, tplCur, v => {
        st.template = (tpls.filter(t => t.name === v)[0] || {}).id || null;
      }), 'A result template — how the page looks. Made in Build → Result templates.'));
      const lgNames = ['— none —'].concat(p.code.map(c => c.name));
      const lgCur = (p.code.filter(c => c.id === st.logic)[0] || {}).name || '— none —';
      body.append(field('Logic', selectCtl(lgNames, lgCur, v => {
        st.logic = (p.code.filter(c => c.name === v)[0] || {}).id || null;
      }), p.code.length ? 'One of this project\'s presets — how the page computes.'
                        : 'Nothing to pick: grant a preset first, under Preset code.'));
      body.append(field('Reads', pickList(
        D.DATASETS.map(t => ({ nm:t.name,
          sub:(p.sources || []).indexOf(t.name) > -1 ? t.desc : 'not on the project shelf — bind it under Knowledge',
          meta:'table', id:t.name })),
        it => st.sources.indexOf(it.id) > -1,
        (it, on) => {
          st.sources = on ? st.sources.concat([it.id]) : st.sources.filter(x => x !== it.id);
        })));
      const sw = switchCtl('Published — live at a URL, rebuilt on every run', st.live);
      $('input', sw).onchange = e => { st.live = e.target.checked; };
      body.append(sw);
      if (!fresh){
        const rm = el('button','btn btn--ghost btn--sm', ic('trash',13) + 'Remove the page');
        rm.type = 'button';
        rm.onclick = () => {
          p.pages = p.pages.filter(x => x.id !== pg.id);
          closeEdit(); render(); toast('Page removed — ' + pg.name);
        };
        body.append(rowActs([rm]));
      }
    },
    apply(st){
      pg.name = st.name.trim() || pg.name;
      pg.template = st.template; pg.logic = st.logic; pg.sources = st.sources;
      pg.state = st.live ? 'live' : 'draft';
      pg.url = st.live
        ? (pg.url || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.acme.app/' +
                     pg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
        : null;
      if (fresh) p.pages.push(pg);
      refreshDesc(p);
    } });
}

/* The deploy line a page already has, the way a result template has one: the
   command is read, not run, and it names all three bindings so the reader can
   check them against the rows above it. */
function pageSnippet(p, pg){
  const t = pageTemplate(pg), lg = pageLogic(p, pg);
  return [
    'nebulas deploy ' + p.id + '/' + pg.id +
      ' --template ' + (t ? t.id : '—') + ' --logic ' + (lg ? lg.name : '—'),
    pg.state === 'live' && pg.url
      ? '  live at ' + pg.url + ' · rebuilt on every run'
      : '  draft — nothing is hosted until it is published'
  ].join('\n');
}

/* A page rebuild files a result the way a scheduled run does: same column,
   same attribution, so the project page's Results list carries both. */
function runPage(p, pg){
  const t = pageTemplate(pg), lg = pageLogic(p, pg);
  const n = allResults().filter(a => a.from === p.name).length + 1;
  const report = [
    '**' + pg.name + '** was rebuilt' + (pg.state === 'live' && pg.url
      ? ' and published to `' + pg.url + '`.' : ' as a draft — nothing is hosted yet.'),
    '',
    'Ran ' + stampFull(Date.now()) + ' · on request.',
    '',
    '- **Layout** — ' + (t ? t.name : 'none picked'),
    '- **Logic** — ' + (lg ? lg.name + (lg.edited ? ', edited in this project' : ', as the library ships it')
                           : 'none picked'),
    '- **Read** — ' + (pg.sources.length ? pg.sources.join(', ') : 'nothing'),
    '',
    'The rebuild is simulated here, as every answer in this prototype is: a real one ' +
    'would leave the rendered page behind this entry.'
  ].join('\n');
  fileResult({ id:'r-' + p.id + '-' + pg.id + '-' + n, title:pg.name + ' — page rebuilt',
    from:p.name, shape:'doc', size:plural(5, 'line'), md:report });
  state.projLoan = false;
  state.artBefore = null;
  p.when = 'now';
  render();
}

/* The bench's reply for a project runs the question through what is bound —
   the assistant, the shelf, the grants — so the page's facts are the answer's
   ingredients, visibly. */
function pjTestScript(text, p){
  const low = text.toLowerCase();
  /* Asking about a page runs the page: the reply names the template and the
     preset it would run, so changing either on the left changes the next
     answer — the dependency rehearsed, not described. */
  const pg = (p.pages || []).filter(x => low.indexOf(x.name.toLowerCase()) > -1)[0] ||
    (/\b(page|rebuild|publish)\b/.test(low) ? (p.pages || [])[0] : null);
  if (pg){
    const t = pageTemplate(pg), lg = pageLogic(p, pg);
    const steps = pg.sources.length
      ? [{ n:'shelf.read', d:'reading ' + pg.sources.join(', '), t:'0.6s' }] : [];
    if (lg) steps.push({ n:lg.name, d:'executing the project\'s ' +
      (lg.edited ? 'edited copy' : 'copy') + ' of the preset', t:'0.7s' });
    steps.push({ n:'page.render', d:t ? 'laying it out on ' + t.name : 'no layout picked', t:'0.4s' });
    const lines = ['Rebuilding **' + pg.name + '** — simulated, like everything here.', ''];
    lines.push(lg
      ? '- **Logic** — ' + lg.name + (lg.edited ? ', edited in this project.' : ', as the library ships it.')
      : '- **No logic** — the page points at no preset, so there is nothing to run. Pick one under Preset code.');
    lines.push(t ? '- **Layout** — ' + t.name + ', a ' + t.shape + ' template.'
                 : '- **No layout** — pick a result template and the page has a shape.');
    lines.push(pg.state === 'live' && pg.url
      ? '- **Published** — the rebuild would land at ' + pg.url + '.'
      : '- **Draft** — nothing is hosted until the page is published.');
    return { steps:steps, md:lines.join('\n') };
  }
  const reads = (p.kbs || []).concat(p.sources || []);
  const steps = [];
  if (p.assistant) steps.push({ n:'inst.read', d:'reading ' + p.assistant + '’s instructions', t:'0.3s' });
  if (reads.length) steps.push({ n:'kb.search', d:'searching ' + reads.join(', '), t:'0.9s' });
  (p.conn || []).slice(0, 1).forEach(id => {
    const cn = find(D.CONNECTORS, id);
    steps.push({ n:cn.kind + '.read', d:'through the ' + cn.name + ' grant', t:'0.8s' });
  });
  steps.push({ n:'compose', d:'drafting the answer', t:'0.4s' });

  const lines = ['Answering inside **' + p.name + '** — ' +
    (p.assistant ? '**' + p.assistant + '** takes every thread here'
                 : 'no assistant is bound, so the workspace model answers') + '. Simulated output.', ''];
  lines.push(reads.length
    ? '- Read from ' + reads.map(n => '**' + n + '**').join(', ') + ' — the project’s own shelf.'
    : '- Nothing is on the project’s shelf yet — bind knowledge on the left and answers start citing it.');
  if ((p.conn || []).length){
    lines.push('- ' + p.conn.map(id => '**' + find(D.CONNECTORS, id).name + '**').join(', ') +
      ' reached through ' + (p.conn.length === 1 ? 'its grant' : 'their grants') + '.');
  }
  if (p.run) lines.push('- The program files this kind of answer ' + p.run.every.toLowerCase() + ' without being asked.');
  const reply = { steps:steps, md:lines.join('\n') };
  if (reads.length) reply.cites = [{ n:reads[0], s:'knowledge' }];
  return reply;
}

function projectBuildView(body, p){
  body.classList.add('pane__body--split');
  const s = buildSplit();
  s.wrap.classList.add('build--test');

  const connName = id => find(D.CONNECTORS, id).name;
  const threads = D.THREADS.filter(t => t.project === p.id);

  const about = el('section','section');
  about.append(sectionHead('About', '<span class="t-mono">' + plural(threads.length, 'thread') + '</span>'));
  const l1 = el('div','setlist');
  l1.append(setRow('Name', esc(p.name), () => editPjAbout(p)));
  l1.append(setRow('Who can see it',
    p.shared ? 'Shared — the workspace works here'
      : (p.people || []).length ? esc('Shared with ' + plural(p.people.length, 'coworker'))
      : 'Personal', () => editPjShare(p)));
  l1.append(setRow('Icon', esc(p.icon), () => editPjAbout(p)));
  about.append(l1);
  s.main.append(about);

  const work = el('section','section');
  work.append(sectionHead('The work'));
  const l2 = el('div','setlist');
  l2.append(setRow('Assistants',
    (p.assistants || []).length ? esc(p.assistants.join(' · '))
                                : 'none — threads here use the workspace model',
    () => editPjAsst(p)));
  const reads = (p.kbs || []).concat(p.sources || []);
  l2.append(setRow('Knowledge',
    reads.length ? esc(reads.join(' · ')) : 'nothing on the shelf yet',
    () => editPjKnow(p)));
  l2.append(setRow('Connections',
    (p.conn || []).length ? esc(p.conn.map(connName).join(' · ')) : 'none granted',
    () => editPjConn(p)));
  work.append(l2);
  /* A granted connector that is not connected is stated, not hidden. */
  const cold = (p.conn || []).map(id => find(D.CONNECTORS, id)).filter(c => c.state === 'off');
  if (cold.length){
    const b = banner('warn', '<strong>' + esc(cold.map(c => c.name).join(', ')) +
      '</strong> ' + (cold.length === 1 ? 'is granted but not connected' : 'are granted but not connected') +
      '. The grant states the need; the connection is made in Cloud → Connections.');
    b.style.margin = 'var(--s-3) 0 0';
    work.append(b);
  }
  s.main.append(work);

  const prog = el('section','section');
  prog.append(sectionHead('Auto program'));
  const l3 = el('div','setlist');
  l3.append(setRow('Program',
    p.run ? esc(p.run.every.toLowerCase() + ' — files a result in the results column')
          : 'off — nothing runs by itself',
    () => editPjRun(p)));
  if (p.run) l3.append(setRow('What it produces', esc(p.run.ask), () => editPjRun(p)));
  prog.append(l3);
  s.main.append(prog);

  /* ------------------------------------------------------------ preset code
     The project's own copies of library presets: what its pages may run. The
     rows edit; the folds below them read — the code belongs on the page it
     governs, not behind a dialog only. Build is the only surface that edits
     any of this; the chat page reports it and points here. */
  const codeSec = el('section','section');
  codeSec.append(sectionHead('Preset code',
    p.code.length ? '<span class="t-mono">' + plural(p.code.length, 'preset') + '</span>' : ''));
  const l4 = el('div','setlist');
  p.code.forEach(c => l4.append(setRow(c.name,
    esc(c.lang + (c.edited ? ' · edited here' : ' · as the library ships it')),
    () => editPjCode(p, c))));
  if (!p.code.length) l4.append(setRow('Presets', 'none granted — a page runs on one, so this comes first',
    () => editPjCodeGrant(p)));
  codeSec.append(l4);
  p.code.forEach(c => codeSec.append(fold(c.name,
    () => c.edited ? 'edited here' : 'as shipped',
    b => b.append(codeCard(c.code)))));
  const grant = el('button','btn btn--ghost btn--sm', ic('plus',13) + 'Grant a preset');
  grant.type = 'button';
  grant.onclick = () => editPjCodeGrant(p);
  codeSec.append(rowActs([grant]));
  s.main.append(codeSec);

  /* ------------------------------------------------------------ output pages
     What the project publishes: each page a template, a preset and its reads,
     with the deploy line underneath so the three bindings can be checked
     against the command that ships them. Gaps are stated the way a cold
     connector is — a page pointing at a deleted preset stays on the page. */
  const out = el('section','section');
  out.append(sectionHead('Output pages',
    p.pages.length ? '<span class="t-mono">' + plural(p.pages.length, 'page') + '</span>' : ''));
  if (!p.pages.length){
    const l5 = el('div','setlist');
    l5.append(setRow('Pages', 'none — a page turns what this project knows into something hosted',
      () => editPjPage(p, null)));
    out.append(l5);
  }
  p.pages.forEach(pg => {
    const t = pageTemplate(pg), lg = pageLogic(p, pg);
    const l5 = el('div','setlist');
    l5.append(setRow(pg.name,
      esc((t ? t.name : 'no layout') + ' · ' + (lg ? lg.name : 'no logic') + ' · ' + pg.state),
      () => editPjPage(p, pg)));
    out.append(l5);
    if (!lg){
      const b = banner('warn', '<strong>' + esc(pg.name) + '</strong> has no logic — its preset was ' +
        'never picked or has been ungranted. The page keeps its row; pick a preset to make it build again.');
      b.style.margin = 'var(--s-3) 0 0';
      out.append(b);
    }
    const off = pg.sources.filter(nm => (p.sources || []).indexOf(nm) < 0);
    if (off.length){
      const b = banner('warn', '<strong>' + esc(off.join(', ')) + '</strong> ' +
        (off.length === 1 ? 'is' : 'are') + ' read by ' + esc(pg.name) +
        ' but not on the project shelf. Bind ' + (off.length === 1 ? 'it' : 'them') +
        ' under Knowledge, or the rebuild reads nothing.');
      b.style.margin = 'var(--s-3) 0 0';
      out.append(b);
    }
    out.append(codeCard(pageSnippet(p, pg)));
    const run = el('button','btn btn--secondary btn--sm',
      '<span style="display:flex">' + ic('play',13) + '</span>Rebuild now');
    run.type = 'button';
    run.onclick = () => runPage(p, pg);
    out.append(rowActs([run]));
  });
  const addPg = el('button','btn btn--ghost btn--sm', ic('plus',13) + 'Add a page');
  addPg.type = 'button';
  addPg.onclick = () => editPjPage(p, null);
  out.append(rowActs([addPg]));
  s.main.append(out);

  if (p.channels && p.channels.length){
    const chSec = el('section','section');
    chSec.append(sectionHead('Channels', '<span class="t-mono">' + p.channels.length + '</span>'));
    p.channels.forEach(ch => {
      const cn = connById(ch.cn);
      chSec.append(listRow({
        lead:dotLead(cn ? cn.state : 'off'),
        title:ch.nm, sub:ch.handle + ' · ' + ch.posts,
        meta:cn && cn.state === 'off' ? 'not connected' : '',
        onClick:() => cn && select('cloud', key('cn', cn.id))
      }));
    });
    s.main.append(chSec);
  }

  const open = el('button','btn btn--secondary', ic('open',13) + 'Open the project');
  open.onclick = () => select('chat', key('p', p.id));
  const opt = el('button','btn btn--secondary', ic('spark',13) + 'Optimize in chat');
  opt.onclick = () => openMaker('pj', p);
  const del = el('button','btn btn--ghost', ic('trash',13) + 'Delete');
  del.onclick = () => deleteProject(p);
  const acts = el('div');
  acts.style.cssText = 'display:flex;gap:var(--s-2);flex-wrap:wrap;margin-top:var(--s-6)';
  acts.append(open, opt, del);
  s.main.append(acts);

  /* ------------------------------------------------------------ the bench */
  testBench(s.side, {
    th:testThread(p), who:p.assistant || state.model,
    placeholder:'Ask inside ' + p.name + '…',
    hint:'Ask what you would ask in the project. The reply runs through what is bound on the left — the assistant, the shelf, the grants.',
    starters:(p.pages.length ? ['Rebuild the ' + p.pages[0].name + ' page'] : [])
      .concat(p.run ? [p.run.ask] : [])
      .concat(['What changed in ' + p.name + ' this week?']).slice(0, 2),
    script:v => pjTestScript(v, p)
  });

  body.append(s.wrap);
}

/* ==================================================================== maker
   Build's chat layer: an overlay with the conversation on the left and the
   record live on the right, so a change said in words is visible the moment
   it lands. One idea holds it together: CREATE IS OPTIMIZE ON A FRESH DRAFT.
   The + of a lane opens this on a new draft record; "Optimize in chat" on a
   builder page opens it on the record that exists — same overlay, same verbs,
   no separate create ceremony. The conversation is a REAL thread, tagged
   `build:` the way project threads are tagged `project:`, so it shows in
   History and resumes when the record is optimized again. The reading is a
   parse, not understanding: every reply names exactly what was applied, and
   the inspector remains the editor of everything else. */
let makerOn = null;          /* { kind, rec, thread, fresh } — the overlay's state */

const MAKER_KIND = {
  as:{ noun:'assistant', icon:'agent',
    hint:'Describe who it answers and with what. Skills, knowledge, connectors and models are matched by name; behaviour by phrases like "always confirm".',
    starters:['An assistant that answers billing questions from the Finance corpus and can query the warehouse',
              'Make it stricter — always confirm before writing anywhere'] },
  pj:{ noun:'project', icon:'folder',
    hint:'Describe the work and what it reads. Knowledge, connectors and presets are matched by name; "every week" sets the program; "a page" drafts one.',
    starters:['A churn watch project reading the Support corpus and HubSpot, reporting every week',
              'Grant watchlist_rows and add an accounts page'] },
  wg:{ noun:'widget', icon:'widget',
    hint:'Describe the tile. Shapes are read from the words — a value, a trend, a question box, a list — and colours, corners and width by name.',
    starters:['A KPI tile for open tickets, 47 against a 100 goal',
              'Make it amber and wide'] },
  tp:{ noun:'result template', icon:'template',
    hint:'Describe the page — a landing page, a portal, docs, or a PDF report layout with its sections.',
    starters:['A PDF report layout with sections for headline numbers, detail and actions',
              'Call it Quarterly board pack'] }
};

const makerStore = kind => kind === 'as' ? D.ASSISTANTS : kind === 'pj' ? D.PROJECTS : D.DESIGNS;
const makerUnnamed = rec => /^(Untitled|New)\b/.test(rec.name);

function openMaker(kind, rec){
  const fresh = !rec;
  if (!rec) rec = kind === 'as' ? draftAssistant()
    : kind === 'pj' ? draftProject()
    : draftDesign(kind === 'tp' ? 'template' : 'widget');
  const tag = key(kind, rec.id);
  /* The record's conversation, resumed if it has one: optimizing twice is one
     chat, not an archaeology of little ones. */
  let t = D.THREADS.filter(x => x.build === tag)[0];
  if (!t){
    t = { id:'n' + (++newThreadN), title:rec.name, when:'now', group:'Today',
          project:null, build:tag, msgs:[] };
    D.THREADS.unshift(t);
  }
  makerOn = { kind:kind, rec:rec, thread:t, fresh:fresh };
  renderMaker();
  $('#makerScrim').dataset.open = 'true';
  $('#makerInput').value = '';
  $('#makerInput').focus();
}
function closeMaker(){
  if (makerOn && makerOn.fresh && !makerOn.thread.msgs.length){
    /* Nothing was said, so nothing was made: the silent draft and its empty
       thread leave with the overlay. */
    const st = makerStore(makerOn.kind);
    const i = st.indexOf(makerOn.rec);
    if (i > -1) st.splice(i, 1);
    const ti = D.THREADS.indexOf(makerOn.thread);
    if (ti > -1) D.THREADS.splice(ti, 1);
    renderList();
  }
  $('#makerScrim').dataset.open = 'false';
  makerOn = null;
}

function renderMakerHead(){
  const m = makerOn, mk = MAKER_KIND[m.kind];
  $('#makerIco').innerHTML = ic(mk.icon, 15);
  $('#makerTitle').textContent = makerUnnamed(m.rec) ? 'Make a ' + mk.noun : m.rec.name;
  $('#makerSub').textContent = mk.noun + ' · ' + (m.rec.state || (m.rec.shared ? 'shared' : 'draft')) +
    ' — the chat drafts and adjusts; the inspector edits everything';
}
function renderMakerSide(){
  const m = makerOn, rec = m.rec, side = $('#makerSide');
  side.innerHTML = '';
  if (m.kind === 'wg' || m.kind === 'tp'){
    side.append(designCanvas(rec));
    side.append(defList([
      ['State', esc(rec.state)],
      ['Shape', esc(rec.shape)],
      ['Accent', esc(rec.cfg.accent)],
      ['Width', esc(rec.cfg.width)],
      ['Theme', esc(rec.cfg.theme)]
    ]));
  } else if (m.kind === 'as'){
    side.append(defList([
      ['State', dotLead(rec.state) + esc(rec.state)],
      ['Model', esc(rec.model)],
      ['Team', esc(rec.team)],
      ['Skills', rec.skills.length ? esc(rec.skills.join(', ')) : '<span style="color:var(--warn)">none</span>'],
      ['Knowledge', esc(rec.kb || 'none')],
      ['Connectors', rec.conn.length ? esc(rec.conn.map(id => (connById(id) || {}).name).join(', ')) : 'none'],
      ['Behaviour', esc([rec.opts.cite && 'cites', rec.opts.confirm && 'confirms writes',
                         rec.opts.think && 'extended thinking'].filter(Boolean).join(' · ') || '—')]
    ]));
    if (rec.inst){
      const q = el('blockquote','maker__quote');
      q.style.cssText = 'margin:0;padding-left:var(--s-3);border-left:var(--ring) solid var(--line-strong);' +
        'font-size:var(--t-12);line-height:var(--lh-prose);color:var(--text-3)';
      q.textContent = rec.inst;
      side.append(q);
    }
  } else {
    side.append(defList([
      ['Visibility', rec.shared ? 'shared' : 'personal'],
      ['Assistant', esc(rec.assistant || 'none')],
      ['Knowledge', esc((rec.kbs || []).concat(rec.sources || []).join(', ') || 'none')],
      ['Connections', (rec.conn || []).length
        ? esc(rec.conn.map(id => (connById(id) || {}).name).join(', ')) : 'none'],
      ['Schedule', rec.run ? esc(rec.run.every.toLowerCase()) : '—'],
      ['Preset code', (rec.code || []).length ? esc(rec.code.map(c => c.name).join(', ')) : 'none'],
      ['Pages', (rec.pages || []).length ? esc(rec.pages.map(x => x.name).join(', ')) : '—']
    ]));
    if (rec.run && rec.run.ask){
      const q = el('div');
      q.style.cssText = 'padding-left:var(--s-3);border-left:var(--ring) solid var(--line-strong);' +
        'font-size:var(--t-12);line-height:var(--lh-prose);color:var(--text-3)';
      q.textContent = rec.run.ask;
      side.append(q);
    }
  }
  const foot = $('#makerFoot');
  foot.innerHTML = '';
  const open = el('button','btn btn--primary btn--sm', ic('open', 13) +
    (m.kind === 'pj' ? 'Open in Build' : 'Open in Build'));
  open.type = 'button';
  open.onclick = () => {
    const to = key(m.kind, rec.id);
    makerOn = null;                                  /* keep the record: it is made */
    $('#makerScrim').dataset.open = 'false';
    select('build', to);
  };
  foot.append(open);
  if (m.kind === 'pj'){
    const page = el('button','btn btn--secondary btn--sm', ic('folder', 13) + 'Open the project');
    page.type = 'button';
    page.onclick = () => {
      const id = rec.id;
      makerOn = null;
      $('#makerScrim').dataset.open = 'false';
      select('chat', key('p', id));
    };
    foot.append(page);
  }
  if (m.fresh){
    const bin = el('button','btn btn--ghost btn--sm', ic('trash', 13) + 'Discard');
    bin.type = 'button';
    bin.onclick = () => makerDiscard();
    foot.append(bin);
  }
}
function makerDiscard(){
  const m = makerOn;
  const st = makerStore(m.kind);
  const i = st.indexOf(m.rec);
  const ti = D.THREADS.indexOf(m.thread);
  if (i > -1) st.splice(i, 1);
  if (ti > -1) D.THREADS.splice(ti, 1);
  makerOn = null;
  $('#makerScrim').dataset.open = 'false';
  render();
  toast('Discarded ' + m.rec.name, { label:'Undo', run:() => {
    if (i > -1) st.splice(i, 0, m.rec);
    if (ti > -1) D.THREADS.splice(ti, 0, m.thread);
    render();
  } });
}
function renderMaker(){
  renderMakerHead();
  renderMakerSide();
  const log = $('#makerLog');
  log.innerHTML = '';
  const m = makerOn;
  if (!m.thread.msgs.length){
    /* The hint carries the class runTurn clears, so the first turn takes it
       with it. The starters are worked first sentences, not suggestions. */
    const hint = emptyState(MAKER_KIND[m.kind].icon, 'Say what it should be', MAKER_KIND[m.kind].hint);
    const chips = el('div');
    chips.style.cssText = 'display:flex;flex-direction:column;gap:var(--s-2);margin-top:var(--s-4);align-items:center';
    MAKER_KIND[m.kind].starters.forEach(t => {
      const c = el('button','chip','<span>' + esc(t) + '</span>');
      c.type = 'button';
      c.onclick = () => { $('#makerInput').value = t; makerSubmit(); };
      chips.append(c);
    });
    hint.append(chips);
    log.append(hint);
  } else {
    m.thread.msgs.forEach(msg => log.append(msgNode(msg)));
    log.scrollTop = log.scrollHeight;
  }
}

function makerSubmit(){
  const m = makerOn;
  const v = $('#makerInput').value.trim();
  if (!m || !v || state.busy) return;
  $('#makerInput').value = '';
  runTurn(v, makerScript(v, m), {
    host:$('#makerLog'),
    thread:m.thread,
    scroll:() => { const s = $('#makerLog'); s.scrollTo({ top:s.scrollHeight, behavior:'instant' }); },
    busy:on => { $('#makerSend').disabled = on; $('#makerInput').disabled = on; if (!on) $('#makerInput').focus(); },
    sync:() => {
      renderMakerHead();
      renderMakerSide();
      /* The lane behind the overlay shows names and subs; keep it true. */
      if (state.section === 'build') renderList();
    }
  });
}

/* ------------------------------------------------------- the maker's read
   A small verb table, not understanding. Each parser collects `changes`
   (the human lines the reply prints) and `acts` (applied after the trace),
   and the reply is honest about the remainder. */
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

function makerScript(text, m){
  const rec = m.rec, kind = m.kind;
  const low = ' ' + text.toLowerCase() + ' ';
  const changes = [], acts = [];
  const say = (line, f) => { changes.push(line); acts.push(f); };
  const removing = /\b(remove|drop|take (away|off|out)|revoke|without)\b/.test(low);

  /* rename — every kind speaks it */
  const rn = text.match(/\b(?:rename|call)\s+(?:it|this)?\s*(?:to\s+)?["“]?([^"”.,]{2,48})["”]?/i);
  if (rn){
    const nm = titleCase(rn[1].trim());
    say('renamed it **' + nm + '**', () => {
      rec.name = nm;
      if (rec.cfg) rec.cfg.title = nm;
      m.thread.title = nm;
    });
  }

  if (kind === 'as') makerAsstRead(text, low, rec, m, say, removing);
  else if (kind === 'pj') makerProjRead(text, low, rec, m, say, removing);
  else makerDesignRead(text, low, rec, m, say, removing);

  const noun = MAKER_KIND[kind].noun;
  const steps = [
    { n:'maker.read', d:'"' + text.slice(0, 46) + (text.length > 46 ? '…' : '') + '"', t:'0.3s' },
    { n:'maker.apply', d:changes.length ? plural(changes.length, 'change') + ' to the ' + noun
                                        : 'nothing recognised', t:'0.4s' }
  ];
  const md = changes.length
    ? 'Done — applied to **' + (rn ? rn[1].trim() : rec.name) + '**:\n\n' +
      changes.map(c => '- ' + c).join('\n') +
      '\n\nAnything I did not catch, its Build page edits — this chat and that page write the same record.'
    : 'I read it, but nothing in it maps to what a ' + noun + ' has. I match **names** — a model, ' +
      'a skill, a corpus, a connector, a colour — and a few phrases like *rename it…* or *every week*. ' +
      'Its Build page edits everything, always.';
  return { steps:steps, md:md, apply:() => acts.forEach(f => f()) };
}

/* assistant: model · team · skills (by name part) · knowledge · connectors ·
   behaviour phrases · instructions. A first sentence also names and seeds it. */
function makerAsstRead(text, low, a, m, say, removing){
  if (m.fresh && makerUnnamed(a) && !/\brename|call\b/i.test(text)){
    const mt = text.match(/(?:assistant|helper|bot)?\s*(?:that|which|who)\s+([a-z][^,.;]{3,42}?)(?:\s+(?:from|using|with|and|via)\b|[,.;]|$)/i);
    const nm = titleCase(((mt && mt[1]) || 'new assistant').trim());
    say('named it **' + nm + '**', () => { a.name = nm; m.thread.title = nm; });
    say('wrote the ask into its instructions', () => {
      a.desc = text.length > 140 ? text.slice(0, 137) + '…' : text;
      a.inst = text;
    });
  }
  D.MODELS.forEach(md => {
    if (low.indexOf(md.toLowerCase()) > -1 && md !== a.model)
      say('routed it to **' + md + '**', () => { a.model = md; });
  });
  D.ASSISTANT_TEAMS.forEach(t => {
    if (new RegExp('\\b(for|to) (the )?' + t.toLowerCase() + '( team)?\\b').test(low) && t !== a.team)
      say('moved it to the **' + t + '** team', () => { a.team = t; });
  });
  D.SKILLS.forEach(sk => {
    const words = sk.name.split('.').filter(w => w.length > 3);
    if (!words.some(w => low.indexOf(w) > -1)) return;
    const has = a.skills.indexOf(sk.name) > -1;
    if (removing && has) say('took away the **' + sk.name + '** skill',
      () => { a.skills = a.skills.filter(n => n !== sk.name); });
    if (!removing && !has) say('gave it the **' + sk.name + '** skill',
      () => { a.skills.push(sk.name); });
  });
  D.KBS.forEach(k => {
    if (low.indexOf(k.name.toLowerCase()) > -1 && a.kb !== k.name)
      say('pointed it at **' + k.name + '**', () => { a.kb = k.name; });
  });
  D.CONNECTORS.forEach(c => {
    if (low.indexOf(c.name.toLowerCase()) < 0 &&
        !(c.kind === 'warehouse' && low.indexOf('warehouse') > -1)) return;
    const has = a.conn.indexOf(c.id) > -1;
    if (removing && has) say('revoked **' + c.name + '**',
      () => { a.conn = a.conn.filter(x => x !== c.id); });
    if (!removing && !has) say('granted **' + c.name + '**' +
      (c.state === 'off' ? ' — not connected yet; Cloud → Connections does that' : ''),
      () => { a.conn.push(c.id); });
  });
  if (/\b(always confirm|confirm before|stricter)\b/.test(low) && !a.opts.confirm)
    say('set it to **confirm before writing** anywhere', () => { a.opts.confirm = true; });
  if (/\b(stop confirming|no confirmation|less strict)\b/.test(low) && a.opts.confirm)
    say('stopped it confirming writes', () => { a.opts.confirm = false; });
  if (/\b(cite|sources? on every|attach sources)\b/.test(low) && !a.opts.cite)
    say('made it **cite a source** on every claim', () => { a.opts.cite = true; });
  if (/\b(extended thinking|think longer|think harder)\b/.test(low) && !a.opts.think)
    say('turned on **extended thinking**', () => { a.opts.think = true; });
  const inst = text.match(/\b(?:tell it to|instruct(?:ions?)?:?)\s+(.{4,})$/i);
  if (inst && !(m.fresh && makerUnnamed(a)))
    say('added to its instructions', () => { a.inst = (a.inst ? a.inst + '\n' : '') + inst[1].trim(); });
}

/* project: name · visibility · knowledge and tables by name · connectors ·
   assistant by name · the program from cadence words. */
function makerProjRead(text, low, p, m, say, removing){
  if (m.fresh && makerUnnamed(p) && !/\brename|call\b/i.test(text)){
    const mt = text.match(/^(?:a|an|the)?\s*(.{2,36}?)\s+project\b/i);
    const nm = titleCase(((mt && mt[1]) || 'new project').trim());
    say('named it **' + nm + '**', () => {
      p.name = nm; m.thread.title = nm;
      p.desc = text.length > 140 ? text.slice(0, 137) + '…' : text;
      p.descAuto = false;
    });
  }
  if (/\bshare(d)?\b.*\b(workspace|team|everyone)\b/.test(low) && !p.shared)
    say('shared it with the workspace', () => { p.shared = true; });
  if (/\b(personal|private|only me)\b/.test(low) && p.shared)
    say('made it personal', () => { p.shared = false; });
  D.KBS.forEach(k => {
    if (low.indexOf(k.name.toLowerCase()) < 0) return;
    const has = (p.kbs || []).indexOf(k.name) > -1;
    if (removing && has) say('detached **' + k.name + '**',
      () => { p.kbs = p.kbs.filter(n => n !== k.name); });
    if (!removing && !has) say('attached **' + k.name + '**',
      () => { (p.kbs = p.kbs || []).push(k.name); });
  });
  D.DATASETS.forEach(t => {
    if (low.indexOf(t.name.toLowerCase()) < 0) return;
    if ((p.sources || []).indexOf(t.name) < 0 && !removing)
      say('pointed it at the **' + t.name + '** table', () => { (p.sources = p.sources || []).push(t.name); });
  });
  D.CONNECTORS.forEach(c => {
    if (low.indexOf(c.name.toLowerCase()) < 0) return;
    const has = (p.conn || []).indexOf(c.id) > -1;
    if (removing && has) say('revoked **' + c.name + '**',
      () => { p.conn = p.conn.filter(x => x !== c.id); });
    if (!removing && !has) say('granted **' + c.name + '**' +
      (c.state === 'off' ? ' — not connected yet; Cloud → Connections does that' : ''),
      () => { (p.conn = p.conn || []).push(c.id); });
  });
  D.ASSISTANTS.forEach(x => {
    if (low.indexOf(x.name.toLowerCase()) > -1 && (p.assistants || []).indexOf(x.name) < 0)
      say('bound the **' + x.name + '** assistant', () => {
        (p.assistants = p.assistants || []).push(x.name);
        p.assistant = p.assistants[0];
      });
  });
  const every = /\b(daily|every day|each morning|every morning)\b/.test(low) ? 'Every day'
    : /\b(weekly|every week|on mondays?)\b/.test(low) ? 'Every week'
    : /\b(monthly|every month)\b/.test(low) ? 'Every month' : null;
  if (every){
    const prod = text.match(/\b(?:produce|write|report|make|send|build)(?:ing|s)?\s+(?:an?\s+|the\s+)?(.{4,80}?)(?:[,.;]|$)/i);
    say('set the program to run **' + every.toLowerCase() + '**', () => {
      const prev = p.run && p.run.sched;
      p.run = { every:every, ask:(prod ? titleCase(prod[1].trim()) : p.run && p.run.ask) ||
        'Summarise what changed in ' + p.name + '.' };
      syncProjectRun(p, prev);
    });
  }
  if (/\b(stop|turn off|switch off)\b.*\b(schedule|program|running)\b/.test(low) && p.run)
    say('turned the program off', () => {
      const prev = p.run.sched;
      p.run = null;
      syncProjectRun(p, prev);
    });
  /* Presets by name, the way connectors are: a grant copies the library row
     onto the project, and Build is where the copy gets edited. */
  D.SNIPPETS.forEach(sn => {
    if (low.indexOf(sn.name.toLowerCase()) < 0) return;
    const has = (p.code || []).some(c => c.from === sn.id);
    if (removing && has) say('ungranted the **' + sn.name + '** preset',
      () => { p.code = p.code.filter(c => c.from !== sn.id); });
    if (!removing && !has) say('granted the **' + sn.name + '** preset — its copy is editable in Build',
      () => { (p.code = p.code || []).push({ id:'pc-n' + (++madeN), from:sn.id, edited:false,
        name:sn.name, lang:sn.lang, desc:sn.desc, code:sn.code }); });
  });
  /* "A page" drafts one, bound to whatever logic and layout the sentence
     names — or the first of each, said out loud so the guess is checkable. */
  if (!removing && /\b(page|portal site|dashboard page|watchlist page)\b/.test(low) &&
      !(p.pages || []).length){
    say('drafted a page — it binds a layout and one granted preset; Build finishes it', () => {
      p.pages = p.pages || [];
      const tpl = D.DESIGNS.filter(d => d.kind === 'template' &&
        low.indexOf(d.shape) > -1)[0] || D.DESIGNS.filter(d => d.kind === 'template')[0];
      const mt = text.match(/\b(?:a|an|the)\s+(.{2,36}?)\s+page\b/i);
      p.pages.push({ id:'pg-n' + (++madeN),
        name:titleCase(((mt && mt[1]) || p.name + ' page').trim()),
        template:tpl ? tpl.id : null,
        logic:((p.code || [])[0] || {}).id || null,
        sources:(p.sources || []).slice(0, 1), state:'draft' });
    });
  }
}

/* widget / template: a first sentence goes through the same parser Auto
   program's element maker uses; later ones speak the inspector's vocabulary. */
function makerDesignRead(text, low, d, m, say, removing){
  if (m.fresh && makerUnnamed(d) && !/\brename|call\b/i.test(text)){
    if (d.kind === 'widget'){
      const spec = parseElement(text);
      /* Unlike Auto program's element (placeholders until bound), the maker
         takes the sentence's own numbers: "47 against a 100 goal" is a value
         and a caption, said out loud. */
      const num = text.match(/(?:^|[\s,])(\d[\d,.]*%?)(?=[\s,.;]|$)/);
      const vs = text.match(/\b(against|versus|vs\.?|towards?)\s+(.{2,48}?)(?:[,.;]|$)/i);
      say('drafted the **' + spec.shape + '** — named it **' + spec.name + '**', () => {
        d.shape = spec.shape;
        d.name = spec.name;
        m.thread.title = spec.name;
        Object.assign(d.cfg, spec.cfg, { title:spec.name });
        if (num && d.cfg.value !== undefined) d.cfg.value = num[1];
        if (vs) d.cfg.cap = titleCase(vs[1].toLowerCase() + ' ' + vs[2].trim());
        if (spec.bars) d.bars = spec.bars;
        if (spec.rows) d.rows = spec.rows;
        d.desc = text.length > 140 ? text.slice(0, 137) + '…' : text;
      });
    } else {
      const shape = /\bpdf|report layout|document|letter|invoice layout\b/.test(low) ? 'pdf'
        : /\bportal|dashboard site|intranet\b/.test(low) ? 'portal'
        : /\bdocs|help|faq|manual\b/.test(low) ? 'docs' : 'landing';
      const mt = text.match(/^(?:a|an|the)?\s*(.{2,40}?)\s*(?:template|layout|page|site)\b/i);
      const nm = titleCase(((mt && mt[1]) || shape + ' result template').replace(/^pdf\s*/i, '').trim() || 'New result template');
      say('drafted a **' + (shape === 'pdf' ? 'PDF layout' : shape + ' page') + '** — named it **' + nm + '**', () => {
        d.shape = shape;
        d.name = nm;
        m.thread.title = nm;
        d.cfg.title = nm;
        d.desc = text.length > 140 ? text.slice(0, 137) + '…' : text;
        const secs = text.match(/sections?\s+(?:for|of|:)?\s*(.{4,120}?)(?:[.;]|$)/i);
        if (shape === 'pdf' && secs)
          d.cfg.sections = commaList(secs[1].replace(/\s+and\s+/g, ', ')).map(titleCase).join(', ');
      });
    }
  }
  D.DESIGN_ACCENTS.forEach(([nm]) => {
    if (low.indexOf(nm.toLowerCase()) > -1 && d.cfg.accent !== nm)
      say('set the accent to **' + nm + '**', () => { d.cfg.accent = nm; });
  });
  [['square','Square'], ['soft', 'Soft'], ['round', 'Round']].forEach(([w, v]) => {
    if (new RegExp('\\b' + w + '(ed|er)? corners?\\b').test(low) && d.cfg.radius !== v)
      say('set the corners to **' + v.toLowerCase() + '**', () => { d.cfg.radius = v; });
  });
  [['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']].forEach(([w, v]) => {
    if (new RegExp('\\b' + w + 'r?\\b').test(low) && d.cfg.width !== v)
      say('made it **' + v.toLowerCase() + '**', () => { d.cfg.width = v; });
  });
  [['light', 'Light'], ['dark', 'Dark'], ['follow', 'Follow']].forEach(([w, v]) => {
    if (new RegExp('\\b' + w + '( theme| mode)?\\b').test(low) && d.cfg.theme !== v &&
        new RegExp('\\b' + w + '\\b( theme| mode|$| and| ,)').test(low))
      say('set the theme to **' + v.toLowerCase() + '**', () => { d.cfg.theme = v; });
  });
  const val = text.match(/\bvalue (?:to |of )?["']?([^"',.;]{1,16})/i);
  if (val && d.cfg.value !== undefined)
    say('set the value to **' + val[1].trim() + '**', () => { d.cfg.value = val[1].trim(); });
  const delta = text.match(/\bdelta (?:to |of )?["']?([^"',.;]{1,12})/i);
  if (delta && d.cfg.delta !== undefined)
    say('set the delta to **' + delta[1].trim() + '**', () => { d.cfg.delta = delta[1].trim(); });
  const cap = text.match(/\bcaption (?:to |of |says? )?["']?([^"'.;]{2,80})/i);
  if (cap) say('set the caption', () => { d.cfg.cap = titleCase(cap[1].trim()); });
  const secs2 = !(m.fresh && makerUnnamed(d)) && text.match(/\bsections?\s+(?:to|:)?\s*(.{4,120}?)(?:[.;]|$)/i);
  if (secs2 && d.shape === 'pdf')
    say('set the sections', () => {
      d.cfg.sections = commaList(secs2[1].replace(/\s+and\s+/g, ', ')).map(titleCase).join(', ');
    });
  const foot = text.match(/\bfooter\s+(?:to|says?|:)?\s*["']?([^"'.;]{2,60})/i);
  if (foot && d.shape === 'pdf')
    say('set the footer', () => { d.cfg.footer = titleCase(foot[1].trim()); });
  const nav = text.match(/\b(?:nav(?:igation)?|routes?)\s+(?:to|of|:)?\s*(.{3,80}?)(?:[.;]|$)/i);
  if (nav && d.kind === 'template' && d.shape !== 'pdf')
    say('set the navigation', () => {
      d.cfg.nav = commaList(nav[1].replace(/\s+and\s+/g, ', ')).map(titleCase).join(', ');
    });
  if (/\bhide (the )?header\b/.test(low) && d.cfg.header)
    say('hid the header', () => { d.cfg.header = false; });
  if (/\bshow (the )?header\b/.test(low) && !d.cfg.header)
    say('brought the header back', () => { d.cfg.header = true; });
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
  const inPjs = D.PROJECTS.filter(p => (p.conn || []).indexOf(c.id) > -1).map(p => ({
    ic:p.icon, nm:p.name, sub:p.shared ? 'shared project' : 'personal project',
    go:() => select('build', key('pj', p.id))
  }));
  s.main.append(usedBySection('Granted to', grants.concat(inPjs),
    'No assistant or project reaches through this connector.'));

  /* ------------------------------------------------------------ inspector */
  inspectorHead(s.side, 'Connection', c.kind);
  s.side.append(defList([
    ['State', dotLead(c.state) + esc(c.state === 'off' ? 'not connected' : c.state === 'warn' ? 'degraded' : 'live')],
    ['Auth', esc(c.auth)],
    ['Direction', esc(c.writes ? 'read and write' : 'read only')],
    ['Granted to', esc(String(grants.length + inPjs.length))],
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
      const n = grants.length + inPjs.length;
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
const deltaCls  = v => /^-/.test(String(v)) ? 'delta--down' : 'delta--up';
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
        (c.delta ? '<span class="delta delta--lg ' + deltaCls(c.delta) + '">' + esc(c.delta) + '</span>' : '') +
      '</div>' +
      (c.cap ? '<div class="wgt__cap">' + esc(c.cap) + '</div>' : '');

  } else if (d.shape === 'chart'){
    b.innerHTML =
      '<div class="wgt__kpirow" style="margin-bottom:var(--s-3)">' +
        '<span class="wgt__kpi">' + esc(c.value) + '</span>' +
        (c.delta ? '<span class="delta delta--lg ' + deltaCls(c.delta) + '">' + esc(c.delta) + '</span>' : '') +
      '</div>' +
      '<div class="spark spark--bars spark--tall wgt__spark">' +
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
  /* A PDF has no site chrome — its header is the page's own, drawn below. */
  if (c.header && d.shape !== 'pdf'){
    t.append(el('div','tpl__bar',
      '<span class="tpl__logo"></span><span class="tpl__nm">' + esc(c.title) + '</span>' +
      '<span class="tpl__navs">' + nav.map(n => '<span>' + esc(n) + '</span>').join('') + '</span>'));
  }

  if (d.shape === 'pdf'){
    const page = el('div','tpl__paper');
    page.innerHTML =
      (c.header ? '<div class="tpl__pagehead"><span style="display:inline-flex;align-items:center;gap:var(--s-2)">' +
        '<span class="tpl__logo"></span><span class="tpl__nm">' + esc(c.title) + '</span></span>' +
        '<div class="tpl__line" style="width:18%"></div></div>' : '') +
      '<div class="tpl__h1">' + esc(c.title) + '</div>' +
      (c.sub ? '<div class="tpl__sub">' + esc(c.sub) + '</div>' : '') +
      commaList(c.sections).map((nm, i) =>
        '<div class="tpl__sec">' +
          '<div class="tpl__secnm">' + esc(nm) + '</div>' +
          lineRow(i % 2 ? [100, 88, 52] : [100, 94, 71]) +
        '</div>').join('') +
      '<div class="tpl__pagefoot"><span>' + esc(c.footer || '') + '</span><span>1 / 3</span></div>';
    t.append(page);

  } else if (d.shape === 'portal'){
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
  if (d.shape === 'pdf'){
    return [
      'nebulas layout set-default ' + d.id,
      '  applied to PDF downloads from the results column'
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
    '<span class="badge badge--mono">' + (d.kind === 'widget' ? 'Widget'
      : d.shape === 'pdf' ? 'PDF result template' : 'Web result template') + '</span>' +
    stateBadge(d.state)));

  const s = buildSplit();
  s.main.append(designCanvas(d));

  const emb = el('section','section');
  emb.style.marginTop = 'var(--s-6)';
  /* A widget's meta is whose theme wins, because it lands in a page we do not
     control. A template IS the page, so its meta is how many routes it has —
     and a PDF's is how many sections, since a page count is the printer's. */
  const pdf = d.shape === 'pdf';
  emb.append(sectionHead(d.kind === 'widget' ? 'Embed' : pdf ? 'Apply' : 'Deploy',
    '<span class="t-mono">' + esc(d.kind === 'widget'
      ? (c.theme === 'Follow' ? 'inherits the host page' : c.theme.toLowerCase() + ', fixed')
      : pdf ? plural(commaList(c.sections).length, 'section')
      : plural(commaList(c.nav).length, 'route')) + '</span>'));
  emb.append(codeCard(embedSnippet(d)));
  emb.append(noteP(d.kind === 'widget'
    ? 'The widget ships its own tokens, so it looks like this inside a page whose CSS we have never seen.'
    : pdf
    ? 'A PDF layout styles what leaves as a document — when a result downloads as pdf, this is the page it is set on.'
    : 'A web result template is a hosted page. The routes come from the nav; the palette comes from the accent chosen here.'));
  s.main.append(emb);

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
    if (d.shape === 'pdf'){
      s.side.append(field('Sub-title', inputCtl(c.sub, v => { c.sub = v; up(); })));
      s.side.append(field('Sections', inputCtl(c.sections, v => { c.sections = v; up(); }),
        'Comma separated, in reading order.'));
      s.side.append(field('Footer', inputCtl(c.footer, v => { c.footer = v; up(); }),
        'Printed on every page, opposite the page number.'));
    } else {
      s.side.append(field('Navigation', inputCtl(c.nav, v => { c.nav = v; up(); }),
        'Comma separated. Each one becomes a route.'));
    }
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
  const opt = el('button','btn btn--secondary', ic('spark',13) + 'Optimize in chat');
  opt.onclick = () => openMaker(d.kind === 'widget' ? 'wg' : 'tp', d);
  const copy = el('button','btn btn--ghost', ic('copy',13) + (d.kind === 'widget' ? 'Copy embed' : 'Copy command'));
  copy.onclick = () => toast('Copied — prototype');
  inspectorActs(s.side, [pub, opt, copy]);

  pad.append(s.wrap);
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

  } else if (view === 'usage'){
    pad.append(pageHead('Usage',
      'What this account spends, in tokens. Today is the session\'s own live count — ' +
      'the status bar reads the same number — and the history is example data, like every figure here.'));
    const u = a.usage;
    const week = u.days.slice(0, 6).reduce((s, v) => s + v, 0);
    pad.append(statGrid([
      ['Today', nf(state.tokens) + ' / 200k'],
      ['Last 7 days', nf((week + Math.round(state.tokens / 1000)) * 1000)],
      ['This month', u.month],
      ['Cost this month', u.cost]
    ]));
    pad.lastChild.style.marginBottom = 'var(--s-8)';

    const sec = el('section','section');
    sec.append(sectionHead('Day by day',
      '<span class="t-mono">against the 200k daily allowance</span>'));
    const wrap = el('div','barlist barlist--flat');
    const bar = (k, v, pct) => el('div','barlist__row',
      '<span class="barlist__k">' + esc(k) + '</span>' +
      '<span class="meter"><i style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></span>' +
      '<span class="barlist__v">' + esc(v) + '</span>');
    wrap.append(bar('Today · live', nf(state.tokens), state.tokens / 2000));
    u.days.forEach((v, i) => {
      const d = new Date(T0);
      d.setDate(d.getDate() - (i + 1));
      const label = i === 0 ? 'Yesterday'
        : DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
      wrap.append(bar(label, v + 'k', v / 2));
    });
    sec.append(wrap);
    pad.append(sec);

  } else if (view === 'appearance'){
    pad.append(pageHead('Appearance','Theme, density, and the accent every action wears. All three are remembered on this device.'));
    const wrap = el('div');
    wrap.style.cssText = 'display:grid;gap:var(--s-6);max-width:520px';
    wrap.append(field('Theme', segCtl(['Light','Dark'],
      document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light',
      v => setTheme(v.toLowerCase()))));
    wrap.append(field('Density', segCtl(['Compact','Comfortable','Roomy'], densityLabel(),
      v => setDensity(v.toLowerCase() === 'comfortable' ? '' : v.toLowerCase())),
      'Density is a single token. Every gap in the interface derives from it.'));

    /* Presets: each dot carries its scheme's data-accent, so it shows that
       scheme's colour whichever one is in force. */
    const sw = el('div');
    sw.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--s-2)';
    const presets = [['','Nebula'], ['ocean','Ocean'], ['forest','Forest'], ['ember','Ember'], ['plum','Plum']];
    presets.forEach(([k, name]) => {
      const b = el('button','swatch',
        '<span class="swatch__dot" data-accent="' + (k || 'nebula') + '"></span><span>' + esc(name) + '</span>');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.accent === k));
      b.onclick = () => { state.accent = k; applyAccent(); select('account','appearance'); };
      sw.append(b);
    });
    wrap.append(field('Accent', sw,
      'One accent, one meaning — a scheme recolours it everywhere: buttons, focus, links and live marks.'));

    /* Custom: a hue, run through the same recipe the presets use. Sliding
       repaints nothing but the tokens, so the drag never loses the thumb. */
    const cust = el('div');
    cust.style.cssText = 'display:flex;align-items:center;gap:var(--s-3)';
    const r = el('input','range');
    r.type = 'range'; r.min = 0; r.max = 359; r.step = 1;
    r.value = typeof state.accent === 'number' ? state.accent : 245;
    const dot = el('span','swatch__dot');
    if (typeof state.accent !== 'number') dot.style.background = 'hsl(' + r.value + ' 55% 50%)';
    r.oninput = () => {
      state.accent = +r.value;
      applyAccent();
      dot.style.background = '';                       /* back to var(--accent), now custom */
      $$('.swatch', sw).forEach(x => x.setAttribute('aria-pressed','false'));
    };
    cust.append(r, dot);
    wrap.append(field('Custom', cust,
      'Drag for your own hue. It follows light and dark like the presets do.'));
    pad.append(wrap);

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
const CODE_EXT = { Python:'py', 'Node.js':'js', SQL:'sql', 'cURL':'sh', Bash:'sh' };
const CODE_LANG = { Python:'python', 'Node.js':'js', SQL:'sql', 'cURL':'bash', Bash:'bash' };
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

function copyText(text, what){
  const ok = () => toast((what || 'Link') + ' copied');
  const fail = () => toast('Could not copy — the text is selected, use ⌘C');
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
      '<span class="barlist__v' + (neg ? ' delta--down' : '') + '">' +
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
  if (a.kind === 'channel') return [
    { label:'Today',    render:() => artChannelNode(a) },
    { label:'The page', render:() => artProseNode(a.md) }
  ];
  if (a.kind === 'page') return [
    { label:'Page',    render:() => artPageNode(a) },
    { label:'Content', render:() => artProseNode(a.md) }
  ];
  if (a.kind === 'form') return [
    { label:'Entries',  render:() => artFormNode(a, 'entries') },
    { label:'The form', render:() => artFormNode(a, 'shape') }
  ];
  return [{ label:'Document', render:() => artProseNode(a.md) }];
}
/* A page result renders live from the project record it names — its three
   bindings, the deploy line, and the rebuild — so repointing the page in
   Build changes this pane, not a stale copy. The Content tab is the page as
   it renders. */
function artPageNode(a){
  const p = byId(D.PROJECTS, a.pid);
  const pg = p && (p.pages || []).filter(x => x.id === a.pg)[0];
  if (!pg) return helpNote('This page is no longer on the project.');
  const t = pageTemplate(pg), lg = pageLogic(p, pg);
  const wrap = el('div');
  const sec = el('section','section');
  sec.append(sectionHead('The page', '<span class="t-mono">' + esc(pg.state) + '</span>'));
  sec.append(defList([
    ['State', esc(pg.state) + (pg.url ? ' · ' + esc(pg.url) : '')],
    ['Layout', esc(t ? t.name : 'none picked')],
    ['Logic', lg ? esc(lg.name + (lg.edited ? ' — edited in this project' : '')) : 'none picked'],
    ['Reads', esc(pg.sources.join(', ') || 'nothing')]
  ]));
  wrap.append(sec);
  const dep = el('section','section');
  dep.append(sectionHead('Deploy'));
  dep.append(codeCard(pageSnippet(p, pg)));
  wrap.append(dep);
  const run = el('button','btn btn--secondary btn--sm',
    '<span style="display:flex">' + ic('play',13) + '</span>Rebuild now');
  run.type = 'button';
  run.onclick = () => runPage(p, pg);
  const def = el('button','btn btn--ghost btn--sm', ic('build',13) + 'Define in Build');
  def.type = 'button';
  def.onclick = () => select('build', key('pj', p.id));
  wrap.append(rowActs([run, def]));
  return wrap;
}
/* A form result renders live from the project record: the entries as a table,
   the shape as a read-only fact. The widget dialog restyles the widget that
   feeds these forms; it never touches what they record — which is why the
   shape tab states the structure instead of offering to edit it. */
function artFormNode(a, tab){
  const p = byId(D.PROJECTS, a.pid);
  const fm = p && (p.forms || []).filter(x => x.id === a.fm)[0];
  if (!fm) return helpNote('This form is no longer on the project.');
  const wrap = el('div');
  if (tab === 'shape'){
    const sec = el('section','section');
    sec.append(sectionHead('The fields', '<span class="t-mono">' + fm.fields.length + '</span>'));
    sec.append(defList(fm.fields.map(f => [f[0], esc(f[1])])));
    wrap.append(sec);
    wrap.append(helpNote('The structure is fixed. Widget design changes how it looks — the logo, the colours, the fixed text — never what it records.'));
    return wrap;
  }
  if (fm.desc) wrap.append(noteP(fm.desc));
  const t = el('table','table table--rows');
  t.innerHTML =
    '<thead><tr>' + fm.fields.map(f => '<th>' + esc(f[0]) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + fm.entries.map(r =>
      '<tr>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody>';
  const sx = el('div','scroll-x');
  sx.append(t);
  wrap.append(sx);
  return wrap;
}

/* A channel result renders live from the project record it names, so editing a
   draft or connecting the channel changes this pane, not a stale copy. */
function artChannelNode(a){
  const p = byId(D.PROJECTS, a.pid);
  const c = p && (p.channels || []).filter(x => x.id === a.ch)[0];
  if (!c) return helpNote('This channel is no longer on the project.');
  return channelDayNode(p, c);
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

/* The project a result could be filed into: the one it is already filed in,
   else the one whose page is open, else the one the producing thread belongs
   to. Chat output lands in this global store either way — filing is the
   explicit act that ALSO lists it in that project's own Results section, and
   the record itself moves nowhere. A result the project produced (a scheduled
   run, a page run) is listed there already, so it offers no filing. */
function artFileTarget(a){
  if (a.pj) return byId(D.PROJECTS, a.pj);
  let p = null;
  if (state.section === 'chat' && kindOf(state.item.chat) === 'p')
    p = byId(D.PROJECTS, idOf(state.item.chat));
  if (!p){
    const th = D.THREADS.filter(x => x.title === a.from)[0];
    if (th && th.project) p = byId(D.PROJECTS, th.project);
  }
  return p && p.name !== a.from ? p : null;
}

function renderArtifact(){
  const a = state.art.id ? D.ARTIFACT_BY_ID(state.art.id) : null;
  const tabs = $('#artTabs'), body = $('#artBody'), foot = $('#artFoot');
  tabs.innerHTML = ''; body.innerHTML = ''; foot.innerHTML = '';
  $('#artBack').hidden = !a;
  /* All act on the result being read, so none exists in the list. */
  $('#artDl').hidden = !a;
  $('#artShare').hidden = !a;
  $('#artFile').hidden = !a || !artFileTarget(a);

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

  /* Filing into a project's Results — a toggle, so a mis-file is one more
     click. The panel count changes, so the page re-renders too. */
  const fp = artFileTarget(a);
  if (fp){
    const filed = a.pj === fp.id;
    const fb = $('#artFile');
    fb.setAttribute('aria-pressed', String(filed));
    fb.title = filed ? 'In ' + fp.name + '’s results — click to remove'
                     : 'Add to ' + fp.name + '’s results';
    fb.setAttribute('aria-label', fb.title);
    fb.onclick = () => toggleArtFile(a, fp);
  }

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
   Seven apps, seven surfaces, every one assembled from components that
   already exist elsewhere: an app is a new arrangement, not a new vocabulary.

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
    if (p.notes){
      s.notes = p.notes.map(n => ({ html:n.html, tags:n.tags.slice() }));
      s.open = null; s.tagging = false;
    }
    if (p.events){
      s.events = p.events.map(e => ({ off:e[0], at:e[1], min:e[2], t:e[3], sub:e[4] }));
      s.view = 'Week'; s.wk = 0; s.mo = 0; s.draft = null; s.edit = null;
    }
    if (p.s === 'cvx'){
      const mk = c => Object.assign({}, c, { read:false, exp:c.exp.map(x => x.slice()) });
      /* The first CV ships read so a resume is one click away on arrival; the
         rest wait in the pretend tray behind the upload box. */
      s.cvs = [Object.assign(mk(p.cvs[0]), { read:true })];
      s.pool = p.cvs.slice(1).map(mk);
      s.open = null;               /* which resume is on screen; null = the list */
    }
    if (p.s === 'invx'){
      const mk = v => Object.assign({}, v, { read:false, amounts:v.amounts.map(x => x.slice()) });
      /* Two pretend pools, one per way in, so the two buttons stay distinct. */
      s.invs = [Object.assign(mk(p.invs[0]), { read:true })];
      s.pics  = p.invs.slice(1).filter(v => v.src !== 'camera').map(mk);
      s.shots = p.invs.filter(v => v.src === 'camera').map(mk);
      s.open = null;               /* which invoice is on screen; null = the ledger */
    }
    if (p.s === 'news'){
      s.read = p.items.map(it => !it.unread);
      s.sum = p.items.map(() => false);
      s.topic = 'All';
    }
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
   Everything is generated from the clock and the fixture marks events by
   their OFFSET from today, so the calendar is never wrong about what "today"
   is. Monday-first. Two views over one list of events: Week answers "when is
   the day busy" at hour resolution, Month answers "which days hold
   something" — and Upcoming answers "what", because a block forty pixels
   wide cannot. An event added here lands in the panel's own list and nowhere
   else: the fixture mirrors a work calendar this prototype cannot write to. */
const WEEK_H0 = 8, WEEK_H1 = 18;              /* the hours the week grid draws */
function calDay(off){ const d = new Date(T0); d.setDate(d.getDate() + off); return d; }
/* Monday of the week `wk` weeks away, as an offset from today. */
function calMonday(wk){ return wk * 7 - ((new Date(T0).getDay() + 6) % 7); }
const calMins = at => { const p = String(at).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
/* "Today" · "Tomorrow" · "Thu 27" — the day the way somebody would say it,
   with the month only once it stops being obvious. */
function calDayLabel(off){
  if (off === 0) return 'Today';
  if (off === 1) return 'Tomorrow';
  const d = calDay(off), now = new Date(T0);
  return DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() +
    (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      ? '' : ' ' + MONTHS[d.getMonth()]);
}
function calWhen(e){ return calDayLabel(e.off) + ' ' + e.at; }
/* Every door into the form goes through these two, so a slot click, an event
   click and the New event button cannot drift apart. */
function calAdd(app, st, off, at){
  st.edit = null;
  st.draft = { t:'', off:off, at:at, min:'30m' };
  repaintApp(app);
}
function calEdit(app, st, e){
  st.edit = e;
  st.draft = { t:e.t, off:e.off, at:e.at, min:{ 30:'30m', 45:'45m', 60:'1h' }[e.min] || '30m' };
  repaintApp(app);
}

function calWeekGrid(app, st){
  const mon = calMonday(st.wk);
  const grid = el('div','week');
  grid.append(el('div','week__hd'));           /* over the hour gutter */
  for (let i = 0; i < 7; i++){
    const d = calDay(mon + i);
    grid.append(el('div','week__hd' + (mon + i === 0 ? ' week__hd--today' : ''),
      esc(DAYS[d.getDay()].slice(0, 3)) + '<b>' + d.getDate() + '</b>'));
  }
  /* The gutter's rows ARE the vertical scale: the day columns stretch to it. */
  const gut = el('div','week__gut');
  for (let h = WEEK_H0; h < WEEK_H1; h++) gut.append(el('span','week__hr', pad2(h) + ':00'));
  grid.append(gut);
  for (let i = 0; i < 7; i++){
    const off = mon + i;
    const col = el('div','week__day' + (off === 0 ? ' week__day--today' : ''));
    col.title = 'Add an event — ' + calDayLabel(off);
    /* An empty slot is an invitation: the clicked hour becomes the draft. */
    col.onclick = ev => {
      const r = col.getBoundingClientRect();
      const h = WEEK_H0 + Math.floor((ev.clientY - r.top) / (r.height / (WEEK_H1 - WEEK_H0)));
      calAdd(app, st, off, pad2(Math.max(WEEK_H0, Math.min(WEEK_H1 - 1, h))) + ':00');
    };
    st.events.filter(e => e.off === off).forEach(e => {
      const b = el('div','week__evt', esc(e.t));
      b.style.top = 'calc(var(--week-hour) * ' +
        (Math.max(calMins(e.at) - WEEK_H0 * 60, 0) / 60).toFixed(3) + ')';
      b.style.height = 'calc(var(--week-hour) * ' + (e.min / 60).toFixed(3) + ')';
      b.title = e.at + ' · ' + e.t + ' — ' + e.sub + ' · ' + e.min + 'm. Click to edit.';
      b.onclick = ev => { ev.stopPropagation(); calEdit(app, st, e); };
      col.append(b);
    });
    grid.append(col);
  }
  return grid;
}

function calMonthGrid(app, st){
  const now = new Date(T0);
  const first = new Date(now.getFullYear(), now.getMonth() + st.mo, 1);
  const y = first.getFullYear(), m = first.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;           /* → Monday-first */
  const today = st.mo === 0 ? now.getDate() : 0;
  /* Offsets become dates, and anything outside the shown month is dropped
     rather than drawn on the wrong day. */
  const byDay = {};
  st.events.forEach(e => {
    const d = calDay(e.off);
    if (d.getFullYear() === y && d.getMonth() === m)
      (byDay[d.getDate()] = byDay[d.getDate()] || []).push(e.t);
  });
  const grid = el('div','cal');
  ['M','T','W','T','F','S','S'].forEach(d => grid.append(el('div','cal__wd', d)));
  for (let i = 0; i < offset; i++) grid.append(el('div','cal__d cal__d--pad','0'));
  for (let d = 1; d <= days; d++){
    const cls = 'cal__d' + (byDay[d] ? ' cal__d--mark' : '') + (d === today ? ' cal__d--today' : '');
    const cell = el('div', cls, String(d));
    const off = Math.round((new Date(y, m, d).getTime() - startOfDay(T0)) / 864e5);
    cell.title = byDay[d]
      ? MONTHS[m] + ' ' + d + ' — ' + byDay[d].join(' · ') + '. Click to add here.'
      : 'Add an event — ' + calDayLabel(off);
    cell.onclick = () => calAdd(app, st, off, '09:00');
    grid.append(cell);
  }
  return grid;
}

/* Both views answer to one label. The week is named by its Thursday, so a week
   straddling two months is named by the month holding most of it. */
function calLabel(st){
  const now = new Date(T0);
  const d = st.view === 'Week' ? calDay(calMonday(st.wk) + 3)
    : new Date(now.getFullYear(), now.getMonth() + st.mo, 1);
  return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/* Three answers make an event: what, when, how long. One form for both making
   and changing one — the only differences are what the fields start as and
   whether Remove is on the table. */
function calEventForm(app, st){
  const d = st.draft, edit = st.edit;
  /* The next seven days cover almost every event; a day clicked further out
     joins the list rather than being unpickable. */
  const offs = [0, 1, 2, 3, 4, 5, 6];
  if (offs.indexOf(d.off) < 0) offs.unshift(d.off);
  const labels = offs.map(calDayLabel);
  const close = () => { st.draft = null; st.edit = null; };
  /* Land where the event did, so saving is never followed by hunting for it. */
  const land = off => {
    st.wk = Math.floor((off - calMonday(0)) / 7);
    st.mo = (calDay(off).getFullYear() * 12 + calDay(off).getMonth())
          - (new Date(T0).getFullYear() * 12 + new Date(T0).getMonth());
  };

  const c = appCard(edit ? 'Edit event' : 'New event');
  const form = el('div');
  form.style.cssText = 'display:grid;gap:var(--s-3)';
  form.append(
    field('Title', inputCtl(d.t, v => d.t = v, 'Renewal review')),
    field('Day', selectCtl(labels, calDayLabel(d.off), v => d.off = offs[labels.indexOf(v)])),
    field('Starts', inputCtl(d.at, v => d.at = v, '09:00'), 'The grid draws 08:00 – 18:00.'),
    field('Length', segCtl(['30m','45m','1h'], d.min, v => d.min = v))
  );

  const acts = el('div','live__acts');
  const save = el('button','btn btn--primary btn--sm',
    ic('check', 13) + (edit ? 'Save' : 'Add event'));
  save.type = 'button';
  save.onclick = () => {
    const at = /^([01]?\d|2[0-3]):[0-5]\d$/.test(d.at.trim())
      ? (d.at.trim().length < 5 ? '0' : '') + d.at.trim() : '09:00';
    const min = { '30m':30, '45m':45, '1h':60 }[d.min];
    if (edit){
      Object.assign(edit, { off:d.off, at:at, min:min, t:d.t.trim() || edit.t });
      close(); land(edit.off); repaintApp(app);
      toast(edit.t + ' — ' + calWhen(edit));
    } else {
      const e = { off:d.off, at:at, min:min, t:d.t.trim() || 'Untitled event', sub:'Added here' };
      st.events.push(e);
      close(); land(e.off); repaintApp(app);
      toast(e.t + ' — ' + calWhen(e) + ', only in this workspace', {
        label:'Undo',
        run:() => {
          const i = st.events.indexOf(e);
          if (i >= 0) st.events.splice(i, 1);
          if (state.app === app.id) repaintApp(app);
        }
      });
    }
  };
  acts.append(save);
  if (edit){
    const rm = el('button','btn btn--ghost btn--sm', ic('trash', 12) + 'Remove');
    rm.type = 'button';
    rm.onclick = () => {
      const i = st.events.indexOf(edit);
      if (i >= 0) st.events.splice(i, 1);
      close(); repaintApp(app);
      toast(edit.t + ' removed', {
        label:'Undo',
        run:() => { st.events.push(edit); if (state.app === app.id) repaintApp(app); }
      });
    };
    acts.append(rm);
  }
  const cancel = el('button','btn btn--ghost btn--sm','Cancel');
  cancel.type = 'button';
  cancel.onclick = () => { close(); repaintApp(app); };
  acts.append(cancel);
  c.body.append(form, acts);
  return c.card;
}

function appAgenda(app, p){
  const st = appState(app);
  const week = st.view === 'Week';

  /* One toolbar for both views: the arrows move whichever unit is on screen
     and the label answers "where am I" after they have. Sync is honest about
     being a mirror — there is nothing upstream to fetch in a prototype. */
  const ctls = el('span');
  ctls.style.cssText = 'display:flex;align-items:center;gap:var(--s-1)';
  [['chevL', -1], ['chevR', 1]].forEach(([g, k]) => {
    const b = el('button','iconbtn iconbtn--xs', ic(g, 13));
    b.type = 'button';
    b.title = (k < 0 ? 'Previous ' : 'Next ') + (week ? 'week' : 'month');
    b.onclick = () => { if (week) st.wk += k; else st.mo += k; repaintApp(app); };
    ctls.append(b);
  });
  const sync = el('button','iconbtn iconbtn--xs', ic('retry', 12));
  sync.type = 'button';
  sync.title = 'Sync with your work calendar';
  sync.onclick = () =>
    toast('In sync — ' + plural(st.events.length, 'event') + ' mirrored, nothing new upstream');
  ctls.append(sync);
  ctls.append(segCtl(['Week','Month'], st.view, v => { st.view = v; repaintApp(app); }));

  const c = appCard(calLabel(st), ctls);
  c.body.append(week ? calWeekGrid(app, st) : calMonthGrid(app, st));
  const nodes = [c.card];

  if (st.draft) nodes.push(calEventForm(app, st));

  const add = el('button','btn btn--ghost btn--sm', ic('plus', 12) + 'New event');
  add.type = 'button';
  add.onclick = () => {
    if (st.draft && !st.edit){ st.draft = null; repaintApp(app); }
    else calAdd(app, st, 0, '09:00');
  };
  const up = appCard('Upcoming', add);
  const soon = st.events.filter(e => e.off >= 0)
    .sort((a, b) => a.off - b.off || calMins(a.at) - calMins(b.at)).slice(0, 6);
  if (!soon.length){
    up.body.append(el('div','field__help','No upcoming events.'));
  } else {
    soon.forEach(e => {
      const r = el('div','artlist__row');
      r.innerHTML =
        '<span class="t-mono" style="flex:none;color:var(--text-4);font-size:var(--t-11)">' + esc(calWhen(e)) + '</span>' +
        '<span class="row__main" style="flex:1">' +
          '<span class="row__title">' + esc(e.t) + '</span>' +
          '<span class="row__sub">' + esc(e.sub) + ' · ' + e.min + 'm</span>' +
        '</span>';
      r.title = 'Click to edit';
      r.style.cursor = 'pointer';
      r.onclick = () => calEdit(app, st, e);
      up.body.append(r);
    });
  }
  nodes.push(up.card);
  return nodes;
}

/* ----------------------------------------------------------------- cvx
   The CV extractor is a tray and a reading room, two screens deep: the list
   (upload box, candidates, one Extract for everything waiting), and behind
   each read candidate THE RESUME ITSELF — who they are, what they have done,
   where — with one way back to the list. No extraction furniture between the
   reader and the person: the digital version of a CV is a resume, not a
   table of fields. Uploads are simulated from a fixed set, like every reply
   here, and the box says so. */
function appCvx(app, p){
  const st = appState(app);
  if (st.open != null) return cvResume(app, st);
  const nodes = [];

  const up = appCard('Upload');
  const box = el('button','dropbox');
  box.type = 'button';
  box.innerHTML =
    '<span style="display:flex;color:var(--text-4)">' + ic('files', 18) + '</span>' +
    '<span><b>Add a CV</b> — pdf or docx</span>' +
    '<span class="field__help">' + (st.pool.length
      ? plural(st.pool.length, 'pretend CV') + ' left in the tray — uploads are simulated'
      : 'The tray is empty — every pretend CV is in') + '</span>';
  box.onclick = () => {
    if (!st.pool.length)
      return toast('Nothing left to upload — the pretend tray is empty');
    const cv = st.pool.shift();
    st.cvs.push(cv);
    repaintApp(app);
    toast(cv.file + ' uploaded — Extract reads it');
  };
  up.body.append(box);
  nodes.push(up.card);

  /* One Extract for everything waiting: the reading is a batch, not a
     ceremony per file. When nothing waits the head says so instead. */
  const unread = st.cvs.filter(c => !c.read).length;
  let lead;
  if (unread){
    lead = el('button','btn btn--primary btn--sm',
      ic('spark', 12) + 'Extract ' + (unread > 1 ? unread + ' CVs' : 'CV'));
    lead.type = 'button';
    lead.onclick = () => {
      st.cvs.forEach(c => c.read = true);
      repaintApp(app);
      toast(plural(unread, 'resume') + ' ready to read');
    };
  } else lead = el('span','badge badge--ok','all read');
  const list = appCard('Candidates', lead);
  st.cvs.forEach((c, i) => {
    list.body.append(listRow({
      lead: dotLead(c.read ? 'ok' : ''),
      title: c.read ? c.name : c.file,
      sub: c.read ? c.title + ' · ' + c.loc : 'uploaded · not read yet',
      onClick: () => {
        if (!c.read) return toast(c.file + ' is not read yet — Extract turns it into a resume');
        st.open = i;
        repaintApp(app);
        $('#appSheetBody').scrollTop = 0;
      }
    }));
  });
  nodes.push(list.card, helpNote('Click a candidate to read the resume.'));
  return nodes;
}

/* The resume, as a page: header, summary, experience, education. The one
   control is the way back — everything else is the candidate. What the reader
   inferred rather than read (a notice period written in prose) is the only
   thing allowed to interrupt, because it is the only thing needing a human. */
function cvResume(app, st){
  const c = st.cvs[st.open];
  const nodes = [];

  const back = el('button','btn btn--ghost btn--sm', ic('chevL', 12) + 'Candidates');
  back.type = 'button';
  back.onclick = () => { st.open = null; repaintApp(app); };
  const bar = el('div');
  bar.append(back);
  nodes.push(bar);

  const hd = el('div');
  hd.innerHTML =
    '<div style="font-size:var(--t-15);font-weight:var(--w-semi);letter-spacing:var(--ls-snug);color:var(--text)">' + esc(c.name) + '</div>' +
    '<div style="margin-top:2px;font-size:var(--t-12);color:var(--text-2)">' + esc(c.title) + ' · ' + esc(c.loc) + '</div>' +
    '<div class="field__help" style="margin-top:2px">' + esc(c.years) + ' of experience · notice period ' + esc(c.notice) +
      (c.flag ? ' <span class="badge badge--warn">check</span>' : '') + '</div>';
  nodes.push(hd);

  const sum = el('p');
  sum.style.cssText = 'margin:0;font-size:var(--t-12);line-height:var(--lh-prose);color:var(--text-2)';
  sum.textContent = c.summary;
  nodes.push(sum);

  const ex = appCard('Experience');
  c.exp.forEach(([role, org, span, did]) => {
    const row = el('div');
    row.style.cssText = 'padding:var(--s-2) 0';
    row.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:var(--s-2)">' +
        '<span style="font-size:var(--t-12);font-weight:var(--w-medium);color:var(--text)">' + esc(role) + '</span>' +
        '<span style="font-size:var(--t-11);color:var(--text-3)">' + esc(org) + '</span>' +
        '<span class="toolbar__spacer"></span>' +
        '<span class="t-mono" style="font-size:var(--t-11);color:var(--text-4);flex:none">' + esc(span) + '</span>' +
      '</div>' +
      '<div style="margin-top:2px;font-size:var(--t-12);line-height:var(--lh-ui);color:var(--text-3)">' + esc(did) + '</div>';
    ex.body.append(row);
  });
  nodes.push(ex.card);

  const ed = appCard('Education');
  ed.body.innerHTML =
    '<div style="font-size:var(--t-12);color:var(--text-2)">' + esc(c.edu) + '</div>' +
    '<div class="field__help" style="margin-top:var(--s-2)">Works with ' + esc(c.skills) + '</div>';
  nodes.push(ed.card);

  if (c.note) nodes.push(banner('warn', esc(c.note)));
  nodes.push(helpNote('Read from ' + c.file + ' · ' + c.pages + '.'));
  return nodes;
}

/* ----------------------------------------------------------------- invx
   The invoice extractor has the CV extractor's two screens — the tray, and
   behind each row the invoice itself, with one way back — plus a second way
   in: a capture from the computer's camera, fed by its own pretend pool so
   the two buttons keep meaning two different things. The list is a LEDGER,
   not a list of names: vendor, date and amount line up as columns, because
   ten invoices are compared by their numbers. Totals are re-added rather
   than trusted, and a figure the frame cropped out says so instead of
   guessing. */
const INV_SRC = { upload:'from a file', photo:'from a photo', camera:'from the camera' };
function appInvx(app, p){
  const st = appState(app);
  if (st.open != null) return invDetail(app, st);
  const nodes = [];
  const intake = (v, verb) => {
    st.invs.push(v);
    repaintApp(app);
    toast(v.file + ' ' + verb + ' — Digitise reads it');
  };

  const up = appCard('Add an invoice');
  const box = el('button','dropbox');
  box.type = 'button';
  box.innerHTML =
    '<span style="display:flex;color:var(--text-4)">' + ic('receipt', 18) + '</span>' +
    '<span><b>Add a picture</b> — photo, scan or pdf</span>' +
    '<span class="field__help">' + (st.pics.length
      ? plural(st.pics.length, 'pretend picture') + ' left in the tray — uploads are simulated'
      : 'The tray is empty — every pretend picture is in') + '</span>';
  box.onclick = () => {
    if (!st.pics.length)
      return toast('Nothing left to upload — the pretend tray is empty');
    intake(st.pics.shift(), 'uploaded');
  };
  const cam = el('button','btn btn--ghost btn--sm', ic('camera', 13) + 'Use the camera');
  cam.type = 'button';
  cam.title = 'The capture is simulated — nothing is filmed';
  cam.onclick = () => {
    if (!st.shots.length)
      return toast('Nothing in front of the pretend camera — both captures are in');
    intake(st.shots.shift(), 'captured');
  };
  const acts0 = el('div','live__acts');
  acts0.append(cam);
  up.body.append(box, acts0);
  nodes.push(up.card);

  const unread = st.invs.filter(v => !v.read).length;
  let lead;
  if (unread){
    lead = el('button','btn btn--primary btn--sm',
      ic('spark', 12) + 'Digitise ' + (unread > 1 ? unread + ' invoices' : 'invoice'));
    lead.type = 'button';
    lead.onclick = () => {
      st.invs.forEach(v => v.read = true);
      repaintApp(app);
      toast(plural(unread, 'invoice') + ' digitised — the ledger has the numbers');
    };
  } else lead = el('span','badge badge--ok','all digitised');
  const list = appCard('Invoices', lead);

  /* The ledger. An unread row holds its filename where the vendor will be:
     the columns say what Digitise is about to fill in. */
  const tbl = el('table','table table--rows');
  tbl.innerHTML = '<thead><tr><th>Vendor</th><th>Issued</th><th class="num">Total</th></tr></thead>';
  const tb = el('tbody');
  st.invs.forEach((v, i) => {
    const tr = el('tr');
    tr.innerHTML = v.read
      ? '<td><span style="display:inline-flex;align-items:center;gap:var(--s-2)">' + dotLead('ok') +
          '<span style="color:var(--text);font-weight:var(--w-medium)">' + esc(v.vendor) + '</span></span></td>' +
        '<td style="white-space:nowrap">' + esc(v.issued) + '</td>' +
        '<td class="num">' + esc(v.amounts[v.amounts.length - 1][1]) + '</td>'
      : '<td><span style="display:inline-flex;align-items:center;gap:var(--s-2)">' + dotLead('') +
          '<span>' + esc(v.file) + '</span></span></td>' +
        '<td style="color:var(--text-4)">' + (v.src === 'camera' ? 'captured' : 'uploaded') + '</td>' +
        '<td class="num" style="color:var(--text-4)">—</td>';
    tr.style.cursor = 'pointer';
    tr.title = v.read ? 'Open the invoice' : 'Not digitised yet';
    tr.onclick = () => {
      if (!v.read) return toast(v.file + ' is not digitised yet — press Digitise first');
      st.open = i;
      repaintApp(app);
      $('#appSheetBody').scrollTop = 0;
    };
    tb.append(tr);
  });
  tbl.append(tb);
  list.body.append(tbl);
  nodes.push(list.card, helpNote('Click a row to open the invoice.'));
  return nodes;
}

/* The invoice, as a page: who is asking for what, by when, and the amounts
   re-added at the bottom the way the paper adds them. One control — the way
   back to the ledger. */
function invDetail(app, st){
  const v = st.invs[st.open];
  const nodes = [];

  const back = el('button','btn btn--ghost btn--sm', ic('chevL', 12) + 'Invoices');
  back.type = 'button';
  back.onclick = () => { st.open = null; repaintApp(app); };
  const bar = el('div');
  bar.append(back);
  nodes.push(bar);

  const hd = el('div');
  hd.innerHTML =
    '<div style="font-size:var(--t-15);font-weight:var(--w-semi);letter-spacing:var(--ls-snug);color:var(--text)">' + esc(v.vendor) + '</div>' +
    '<div style="margin-top:2px;font-size:var(--t-12);color:var(--text-2)">Invoice ' + esc(v.no) + '</div>' +
    '<div class="field__help" style="margin-top:2px">Issued ' + esc(v.issued) + ' · due ' + esc(v.due) +
      (v.flag ? ' <span class="badge badge--warn">check</span>' : '') + '</div>';
  nodes.push(hd);

  const am = appCard('Amounts');
  v.amounts.forEach(([k, val, flag], i) => {
    const last = i === v.amounts.length - 1;
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:baseline;gap:var(--s-3);padding:var(--s-1) 0' +
      (last ? ';border-top:var(--border) solid var(--line);margin-top:var(--s-1);padding-top:var(--s-2)' : '');
    row.innerHTML =
      '<span style="flex:1;font-size:var(--t-12);color:' + (last ? 'var(--text)' : 'var(--text-3)') + '">' + esc(k) +
        (flag === 'check' ? ' <span class="badge badge--warn">check</span>' : '') + '</span>' +
      '<span class="t-mono" style="font-size:var(--t-12);color:' + (last ? 'var(--text)' : 'var(--text-2)') +
        (last ? ';font-weight:var(--w-semi)' : '') + '">' + esc(val) + '</span>';
    am.body.append(row);
  });
  nodes.push(am.card);

  if (v.check) nodes.push(banner('info', esc(v.check)));
  if (v.note)  nodes.push(banner('warn', esc(v.note)));

  nodes.push(helpNote('Read ' + INV_SRC[v.src] + ' — ' + v.file + ' · ' + v.pages + '.'));
  return nodes;
}

/* --------------------------------------------------------------- files
   Clicking a file attaches it to the next message. That is the whole reason
   this app is beside the composer rather than a page of its own. */
function appFiles(app, p){
  const c = appCard('Uploads');
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
   A headline is a card: its picture, the title (wrapping — the headline IS
   the content), where and when, and three verbs. Summarize opens the summary
   right here and marks it read; Ask in chat writes the question into the
   composer; Save files the summary in the results column. Topics filter the
   feed, Refresh is honest about being a fixture, and the pictures are inline
   SVGs drawn from the tokens — six abstract editorial marks, cycled, because
   fetching real ones would be the page's only network call. */
const NEWS_ART = [
  '<svg viewBox="0 0 600 240"><circle cx="430" cy="118" r="150" fill="var(--accent-soft)"/><circle cx="430" cy="118" r="92" fill="none" stroke="var(--accent-line)" stroke-width="2"/><circle cx="430" cy="118" r="16" fill="var(--accent)"/><rect x="56" y="114" width="230" height="4" rx="2" fill="var(--line-strong)"/><rect x="56" y="132" width="140" height="4" rx="2" fill="var(--line)"/></svg>',
  '<svg viewBox="0 0 600 240"><rect x="70" y="150" width="52" height="50" rx="4" fill="var(--line-strong)"/><rect x="150" y="120" width="52" height="80" rx="4" fill="var(--line-strong)"/><rect x="230" y="132" width="52" height="68" rx="4" fill="var(--line-strong)"/><rect x="310" y="88" width="52" height="112" rx="4" fill="var(--accent)"/><rect x="390" y="64" width="52" height="136" rx="4" fill="var(--accent-soft)"/><rect x="470" y="104" width="52" height="96" rx="4" fill="var(--line)"/><rect x="56" y="208" width="488" height="3" rx="1.5" fill="var(--line-strong)"/></svg>',
  '<svg viewBox="0 0 600 240"><path d="M0 190 L180 70 L340 150 L600 30 L600 240 L0 240 Z" fill="var(--warn-soft)"/><path d="M0 190 L180 70 L340 150 L600 30" fill="none" stroke="var(--warn)" stroke-width="3"/><circle cx="340" cy="150" r="7" fill="var(--warn)"/></svg>',
  '<svg viewBox="0 0 600 240"><rect x="120" y="30" width="360" height="180" rx="10" fill="none" stroke="var(--accent-line)" stroke-width="2"/><rect x="150" y="62" width="130" height="10" rx="5" fill="var(--accent)"/><rect x="150" y="92" width="300" height="6" rx="3" fill="var(--line-strong)"/><rect x="150" y="112" width="300" height="6" rx="3" fill="var(--line)"/><rect x="150" y="132" width="240" height="6" rx="3" fill="var(--line)"/><rect x="150" y="164" width="90" height="18" rx="9" fill="var(--accent-soft)"/></svg>',
  '<svg viewBox="0 0 600 240"><circle cx="240" cy="120" r="95" fill="var(--ok-soft)"/><circle cx="360" cy="120" r="95" fill="var(--accent-soft)"/><path d="M300 46 a95 95 0 0 1 0 148 a95 95 0 0 1 0 -148" fill="var(--raised-2)"/><circle cx="300" cy="120" r="10" fill="var(--ok)"/></svg>',
  '<svg viewBox="0 0 600 240"><path d="M140 190 a160 160 0 0 1 320 0" fill="none" stroke="var(--line)" stroke-width="16"/><path d="M140 190 a160 160 0 0 1 214 -150" fill="none" stroke="var(--accent)" stroke-width="16" stroke-linecap="round"/><circle cx="300" cy="190" r="8" fill="var(--text-4)"/><rect x="290" y="110" width="20" height="80" rx="8" fill="var(--raised-2)"/></svg>'
];
function appNews(app, p){
  const st = appState(app);
  const nodes = [];

  /* one toolbar: the topics, then how fresh it is */
  const topics = ['All'].concat(p.items.map(x => x.topic)
    .filter((t, i, a) => a.indexOf(t) === i));
  const bar = el('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:var(--s-2)';
  bar.append(segCtl(topics, st.topic, v => { st.topic = v; repaintApp(app); }));
  bar.append(el('span','toolbar__spacer'));
  const refresh = el('button','iconbtn iconbtn--xs', ic('retry', 12));
  refresh.type = 'button';
  refresh.title = 'Refresh the feed';
  refresh.onclick = () => toast('Refreshed — nothing new upstream, the feed is simulated');
  bar.append(refresh);
  nodes.push(bar);

  p.items.forEach((it, i) => {
    if (st.topic !== 'All' && it.topic !== st.topic) return;
    const card = el('article','newscard');
    card.innerHTML =
      '<figure class="newscard__img" aria-hidden="true">' + NEWS_ART[i % NEWS_ART.length] + '</figure>' +
      '<h3 class="newscard__title">' + esc(it.t) + '</h3>' +
      '<div class="newscard__meta">' +
        (st.read[i] ? '' : '<span class="dot dot--unread"></span>') +
        '<span>' + esc(it.src) + ' · ' + esc(it.when) + ' · ' + esc(it.topic) + '</span>' +
      '</div>' +
      (st.sum[i] ? '<p class="newscard__sum">' + esc(it.sum) + '</p>' : '');
    const acts = el('div','newscard__acts');
    const verb = (label, run) => {
      const b = el('button','linkbtn', label);
      b.type = 'button';
      b.onclick = () => { st.read[i] = true; run(); };
      return b;
    };
    acts.append(
      verb(st.sum[i] ? 'Hide the summary' : 'Summarize',
        () => { st.sum[i] = !st.sum[i]; repaintApp(app); }),
      verb('Ask in chat', () => { repaintApp(app); askAbout(it.t, it.src); }),
      verb('Save', () => {
        repaintApp(app);
        fileResult({ id:'r-news-' + i, title:it.t, from:app.name, shape:'doc', size:'summary',
          md:'# ' + it.t + '\n\n' + it.src + ' · ' + it.when + '\n\n' + it.sum });
      })
    );
    card.append(acts);
    nodes.push(card);
  });

  nodes.push(helpNote('Summarize reads it here; Ask in chat writes the question into the composer; Save files the summary in the results column.'));
  return nodes;
}

/* ---------------------------------------------------------------- note
   Two screens, like every app that holds more than one thing: the note
   list, and behind each name the note itself in an editor. The editor is
   contenteditable with a small formatting hand — bold to strikethrough,
   three heading sizes, three list kinds, quote, code, rule, undo and redo —
   and its first line is still the title, so there is no title field. What
   you make survives switching apps, sections and threads. */
const noteTitle = n => {
  const d = el('div');
  d.innerHTML = n.html;
  const t = (d.firstElementChild ? d.firstElementChild.textContent : d.textContent).trim();
  return t.slice(0, 48) || 'Empty note';
};
function noteWords(n){
  const d = el('div');
  d.innerHTML = n.html;
  const t = d.textContent.trim();
  return plural(t ? t.split(/\s+/).length : 0, 'word');
}
function appNoteSurface(app){
  const st = appState(app);
  if (st.open != null) return noteEditor(app, st);

  const add = el('button','btn btn--ghost btn--sm', ic('plus', 12) + 'New');
  add.type = 'button';
  add.onclick = () => {
    st.notes.unshift({ html:'', tags:[] });
    st.open = 0;
    repaintApp(app);
  };
  const c = appCard('Notes', add);
  st.notes.forEach((n, i) => {
    c.body.append(listRow({
      title:noteTitle(n),
      sub:noteWords(n) + (n.tags.length ? ' · ' + n.tags.join(' · ') : ''),
      onClick:() => { st.open = i; repaintApp(app); }
    }));
  });
  return [c.card, helpNote('Click a note to read or edit it.')];
}

/* The editor. Formatting goes through the browser's own editing commands —
   the note is HTML, styled by .notebody — and the note saves on every
   keystroke, into the instance, with no repaint: a repaint per character
   would take the caret with it. A ☐ in a checklist toggles when clicked. */
function noteEditor(app, st){
  const note = st.notes[st.open];
  const nodes = [];

  const back = el('button','btn btn--ghost btn--sm', ic('chevL', 12) + 'Notes');
  back.type = 'button';
  back.onclick = () => { st.open = null; st.tagging = false; repaintApp(app); };
  const bar = el('div');
  bar.append(back);
  nodes.push(bar);

  const ed = el('div','notebody');
  ed.contentEditable = 'true';
  ed.innerHTML = note.html;
  ed.setAttribute('data-empty','First line is the title…');
  ed.oninput = () => { note.html = ed.innerHTML; };
  /* Clicking a checklist mark flips it — the character IS the checkbox. */
  ed.onclick = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const nd = sel.anchorNode;
    if (!nd || nd.nodeType !== 3) return;
    for (const j of [sel.anchorOffset, sel.anchorOffset - 1]){
      const ch = nd.textContent[j];
      if (ch === '☐' || ch === '☑'){
        nd.textContent = nd.textContent.slice(0, j) + (ch === '☐' ? '☑' : '☐') + nd.textContent.slice(j + 1);
        note.html = ed.innerHTML;
        return;
      }
    }
  };

  /* One row of controls, families separated by hairlines. Buttons take
     mousedown so the selection in the editor is still there to format. */
  const tb = el('div','notebar');
  const press = (label, title, run) => {
    const b = el('button','iconbtn iconbtn--xs', label);
    b.type = 'button';
    b.title = title;
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { ed.focus(); run(); note.html = ed.innerHTML; };
    return b;
  };
  const cmd = (c, v) => () => document.execCommand(c, false, v || null);
  const block = tag => () => {
    const cur = String(document.queryCommandValue('formatBlock')).toLowerCase();
    document.execCommand('formatBlock', false, cur === tag ? '<p>' : '<' + tag + '>');
  };
  const sep = () => el('span','notebar__sep');
  tb.append(
    press('<b>B</b>', 'Bold — ⌘B', cmd('bold')),
    press('<i>I</i>', 'Italic — ⌘I', cmd('italic')),
    press('<u>U</u>', 'Underline — ⌘U', cmd('underline')),
    press('<s>S</s>', 'Strikethrough', cmd('strikeThrough')),
    sep(),
    press('H1', 'Heading 1', block('h1')),
    press('H2', 'Heading 2', block('h2')),
    press('H3', 'Heading 3', block('h3')),
    sep(),
    press(ic('ulist', 13), 'Bulleted list', cmd('insertUnorderedList')),
    press(ic('olist', 13), 'Numbered list', cmd('insertOrderedList')),
    press(ic('clist', 13), 'Checklist — click a ☐ to tick it', () => {
      document.execCommand('insertUnorderedList');
      document.execCommand('insertText', false, '☐ ');
    }),
    sep(),
    press(ic('quote', 13), 'Quote', block('blockquote')),
    press(ic('code', 13), 'Code block', block('pre')),
    press(ic('hrule', 13), 'Rule', cmd('insertHorizontalRule')),
    sep(),
    press(ic('undo', 13), 'Undo', cmd('undo')),
    press(ic('redo', 13), 'Redo', cmd('redo'))
  );
  nodes.push(tb, ed);

  /* Tags: chips with a way out, and + Tag becomes the input when asked. */
  const tags = el('div');
  tags.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:var(--s-2)';
  note.tags.forEach((t, k) => {
    const chip = el('span','chip chip--removable','<span>' + esc(t) + '</span>');
    const x = el('button','chip__x', ic('x', 11));
    x.type = 'button';
    x.title = 'Remove the tag';
    x.onclick = () => { note.tags.splice(k, 1); repaintApp(app); };
    chip.append(x);
    tags.append(chip);
  });
  if (st.tagging){
    const inp = el('input','input');
    inp.type = 'text';
    inp.placeholder = 'finance';
    inp.style.width = 'calc(var(--s-16) * 2)';
    const commit = () => {
      const v = inp.value.trim().toLowerCase();
      if (v && note.tags.indexOf(v) < 0) note.tags.push(v);
      st.tagging = false;
      repaintApp(app);
    };
    inp.onblur = commit;
    inp.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); commit(); } };
    tags.append(inp);
    requestAnimationFrame(() => inp.focus());
  } else {
    const addTag = el('button','linkbtn','+ Tag');
    addTag.type = 'button';
    addTag.onclick = () => { st.tagging = true; repaintApp(app); };
    tags.append(addTag);
  }
  nodes.push(tags);

  /* The note saves as you type; Save is the door that says so — it names
     what was kept and puts you back on the list. */
  const acts = el('div','live__acts');
  const save = el('button','btn btn--primary btn--sm', ic('check', 13) + 'Save');
  save.type = 'button';
  save.onclick = () => {
    note.html = ed.innerHTML;
    st.open = null; st.tagging = false;
    repaintApp(app);
    toast('Saved — ' + noteTitle(note));
  };
  acts.append(save);
  nodes.push(acts);
  return nodes;
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

  /* The add row leads: this app exists to catch the next thing before it is
     forgotten, so writing one down must not wait below the list. It takes
     the item and, if asked, when it is due — the same next seven days the
     calendar offers, since nobody dates a todo by typing. */
  const add = el('form');
  /* A raised tray, so the way in reads as a place and not a stray row. */
  add.style.cssText = 'display:flex;gap:var(--s-2);flex-wrap:wrap;margin-bottom:var(--s-3);' +
    'padding:var(--s-2);border-radius:var(--r-md);background:var(--raised)';
  const input = el('input','input');
  input.type = 'text';
  input.placeholder = 'Add an item…';
  input.style.cssText = 'flex:1;min-width:0';
  const whens = ['No due','Today','Tomorrow'];
  for (let i = 2; i < 7; i++) whens.push(calDayLabel(i));
  let due = 'No due';
  const sel = selectCtl(whens, due, v => due = v);
  sel.style.width = 'auto';
  const go = el('button','btn btn--secondary btn--sm','Add');
  go.type = 'submit';
  add.append(input, sel, go);
  add.onsubmit = e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    /* 'Today' and 'Tomorrow' are stored the way the fixture says them. */
    const when = due === 'No due' ? ''
      : (due === 'Today' || due === 'Tomorrow') ? due.toLowerCase() : due;
    st.items.unshift({ t:v, due:when, done:false });
    repaintApp(app);
  };
  c.body.append(add);

  const list = el('div','picklist');
  list.style.cssText = 'border:0;border-radius:0';
  st.items.forEach(it => {
    const row = el('label','picklist__row');
    row.dataset.done = String(it.done);
    const box = el('input','check check--ink');
    box.type = 'checkbox';
    box.checked = it.done;
    box.onchange = () => { it.done = box.checked; repaintApp(app); };
    row.append(box);
    row.append(el('span','picklist__main','<span class="picklist__nm">' + esc(it.t) + '</span>'));
    if (it.due) row.append(el('span','badge' + (it.due === 'today' ? ' badge--warn' : ''), esc(it.due)));
    list.append(row);
  });
  c.body.append(list);
  return [c.card];
}

function appSurface(app){
  const p = D.APP_PANELS[app.id];
  if (!p) return [emptyState('cube', app.name, app.desc)];
  if (p.s === 'agenda')  return appAgenda(app, p);
  if (p.s === 'cvx')     return appCvx(app, p);
  if (p.s === 'invx')    return appInvx(app, p);
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

/* `opts` lets a turn run somewhere other than the chat pane — the maker
   overlay streams into its own log. opts.host is the container, opts.scroll
   its scroller, opts.thread the record the turn is written into, opts.busy a
   lock indicator for the host's own send button, opts.sync a redraw called
   once the script's work has been applied, opts.who the name the reply speaks
   under. With no opts, everything below is exactly what it always was. */
async function runTurn(userText, script, opts){
  if (state.busy) return;
  state.busy = true;
  $('#sendBtn').disabled = true;
  if (opts && opts.busy) opts.busy(true);
  syncStatus();
  const down = opts ? (opts.scroll || (() => {})) : scrollDown;

  /* The thread this turn belongs to, resolved before anything is appended so
     the turn can be written into it at the end. */
  const thread = opts ? (opts.thread || null)
    : (state.section === 'chat' ? find(D.THREADS, state.item.chat) : null);

  /* An empty thread is showing the hero, which is centred and therefore not a
     reading column. The first turn replaces it with one. */
  let inner = opts ? opts.host : $('.pane__measure', $('#mainBody'));
  if (!inner){
    detachComposer();          /* the hero has it — see render() */
    $('#mainBody').innerHTML = '';
    inner = el('div','pane__measure');
    $('#mainBody').append(inner);
  }
  const emptyNode = $('.empty', inner);
  if (emptyNode) emptyNode.remove();

  inner.append(msgNode({ role:'user', text:userText }));
  down();

  /* A scripted case supplies its own turn; anything typed cycles the canned
     replies as before. */
  const reply = script || D.REPLIES[replyIx++ % D.REPLIES.length];

  const wrap = el('div','msg');
  wrap.dataset.role = 'ai';
  const head = el('div','msg__head');
  /* A bound assistant answers under its own name — that is what binding one
     means. The model it routes to is still in the composer. A host can name
     the speaker itself (the test bench answers as the record on trial). */
  head.innerHTML = '<span class="msg__who">' +
    esc(opts && opts.who ? opts.who :
        (state.assistant ? find(D.ASSISTANTS, state.assistant).name : state.model)) +
                   '</span><span class="msg__meta" data-dur>thinking...</span>';
  wrap.append(head);

  const trace = traceNode([], '', true);
  trace.classList.add('msg__trace');
  const tbody = $('.trace__body', trace);
  tbody.innerHTML = '';
  $('[data-label]', trace).textContent = 'Working...';
  wrap.append(trace);
  inner.append(wrap);
  down();

  let elapsed = 0;
  for (const s of reply.steps){
    const step = el('div','step',
      '<span class="dot dot--run is-live"></span>' +
      '<span class="step__name">' + esc(s.n) + '</span>' +
      '<span class="step__detail">' + esc(s.d) + '</span>' +
      '<span class="step__t"></span>');
    tbody.append(step);
    down();
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

  /* A script may carry work. It is applied once the steps have run, so the
     reply below describes something that has already happened — and the host
     redraws whatever shows the record (the maker's live pane). */
  if (reply.apply){
    reply.apply();
    if (opts && opts.sync) opts.sync();
  }

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
        if (i % 8 === 0){ syncStatus(); down(); }
        await sleep(11 + (i % 3) * 6);
      }
    }
    if (caret) caret.classList.remove('has-caret');
  }
  body.classList.remove('is-streaming');
  $$('.is-revealed', body).forEach(e => e.classList.remove('is-revealed'));

  /* The artifact lands in the pane, and the thread keeps the reference. The
     results column is not opened over an overlay's shoulder. */
  if (reply.artifactId){
    const a = D.ARTIFACT_BY_ID(reply.artifactId);
    if (a){ wrap.append(artRefNode(a)); if (!opts) openArtifact(a.id); }
  }
  /* The widget stays in the thread. What it has settled on is registered as a
     named result in the artifact column — immediately for a table, a chart or a
     snippet, and only once acted on for a form or a questionnaire. */
  let w = null;
  if (reply.w){
    w = makeLive(reply.w, thread ? thread.title : 'this thread');
    /* Where the widget was authored. A program widget writes this into its
       schedule row, so the row's Chat cell can point back here. */
    w.thread = thread ? thread.id : null;
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
    /* The topbar counted turns before this one existed — but only the chat
       pane's topbar; an overlay turn leaves the page behind it alone. */
    if (!opts) syncHead();
  }

  state.turns += 2;
  state.busy = false;
  $('#sendBtn').disabled = !$('#composerInput').value.trim();
  if (opts && opts.busy) opts.busy(false);
  syncStatus();
  down();
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
    items.push({ g:d.kind === 'widget' ? 'Widgets' : 'Result templates', nm:d.name, sub:d.shape,
                 run:() => select('build', key(d.kind === 'widget' ? 'wg' : 'tp', d.id)) }); });

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
  /* A custom accent is computed per theme, so flipping recomputes it. */
  applyAccent();
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

/* ------------------------------------------------------------ the accent
   state.accent is '' (the default), a preset name, or a hue number. Presets
   live in tokens.css as data-accent schemes; a custom hue is run through the
   same recipe at runtime, and recomputed when the theme flips, because an
   accent deep enough for a light page is too dark for a dark one. */
function applyAccent(){
  const root = document.documentElement;
  const a = state.accent || '';
  ['--accent','--accent-hi','--accent-soft','--accent-line']
    .forEach(k => root.style.removeProperty(k));
  if (typeof a === 'number'){
    root.dataset.accent = 'custom';
    const dark = root.dataset.theme === 'dark';
    const s = dark ? ' 62% ' : ' 55% ';
    const l = dark ? '68%' : '46%', hi = dark ? '75%' : '39%';
    root.style.setProperty('--accent', 'hsl(' + a + s + l + ')');
    root.style.setProperty('--accent-hi', 'hsl(' + a + s + hi + ')');
    root.style.setProperty('--accent-soft', 'hsl(' + a + s + l + ' / ' + (dark ? '.14' : '.10') + ')');
    root.style.setProperty('--accent-line', 'hsl(' + a + s + l + ' / ' + (dark ? '.34' : '.28') + ')');
  } else if (a){
    root.dataset.accent = a;
  } else {
    delete root.dataset.accent;
  }
  store('accent', String(a));
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
  /* The results column starts closed. It is a store, and a store earns its
     width when something new is filed — fileResult and a settling widget both
     open it explicitly — not on arrival. The reader's own choice (⌘. or the
     topbar toggle) always wins over this default. */
  if (kind === 'art') return false;
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
    /* Typed into an empty chat while the hero's Auto program mode is up: the
       first turn consumes the mode — the sentence is a routine, so the reply
       is the parsed program rather than a scripted answer. After that turn the
       thread is an ordinary thread. The project guard keeps the project page's
       own behaviour: it has an Auto program surface of its own. */
    const t0 = state.section === 'chat' ? byId(D.THREADS, state.item.chat) : null;
    const auto = !!t0 && !t0.msgs.length && heroMode === 'Auto program' &&
                 kindOf(state.item.chat) !== 'p';
    /* Typed on a project page: the chat stays ON the project page. A first
       message opens a thread in the project (which binds its assistant) and
       the project's own chat area hosts the turn — runTurn streams into it
       and records onto the thread, exactly as the test bench does. */
    if (state.section === 'chat' && kindOf(state.item.chat) === 'p'){
      const pid = idOf(state.item.chat);
      if (!projThread){
        const t = { id:'n' + (++newThreadN), title:'New chat', when:'now', group:'Today',
                    project:pid, msgs:[] };
        D.THREADS.unshift(t);
        const p = find(D.PROJECTS, pid);
        if (p && p.assistant){
          const a = D.ASSISTANTS.filter(x => x.name === p.assistant)[0];
          if (a) state.assistant = a.id;
        }
        projThread = t.id;
      }
      render();
      syncAssistantChip();
      const th = byId(D.THREADS, projThread);
      const scroll = () => {
        const sc = $('.projmain');
        if (sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 260)
          sc.scrollTo({ top:sc.scrollHeight, behavior:'instant' });
      };
      runTurn(v, undefined, { host:$('.projmain .pane__measure'), thread:th, scroll:scroll })
        .then(() => {
          /* The first turn names the thread; the bar and the panel say so. */
          if (state.section === 'chat' && state.item.chat === key('p', pid)) render();
        });
      return;
    }
    syncAssistantChip();
    runTurn(v, auto ? autoScript(v) : undefined);
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

  /* run history */
  $('#schedClose').onclick = closeSched;
  $('#schedScrim').addEventListener('mousedown', e => { if (e.target === $('#schedScrim')) closeSched(); });

  /* the edit dialog — the scrim discards like Cancel; only Save commits */
  $('#editClose').onclick = closeEdit;
  $('#editCancel').onclick = closeEdit;
  $('#editSave').onclick = saveEdit;
  $('#editScrim').addEventListener('mousedown', e => { if (e.target === $('#editScrim')) closeEdit(); });

  /* the maker */
  $('#makerClose').onclick = closeMaker;
  $('#makerScrim').addEventListener('mousedown', e => { if (e.target === $('#makerScrim')) closeMaker(); });
  $('#makerSend').onclick = makerSubmit;
  /* Enter sends, Shift+Enter breaks the line — the small box convention. */
  $('#makerInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); makerSubmit(); }
  });

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
    } else if (e.key === 'Escape' && $('#editScrim').dataset.open === 'true'){
      /* Opened over whatever page armed it, so it takes Escape first —
         and Escape means Cancel: the staged copy is dropped unsaved. */
      closeEdit();
    } else if (e.key === 'Escape' && $('#asstScrim').dataset.open === 'true'){
      closeAssistant();
    } else if (e.key === 'Escape' && $('#shareScrim').dataset.open === 'true'){
      /* Opened last, so it takes Escape first. */
      closeShare();
    } else if (e.key === 'Escape' && $('#postScrim').dataset.open === 'true'){
      /* Opened from the project page, so it is above everything on it. */
      closePost();
    } else if (e.key === 'Escape' && $('#makerScrim').dataset.open === 'true'){
      /* The maker opens over Build, so it yields before Build's own layers. */
      closeMaker();
    } else if (e.key === 'Escape' && $('#schedScrim').dataset.open === 'true'){
      closeSched();
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
  /* The remembered accent: a preset's name, or a bare number for a hue. */
  const acc = load('accent') || '';
  state.accent = /^\d+$/.test(acc) ? +acc : acc;
  applyAccent();
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
