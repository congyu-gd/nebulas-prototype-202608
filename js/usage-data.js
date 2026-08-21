/* ============================================================================
   usage-data.js — the two monitoring perspectives.

   The other twelve pages answer "what should exist". These two answer "what
   happened", so they are views rather than modules: nothing here is saved,
   nothing counts toward the thirteen, and every threshold a number is judged
   against is READ FROM THE CONFIGURATION — the budget from module 13, the SLO
   from 08, the quotas from 12, the models from 05, the metered dimensions from
   07. A dashboard that invents its own limits cannot tell you anything about
   this deployment.

   Figures are generated from a seeded PRNG, not Math.random, so the same page
   renders the same numbers every time. Switching range or scope changes the
   seed, which is why the shape of a series changes with it.

   They are example data, and they are here before the tenant is: this is a
   prototype, so a reader arriving at these pages should see what they report
   rather than an empty state explaining what they would report. The header
   badge says `Example data` until the tenant exists.

   People are fictional. An adoption page that names real colleagues is a
   surveillance tool wearing a dashboard's clothes.
   ========================================================================= */

const VIEW_PHASE = 'usage';

/* ================================================================= seeded rng
   FNV-1a for the seed, mulberry32 for the stream. Both are short, and neither
   needs a dependency. */
function useed(s){
  let h = 2166136261 >>> 0;
  s = String(s);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function urng(seed){
  let a = useed(seed);
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* A plausible series: a random walk around a base with a slight drift, never
   negative, so a chart reads as a measurement rather than as noise. `cap` is
   for the series that have a real ceiling — a utilisation cannot pass 100%,
   and weekly actives cannot pass the seats that were bought. */
function uwalk(seed, n, base, vol, drift, cap){
  const r = urng(seed), out = [];
  let v = base;
  for(let i = 0; i < n; i++){
    v = v * (1 + (r() - 0.5) * vol) + base * (drift || 0) / n;
    out.push(Math.min(cap == null ? Infinity : cap, Math.max(base * 0.15, v)));
  }
  return out;
}
const usum = a => a.reduce((x, y) => x + y, 0);
const uavg = a => usum(a) / a.length;

/* ================================================================ formatting */
function utrim(x){
  const s = x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
  return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}
function ucount(n){
  const a = Math.abs(n);
  if(a >= 1e9) return utrim(n / 1e9) + 'B';
  if(a >= 1e6) return utrim(n / 1e6) + 'M';
  if(a >= 1e3) return utrim(n / 1e3) + 'k';
  return String(Math.round(n));
}
function umoney(n){
  const neg = n < 0;
  return (neg ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
}
const upct = (x, d) => (d ? x.toFixed(d) : String(Math.round(x))) + '%';

/* ================================================================== fixtures
   Seats add up to 240. The weights are the share of platform usage, which is
   deliberately not the share of seats — that gap is the point of the
   department card. */
const UDEPTS = [
  { nm:'Engineering', seats:78, w:.34 },
  { nm:'Sales',       seats:46, w:.19 },
  { nm:'Support',     seats:38, w:.16 },
  { nm:'Finance',     seats:22, w:.10 },
  { nm:'Marketing',   seats:20, w:.08 },
  { nm:'Operations',  seats:18, w:.07 },
  { nm:'Legal',       seats:10, w:.04 },
  { nm:'People',      seats: 8, w:.02 }
];
const UPEOPLE = [
  { nm:'A. Okonkwo',  dept:'Engineering', ref:'4c1f' },
  { nm:'L. Marchand', dept:'Finance',     ref:'8ba2' },
  { nm:'S. Haruna',   dept:'Support',     ref:'21d7' },
  { nm:'D. Vasquez',  dept:'Sales',       ref:'9e04' },
  { nm:'K. Lindqvist',dept:'Engineering', ref:'b35c' },
  { nm:'R. Fontaine', dept:'Marketing',   ref:'7f68' },
  { nm:'M. Adeyemi',  dept:'Operations',  ref:'0a93' },
  { nm:'J. Petrov',   dept:'Legal',       ref:'cd51' }
];
const UASSTS = [
  { nm:'Revenue analyst',  dept:'Finance' },
  { nm:'Contract reviewer',dept:'Legal' },
  { nm:'Support triage',   dept:'Support' },
  { nm:'Pipeline notes',   dept:'Sales' },
  { nm:'Data profiler',    dept:'Engineering' }
];

/* ==================================================================== ranges
   `f` scales a monthly baseline to the window. The number of points is the
   number of bars a chart draws, and `per` names what one bar is. */
const URANGES = [
  { k:'24h',     l:'24 hours', pts:24, f:1 / 30,  per:'hour' },
  { k:'7d',      l:'7 days',   pts:7,  f:7 / 30,  per:'day' },
  { k:'30d',     l:'30 days',  pts:30, f:1,       per:'day' },
  { k:'quarter', l:'Quarter',  pts:13, f:3,       per:'week' }
];
const urange = k => URANGES.find(r => r.k === k) || URANGES[2];

function ulabels(r){
  if(r.k === '24h')     return Array.from({length:24}, (_, i) => String(i).padStart(2,'0') + ':00');
  if(r.k === '7d')      return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  if(r.k === 'quarter') return Array.from({length:13}, (_, i) => 'W' + (i + 1));
  return Array.from({length:30}, (_, i) => 'Day ' + (i + 1));
}

/* A delta against the previous window of the same length. Seeded, so it does
   not flicker, and honest about direction: `good` says whether up is good, and
   the renderer colours it from that rather than from the sign. */
function udelta(seed, spread, good){
  const r = urng(seed);
  const v = (r() - 0.42) * spread;
  return { v:v, good:good !== false };
}

/* ============================================================== the two views
   `cards` is a function of the render context, not a constant: the cards a
   page shows depend on what is configured. */
const VIEWS = [
  {
    id:'cloud-usage', label:'Cloud Usage', page:'Platform Consumption',
    icon:'gauge', phase:VIEW_PHASE,
    desc:'What the deployment consumed, measured against the budget, quotas and objectives set in the modules.',
    cards:cloudCards
  },
  {
    id:'people-usage', label:'Employee Usage', page:'Adoption & Seats',
    icon:'people', phase:VIEW_PHASE,
    desc:'Whether the seats are being used, by whom and for what — aggregate first, because adoption is a number and a person is not.',
    cards:peopleCards
  }
];

/* ============================================================== cloud usage */
function cloudCards(ctx){
  const c = ctx.cfg, r = ctx.range, f = r.f * ctx.share, sd = ctx.seed;
  const labels = ulabels(r);

  /* Baselines are monthly for the whole tenant; everything below scales. */
  const reqs   = 1420000 * f;
  const tokIn  = 412000000 * f;
  const tokOut = 96000000 * f;
  const gpuCap = c.gpuCount * 24 * 30 * r.f;          /* GPU-hours available */
  const gpuUse = uwalk(sd + 'gpu', r.pts, 52, .28, .1, 94);
  const gpuHrs = gpuCap * (uavg(gpuUse) / 100);
  /* Spend follows the window like everything else, but the budget in module 13
     is monthly — so the tile pro-rates it and the card below stays on the
     month. Comparing a quarter's spend to a monthly budget would report 300%
     and mean nothing. */
  const spend  = c.budget * 0.73 * r.f * ctx.share;
  const budWin = c.budget * r.f * ctx.share;
  const mSpend = c.budget * 0.73 * ctx.share;
  const mBud   = c.budget * ctx.share;
  const proj   = c.budget * 0.996 * ctx.share;
  const avail  = 99.94, p95 = 2.1;

  const cards = [];

  /* ---------------------------------------------------------------- headline
     A tile takes colour only when it has crossed a limit somebody configured.
     Green for "as expected" would make the exceptions harder to find. */
  cards.push({ k:'kpi', tiles:[
    { l:'Requests', v:ucount(reqs), sub:'across ' + r.l.toLowerCase(),
      d:udelta(sd + 'd1', .18), spark:uwalk(sd + 's1', 16, 60, .3, .2) },
    { l:'Tokens', v:ucount(tokIn + tokOut), sub:ucount(tokIn) + ' in · ' + ucount(tokOut) + ' out',
      d:udelta(sd + 'd2', .24), spark:uwalk(sd + 's2', 16, 60, .3, .3) },
    { l:'GPU hours', v:utrim(gpuHrs) + ' h', sub:'of ' + utrim(gpuCap) + ' h available',
      d:udelta(sd + 'd3', .2), spark:gpuUse.slice(0, 16) },
    { l:'Spend', v:umoney(spend),
      sub:'of ' + umoney(budWin) + (r.k === '30d' ? ' budget' : ' pro-rated'),
      tone:spend / budWin > .8 ? 'warn' : null,
      d:udelta(sd + 'd4', .16, false), spark:uwalk(sd + 's4', 16, 60, .18, .35) },
    { l:'Availability', v:upct(avail, 2), sub:'objective ' + c.slo,
      d:udelta(sd + 'd5', .02), spark:uwalk(sd + 's5', 16, 60, .06) },
    { l:'p95 latency', v:utrim(p95) + 's', sub:'objective ' + c.p95,
      d:udelta(sd + 'd6', .12, false), spark:uwalk(sd + 's6', 16, 60, .2, -.1) }
  ]});

  /* ------------------------------------------------------ spend vs budget */
  cards.push({
    t:'Spend against budget · month to date', k:'thresh',
    v:mSpend, max:mBud,
    left:umoney(mSpend) + ' spent',
    right:umoney(Math.max(0, mBud - mSpend)) + ' left of ' + umoney(mBud),
    marks:c.thresholds.map(t => ({ at:t / 100, l:t + '%' })),
    note:'The window above does not change this card — the budget in module 13 is monthly. ' +
         'Projected month-end <b>' + umoney(proj) + '</b> — ' + upct(proj / mBud * 100) +
         ' of budget, on ' + c.granularity.toLowerCase() + ' granularity. ' +
         (c.anomaly
            ? 'Anomaly detection is on at <b>' + c.anomalySens.toLowerCase() + '</b> sensitivity: <b>2</b> flagged this period.'
            : 'Anomaly detection is off, so nothing here is being watched for a spike.')
  });

  /* -------------------------------------------- consumption by dimension */
  const dimAll = {
    'Token usage':{ v:tokIn + tokOut, fmt:ucount, share:.52 },
    'API calls':  { v:reqs,           fmt:ucount, share:.16 },
    'GPU minutes':{ v:gpuHrs * 60,    fmt:ucount, share:.24 },
    'Storage':    { v:168 * ctx.share,fmt:x => utrim(x) + ' GB', share:.05 },
    'Seats':      { v:Math.round(240 * ctx.share), fmt:x => String(x) + ' seats', share:.03 }
  };
  const metered = c.metered.filter(d => dimAll[d]);
  const missing = Object.keys(dimAll).filter(d => c.metered.indexOf(d) < 0);
  cards.push({
    t:'Consumption by metered dimension', k:'bars',
    rows:metered.map(d => ({
      nm:d, v:dimAll[d].share,
      val:dimAll[d].fmt(dimAll[d].v),
      meta:upct(dimAll[d].share * 100) + ' of spend'
    })),
    note:(missing.length
      ? '<b>' + missing.join(' · ') + '</b> ' + (missing.length > 1 ? 'are' : 'is') +
        ' consumed but not metered, so ' + (missing.length > 1 ? 'they cannot' : 'it cannot') +
        ' be billed or charged back. Module 07 → Billing dimensions.'
      : 'Every dimension the platform consumes is metered.') +
      ' Billing period: <b>' + c.period.toLowerCase() + '</b>.'
  });

  /* -------------------------------------------------- models and routing */
  const models = c.commercial.concat(c.selfHosted);
  const mr = urng(sd + 'models');
  let weights = models.map(() => .2 + mr());
  const wsum = usum(weights) || 1;
  weights = weights.map(w => w / wsum);
  cards.push({
    t:'Model and routing', k:'table',
    cols:[{ l:'Model' }, { l:'Share', num:true }, { l:'Calls', num:true },
          { l:'Tokens', num:true }, { l:'Cost', num:true }, { l:'p95', num:true }, { l:'Errors', num:true }],
    rows:models.length ? models.map((m, i) => {
      const w = weights[i], self = c.selfHosted.indexOf(m) > -1;
      const rr = urng(sd + m);
      return [
        m + (self ? ' <span class="t-mono" style="color:var(--text-4)">self-hosted</span>' : ''),
        upct(w * 100),
        ucount(reqs * w),
        ucount((tokIn + tokOut) * w),
        umoney(spend * w * (self ? .35 : 1.1)),
        utrim(1.2 + rr() * 2.4) + 's',
        upct(0.2 + rr() * 1.1, 1)
      ];
    }) : [['No model selected in module 05 — the gateway has nothing to route to.', '', '', '', '', '', '']],
    note:'Routing is <b>' + c.routing.toLowerCase() + '</b>, and on provider failure the gateway will <b>' +
         c.onFail.toLowerCase() + '</b>. <b>' + Math.round(14 * r.f) +
         '</b> failovers fired this period — the only evidence that setting works. ' +
         (c.gateway === 'None (direct)'
            ? 'With no gateway, per-model cost is inferred from provider invoices rather than measured.'
            : 'Measured at the <b>' + c.gateway + '</b> gateway.')
  });

  /* ------------------------------------------------------ GPU utilisation */
  cards.push({
    t:'GPU utilisation', k:'cols',
    series:gpuUse, labels:labels, unit:'%', target:{ v:70, l:'70% target' },
    note:'Pool is <b>' + c.gpuPool + '</b>. Mean <b>' + upct(uavg(gpuUse)) + '</b>, peak <b>' +
         upct(Math.max.apply(null, gpuUse)) + '</b>. ' +
         (uavg(gpuUse) < 45
            ? 'Sustained below half — one replica fewer would still hold the peak.'
            : 'Headroom is thin at peak; the next model rollout needs capacity planning first.') +
         (c.autoStopIdle ? ' Idle nodes auto-stop.' : ' Idle nodes are not auto-stopped, so troughs are billed in full.')
  });

  /* ------------------------------------------------------------- capacity */
  const stor = 168 * ctx.share, storCap = c.storageCap * ctx.share;
  cards.push({
    t:'Capacity and storage', k:'facts',
    rows:[
      ['Nodes, mean', utrim(3 + 3.4 * ctx.share * (r.f > 1 ? 1.1 : 1)), 'band ' + c.nodeBand + ' · ' + Math.round(38 * r.f) + ' scale-ups'],
      ['Spot reclaims', String(Math.round(6 * r.f)), c.spot ? 'spot capacity is on' : 'spot is off — these are maintenance evictions'],
      ['Object storage', utrim(stor) + ' GB', upct(stor / storCap * 100) + ' of the ' + utrim(storCap) + ' GB tenant cap'],
      ['Growth', '+' + utrim(11 * r.f * ctx.share) + ' GB', 'in ' + r.l.toLowerCase() + ' · cap reached in ' + Math.round((storCap - stor) / (11 * ctx.share) ) + ' months at this rate'],
      ['Queue depth, p95', String(Math.round(18 + 40 * ctx.share)), 'messages on ' + c.broker]
    ]
  });

  /* ------------------------------------------------------------ retrieval */
  cards.push({
    t:'Retrieval', k:'facts',
    rows:[
      ['Vector index', utrim(4.2 * ctx.share) + ' GB', c.vector + ' · ' + ucount(128000 * ctx.share) + ' documents'],
      ['Queries', ucount(reqs * .38), 'top-k ' + c.topk + ' · chunk ' + c.chunk],
      ['Retrieval hit rate', upct(87), 'a cited chunk was used in the answer'],
      ['Rerank share of cost', upct(6), c.rerank ? 'reranking is on' : 'reranking is off'],
      ['Citation coverage', upct(c.cite ? 96 : 41), c.cite ? 'answers must cite' : 'citations are not required, so most answers have none']
    ]
  });

  /* -------------------------------------------------------- quota pressure */
  cards.push({
    t:'Quota pressure', k:'table',
    cols:[{ l:'Limit' }, { l:'Configured', num:true }, { l:'Peak', num:true }, { l:'Times reached', num:true }, { l:'Affected', num:true }],
    rows:[
      ['Tokens per minute', ucount(c.tpm), ucount(c.tpm * .82), String(Math.round(9 * r.f)), ucount(reqs * .004)],
      ['API calls per day', ucount(c.callsDay), ucount(c.callsDay * .61), String(Math.round(2 * r.f)), ucount(reqs * .001)],
      ['Storage per tenant', utrim(storCap) + ' GB', utrim(stor) + ' GB', '0', '—'],
      ['Gateway rate limit', c.rateLimit, '—', String(Math.round(4 * r.f)), ucount(reqs * .0008)]
    ],
    note:'On exhaustion the platform will <b>' + c.onExhaust.toLowerCase() + '</b>' +
         (c.hardStop ? ', and quota is a hard stop — requests are rejected rather than billed as overage.'
                     : ', and overage is billed rather than blocked.')
  });

  /* ---------------------------------------------------------- reliability */
  const errTot = reqs * .0071;
  cards.push({
    t:'Reliability', k:'table',
    cols:[{ l:'Failure' }, { l:'Count', num:true }, { l:'Share', num:true }, { l:'Where' }],
    rows:[
      ['429 rate limited', ucount(errTot * .41), upct(41), 'gateway, upstream of the models'],
      ['5xx provider', ucount(errTot * .28), upct(28), 'commercial API'],
      ['Timeout', ucount(errTot * .19), upct(19), 'inference, long context'],
      ['Tool / connector', ucount(errTot * .12), upct(12), 'application services']
    ],
    note:'Availability <b>' + upct(avail, 2) + '</b> against an objective of <b>' + c.slo +
         '</b> — <b>' + upct(38) + '</b> of the error budget spent, ' + Math.round(12 * r.f) +
         ' incidents, longest ' + Math.round(9 + 6 * ctx.share) + ' minutes.'
  });

  /* ----------------------------------------------------------- chargeback */
  const untagged = c.blockUntagged ? 0 : spend * .023;
  cards.push({
    t:'Chargeback by ' + (c.tags.indexOf('department') > -1 ? 'department' : 'tag'), k:'bars',
    rows:UDEPTS.map(d => ({
      nm:d.nm, v:d.w, val:umoney(spend * d.w), meta:upct(d.w * 100)
    })).concat(untagged ? [{ nm:'Untagged', v:.023, val:umoney(untagged), meta:'cannot be charged back', tone:'err' }] : []),
    note:'Model is <b>' + c.chargeback.toLowerCase() + '</b> on tags <b>' + c.tags.join(' · ') + '</b>. ' +
         (c.blockUntagged
            ? 'Untagged resources are blocked at creation, so every dollar has an owner.'
            : 'Untagged resources are allowed, so <b>' + umoney(untagged) + '</b> has no owner. Module 12 can block them at creation.')
  });

  /* --------------------------------------------------------- optimisation */
  const RECS = {
    'Reserved instances':['General pool, 3 nodes always on', spend * .11],
    'Savings Plans':     ['Committed inference spend', spend * .08],
    'Idle resources':    ['GPU pool, nightly trough', spend * .06],
    'Rightsizing':       ['System pool over-provisioned 2×', spend * .03],
    'Storage tiering':   ['Cold objects older than 90 days', spend * .02]
  };
  cards.push({
    t:'Optimisation', k:'table',
    cols:[{ l:'Recommendation' }, { l:'What it names' }, { l:'Saving / month', num:true }],
    rows:c.recs.length
      ? c.recs.filter(x => RECS[x]).map(x => [x, RECS[x][0], umoney(RECS[x][1])])
      : [['No recommendation types selected in module 13.', '', '']],
    note:'Reviewed <b>' + c.review.toLowerCase() + '</b>. Total identified: <b>' +
         umoney(usum(c.recs.filter(x => RECS[x]).map(x => RECS[x][1]))) + '</b> per month.'
  });

  return cards;
}

/* =========================================================== employee usage */
function peopleCards(ctx){
  const c = ctx.cfg, r = ctx.range, sd = ctx.seed;
  const scoped = ctx.dept;
  const seats  = scoped ? scoped.seats : usum(UDEPTS.map(d => d.seats));
  const share  = ctx.share;
  const active = Math.round(seats * .73);
  const mau    = Math.round(seats * .87);
  const wau    = active;
  const spend  = c.budget * 0.73 * share;
  const perAct = spend / Math.max(1, active);
  const wauSer = uwalk(sd + 'wau', r.pts, active, .12, .18, seats);

  const cards = [];

  cards.push({ k:'kpi', tiles:[
    { l:'Licensed seats', v:String(seats), sub:(scoped ? scoped.nm : 'whole tenant') + ' · billed ' + c.period.toLowerCase(),
      d:udelta(sd + 'p1', .06), spark:uwalk(sd + 'ps1', 16, 60, .04, .06) },
    { l:'Active', v:String(active), sub:'weekly active · ' + mau + ' monthly',
      d:udelta(sd + 'p2', .14), spark:wauSer.slice(0, 16) },
    { l:'Activation', v:upct(active / seats * 100), sub:'of seats used at least once',
      tone:active / seats < .7 ? 'warn' : null,
      d:udelta(sd + 'p3', .1), spark:uwalk(sd + 'ps3', 16, 60, .08, .12) },
    { l:'Sessions per active', v:utrim(14.2), sub:'per week',
      d:udelta(sd + 'p4', .16), spark:uwalk(sd + 'ps4', 16, 60, .18, .1) },
    { l:'Tokens per active', v:ucount(508000000 * r.f * share / Math.max(1, active)), sub:'in ' + r.l.toLowerCase(),
      d:udelta(sd + 'p5', .22), spark:uwalk(sd + 'ps5', 16, 60, .24, .2) },
    { l:'Cost per active', v:umoney(perAct), sub:'platform spend ÷ active users',
      d:udelta(sd + 'p6', .14, false), spark:uwalk(sd + 'ps6', 16, 60, .14, -.06) }
  ]});

  cards.push({
    t:'Active users over ' + r.l.toLowerCase(), k:'cols',
    series:wauSer, labels:ulabels(r), unit:' users', target:{ v:seats, l:String(seats) + ' licensed' },
    note:'<b>' + Math.round(seats * .09) + '</b> first-time users, <b>' + Math.round(active * .82) +
         '</b> returning, <b>' + Math.round(seats * .11) + '</b> dormant for 30 days or more, <b>' +
         Math.round(seats * .03) + '</b> stopped entirely. Median time from invite to first finished task: <b>' +
         utrim(3.2) + ' days</b>.'
  });

  const depts = scoped ? [scoped] : UDEPTS;
  const dw = usum(depts.map(d => d.w)) || 1;
  cards.push({
    t:'By department', k:'bars',
    rows:depts.map(d => {
      const a = Math.round(d.seats * (.55 + urng(sd + d.nm)() * .4));
      return {
        nm:d.nm, v:d.w / dw,
        val:a + ' / ' + d.seats + ' active',
        meta:umoney(spend * (d.w / dw) / Math.max(1, a)) + ' per head'
      };
    }),
    note:'Hierarchy is <b>' + c.hierarchy + '</b>, so a department here is a node in the same tree the permissions use. ' +
         'Share of usage is not share of seats: <b>Engineering</b> holds ' +
         upct(UDEPTS[0].seats / 240 * 100) + ' of seats and ' + upct(UDEPTS[0].w * 100) + ' of usage.'
  });

  cards.push({
    t:'What people do', k:'bars',
    rows:[
      { nm:'Chat and tasks',        v:.41, val:ucount(1420000 * r.f * share * .41), meta:'threads' },
      { nm:'Projects',              v:.22, val:ucount(1420000 * r.f * share * .22), meta:'in a project' },
      { nm:'Assistants',            v:.17, val:ucount(1420000 * r.f * share * .17), meta:'bound to an assistant' },
      { nm:'Apps',                  v:.13, val:ucount(1420000 * r.f * share * .13), meta:'panel actions' },
      { nm:'Scheduled programs',    v:.07, val:String(Math.round(96 * r.f * share)), meta:'runs, unattended' }
    ],
    note:c.logPrompts
      ? 'Prompt logging is <b>on</b> in module 05, so contents are available — this page still reports categories only, and module 10 owns what the logs may be used for.'
      : 'Prompt logging is <b>off</b> in module 05, so only counts and categories exist. Nothing here can show what anyone typed.'
  });

  cards.push({
    t:'Assistants and projects', k:'table',
    cols:[{ l:'Assistant' }, { l:'Owner' }, { l:'Runs', num:true }, { l:'Results', num:true }, { l:'Users', num:true }],
    rows:UASSTS.filter(a => !scoped || a.dept === scoped.nm).map(a => {
      const rr = urng(sd + a.nm);
      return [a.nm, a.dept, String(Math.round((60 + rr() * 900) * r.f)),
              String(Math.round((20 + rr() * 240) * r.f)), String(Math.round(4 + rr() * 40))];
    }),
    note:'<b>' + Math.round(34 * share) + '</b> projects run on a schedule and produce results without anyone asking — ' +
         'the clearest signal that the platform has been adopted rather than merely opened.'
  });

  const never = Math.round(seats * .075), dorm = Math.round(seats * .11), leavers = Math.round(seats * .017);
  const seatCost = perAct * .68;
  cards.push({
    t:'Seat hygiene', k:'table',
    cols:[{ l:'Condition' }, { l:'Seats', num:true }, { l:'Per month', num:true }, { l:'What to do' }],
    rows:[
      ['Never activated', String(never), umoney(never * seatCost), 'invited, never signed in'],
      ['Dormant 30 days or more', String(dorm), umoney(dorm * seatCost), 'downgrade or reclaim'],
      ['Leavers still assigned', String(leavers), umoney(leavers * seatCost), c.offboarding],
      ['Reclaimable', String(never + dorm + leavers), umoney((never + dorm + leavers) * seatCost), 'total recoverable'],
    ],
    note:'Offboarding policy is <b>' + c.offboarding.toLowerCase() + '</b>' +
         (c.transfer ? ', and owned resources transfer on departure.' : ', and owned resources do not transfer — a leaver takes their projects with them.') +
         ' Reclaiming these is <b>' + umoney((never + dorm + leavers) * seatCost * 12) + '</b> a year.'
  });

  cards.push({
    t:'Access and risk', k:'facts',
    rows:[
      ['Failed sign-ins', String(Math.round(212 * r.f * share)), 'via ' + c.idp + ' · ' + (c.mfa ? 'MFA required at first login' : 'MFA not required')],
      ['Accounts without MFA', String(Math.round(seats * .06)), c.mfa ? 'invited before the policy' : 'policy is off in module 01'],
      ['External shares', String(Math.round(48 * r.f * share)), 'results shared outside the workspace'],
      ['Data-loss hits', String(Math.round(31 * r.f * share)), c.dlp ? 'blocked by module 10' : 'module 10 scanning is off — these are counted, not blocked'],
      ['Directory sync', c.scim ? 'SCIM, hourly' : 'manual', c.scim ? 'joiners and leavers arrive on their own' : 'leavers rely on someone remembering']
    ]
  });

  cards.push({
    t:'Who needs help', k:'table', gate:true,
    cols:[{ l:ctx.ids ? 'Person' : 'Account' }, { l:'Department' }, { l:'Sessions', num:true }, { l:'Signal' }],
    rows:UPEOPLE.filter(p => !scoped || p.dept === scoped.nm).slice(0, 6).map((p, i) => {
      const rr = urng(sd + p.ref);
      const heavy = i < 3;
      return [
        ctx.ids ? p.nm : p.dept.toLowerCase() + ' · user ' + p.ref,
        p.dept,
        String(Math.round(heavy ? 40 + rr() * 60 : 1 + rr() * 3)),
        heavy ? 'heavy user — worth asking what works' : 'stopped after week one — training candidate'
      ];
    }),
    note:ctx.ids
      ? 'Individual rows are visible to you as <b>platform admin</b>. This is a reveal for a purpose, not a default — it is not remembered, and closing the page hides them again.'
      : 'Individual rows are hidden. Aggregate answers most adoption questions, so naming people is a deliberate act rather than the default view.'
  });

  cards.push({
    t:'What is collected', k:'note',
    lines:[
      'Counts, categories and timings — never the contents of a prompt or an answer. ' +
        (c.logPrompts ? 'Module 05 does log prompts, but this page does not read them.' : 'Module 05 does not log prompts at all.'),
      'Kept for <b>' + c.mRetention + '</b> (metrics) and <b>' + c.lRetention + '</b> (logs), per module 09. Nothing here outlives that.',
      (c.piiMask ? 'Personal data is masked at ingest, per module 09 — a guarantee rather than a cleanup job.'
                 : 'PII masking at ingest is <b>off</b> in module 09, so logs may carry personal data that this page deliberately does not show.'),
      'Visible to <b>' + c.model + '</b> roles holding platform administration. Individual rows are gated above; ' +
        (c.tenantDash ? 'tenants see their own usage, per module 09.' : 'tenants cannot see this at all — module 09 keeps it internal.')
    ]
  });

  return cards;
}
