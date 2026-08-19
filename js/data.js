/* ============================================================================
   data — every surface's fixture content. Static prototype: no network.
   Kept separate from app.js so screens can be added without touching logic.
   ========================================================================= */
window.DATA = (function(){
'use strict';

/* ------------------------------------------------------------- artifacts
   One object serves two places: the reference card inside a thread and the
   artifact pane on the right. They share an id, so opening from either lands
   on the same thing. */
/* `when` is an AGE, not a date: a hand-written date rots on the shelf, so the
   app turns these into real timestamps at boot (see initResults). Minutes,
   hours and days, alone or combined — "2d 5h". */
const ARTIFACTS = [
  {
    id:'a1', kind:'table', title:'Q3 variance by segment',
    from:'Q3 revenue analysis', when:'2m', size:'4 rows',
    /* A table artifact is a label against one muted value — see artListNode.
       The attribution behind each number is in the turn that produced it. */
    rows:[
      ['Enterprise','$22.4M'],
      ['Mid-market','$12.8M'],
      ['SMB','$4.6M'],
      ['Services','$1.4M']
    ],
    code:[
      '# variance decomposition',
      'import pandas as pd',
      '',
      'q3   = wh.read("q3_ledger")',
      'plan = xls.read("FY25_targets", sheet=2)',
      '',
      'var = (q3.groupby("segment").arr.sum()',
      '         .sub(plan.set_index("segment").q3_plan)',
      '         .rename("variance"))',
      '',
      '# strip non-recurring before attributing growth',
      'recurring = q3[~q3.line_item.isin(ONE_OFFS)]',
      'print(var.sort_values(ascending=False))'
    ].join('\n')
  },
  {
    id:'a2', kind:'diff', title:'pipeline.py — bounded queue',
    from:'Refactor the ingestion pipeline', when:'1h', size:'12 lines',
    code:[
      '# ingest/pipeline.py:318',
      '-  self._queue = asyncio.Queue()',
      '+  # bound the queue so a slow sink applies real backpressure',
      '+  self._queue = asyncio.Queue(maxsize=settings.INGEST_QUEUE_DEPTH)',
      '',
      '# ingest/adapters/base.py:74',
      '-  try:',
      '-      await asyncio.wait_for(self._q.put(batch), timeout=5)',
      '-  except asyncio.TimeoutError:',
      '-      log.warning("queue put timed out, dropping")',
      '+  # block. a full queue means the sink is behind and the',
      '+  # producer must wait, which is the entire point.',
      '+  await self._q.put(batch)'
    ].join('\n')
  },
  {
    id:'a3', kind:'chart', title:'Churn model — feature importance',
    from:'Churn signals in enterprise accounts', when:'1d 3h', size:'8 features',
    bars:[
      ['admin_changed_90d', 100],
      ['seats_active_delta', 61],
      ['exec_sponsor_left', 54],
      ['ticket_reopen_rate', 38],
      ['usage_decline_30d', 31],
      ['contract_acv', 19],
      ['nps_last', 12],
      ['region', 4]
    ],
    cols:['Feature','Gain','Effect'],
    rows:[
      ['admin_changed_90d','0.284','raises risk','up'],
      ['seats_active_delta','0.173','lowers risk','dn'],
      ['exec_sponsor_left','0.154','raises risk','up'],
      ['ticket_reopen_rate','0.108','raises risk','up']
    ],
    code:[
      '# rank feature importance',
      'from sklearn.ensemble import HistGradientBoostingClassifier',
      '',
      'X, y = build_matrix(accounts_health, window="90d")',
      'clf  = HistGradientBoostingClassifier(max_depth=4).fit(X, y)',
      '',
      '# permutation importance, not split gain — split gain over-rewards',
      '# high-cardinality columns like account_id',
      'imp = permutation_importance(clf, X, y, n_repeats=20)',
      'print(rank(imp.importances_mean, X.columns))'
    ].join('\n')
  },
  {
    id:'a4', kind:'doc', title:'Empty-state copy set',
    from:'Onboarding copy pass', when:'2d 5h', size:'9 states',
    md:[
      '### The pattern',
      'State what is missing, then name the one action that fills it. No encouragement, no personality, no exclamation marks.',
      '',
      '### Rewrites',
      '- **Projects** — "No projects yet" becomes **Projects you create appear here.** with a single <code>New project</code> action.',
      '- **Members** — "Let us get your team in here" becomes **You are the only member of this workspace.**',
      '- **Integrations** — "Nothing connected yet" becomes **No integrations connected.**',
      '- **Schedule** — "Automate your busywork" becomes **No scheduled tasks.**',
      '',
      '### What changed structurally',
      'Three of the original nine were doing two jobs at once — describing the state *and* selling the feature. Those are split. The selling belongs in the docs, not in an empty state.'
    ].join('\n'),
    code:'— document artifact, no source —'
  },
  {
    id:'a5', kind:'table', title:'FY25 forecast bridge',
    from:'Q3 revenue analysis', when:'2d 1h', size:'6 rows',
    rows:[
      ['Q3 actual','today'],
      ['less services timing','1d'],
      ['trailing growth','1d'],
      ['November pricing','2d'],
      ['SMB churn','3d'],
      ['Q4 forecast','1w']
    ],
    code:[
      '# forecast bridge — each step is additive and named',
      'base = actual("Q3") - one_offs("Q3")',
      'steps = [',
      '    ("trailing growth",   base * trailing_rate(3)),',
      '    ("November pricing",  -exposure("renewals", month=11) * 0.021),',
      '    ("SMB churn",         -churn_cost("SMB", bps=40)),',
      ']',
      'print(bridge(base, steps))'
    ].join('\n')
  },
  {
    id:'a6', kind:'doc', title:'Adapter credit scheme',
    from:'Refactor the ingestion pipeline', when:'3d 7h', size:'2 pages',
    md:[
      'ADR-014 specifies a credit-based backpressure scheme. Nothing in the code reads a credit, so this is a design note rather than documentation.',
      '',
      '### Mechanism',
      '- Each adapter holds a budget of in-flight batches, granted by the sink rather than claimed by the producer.',
      '- A credit is returned only after the sink acknowledges a durable write, not after the queue accepts the batch.',
      '- Zero credits blocks the adapter. That is the entire mechanism — there is no timeout and no drop path.',
      '',
      '### Why the current code cannot express it',
      'Backpressure exists at the edges and nowhere in the middle. <code>pipeline.py:318</code> builds an unbounded queue, so a slow sink accumulates an in-memory backlog instead of slowing producers. Bounding that queue is a prerequisite; credits are the refinement on top.'
    ].join('\n'),
    code:'— document artifact, no source —'
  },
  /* What the weekly run files. Two channels reporting and one not: LinkedIn's
     connector is off, so the row says so instead of showing a zero, which would
     read as "nothing worked" rather than "nothing was measured". */
  {
    id:'a7', kind:'table', title:'Channel performance · week 33',
    from:'Social publishing', when:'20m', size:'9 rows',
    rows:[
      ['Facebook · reach','182.4k'],
      ['Facebook · engagement rate','3.4%'],
      ['Facebook · new follows','+412'],
      ['Instagram · reach','246.1k'],
      ['Instagram · engagement rate','5.1%'],
      ['Instagram · new follows','+1,204'],
      ['LinkedIn · reach','not measured'],
      ['LinkedIn · engagement rate','not measured'],
      ['Best post','IG reel · 48.9k reach']
    ],
    code:[
      '# weekly channel report',
      'import pandas as pd',
      '',
      'fb = wh.read("fb_page_insights")',
      'ig = wh.read("ig_media_insights")',
      'li = wh.read("li_page_analytics")   # stale: connector off',
      '',
      'wk = lambda d: d[d.published_at >= WEEK_START]',
      'rate = lambda d: d.engagements.sum() / d.reach.sum()',
      '',
      '# a channel with no sync reports nothing, not zero',
      'if li.max_date < WEEK_START:',
      '    report["linkedin"] = None',
      'print(rate(wk(fb)), rate(wk(ig)))'
    ].join('\n')
  },
  {
    id:'a8', kind:'doc', title:'Post pack · retrofit case study',
    from:'Social publishing', when:'1d 2h', size:'3 posts',
    md:[
      'One story, three channels, three shapes. The claim — 31% energy per unit — is the one approved in the brand kit; the 9-day downtime figure comes from the case study itself.',
      '',
      '### LinkedIn',
      'Retrofitting a 40-year-old line beats replacing it more often than the brochures admit. Northwind kept the frames, changed the drives, and took **31%** off energy per unit. The write-up, including what did not work: acme.com/stories/northwind',
      '',
      '### Instagram — carousel, 5 frames',
      '- Same frame. New drives.',
      '- 31% less energy per unit',
      '- 9 days of downtime, not 11 weeks',
      '- What we would do differently',
      '- Read the write-up — link in bio',
      '',
      '### Facebook',
      'We kept the frames and changed the drives. Nine days of downtime, 31% less energy per unit, and a line that outlives the people who signed it off. Full story: acme.com/stories/northwind',
      '',
      '### Not used',
      'The word *revolutionary* appears in the source deck four times. It is on the avoid list, and the numbers do the work without it.'
    ].join('\n'),
    code:'— document artifact, no source —'
  }
];
const ARTIFACT_BY_ID = id => ARTIFACTS.filter(a => a.id === id)[0] || null;

/* ---------------------------------------------------------------- threads */
const THREADS = [
  {
    id:'t1', title:'Q3 revenue analysis', when:'2m', group:'Today', project:'p1',
    msgs:[
      { role:'user', text:'Pull Q3 revenue by segment and tell me what actually drove the beat. I care about durable causes, not one-offs.' },
      { role:'ai', dur:'3.4s',
        steps:[
          { n:'warehouse.query', d:'SELECT segment, month, arr FROM q3_ledger ...', t:'1.1s' },
          { n:'code.run', d:'reconcile against FY25_targets, normalise FX', t:'0.9s' },
          { n:'code.run', d:'decompose beat into new / expansion / churn', t:'1.4s' }
        ],
        md:[
          'Q3 landed at **$41.2M**, **12.4%** over plan. The beat is narrower than it looks — two segments carry all of it.',
          '',
          '### Where it came from',
          '- **Enterprise renewals** contributed $3.1M of the $4.5M variance, and 78% of that is multi-year commitments signed before the July pricing change. That is durable.',
          '- **Mid-market expansion** added $1.0M on seat growth in existing accounts — also durable, and the third consecutive quarter of expansion outpacing new logo.',
          '- **SMB** came in $0.4M *under* plan. Logo churn is up 40bps quarter over quarter.',
          '',
          '### What I would discount',
          'The $0.6M in <code>professional_services</code> is a single implementation that slipped from Q2. Treat it as timing, not growth — it will not repeat in Q4.'
        ].join('\n'),
        cites:[
          { n:'q3_ledger.parquet', s:'warehouse' },
          { n:'FY25_targets.xlsx', s:'drive' },
          { n:'renewals_export.csv', s:'upload' }
        ],
        artifactId:'a1'
      },
      { role:'user', text:'What does that imply for the Q4 forecast?' },
      { role:'ai', dur:'2.1s',
        steps:[
          { n:'code.run', d:'strip non-recurring, re-forecast from recurring base', t:'1.3s' },
          { n:'search.docs', d:'pricing-changes.md — effective dates', t:'0.5s' }
        ],
        md:[
          'Take the services timing out and the recurring base is **$39.8M**, not $41.2M. Growing that at the trailing three-quarter rate gives **$42.1M-$43.4M** for Q4.',
          '',
          'Two things would move it outside that band:',
          '- The July pricing change starts hitting renewals in **November**, not Q4 as a whole. Roughly a third of Q4 renewal volume is exposed.',
          '- SMB churn at the current 40bps trajectory costs about $0.3M if it holds.',
          '',
          'I would forecast **$42.4M** and flag the November cohort as the number to watch.'
        ].join('\n'),
        cites:[ { n:'pricing-changes.md', s:'notion' }, { n:'q3_ledger.parquet', s:'warehouse' } ],
        artifactId:'a5'
      }
    ]
  },
  {
    id:'t2', title:'Refactor the ingestion pipeline', when:'1h', group:'Today', project:'p2',
    msgs:[
      { role:'user', text:'The ingestion pipeline stalls under load. Read pipeline.py and the adapters, then tell me where the backpressure actually breaks.' },
      { role:'ai', dur:'5.2s',
        steps:[
          { n:'fs.read', d:'ingest/pipeline.py, 11 adapter modules', t:'0.8s' },
          { n:'code.analyze', d:'trace queue handoffs and await points', t:'2.6s' },
          { n:'search.repo', d:'ADR-014 — intended backpressure contract', t:'1.8s' }
        ],
        md:[
          'The pipeline has backpressure at the edges and nowhere in the middle. Three findings, ordered by how much they will hurt you.',
          '',
          '- **The unbounded fan-out queue.** <code>pipeline.py:318</code> creates the work queue with no <code>maxsize</code>. Every adapter can enqueue freely, so a slow sink builds an in-memory backlog until the process is OOM-killed rather than slowing the producers. This is the stall you are seeing.',
          '- **Adapters swallow the signal.** Each adapter awaits <code>queue.put()</code>, but <code>S3Adapter</code> and <code>KafkaAdapter</code> wrap it in a five second <code>wait_for</code> and log-and-continue on timeout. The one place backpressure could propagate is where it gets dropped.',
          '- **ADR-014 was never implemented.** The ADR specifies a credit-based scheme with per-adapter budgets. Nothing in the code reads a credit. The doc describes a system that does not exist.',
          '',
          'Fixing the first one alone converts an OOM into a slowdown, which is the behaviour you want.'
        ].join('\n'),
        cites:[ { n:'ingest/pipeline.py', s:'repo' }, { n:'ingest/adapters/', s:'repo' }, { n:'ADR-014.md', s:'docs' } ],
        artifactId:'a2'
      }
    ]
  },
  {
    id:'t3', title:'Churn signals in enterprise accounts', when:'1d', group:'Earlier', project:'p3',
    msgs:[
      { role:'user', text:'Which enterprise accounts are most likely to churn next quarter, and what is the single strongest signal?' },
      { role:'ai', dur:'4.0s',
        steps:[
          { n:'warehouse.query', d:'account health, usage, ticket volume, 90d', t:'1.5s' },
          { n:'code.run', d:'fit gradient boosting, rank feature importance', t:'2.5s' }
        ],
        md:[
          'Eleven accounts sit above a 60% churn probability. The strongest single signal is not usage decline — it is **admin seat turnover**.',
          '',
          'Accounts that lost their original admin in the last two quarters churn at **4.1x** the base rate, and the effect holds after controlling for usage, ticket volume and contract size. Usage decline is a *consequence* of that handover, which is why it shows up later and reads as the cause.',
          '',
          'The practical read: your churn risk is a relationship-continuity problem, and it is visible in the CRM about ninety days before it shows up in usage.'
        ].join('\n'),
        cites:[ { n:'accounts_health.parquet', s:'warehouse' }, { n:'support_tickets.json', s:'zendesk' } ],
        artifactId:'a3'
      }
    ]
  },
  {
    id:'t4', title:'Onboarding copy pass', when:'2d', group:'Earlier', project:null,
    msgs:[
      { role:'user', text:'Tighten the empty-state copy across onboarding. Keep it plain — no exclamation marks, no "let us".' },
      { role:'ai', dur:'1.8s',
        steps:[ { n:'design.read', d:'onboarding-flow.fig — 14 frames, 9 empty states', t:'1.8s' } ],
        md:[
          'Nine empty states, rewritten. The pattern I applied: state what is missing, then name the one action that fills it. No encouragement, no personality.',
          '',
          '- **Projects** — "No projects yet" becomes **"Projects you create appear here."** with a single <code>New project</code> action.',
          '- **Members** — "Let us get your team in here" becomes **"You are the only member of this workspace."**',
          '- **Integrations** — "Nothing connected yet" becomes **"No integrations connected."**',
          '',
          'Three of the original nine were doing two jobs at once — describing the state *and* selling the feature. I split those, and the selling belongs in the docs, not the empty state.'
        ].join('\n'),
        cites:[ { n:'onboarding-flow.fig', s:'figma' } ],
        artifactId:'a4'
      }
    ]
  },
  { id:'t5', title:'Pricing page rewrite', when:'4d', group:'Earlier', project:null, msgs:[] },
  { id:'t6', title:'Cohort retention v2', when:'1w', group:'Earlier', project:'p3', msgs:[] },
  { id:'t7', title:'September social calendar', when:'20m', group:'Today', project:'p4', msgs:[] },
  { id:'t8', title:'Why the reel beat the carousel', when:'2d', group:'Earlier', project:'p4', msgs:[] }
];

/* --------------------------------------------------------------- projects
   A project scopes threads, sources and an assistant. It is the unit people
   actually organise work into, which is why it sits above the thread list.

   Every field except `name` and `icon` is optional, and that is the point: a
   project with none of them filled in is a folder, and the same project with
   `run` set is a small application that produces a result on its own. What it
   is depends on what its owner switched on — see openProject in app.js.

     icon    the glyph on its sidebar row, chosen from PROJ_ICONS
     shared  false = personal; true = readable by everyone in the workspace
     kbs     knowledge bases it draws on, by name
     sources datasets it draws on, by name
     run     null, or { every, ask, sched } — the schedule that makes it an app
             (`sched` points at the SCHEDULE row so the two cannot drift) */
const PROJECTS = [
  { id:'p1', name:'Q3 close', icon:'chart', shared:true,
    desc:'Everything feeding the Q3 revenue close and the Q4 forecast handed to the board.',
    assistant:'Revenue analyst', kbs:['Finance corpus'], sources:['q3_ledger','renewals_export'],
    run:{ every:'Every week', sched:'sc6',
          ask:'Rebuild the forecast bridge and flag every line that moved more than 5% against plan.' },
    when:'2m' },
  { id:'p2', name:'Pipeline health', icon:'code', shared:true,
    desc:'Ingestion reliability work — backpressure, adapter budgets, the ADR-014 follow-through.',
    assistant:'Code reviewer', kbs:['Engineering docs'], sources:['support_tickets'],
    run:null, when:'1h' },
  { id:'p3', name:'Churn program', icon:'users', shared:false,
    desc:'Enterprise retention: signals, the account watchlist, and what the CRM knows before usage does.',
    assistant:'Revenue analyst', kbs:['Support corpus'], sources:['accounts_health','support_tickets'],
    run:{ every:'Every day', sched:'sc3',
          ask:'Refresh the watchlist and name the accounts whose churn signal moved since yesterday.' },
    when:'1d' },
  /* A project that publishes as well as reads. Two extra fields, and both are
     optional like the rest — a project without them is exactly what it was:

       channels  where it posts, each one pointing at the CONNECTORS row that
                 holds the credential (`cn`), so connecting is done in one place
                 and the project reports the state rather than owning it
       queue     what is written but not yet out, per channel

     The three insight tables under `sources` are the monitoring half: the posts
     go out through the channels and the numbers come back through the tables. */
  { id:'p4', name:'Social publishing', icon:'share', shared:true,
    desc:'Posting to Facebook, Instagram and LinkedIn, and the weekly read on what any of it did.',
    assistant:'Social editor', kbs:['Brand & social kit'],
    sources:['fb_page_insights','ig_media_insights','li_page_analytics'],
    channels:[
      { id:'fb', nm:'Facebook', cn:'cn10', handle:'@acmeindustrial', posts:'18 / 30d' },
      { id:'ig', nm:'Instagram', cn:'cn11', handle:'@acme.industrial', posts:'22 / 30d' },
      { id:'li', nm:'LinkedIn', cn:'cn12', handle:'Acme Industrial', posts:'12 / 30d' }
    ],
    queue:[
      { id:'q1', ch:'li', when:'Tue 09:00', state:'scheduled',
        title:'Fleet retrofit case study',
        text:'Retrofitting a 40-year-old line beats replacing it more often than the ' +
             'brochures admit. Northwind kept the frames, changed the drives, and took ' +
             '31% off energy per unit.\n\nThe write-up, including what did not work: ' +
             'acme.com/stories/northwind' },
      { id:'q2', ch:'ig', when:'Tue 17:30', state:'needs review',
        title:'Retrofit carousel — 5 frames',
        text:'Frame 1 — Same frame. New drives.\nFrame 2 — 31% less energy per unit\n' +
             'Frame 3 — 9 days of downtime, not 11 weeks\nFrame 4 — What we would do ' +
             'differently\nFrame 5 — Read the write-up (link in bio)' },
      { id:'q3', ch:'fb', when:'Wed 12:00', state:'draft',
        title:'Open day, 12 September',
        text:'We are opening the Rotterdam floor on 12 September. Bring a line ' +
             'problem you have not solved and an engineer who has tried.\n\n' +
             'Places are limited: acme.com/openday' }
    ],
    run:{ every:'Every week', sched:'sc7',
          ask:'Pull last week across Facebook, Instagram and LinkedIn. Report reach, ' +
              'engagement rate and follower change per channel, name the post that beat ' +
              'its channel average and say what it did differently, and flag anything ' +
              'that fell more than 20% against the four-week mean.' },
    when:'20m' }
];

/* ------------------------------------------------------------- assistants
   An assistant is a named binding of model, skills and knowledge. The rail
   has no icon for it — it belongs to the conversation, so it lives in the
   chat sidebar next to the threads it governs. */
/* Enough of these that the list has to be filtered rather than read. `team`
   drives the filter tabs, `fav` puts one in the composer's picker. */
const ASSISTANTS = [
  { id:'as1', name:'Revenue analyst', state:'ok', model:'Nebula Pro', team:'Revenue', fav:true,
    desc:'Answers from the finance warehouse. Refuses to attribute growth without stripping non-recurring lines first.',
    skills:['warehouse.query','code.run','chart.build'], kb:'Finance corpus', threads:4 },
  { id:'as2', name:'Code reviewer', state:'ok', model:'Nebula Pro (extended thinking)', team:'Engineering', fav:true,
    desc:'Reads the repo before answering. Ordered findings, no style commentary unless asked.',
    skills:['fs.read','code.analyze','search.repo'], kb:'Engineering docs', threads:2 },
  { id:'as3', name:'Support triage', state:'ok', model:'Nebula Fast', team:'Support', fav:false,
    desc:'Labels inbound tickets by product area and urgency, and escalates anything it is unsure about.',
    skills:['classify','search.docs'], kb:'Support corpus', threads:1 },
  { id:'as4', name:'Board writer', state:'idle', model:'Nebula Pro', team:'Revenue', fav:true,
    desc:'Drafts the leadership digest from the week\'s analyses. Plain register, no adjectives.',
    skills:['search.docs','doc.write'], kb:'Finance corpus', threads:0 },
  { id:'as5', name:'Forecast reviewer', state:'ok', model:'Nebula Pro', team:'Revenue', fav:false,
    desc:'Checks a forecast against the recurring base and names every assumption it cannot verify.',
    skills:['warehouse.query','code.run'], kb:'Finance corpus', threads:3 },
  { id:'as6', name:'Pricing analyst', state:'ok', model:'Nebula Pro', team:'Revenue', fav:false,
    desc:'Models cohort exposure to a pricing change. Reports the exempt population separately.',
    skills:['warehouse.query','code.run','chart.build'], kb:'Finance corpus', threads:1 },
  { id:'as7', name:'Renewals desk', state:'ok', model:'Nebula Fast', team:'Revenue', fav:false,
    desc:'Answers who renews when, and what is at risk in the next quarter.',
    skills:['warehouse.query','search.docs'], kb:'Finance corpus', threads:2 },
  { id:'as8', name:'Incident scribe', state:'ok', model:'Nebula Pro', team:'Engineering', fav:false,
    desc:'Writes the timeline from logs and traces while the incident is still open. No causes until the data supports one.',
    skills:['search.logs','trace.read','doc.write'], kb:'Engineering docs', threads:5 },
  { id:'as9', name:'Runbook keeper', state:'idle', model:'Nebula Fast', team:'Engineering', fav:false,
    desc:'Compares runbooks against what the services actually do, and flags the drift.',
    skills:['fs.read','search.repo'], kb:'Engineering docs', threads:0 },
  { id:'as10', name:'Migration planner', state:'draft', model:'Nebula Pro (extended thinking)', team:'Engineering', fav:false,
    desc:'Sequences a migration and states what has to be reversible at each step.',
    skills:['code.analyze','doc.write'], kb:'Engineering docs', threads:0 },
  { id:'as11', name:'Churn analyst', state:'ok', model:'Nebula Pro', team:'Support', fav:false,
    desc:'Ranks accounts by churn signal and separates the signals it can act on from the ones it cannot.',
    skills:['warehouse.query','classify'], kb:'Support corpus', threads:2 },
  { id:'as12', name:'Macro editor', state:'ok', model:'Nebula Fast', team:'Support', fav:false,
    desc:'Rewrites support macros to match the current product vocabulary.',
    skills:['search.docs','doc.write'], kb:'Support corpus', threads:1 },
  { id:'as13', name:'Escalation reviewer', state:'idle', model:'Nebula Pro', team:'Support', fav:false,
    desc:'Reads a reopened ticket thread and says whether the escalation was warranted.',
    skills:['classify','search.docs'], kb:'Support corpus', threads:0 },
  { id:'as14', name:'Copy pass', state:'ok', model:'Nebula Pro', team:'Product', fav:false,
    desc:'Rewrites interface copy to state the condition and the one action that changes it.',
    skills:['doc.write'], kb:'Engineering docs', threads:1 },
  { id:'as15', name:'Onboarding guide', state:'draft', model:'Nebula Fast', team:'Product', fav:false,
    desc:'Answers new-workspace questions from the docs, and admits when the docs do not cover it.',
    skills:['search.docs'], kb:'Engineering docs', threads:0 },
  { id:'as16', name:'Meeting digest', state:'ok', model:'Nebula Mini', team:'Product', fav:false,
    desc:'Turns a transcript into decisions, owners and open questions. Nothing else.',
    skills:['doc.write','classify'], kb:'Engineering docs', threads:3 },
  { id:'as17', name:'Social editor', state:'ok', model:'Nebula Pro', team:'Marketing', fav:true,
    desc:'Writes for one channel at a time rather than posting the same paragraph three times. Reads the numbers before suggesting the next one.',
    skills:['doc.write','social.publish','social.insights'], kb:'Brand & social kit', threads:2 }
];
const ASSISTANT_TEAMS = ['Revenue','Engineering','Support','Product','Marketing'];

/* The builder edits these same objects — an assistant is defined in Build and
   chosen in Chat, so there is one of each rather than a definition and a copy.
   Instructions and connector grants are part of the definition, so they are
   filled in here rather than invented by the form: a default the builder writes
   on first open would be indistinguishable from something a person chose. */
ASSISTANTS.forEach(a => {
  a.conn = a.conn || [];
  a.opts = a.opts || { cite:true, confirm:true, think:a.model.indexOf('extended') > -1 };
  a.inst = a.inst ||
    'Answer only from ' + a.kb + '. Name what is missing rather than filling it in, ' +
    'and attach the source to every claim.';
});
/* Ownership. The Build sidebar filters on it, because in a workspace with more
   of these than you made, "whose is this" is the first question — and `me` is
   stored rather than a name so the fixture does not have to know who is signed
   in. A row shows the owner only when it is not you: your own things do not
   need to be labelled as yours. */
const MINE   = ['as1','as2','as4','as5','as14','as16','as17'];
const OWNERS = { as3:'Ana', as6:'Ravi', as7:'Ana', as8:'Ravi', as9:'Marc',
                 as10:'Marc', as11:'Ana', as12:'Ana', as13:'Ravi', as15:'Marc' };
ASSISTANTS.forEach(a => { a.owner = MINE.indexOf(a.id) > -1 ? 'me' : (OWNERS[a.id] || 'Ravi'); });

/* Recommended: the workspace's shortlist for people who have not built their
   own yet — broadly useful, none of them mine, each owned by the team that
   keeps it healthy. A flag rather than a list page, so the card can say so. */
const RECOMMENDED = ['as3','as6','as8','as15'];
ASSISTANTS.forEach(a => { a.rec = RECOMMENDED.indexOf(a.id) > -1; });

ASSISTANTS[0].conn = ['cn1','cn2'];
ASSISTANTS[0].inst =
  'Answer from the finance warehouse. Strip non-recurring lines before attributing growth, ' +
  'and say so when you do. Never present a figure without the period it covers.';
ASSISTANTS[1].conn = ['cn5'];
ASSISTANTS[1].inst =
  'Read the repository before answering. Order findings by consequence, not by file. ' +
  'No style commentary unless it was asked for.';
ASSISTANTS[2].conn = ['cn3','cn6'];
ASSISTANTS[3].conn = ['cn2','cn4'];
ASSISTANTS[4].conn = ['cn1'];
ASSISTANTS[10].conn = ['cn1','cn3'];
/* The social editor reaches all three channels — publishing through two of them
   and reading insights from all three. The LinkedIn row is not connected yet,
   which is the state the project reports rather than hides. */
ASSISTANTS[16].conn = ['cn10','cn11','cn12'];
ASSISTANTS[16].inst =
  'Write for the channel, not for all of them at once: LinkedIn takes the argument, ' +
  'Instagram takes the image and five words, Facebook takes the invitation. Never post ' +
  'the same paragraph twice. Cite the insight table behind any claim about performance.';

/* ------------------------------------------------- what an assistant CAN do
   A skill name says what it is called; this says what it is for, in the one
   line a reader skims. The long behavioural note stays on the SKILLS record —
   this is the label, not the contract. Names that predate the SKILLS list are
   here too, so every capability an assistant claims can be described. */
const SKILL_DESC = {
  'social.publish': 'Queue a post on a connected channel',
  'social.insights':'Read reach and engagement back from a channel',
  'warehouse.query':'Read the warehouse, read-only',
  'code.run':       'Run Python over the result',
  'chart.build':    'Draw the figure behind a number',
  'search.docs':    'Retrieve spans from the knowledge base',
  'doc.write':      'Draft the document, in the house register',
  'fs.read':        'Read files in the repository',
  'code.analyze':   'Read code without running it',
  'search.repo':    'Search the repository by symbol or text',
  'classify':       'Label and route what comes in',
  'search.logs':    'Search logs across services',
  'trace.read':     'Read a distributed trace end to end'
};

/* ------------------------------------------------- and what to ask it first
   Example prompts, per assistant per capability. These are the interaction, not
   decoration: clicking one binds the assistant and puts the question in the
   composer, so each has to be a question this assistant would actually answer
   well. Written per assistant, because "run a query" is not an example. */
const ASSISTANT_EX = {
  as1:{ 'warehouse.query':['Q3 ARR by segment, plan vs actual', 'Which segments missed plan, and by how much?'],
        'code.run':['Strip non-recurring lines and re-attribute the growth'],
        'chart.build':['Chart the Q3 variance by segment'] },
  as2:{ 'fs.read':['Read ingest/pipeline.py and tell me what it assumes'],
        'code.analyze':['Review the last change to the ingestion pipeline'],
        'search.repo':['Where is the queue depth configured?'] },
  as3:{ 'classify':['Label the ten oldest open tickets by area and urgency'],
        'search.docs':['Which of these are covered by an existing macro?'] },
  as4:{ 'search.docs':['What did last week\'s analyses conclude?'],
        'doc.write':['Draft this week\'s leadership digest', 'Rewrite the digest without adjectives'] },
  as5:{ 'warehouse.query':['Recurring base for Q3, excluding services'],
        'code.run':['Check the FY25 forecast against the recurring base'] },
  as17:{ 'doc.write':['Draft this week\'s three posts from the retrofit case study',
                      'Rewrite the LinkedIn post for Instagram — shorter, one hook, no link'],
         'social.publish':['Queue the open-day post for Wednesday midday'],
         'social.insights':['Which post beat its channel average last week, and what did it do differently?'] },
  as6:{ 'warehouse.query':['Which cohorts does the November uplift touch?'],
        'code.run':['Model the exposure if 10% opt out'],
        'chart.build':['Chart exposed ARR by renewal month'] },
  as7:{ 'warehouse.query':['Who renews in the next 60 days?'],
        'search.docs':['What did we agree with Contoso at the last renewal?'] },
  as8:{ 'search.logs':['Errors on billing_export in the last hour'],
        'trace.read':['Follow one failing export request end to end'],
        'doc.write':['Write the timeline so far, no causes'] },
  as9:{ 'fs.read':['Does the ingest runbook match what the service does?'],
        'search.repo':['Which services have no runbook at all?'] },
  as10:{ 'code.analyze':['What has to change to move ingest off the shared queue?'],
         'doc.write':['Sequence the migration, marking what is reversible'] },
  as11:{ 'warehouse.query':['Accounts above 0.6 churn probability'],
         'classify':['Split those signals into actionable and not'] },
  as12:{ 'search.docs':['Which macros use the old pricing vocabulary?'],
         'doc.write':['Rewrite the top five to match the current terms'] },
  as13:{ 'classify':['Was ticket #4809 worth escalating?'],
         'search.docs':['What does the escalation policy actually require?'] },
  as14:{ 'doc.write':['Rewrite the empty states to name one action each',
                      'Tighten the onboarding dialog copy'] },
  as15:{ 'search.docs':['How do I connect a warehouse?', 'What does a solution package contain?'] },
  as16:{ 'doc.write':['Turn this transcript into decisions and owners'],
         'classify':['Which of these are open questions rather than decisions?'] }
};

/* Ids, a temperature and an age, derived rather than hand-written. A uuid typed
   into a fixture by hand is one nobody can quote in a bug report, because it
   changes the next time somebody edits the file; these are generated from the
   record id, so they are the same on every reload. */
function fixtureUuid(seed){
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++){ h ^= seed.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const hex = n => {
    let o = '';
    for (let i = 0; i < n; i++){
      h = (h * 1664525 + 1013904223) >>> 0;
      o += (((h >>> 16) & 0xff) + 0x100).toString(16).slice(-2);
    }
    return o;
  };
  return hex(4) + '-' + hex(2) + '-' + hex(2) + '-' + hex(2) + '-' + hex(6);
}
const ASST_AGES = ['12m','2h','1d','2d 4h','4d','1w','3h','5d'];
ASSISTANTS.forEach((a, i) => {
  a.ex = ASSISTANT_EX[a.id] || {};
  /* Two identifiers, because they answer different questions: the endpoint is
     what an API call addresses, the record id is what a support ticket quotes. */
  a.endpointId = fixtureUuid(a.id + '/endpoint');
  a.recordId = fixtureUuid(a.id + '/record');
  /* Derived from the model rather than invented per assistant: a thinking model
     runs cold, a fast one is allowed a little more room. */
  a.temp = a.opts.think ? 0.1 : (a.model.indexOf('Fast') > -1 || a.model.indexOf('Mini') > -1 ? 0.3 : 0.2);
  a.upd = ASST_AGES[i % ASST_AGES.length];
});

/* --------------------------------------------------------------- schedule
   Two kinds of row in one table, because they answer the same question — what
   runs without anyone asking. A *task* is one piece of work on a cron. A *job*
   is the workflow of its schedule: named steps that run in order each time it
   fires, so the steps carry no cron of their own — `steps` is what the row
   expands into, each step reporting how it went last time.

   `history` is the run log, newest first. `out` is the one-line label; `md` is
   the product itself — the post as written, the digest as sent — because a run
   log answers "what did it make", and for work that generates content the
   answer is the content. A failed run has no `md`: nothing was made, and
   showing a stub would say otherwise. `art` points into the results store when
   the product is still there to open in full; a run whose product landed in a
   channel or a corpus has nothing to open, so the entry says where the work
   went instead. A job's run carries the per-step outcome as [duration, state],
   aligned by index with the workflow's steps. `manual:true` marks a run
   someone asked for rather than one the cron fired.

   `thread` is the chat the run writes into, when it writes into one — a door,
   not a label. A row that feeds a corpus or a channel has no thread, and its
   Chat cell says where the work goes instead of pretending there is a
   conversation to open. */
const SCHEDULE = [
  { id:'sc1', name:'Weekly revenue digest', cron:'Mon 07:00', next:'in 2 d', state:'ok',
    target:'#leadership', thread:'t1', assistant:'Board writer', last:'1:12',
    steps:[
      { name:'Refresh revenue tables', target:'Finance corpus',  assistant:'—',            last:'0:22', state:'ok' },
      { name:'Draft the digest',       target:'thread',          assistant:'Board writer', last:'0:41', state:'ok' },
      { name:'Post to #leadership',    target:'#leadership',     assistant:'—',            last:'0:09', state:'ok' }
    ],
    history:[
      { when:'Mon Aug 10 · 07:00', dur:'1:12', state:'ok',  out:'Digest · week 33 → #leadership',
        md:'**ARR $41.3M**, +2.1% w/w — enterprise carried it, mid-market flat.\n' +
           '- Pipeline coverage 3.1× against the Q3 target, up from 2.8×\n' +
           '- Two renewals above $200k signed early; one $340k renewal slipped to September\n' +
           '- Watch: churn in the 50–200 seat band ticked up a second week',
        steps:[['0:22','ok'],['0:41','ok'],['0:09','ok']] },
      { when:'Mon Aug 3 · 07:00',  dur:'1:26', state:'ok',  out:'Digest · week 32 → #leadership',
        md:'**ARR $40.4M**, +0.8% w/w — a quiet week, on plan.\n' +
           '- Pipeline coverage 2.8×; nothing above $150k moved stage\n' +
           '- Renewals on track; no logo risk flagged by the watchlist',
        steps:[['0:31','ok'],['0:46','ok'],['0:09','ok']] },
      { when:'Mon Jul 27 · 07:00', dur:'0:24', state:'err', out:'Stopped at step 1 — q3_close_lines was mid-load',
        steps:[['0:24','err'],['—','idle'],['—','idle']] },
      { when:'Mon Jul 20 · 07:00', dur:'1:18', state:'ok',  out:'Digest · week 30 → #leadership',
        md:'**ARR $40.1M**, +1.4% w/w — the strongest July week since 2024.\n' +
           '- Enterprise net-new $310k, led by the Meridian expansion\n' +
           '- Pipeline coverage 2.9×; two competitive takeouts entered legal',
        steps:[['0:26','ok'],['0:43','ok'],['0:09','ok']] }
    ] },
  { id:'sc2', name:'Ingest new drive documents', cron:'every 15 min', next:'in 4 min', state:'run',
    target:'Finance corpus', assistant:'—', last:'1:58',
    history:[
      { when:'Today · 17:19', dur:'—',    state:'run', out:'Indexing renewals-playbook.docx' },
      { when:'Today · 17:04', dur:'1:58', state:'ok',  out:'2 documents → Finance corpus' },
      { when:'Today · 16:49', dur:'0:12', state:'ok',  out:'Nothing new to index' },
      { when:'Today · 16:34', dur:'0:11', state:'ok',  out:'Nothing new to index' }
    ] },
  { id:'sc3', name:'Churn watchlist refresh', cron:'daily 06:00', next:'in 16 h', state:'ok',
    target:'Churn program', thread:'t3', assistant:'Revenue analyst', last:'2:41',
    history:[
      { when:'Today · 06:00',     dur:'2:41', state:'ok', out:'Watchlist · 214 accounts (+6) → Churn program' },
      { when:'Yesterday · 06:00', dur:'2:33', state:'ok', out:'Watchlist · 208 accounts (−2) → Churn program' },
      { when:'Tue Aug 11 · 06:00', dur:'2:56', state:'ok', out:'Watchlist · 210 accounts (+11) → Churn program' }
    ] },
  { id:'sc4', name:'Ticket backlog sweep', cron:'hourly', next:'in 22 min', state:'ok',
    target:'Support triage', assistant:'Support triage', last:'0:38',
    history:[
      { when:'Today · 17:00', dur:'0:38', state:'ok', out:'12 tickets triaged, 2 escalated' },
      { when:'Today · 16:00', dur:'0:41', state:'ok', out:'9 tickets triaged' },
      { when:'Today · 15:00', dur:'0:29', state:'ok', out:'4 tickets triaged' }
    ] },
  { id:'sc5', name:'Corpus re-embed', cron:'manual', next:'—', state:'err',
    target:'Finance corpus', assistant:'—', last:'0:04',
    history:[
      { when:'Tue Aug 11 · 14:02', dur:'0:04', state:'err', manual:true,
        out:'Failed — embedding quota exhausted before the first batch' },
      { when:'Thu Jul 30 · 11:20', dur:'48:12', state:'ok', manual:true,
        out:'12,408 documents re-embedded on nebula-embed-3' }
    ] },
  { id:'sc8', name:'Morning LinkedIn post', cron:'daily 08:30', next:'in 15 h', state:'ok',
    target:'Social publishing', thread:'t7', assistant:'Social editor', last:'0:19',
    /* The product IS the post. LinkedIn ships disconnected (cn12), so every run
       writes the post and keeps it — the label says so, and the draft is read
       here in full because that is what a person checks a morning post for. */
    history:[
      { when:'Today · 08:30', dur:'0:19', state:'ok',
        out:'Post written — LinkedIn is not connected, kept in the queue',
        /* The post's visual, as an inline SVG drawn from the page's own tokens —
           no file, no network, and it follows the theme like everything else. */
        img:'<svg viewBox="0 0 600 315" role="img" aria-label="Unplanned downtime, hours per month: 41 before the retrofit, 28 after">' +
            '<rect width="600" height="315" fill="var(--raised)"/>' +
            '<text x="40" y="66" font-size="24" font-weight="600" fill="var(--text)">Unplanned downtime, h / month</text>' +
            '<text x="40" y="94" font-size="15" fill="var(--text-3)">Meridian plant \u00b7 six-week retrofit \u00b7 zero new hardware</text>' +
            '<rect x="40" y="140" width="400" height="44" rx="6" fill="var(--line-strong)"/>' +
            '<text x="456" y="169" font-size="15" fill="var(--text-3)">before \u00b7 41 h</text>' +
            '<rect x="40" y="204" width="276" height="44" rx="6" fill="var(--accent)"/>' +
            '<text x="332" y="233" font-size="15" fill="var(--text-3)">after \u00b7 28 h (\u221231%)</text>' +
            '</svg>',
        md:'Most factory-automation pitches start with a new line. The Meridian retrofit ' +
           'started with a 1987 press brake and a question: what if the machines you already ' +
           'own could tell you what they need?\n' +
           'Six weeks later: 31% less unplanned downtime, zero new hardware on the floor.\n' +
           'The full case study is in the comments. **If your oldest machine could talk, ' +
           'what would you ask it?**' },
      { when:'Yesterday · 08:30', dur:'0:23', state:'ok',
        out:'Post written — LinkedIn is not connected, kept in the queue',
        img:'<svg viewBox="0 0 600 315" role="img" aria-label="Reel against carousel: the reel reached 3.4 times further, the carousel was saved twice as often">' +
            '<rect width="600" height="315" fill="var(--raised)"/>' +
            '<text x="40" y="66" font-size="24" font-weight="600" fill="var(--text)">Same story, two formats</text>' +
            '<text x="40" y="128" font-size="14" fill="var(--text-3)">reach</text>' +
            '<rect x="130" y="110" width="380" height="26" rx="5" fill="var(--accent)"/>' +
            '<text x="518" y="129" font-size="13" fill="var(--text-3)">reel 3.4\u00d7</text>' +
            '<rect x="130" y="144" width="112" height="26" rx="5" fill="var(--line-strong)"/>' +
            '<text x="250" y="163" font-size="13" fill="var(--text-3)">carousel</text>' +
            '<text x="40" y="234" font-size="14" fill="var(--text-3)">saves</text>' +
            '<rect x="130" y="216" width="150" height="26" rx="5" fill="var(--line-strong)"/>' +
            '<text x="288" y="235" font-size="13" fill="var(--text-3)">reel</text>' +
            '<rect x="130" y="250" width="300" height="26" rx="5" fill="var(--accent)"/>' +
            '<text x="438" y="269" font-size="13" fill="var(--text-3)">carousel 2\u00d7</text>' +
            '</svg>',
        md:'We A/B tested a 40-second reel against a 10-slide carousel with the same story.\n' +
           'The reel won on reach 3.4× — but the carousel drove **2× the saves**.\n' +
           'Reach is rented attention; saves are permission to come back. Which one your ' +
           'post needs depends on which of those you are short of.' },
      { when:'Tue Aug 11 · 08:30', dur:'0:21', state:'ok',
        out:'Post written — LinkedIn is not connected, kept in the queue',
        img:'<svg viewBox="0 0 600 315" role="img" aria-label="Posting window moved from 09:00 to 08:30">' +
            '<rect width="600" height="315" fill="var(--raised)"/>' +
            '<text x="40" y="66" font-size="24" font-weight="600" fill="var(--text)">Read with the first coffee</text>' +
            '<text x="40" y="94" font-size="15" fill="var(--text-3)">four weeks of opens, by half hour</text>' +
            '<rect x="40" y="150" width="520" height="10" rx="5" fill="var(--line)"/>' +
            '<rect x="180" y="150" width="120" height="10" rx="5" fill="var(--accent-soft)"/>' +
            '<circle cx="212" cy="155" r="12" fill="var(--accent)"/>' +
            '<text x="196" y="196" font-size="14" font-weight="600" fill="var(--text)">08:30</text>' +
            '<circle cx="264" cy="155" r="8" fill="var(--line-strong)"/>' +
            '<text x="250" y="126" font-size="13" fill="var(--text-4)">09:00, the old slot</text>' +
            '<text x="40" y="264" font-size="14" fill="var(--text-3)">07:00</text>' +
            '<text x="516" y="264" font-size="14" fill="var(--text-3)">12:00</text>' +
            '</svg>',
        md:'September calendar note: we are moving our posting window from 09:00 to 08:30.\n' +
           'Four weeks of data says our audience reads with the first coffee, not the second. ' +
           'Small change, free reach.\n' +
           '*What time slot works for your audience — and when did you last test it?*' }
    ] },
  { id:'sc6', name:'Forecast bridge rebuild', cron:'Fri 18:00', next:'in 5 d', state:'idle',
    target:'Q3 close', thread:'t1', assistant:'Revenue analyst', last:'—',
    history:[] },
  { id:'sc7', name:'Channel performance report', cron:'Mon 08:00', next:'in 3 d', state:'ok',
    target:'Social publishing', thread:'t7', assistant:'Social editor', last:'1:04',
    steps:[
      { name:'Pull channel metrics',           target:'fb · ig · li',      assistant:'—',             last:'0:31', state:'ok' },
      { name:'Compose the weekly report',      target:'thread',            assistant:'Social editor', last:'0:26', state:'ok' },
      { name:'File the result',                target:'Social publishing', assistant:'—',             last:'0:07', state:'ok' }
    ],
    history:[
      /* Run on request twenty minutes ago — the result it filed is a7. */
      { when:'Today · 17:12',      dur:'1:04', state:'ok', manual:true,
        out:'Channel performance · week 33', art:'a7',
        md:'- Instagram led again: reach 246.1k, engagement 5.1%, +1,204 follows\n' +
           '- Facebook reach 182.4k, engagement 3.4% — the reel outran every carousel\n' +
           '- LinkedIn *not measured* — the channel is not connected',
        steps:[['0:31','ok'],['0:26','ok'],['0:07','ok']] },
      { when:'Mon Aug 10 · 08:00', dur:'1:09', state:'ok', out:'Channel performance · week 32',
        md:'- Instagram reach 228.7k, engagement 4.8%; Facebook reach 176.0k, engagement 3.1%\n' +
           '- Best post: the retrofit before/after reel — 44.2k reach in 48 h\n' +
           '- LinkedIn *not measured* — the channel is not connected',
        steps:[['0:34','ok'],['0:28','ok'],['0:07','ok']] },
      { when:'Mon Aug 3 · 08:00',  dur:'1:41', state:'ok', out:'Channel performance · week 31 — LinkedIn not measured',
        md:'- Instagram reach 201.3k, engagement 4.2%; Facebook reach 168.4k, engagement 3.0%\n' +
           '- Carousel formats fell for the third week — moved the calendar toward reels',
        steps:[['1:02','ok'],['0:32','ok'],['0:07','ok']] }
    ] }
];

/* -------------------------------------------------------- knowledge bases */
/* A knowledge base is six kinds of thing at once — the files in it, the tables
   and series extracted from them, what the model has derived, who may read it,
   and what has happened to it. Hence one tab per kind. `b` is a byte count so
   Size sorts numerically rather than alphabetically; `ts` does the same for
   Date Added. */
const KBS = [
  { id:'k1', name:'Finance corpus', docs:'12,408', updated:'12 min ago', health:'ok', embed:'nebula-embed-3',
    desc:'Ledgers, board decks, pricing memos and the FY25 plan. Everything the revenue analyst is allowed to cite.',
    files:[
      { n:'FY25_targets.xlsx',      from:'Drive',      size:'2.1 MB', b:2202010, added:'Aug 12, 2026 09:14', ts:20260812.0914, st:'indexed' },
      { n:'pricing-changes.md',     from:'Repo',       size:'14 KB',  b:14336,   added:'Aug 11, 2026 16:02', ts:20260811.1602, st:'indexed' },
      { n:'board-deck-Q2.pdf',      from:'Local File', size:'8.4 MB', b:8808038, added:'Aug 04, 2026 11:47', ts:20260804.1147, st:'indexed' },
      { n:'q3-close-notes.md',      from:'Local File', size:'22 KB',  b:22528,   added:'Aug 13, 2026 08:31', ts:20260813.0831, st:'indexed' },
      { n:'renewals-playbook.docx', from:'Drive',      size:'340 KB', b:348160,  added:'Aug 13, 2026 17:19', ts:20260813.1719, st:'queued' }
    ],
    tables:[
      ['fy25_targets','1,204 rows','8 cols','Aug 12, 2026'],
      ['q3_close_lines','18,402 rows','14 cols','Aug 13, 2026'],
      ['pricing_cohorts','96 rows','6 cols','Aug 11, 2026']
    ],
    series:[
      { n:'arr_monthly',      cadence:'monthly', span:'Jan 2025 – Jul 2026', bars:[42,46,51,47,55,58,61,66] },
      { n:'churn_bps',        cadence:'monthly', span:'Jan 2025 – Jul 2026', bars:[28,24,26,31,29,35,38,40] },
      { n:'renewal_coverage', cadence:'weekly',  span:'last 12 weeks',       bars:[74,78,71,80,83,79,86,88] }
    ],
    analysis:[
      ['Q3 variance by segment','table · Q3 revenue analysis','2m'],
      ['FY25 forecast bridge','table · Q3 revenue analysis','2d'],
      ['Services timing is not growth','note · flagged twice','3d']
    ],
    access:[
      ['Cong Yu','Owner','every document'],
      ['Revenue analyst','Reader','ledgers, plans, pricing'],
      ['Board Digest (agent)','Reader','board decks only'],
      ['Support team','No access','—']
    ],
    activity:[
      ['17:19','Cong Yu','added renewals-playbook.docx','run'],
      ['08:31','Cong Yu','added q3-close-notes.md','ok'],
      ['Aug 12','Nebulas','re-embedded 1,204 chunks','ok'],
      ['Aug 11','Ravi','revoked support team access','warn']
    ] },

  { id:'k2', name:'Engineering docs', docs:'3,902', updated:'1 h ago', health:'ok', embed:'nebula-embed-3',
    desc:'ADRs, runbooks and the service catalogue. Scoped to the platform repos, not product code.',
    files:[
      { n:'ADR-014.md',            from:'Repo',       size:'9 KB',  b:9216,  added:'Aug 10, 2026 14:20', ts:20260810.1420, st:'indexed' },
      { n:'ingest-runbook.md',     from:'Repo',       size:'31 KB', b:31744, added:'Aug 13, 2026 10:05', ts:20260813.1005, st:'indexed' },
      { n:'service-catalogue.yaml',from:'Repo',       size:'78 KB', b:79872, added:'Aug 09, 2026 09:00', ts:20260809.0900, st:'indexed' },
      { n:'oncall-handover.pdf',   from:'Local File', size:'1.2 MB',b:1258291,added:'Aug 13, 2026 16:44', ts:20260813.1644, st:'indexed' }
    ],
    tables:[
      ['service_catalogue','142 rows','9 cols','Aug 09, 2026'],
      ['adapter_budgets','38 rows','5 cols','Aug 13, 2026']
    ],
    series:[
      { n:'ingest_throughput', cadence:'hourly', span:'last 24 h', bars:[61,68,72,70,79,84,82,88] },
      { n:'queue_depth',       cadence:'hourly', span:'last 24 h', bars:[22,31,44,52,61,74,86,91] }
    ],
    analysis:[
      ['pipeline.py — bounded queue','diff · Refactor the ingestion pipeline','1h'],
      ['Adapter credit scheme','doc · ADR-014 is unimplemented','3d']
    ],
    access:[
      ['Platform team','Editor','every document'],
      ['Cong Yu','Owner','every document'],
      ['Pipeline Health (app)','Reader','runbooks, catalogue']
    ],
    activity:[
      ['16:44','Ravi','added oncall-handover.pdf','ok'],
      ['10:05','Repo sync','updated ingest-runbook.md','ok'],
      ['Aug 12','Nebulas','indexed 8 new ADRs','ok']
    ] },

  { id:'k4', name:'Brand & social kit', docs:'184', updated:'2 h ago', health:'ok', embed:'nebula-embed-3',
    desc:'What the brand sounds like and what it may claim: voice notes, the words we do not use, approved product copy and every post already published.',
    files:[
      { n:'voice-and-tone.md',        from:'Repo',       size:'18 KB',  b:18432,   added:'Aug 09, 2026 10:12', ts:20260809.1012, st:'indexed' },
      { n:'words-we-avoid.md',        from:'Repo',       size:'4 KB',   b:4096,    added:'Aug 09, 2026 10:14', ts:20260809.1014, st:'indexed' },
      { n:'product-claims-approved.docx', from:'Drive',  size:'212 KB', b:217088,  added:'Aug 11, 2026 14:40', ts:20260811.1440, st:'indexed' },
      { n:'published-posts-2026.csv', from:'Local File', size:'96 KB',  b:98304,   added:'Aug 13, 2026 09:02', ts:20260813.0902, st:'indexed' },
      { n:'northwind-case-study.pdf', from:'Drive',      size:'1.8 MB', b:1887437, added:'Aug 12, 2026 16:22', ts:20260812.1622, st:'indexed' }
    ],
    tables:[
      ['published_posts','1,412 rows','9 cols','Aug 13, 2026'],
      ['approved_claims','88 rows','4 cols','Aug 11, 2026']
    ],
    series:[
      { n:'followers_total', cadence:'weekly', span:'last 12 weeks', bars:[61,62,64,66,67,69,72,74] },
      { n:'engagement_rate', cadence:'weekly', span:'last 12 weeks', bars:[38,41,36,44,47,42,51,49] },
      { n:'posts_published', cadence:'weekly', span:'last 12 weeks', bars:[9,11,8,12,10,13,11,12] }
    ],
    analysis:[
      ['Channel performance · week 33','doc · Social publishing','20m'],
      ['Post pack · retrofit case study','doc · Social publishing','1d'],
      ['Carousels outperform reels on saves','note · flagged twice','5d']
    ],
    access:[
      ['Cong Yu','Owner','everything'],
      ['Social editor','Reader','voice, claims, published posts'],
      ['Support team','Reader','approved claims only']
    ],
    activity:[
      ['09:02','Nebulas','indexed published-posts-2026.csv','ok'],
      ['Aug 12','Cong Yu','added northwind-case-study.pdf','ok'],
      ['Aug 11','Ana','approved 6 product claims','ok'],
      ['Aug 09','Cong Yu','created the base','ok']
    ] },

  { id:'k3', name:'Support corpus', docs:'96,551', updated:'4 h ago', health:'warn', embed:'nebula-embed-2',
    desc:'Ticket history and macros. Still on the previous embedding model — the re-embed run is blocked on quota.',
    files:[
      { n:'tickets-90d.jsonl',   from:'Warehouse',  size:'412 MB', b:431947776, added:'Aug 13, 2026 04:00', ts:20260813.0400, st:'indexed' },
      { n:'macros.json',         from:'Repo',       size:'96 KB',  b:98304,     added:'Jul 28, 2026 12:10', ts:20260728.1210, st:'indexed' },
      { n:'june-backfill.jsonl', from:'Warehouse',  size:'—',      b:0,         added:'Aug 01, 2026 02:00', ts:20260801.0200, st:'failed' }
    ],
    tables:[
      ['tickets_90d','96,551 rows','22 cols','Aug 13, 2026'],
      ['macro_usage','412 rows','4 cols','Jul 28, 2026']
    ],
    series:[
      { n:'ticket_volume',  cadence:'daily', span:'last 30 days', bars:[54,61,58,72,66,81,77,69] },
      { n:'reopen_rate',    cadence:'daily', span:'last 30 days', bars:[12,14,11,18,22,19,26,31] }
    ],
    analysis:[
      ['Churn model — feature importance','chart · Churn signals in enterprise accounts','1d'],
      ['Reopen rate is climbing in billing','note · unresolved','5d']
    ],
    access:[
      ['Support team','Editor','every document'],
      ['Churn Radar (app)','Reader','tickets only'],
      ['Revenue analyst','Reader','tickets only']
    ],
    activity:[
      ['04:00','Warehouse sync','refreshed tickets-90d.jsonl','ok'],
      ['Aug 01','Nebulas','backfill failed — quota exceeded','err'],
      ['Jul 28','Ana','added macros.json','ok']
    ] }
];

/* ----------------------------------------------------------- data sources */
const DATASETS = [
  { id:'d1', name:'q3_ledger', source:'warehouse', rows:'2,431,004', updated:'12 min ago', health:'ok', grant:'Editor',
    desc:'Line-level revenue ledger for the Q3 close, one row per invoice line.',
    schema:[
      ['invoice_id','string','no','INV-2026-0001'],
      ['segment','string','no','Enterprise'],
      ['line_item','string','no','subscription'],
      ['arr','decimal(12,2)','no','412000.00'],
      ['booked_at','timestamp','no','2026-07-14 09:22:01'],
      ['fx_rate','decimal(8,4)','yes','1.0842']
    ],
    preview:[
      ['INV-2026-0001','Enterprise','subscription','412,000.00'],
      ['INV-2026-0002','Mid-market','subscription','48,200.00'],
      ['INV-2026-0003','Enterprise','services','96,500.00'],
      ['INV-2026-0004','SMB','subscription','3,900.00']
    ] },
  { id:'d2', name:'accounts_health', source:'warehouse', rows:'41,208', updated:'1 h ago', health:'ok', grant:'Reader',
    desc:'Per-account health scores, usage rollups and admin history.',
    schema:[
      ['account_id','string','no','ACC-0042'],
      ['health_score','int','no','72'],
      ['admin_changed_at','timestamp','yes','2026-05-02 00:00:00'],
      ['seats_active','int','no','118']
    ],
    preview:[ ['ACC-0042','72','2026-05-02','118'], ['ACC-0043','44','—','9'] ] },
  { id:'d3', name:'support_tickets', source:'zendesk', rows:'96,551', updated:'4 h ago', health:'warn', grant:'Reader',
    desc:'Ticket export, last 90 days. Backfill for June is incomplete.',
    schema:[
      ['ticket_id','string','no','TCK-91002'],
      ['area','string','yes','billing'],
      ['urgency','string','yes','high'],
      ['created_at','timestamp','no','2026-08-01 11:02:00']
    ],
    preview:[ ['TCK-91002','billing','high','2026-08-01'], ['TCK-91003','api','normal','2026-08-01'] ] },
  { id:'d5', name:'fb_page_insights', source:'facebook', rows:'1,204', updated:'12 min ago', health:'ok', grant:'Reader',
    desc:'One row per post per day: reach, engagement and what the page gained that day.',
    schema:[
      ['post_id','string','no','FB-2026-0812-1'],
      ['published_at','timestamp','no','2026-08-12 09:00:00'],
      ['format','string','no','link'],
      ['reach','int','no','18402'],
      ['engagements','int','no','612'],
      ['page_follows','int','yes','24']
    ],
    preview:[
      ['FB-2026-0812-1','link','18,402','612'],
      ['FB-2026-0810-1','photo','12,908','508'],
      ['FB-2026-0807-1','video','31,204','1,844'],
      ['FB-2026-0805-1','text','6,120','142']
    ] },
  { id:'d6', name:'ig_media_insights', source:'instagram', rows:'2,088', updated:'14 min ago', health:'ok', grant:'Reader',
    desc:'Per-media metrics including saves and shares, which is where a carousel shows its worth.',
    schema:[
      ['media_id','string','no','IG-2026-0812-2'],
      ['media_type','string','no','carousel'],
      ['reach','int','no','24108'],
      ['saves','int','no','412'],
      ['shares','int','no','188'],
      ['profile_visits','int','yes','96']
    ],
    preview:[
      ['IG-2026-0812-2','carousel','24,108','412'],
      ['IG-2026-0811-1','reel','48,902','1,204'],
      ['IG-2026-0809-1','image','9,408','88'],
      ['IG-2026-0806-1','carousel','21,442','388']
    ] },
  { id:'d7', name:'li_page_analytics', source:'linkedin', rows:'618', updated:'not syncing', health:'warn', grant:'Reader',
    desc:'Company-page impressions, click-through and follower change. Stops at 6 August — the connector is not connected.',
    schema:[
      ['update_id','string','no','LI-2026-0806-1'],
      ['impressions','int','no','8402'],
      ['clicks','int','no','412'],
      ['ctr','decimal(5,4)','no','0.0490'],
      ['follower_delta','int','yes','18']
    ],
    preview:[
      ['LI-2026-0806-1','8,402','412','4.90%'],
      ['LI-2026-0804-1','6,118','208','3.40%'],
      ['LI-2026-0731-1','11,204','694','6.20%']
    ] },
  { id:'d4', name:'renewals_export', source:'upload', rows:'812', updated:'2 d ago', health:'ok', grant:null,
    desc:'Manual CSV upload of the FY25 renewal book.',
    schema:[ ['account','string','no','Northwind'], ['renews_on','date','no','2026-11-04'], ['acv','decimal(12,2)','no','214000.00'] ],
    preview:[ ['Northwind','2026-11-04','214,000.00'], ['Contoso','2026-12-01','88,500.00'] ] }
];

/* ---------------------------------------------------------------- skills
   A skill is one capability with a typed signature. Assistants compose them;
   nobody calls a skill directly. */
const SKILLS = [
  { id:'sk1', name:'warehouse.query', state:'ok', calls:'2,104 / 7d', avg:'1.2s',
    desc:'Read-only SQL against the warehouse. Rejects anything that is not a SELECT, and caps the scan at 40 GB.',
    sig:'warehouse.query(sql: string, timeout?: seconds) -> Table',
    code:[
      'def query(sql: str, timeout: int = 30) -> Table:',
      '    stmt = parse(sql)',
      '    if not stmt.is_select():',
      '        raise Denied("warehouse.query is read-only")',
      '    if estimate_scan(stmt) > GB(40):',
      '        raise Denied("scan estimate exceeds budget")',
      '    return run(stmt, timeout=timeout)'
    ].join('\n') },
  { id:'sk2', name:'code.run', state:'ok', calls:'1,338 / 7d', avg:'2.4s',
    desc:'Executes Python in a sandbox with no network and a 512 MB ceiling. Loaded datasets are mounted read-only.',
    sig:'code.run(src: string, mounts?: Dataset[]) -> Result',
    code:[
      'def run(src: str, mounts: list[Dataset] = ()) -> Result:',
      '    box = Sandbox(net=False, mem=MB(512), wall=SEC(60))',
      '    for d in mounts:',
      '        box.mount(d, mode="ro")   # never writable',
      '    return box.exec(src)'
    ].join('\n') },
  { id:'sk3', name:'search.docs', state:'ok', calls:'894 / 7d', avg:'0.6s',
    desc:'Hybrid retrieval over a knowledge base — dense plus BM25, reranked. Returns spans, never whole documents.',
    sig:'search.docs(q: string, kb: KnowledgeBase, k?: int) -> Span[]',
    code:[
      'def search(q: str, kb: KB, k: int = 8) -> list[Span]:',
      '    dense  = kb.ann(embed(q), k=k * 4)',
      '    sparse = kb.bm25(q, k=k * 4)',
      '    # rerank the union — recall from two retrievers, precision from one model',
      '    return rerank(q, dedupe(dense + sparse))[:k]'
    ].join('\n') },
  { id:'sk4', name:'chart.build', state:'ok', calls:'412 / 7d', avg:'0.4s',
    desc:'Turns a table into a Vega-Lite spec. Picks the mark from the column types rather than asking.',
    sig:'chart.build(t: Table, hint?: string) -> VegaSpec',
    code:[
      'def build(t: Table, hint: str | None = None) -> VegaSpec:',
      '    x, y = infer_axes(t)          # temporal beats ordinal beats nominal',
      '    mark = "line" if is_temporal(x) else "bar"',
      '    return spec(t, mark=mark, x=x, y=y, hint=hint)'
    ].join('\n') },
  { id:'sk5', name:'doc.write', state:'warn', calls:'96 / 7d', avg:'3.1s',
    desc:'Writes a document into the workspace. Always asks for confirmation — it is the only skill here that mutates anything.',
    sig:'doc.write(path: string, body: markdown) -> Doc',
    code:[
      'def write(path: str, body: str) -> Doc:',
      '    if not confirm(f"write {path}?"):   # never silent',
      '        raise Cancelled()',
      '    return workspace.put(path, body)'
    ].join('\n') }
];

/* ----------------------------------------------------------------- agents */
const AGENTS = [
  { id:'ag1', name:'ingest-docs', state:'run',  desc:'Watches the drive folder and embeds new documents into the corpus.',
    schedule:'every 15 min', owner:'data-platform',
    runs:[
      { id:'r1', started:'14:22:07', dur:'0:42', state:'run',  items:'214 / 900 docs' },
      { id:'r2', started:'14:07:04', dur:'1:58', state:'ok',   items:'900 docs' },
      { id:'r3', started:'13:52:01', dur:'2:03', state:'ok',   items:'884 docs' },
      { id:'r4', started:'13:37:00', dur:'0:11', state:'err',  items:'failed: drive 403' }
    ],
    log:[
      { t:'14:22:07', lvl:'info', m:'run started, cursor=2026-08-12T13:52Z' },
      { t:'14:22:09', lvl:'info', m:'drive.list -> 900 candidates, 214 new' },
      { t:'14:22:31', lvl:'info', m:'embed batch 1/9 ok (24 docs, 1.8s)' },
      { t:'14:22:49', lvl:'warn', m:'doc 118 exceeds 200k tokens, chunking' },
      { t:'14:23:02', lvl:'info', m:'embed batch 2/9 ok (24 docs, 1.7s)' }
    ] },
  { id:'ag2', name:'classify-tickets', state:'run', desc:'Labels inbound support tickets by product area and urgency.',
    schedule:'on webhook', owner:'support-eng',
    runs:[
      { id:'r1', started:'14:20:12', dur:'2:10', state:'run', items:'318 tickets' },
      { id:'r2', started:'12:00:00', dur:'3:41', state:'ok',  items:'1,204 tickets' }
    ],
    log:[
      { t:'14:20:12', lvl:'info', m:'webhook batch received (318)' },
      { t:'14:21:40', lvl:'info', m:'classified 210 / 318' },
      { t:'14:22:02', lvl:'warn', m:'low confidence on 14 tickets, queued for review' }
    ] },
  { id:'ag3', name:'nightly-summary', state:'idle', desc:'Writes the daily digest for the leadership channel.',
    schedule:'daily 06:00', owner:'ops',
    runs:[
      { id:'r1', started:'06:00:00', dur:'1:12', state:'ok', items:'1 digest' },
      { id:'r2', started:'yesterday', dur:'1:19', state:'ok', items:'1 digest' }
    ],
    log:[ { t:'06:01:12', lvl:'info', m:'digest posted to #leadership' } ] },
  { id:'ag4', name:'embed-corpus', state:'err', desc:'Full corpus re-embedding after a model upgrade.',
    schedule:'manual', owner:'data-platform',
    runs:[ { id:'r1', started:'11:04:22', dur:'0:04', state:'err', items:'failed: quota exceeded' } ],
    log:[
      { t:'11:04:22', lvl:'info', m:'run started (manual, by cong.yu)' },
      { t:'11:04:26', lvl:'err',  m:'embeddings quota exceeded for org, aborting' }
    ] }
];

/* ------------------------------------------------------------- connectors
   What an assistant can reach. A connector is the credential and the scope,
   never the data — the data arrives as a source or a knowledge base. Three at
   the end are catalogue entries: available, not connected, which is a state
   worth showing rather than a list worth hiding. */
const CONNECTORS = [
  { id:'cn1', name:'Snowflake', kind:'warehouse', state:'ok',
    desc:'The finance warehouse. Every ledger figure in this workspace resolves through here.',
    endpoint:'gd-prod.eu-west-1.snowflakecomputing.com', auth:'Service account',
    scope:'read-only role, 40 GB scan cap', writes:false, calls:'2,104 / 7d', last:'2 min ago' },
  { id:'cn2', name:'Google Drive', kind:'drive', state:'ok',
    desc:'One shared folder. Scoped to Finance so the corpus cannot widen without someone widening it here.',
    endpoint:'drive.google.com/drive/folders/Finance', auth:'Service account',
    scope:'1 folder, read-only', writes:false, calls:'318 / 7d', last:'4 min ago' },
  { id:'cn3', name:'Zendesk', kind:'ticketing', state:'warn',
    desc:'Ticket history and macros. The June backfill never completed, so anything aggregating Q2 undercounts.',
    endpoint:'gnomon.zendesk.com/api/v2', auth:'API key',
    scope:'tickets, macros', writes:true, calls:'1,204 / 7d', last:'4 h ago',
    note:'June backfill incomplete — 12,402 tickets missing.' },
  { id:'cn4', name:'Notion', kind:'docs', state:'ok',
    desc:'Product workspace, read-only. Pricing memos and specs are cited from here.',
    endpoint:'api.notion.com/v1', auth:'Integration token',
    scope:'Product workspace, read-only', writes:false, calls:'96 / 7d', last:'1 h ago' },
  { id:'cn5', name:'GitHub', kind:'repo', state:'ok',
    desc:'Platform repositories. ADRs, runbooks and the service catalogue are read from the default branch.',
    endpoint:'github.com/gnomon-digital', auth:'App installation',
    scope:'4 repositories, contents read', writes:false, calls:'204 / 7d', last:'10 min ago' },
  { id:'cn6', name:'Ingest webhook', kind:'webhook', state:'ok',
    desc:'The inbound edge. Signed requests only, and the signature is checked before the body is parsed.',
    endpoint:'ingest.nebulas.app/v1/hooks/8f2c', auth:'Signed webhook',
    scope:'signed POST, 318 calls today', writes:true, calls:'318 / 1d', last:'2 min ago' },
  { id:'cn7', name:'Slack', kind:'messaging', state:'off',
    desc:'Post digests into a channel and take questions from a thread.',
    endpoint:'—', auth:'OAuth', scope:'—', writes:true, calls:'—', last:'—' },
  { id:'cn8', name:'Stripe', kind:'payments', state:'off',
    desc:'Invoices and subscription events, for revenue that never reaches the warehouse.',
    endpoint:'—', auth:'API key', scope:'—', writes:false, calls:'—', last:'—' },
  { id:'cn9', name:'HubSpot', kind:'crm', state:'off',
    desc:'Accounts, owners and renewal dates — the churn signal that shows up before usage moves.',
    endpoint:'—', auth:'OAuth', scope:'—', writes:false, calls:'—', last:'—' }
];
CONNECTORS.push(
  { id:'cn10', name:'Facebook Pages', kind:'social', state:'ok',
    desc:'One page. Publishing and page insights — the credential lives here, the posts live in the project.',
    endpoint:'graph.facebook.com/v21.0/acmeindustrial', auth:'OAuth',
    scope:'1 page · pages_manage_posts, read_engagement', writes:true, calls:'218 / 7d', last:'12 min ago' },
  { id:'cn11', name:'Instagram', kind:'social', state:'ok',
    desc:'The business account behind the page. Publishing is scheduled, never immediate.',
    endpoint:'graph.facebook.com/v21.0/17841400000000', auth:'OAuth',
    scope:'1 business account · content_publish, insights', writes:true, calls:'196 / 7d', last:'14 min ago' },
  { id:'cn12', name:'LinkedIn', kind:'social', state:'off',
    desc:'The company page. Posts are drafted and queued without it; nothing leaves until it is connected.',
    endpoint:'—', auth:'OAuth', scope:'—', writes:true, calls:'—', last:'—' }
);
const CONNECTOR_AUTHS = ['OAuth','Service account','API key','Integration token','App installation','Signed webhook'];

/* -------------------------------------------------------- design elements
   What the answer looks like once it leaves the workspace. Two kinds only: a
   widget, which is embedded in a page someone else owns, and a template, which
   IS the page. `shape` picks the preview renderer; `cfg` is what the inspector
   edits. The accent named here is the customer's brand, not ours. */
const DESIGNS = [
  { id:'de1', name:'Metric tile', kind:'widget', shape:'kpi', state:'live', owner:'me', team:'Revenue',
    desc:'One number, its movement against plan, and the period it covers.',
    cfg:{ title:'Q3 revenue', sub:'live', accent:'Amber', radius:'Soft', theme:'Follow',
          width:'Narrow', header:true, credit:true,
          value:'$41.2M', delta:'+12.4%', cap:'Against plan · quarter to date' } },

  { id:'de2', name:'Trend card', kind:'widget', shape:'chart', state:'live', owner:'me', team:'Revenue',
    desc:'A series and its latest value. The last bar takes the brand colour; the rest carry it at low opacity.',
    cfg:{ title:'ARR by month', sub:'8 mo', accent:'Nebulas', radius:'Soft', theme:'Follow',
          width:'Medium', header:true, credit:true,
          value:'$66.0M', delta:'+8.2%', cap:'Monthly recurring, last eight months' },
    bars:[42,46,51,47,55,58,61,66] },

  { id:'de3', name:'Ask box', kind:'widget', shape:'ask', state:'live', owner:'Ravi', team:'Product',
    desc:'A question field and the three questions worth starting from. The smallest surface a solution can ship as.',
    cfg:{ title:'Ask the renewal book', sub:'', accent:'Indigo', radius:'Round', theme:'Follow',
          width:'Medium', header:true, credit:true,
          placeholder:'Ask about renewals, exposure or owners…',
          starters:'What renews in November?, Which accounts are exposed?, Who owns Contoso?' } },

  { id:'de4', name:'Watchlist', kind:'widget', shape:'rows', state:'live', owner:'Ana', team:'Support',
    desc:'A ranked list where the bar is the score, so the order is legible before any number is read.',
    cfg:{ title:'Accounts at risk', sub:'5', accent:'Red', radius:'Soft', theme:'Follow',
          width:'Medium', header:true, credit:true, cap:'Churn probability, next quarter' },
    rows:[['Northwind Traders','0.81',81],['Contoso Retail','0.74',74],
          ['Fabrikam','0.63',63],['Tailspin Toys','0.61',61],['Adventure Works','0.22',22]] },

  { id:'de5', name:'Internal portal', kind:'template', shape:'portal', state:'live', owner:'me', team:'Revenue',
    desc:'A signed-in page: nav down the side, cards in the middle. What a team lands on rather than what a prospect reads.',
    cfg:{ title:'Finance Portal', sub:'Everything feeding the close', accent:'Nebulas',
          radius:'Soft', theme:'Follow', width:'Wide', header:true, credit:true,
          nav:'Overview, Revenue, Renewals, Reports' } },

  { id:'de6', name:'Product landing', kind:'template', shape:'landing', state:'draft', owner:'Marc', team:'Product',
    desc:'A public page with one claim, three supports and one action. Still unwired — no package points at it.',
    cfg:{ title:'Ask your revenue data anything', sub:'Answers with the source attached, from the ledger your finance team already trusts.',
          accent:'Emerald', radius:'Round', theme:'Follow', width:'Wide', header:true, credit:true,
          cta:'Request access', nav:'Product, Pricing, Docs' } },

  { id:'de7', name:'Docs & FAQ', kind:'template', shape:'docs', state:'live', owner:'Ravi', team:'Product',
    desc:'Three columns: what exists, what you are reading, and where you are in it.',
    cfg:{ title:'Help Centre', sub:'Sources, assistants and the API', accent:'Blue',
          radius:'Square', theme:'Follow', width:'Wide', header:true, credit:true,
          nav:'Getting started, Sources, Assistants, API' } }
];
/* Six brands to pick from, each already a token. A colour picker would invite a
   seventh that matches nothing. */
const DESIGN_ACCENTS = [
  ['Nebulas','var(--accent)'], ['Indigo','var(--app-1)'], ['Emerald','var(--app-2)'],
  ['Amber','var(--app-3)'],    ['Blue','var(--app-4)'],   ['Red','var(--app-5)']
];

/* ---------------------------------------------------------------- surfaces
   Where a package can ship. `renders` is the load-bearing field: a surface that
   renders needs a design element, and one that answers in JSON does not. */
const SURFACES = [
  { id:'app',   name:'App rail',        renders:true,  desc:'A panel in this workspace’s right-hand rail.' },
  { id:'embed', name:'Embedded widget', renders:true,  desc:'Dropped into a page another team owns.' },
  { id:'site',  name:'Public website',  renders:true,  desc:'A hosted page on your own domain.' },
  { id:'hook',  name:'Webhook',         renders:false, desc:'Called by another system, answers in JSON.' },
  { id:'sched', name:'Scheduled digest',renders:false, desc:'Runs on a clock, writes into a thread or channel.' }
];

/* ------------------------------------------------------- solution packages
   A package is what ships: an assistant, the skills it may call, the knowledge
   it may cite, the connectors it needs, the design element it renders as, and
   the surfaces it reaches. Every field is an id into one of the lists above, so
   a package cannot claim a part that does not exist. */
const SOLUTIONS = [
  { id:'so1', name:'Revenue Cockpit', state:'live', app:'RC', users:'42 users', version:'1.4.0',
    owner:'me', team:'Revenue',
    desc:'The finance team\'s standing view: variance by segment, the forecast bridge, and a question box wired to the revenue analyst.',
    assistant:'as1', skills:['sk1','sk2','sk4'], kb:'k1', conn:['cn1','cn2'],
    design:'de1', surfaces:['app','sched'], audience:'Finance team' },
  { id:'so2', name:'Churn Radar', state:'live', app:'CR', users:'18 users', version:'1.1.0',
    owner:'Ana', team:'Support',
    desc:'Account watchlist ranked by churn probability, with the signal that put each account on the list.',
    assistant:'as11', skills:['sk1'], kb:'k3', conn:['cn1','cn3'],
    design:'de4', surfaces:['app'], audience:'Revenue and support leads' },
  { id:'so3', name:'Ticket Triage', state:'live', app:'TT', users:'64 users', version:'2.0.1',
    owner:'Ana', team:'Support',
    desc:'Labels inbound tickets and escalates the uncertain ones to a human queue instead of guessing.',
    assistant:'as3', skills:['sk3'], kb:'k3', conn:['cn3','cn6'],
    design:'de4', surfaces:['hook','app'], audience:'Support team' },
  { id:'so4', name:'Board Digest', state:'beta', app:'BD', users:'6 users', version:'0.9.0',
    owner:'me', team:'Revenue',
    desc:'Assembles the weekly leadership note from the week\'s analyses. Drafts only — a human sends it.',
    assistant:'as4', skills:['sk3','sk5'], kb:'k1', conn:['cn2','cn4'],
    design:null, surfaces:['sched'], audience:'Leadership' },
  { id:'so5', name:'Pricing Lab', state:'draft', app:'PL', users:'—', version:'0.3.0',
    owner:'Ravi', team:'Revenue',
    desc:'Scenario tool for the November pricing cohort. Still wiring the renewal exposure model.',
    assistant:'as6', skills:['sk1','sk2'], kb:'k1', conn:['cn1'],
    design:null, surfaces:['app','embed'], audience:'Revenue team' }
];

/* ------------------------------------------------------------------- apps
   The right rail. Circular tiles, initials only — an app is identified by
   position and name, not by a colour we would have to invent. */
/* An app carries a colour and a glyph, keyed to what it is for rather than to
   its position in the rail: money is amber wherever it appears, authoring is
   red. `c` indexes --app-1..5 in tokens.css. */
/* ----------------------------------------------------------------- apps
   The workspace's own apps: the tools you keep open BESIDE a conversation, not
   the analytical surfaces a solution publishes. That is why they are ordinary
   and small — a calendar, two extractors, files, news, a note, a todo list. An
   app earns its column by being useful while you are reading something else.

   `c` is the identity colour (--app-1..5) and `icon` the glyph. Adjacent apps
   never share a colour: the rail is scanned, not read. */
const APPS = [
  { id:'ap1', short:'CA', name:'Calendar',          state:'live', c:1, icon:'calendar', desc:'Today, this week, and what is due.' },
  { id:'ap2', short:'CV', name:'CV extractor',      state:'live', c:2, icon:'idcard',   desc:'Reads a CV into fields you can file.' },
  { id:'ap3', short:'IN', name:'Invoice extractor', state:'live', c:3, icon:'receipt',  desc:'Reads an invoice and checks it adds up.' },
  { id:'ap4', short:'MF', name:'My files',          state:'live', c:2, icon:'folder',   desc:'Everything uploaded here, newest first.' },
  { id:'ap5', short:'NW', name:'News',              state:'beta', c:4, icon:'news',     desc:'What moved in the accounts you follow.' },
  { id:'ap6', short:'NO', name:'Note',              state:'live', c:5, icon:'note',     desc:'A scratchpad that survives navigation.' },
  { id:'ap7', short:'TD', name:'Todo',              state:'live', c:4, icon:'checksq',  desc:'What you said you would do.' }
];

/* An app opens into a panel, so each one needs a surface rather than a page.
   Seven apps, seven shapes — `s` picks the renderer:

     agenda   a week at hour resolution, a month, and what is coming up
     cvx      a CV tray: upload, extract, then read each one as a resume
     invx     an invoice tray: a picture or a camera capture, a ledger of
              what came in, each row opening as the invoice itself
     files    what has been uploaded, attachable to the next message
     news     headline cards with token-drawn pictures, topic tabs, a
              summary read in place, askable about in the thread
     note     a note list, each opening into an editor with a small
              formatting hand and tags
     todo     items you can tick

   Anything the reader can change (a ticked box, typed text, an item marked
   read) is seeded from here once and then owned by APP_STATE in app.js — a
   fixture the interface writes back into is a fixture that lies after the
   first click. */
const APP_PANELS = {

  /* Events are [day offset, start, minutes, title, who] — OFFSETS FROM TODAY,
     not dates: a calendar fixture pinned to August 2026 is wrong by September.
     Both grids are generated from the clock. */
  ap1:{ s:'agenda', sub:'4 events today', foot:'Mirrors your work calendar. An event you add here stays here.',
    events:[
      [ 0,'09:30',30,'Pipeline review','Meet'],
      [ 0,'11:00',45,'Contoso renewal call','Ana, Ravi'],
      [ 0,'14:00',60,'Q3 close walkthrough','Finance'],
      [ 0,'16:30',30,'1:1 with Marc','Meet'],
      [-1,'13:00',45,'Design crit','Studio'],
      [ 1,'10:00',45,'Renewal review','Deal desk'],
      [ 2,'15:30',30,'Support sync','#support'],
      [ 4,'09:00',60,'Board pack review','Leads'],
      [ 8,'11:00',45,'Q3 close','Finance']
    ] },

  /* A tray of CVs, each read into a digital resume — not a table of fields:
     the reader wants the person, so the detail IS the resume, and the list
     is how you get between them. The first CV ships read so a resume is one
     click away on arrival; the rest wait in a pretend tray behind the upload
     box, because an upload is simulated here like every reply. A note marks
     what was inferred rather than read — only one of those needs a human. */
  ap2:{ s:'cvx', sub:'1 of 5 read', foot:'Resumes are read from the file, never invented. Uploads are simulated, like every reply here.',
    cvs:[
      { file:'cv-priya-raman.pdf', pages:'2 pages · read in 1.4s',
        name:'Priya Raman', title:'Staff Data Engineer', loc:'Berlin · EU work permit',
        years:'8 years', notice:'~2 months', flag:true,
        summary:'Data engineer who has taken two warehouse migrations end to end — models, orchestration and cost — and writes the runbook as she goes.',
        exp:[
          ['Staff Data Engineer','Helios Analytics','2022 – now','Owns the lakehouse: 40+ dbt models on Snowflake, Airflow orchestration, warehouse spend down 30% in a year.'],
          ['Senior Data Engineer','Nordwind Retail','2018 – 2022','Built the ingestion platform (Kafka → Snowflake) that carried 12 markets; on-call rotation lead.'],
          ['Data Engineer','Bitfabrik','2016 – 2018','ETL for a payments product; first hire on the data team.']
        ],
        edu:'MSc Computer Science, TU Berlin',
        skills:'Python · dbt · Airflow · Snowflake · Terraform · Kafka · Postgres',
        note:'The notice period was written in prose — "about two months" — not stated as a date. Confirm before it goes in an offer.' },
      { file:'cv-marco-silva.pdf', pages:'1 page · read in 0.8s',
        name:'Marco Silva', title:'Senior Frontend Engineer', loc:'Lisbon · EU citizen',
        years:'6 years', notice:'1 month',
        summary:'Frontend engineer who treats performance budgets as a feature; happiest owning a design system and the app that stresses it.',
        exp:[
          ['Senior Frontend Engineer','Fjord Commerce','2021 – now','Leads the storefront rebuild: Next.js, 60% faster LCP, a component library three teams ship on.'],
          ['Frontend Engineer','Azul Bank','2019 – 2021','Rebuilt onboarding flows; conversion up 18%; introduced Playwright end-to-end suites.']
        ],
        edu:'BSc Computer Engineering, IST Lisbon',
        skills:'TypeScript · React · Next.js · GraphQL · Playwright · CSS' },
      { file:'cv-anaelle-dupont.pdf', pages:'2 pages · read in 1.1s',
        name:'Anaëlle Dupont', title:'Product Data Analyst', loc:'Paris',
        years:'4 years', notice:'3 months', flag:true,
        summary:'Analyst who turns product questions into experiments and experiments into decisions the roadmap actually follows.',
        exp:[
          ['Product Data Analyst','Voilà Media','2022 – now','Owns the experimentation pipeline: 40+ A/B tests a year, self-serve Looker for three squads.'],
          ['Data Analyst','Rue du Commerce','2020 – 2022','Funnel and retention analysis for the marketplace; built the churn early-warning report.']
        ],
        edu:'MSc Statistics, ENSAE Paris',
        skills:'SQL · Looker · Python · A/B testing · dbt',
        note:'The notice period comes from the cover letter, not the CV. Confirm which document is right.' },
      { file:'cv-tomasz-kowal.pdf', pages:'1 page · read in 0.7s',
        name:'Tomasz Kowal', title:'DevOps Engineer', loc:'Warsaw · remote',
        years:'9 years', notice:'2 weeks',
        summary:'Platform engineer who measures himself on other teams’ deploy frequency; runs infrastructure as a product with SLOs.',
        exp:[
          ['DevOps Engineer','Grid Systems','2019 – now','Runs 40 services on Kubernetes across 3 regions; deploys went from weekly to daily with ArgoCD.'],
          ['Systems Engineer','PolCloud','2015 – 2019','Terraform for everything; cut environment build time from days to 40 minutes.']
        ],
        edu:'BSc Computer Science, Warsaw University of Technology',
        skills:'Kubernetes · Terraform · AWS · Go · Prometheus · ArgoCD' },
      { file:'cv-lena-hoffmann.pdf', pages:'3 pages · read in 1.6s',
        name:'Lena Hoffmann', title:'ML Engineer', loc:'Munich',
        years:'5 years', notice:'~6 weeks', flag:true,
        summary:'ML engineer who ships models as services — versioned, monitored and cheap to retrain — and retires the ones nobody queries.',
        exp:[
          ['ML Engineer','Alpina Mobility','2022 – now','Demand forecasting in production: PyTorch models behind an API, retraining on MLflow, p95 under 80ms.'],
          ['Data Scientist','Isar Health','2019 – 2022','Risk models for claims triage; moved the team from notebooks to a deployable pipeline.']
        ],
        edu:'MSc Machine Learning, LMU Munich',
        skills:'PyTorch · Python · MLflow · Spark · Docker',
        note:'"~6 weeks" was inferred from a start-date sentence, not stated. Confirm before it goes in an offer.' }
    ] },

  /* The same two screens as the CVs — the tray, and behind each row the
     invoice itself — with two ways in: a picture from disk or a capture from
     the computer's camera, each fed by its own pretend pool so the two
     buttons stay distinct. The list is a ledger: vendor, date, amount line
     up as columns, because ten invoices are compared by their numbers.
     Totals are re-added rather than trusted, and a figure the frame cropped
     out says so instead of guessing. */
  ap3:{ s:'invx', sub:'1 of 5 digitised · totals re-added', foot:'Totals are re-added here rather than trusted. Uploads and captures are simulated, like every reply.',
    invs:[
      { file:'northwind-inv-0841.pdf', src:'upload', pages:'1 page · read in 0.9s',
        vendor:'Northwind Traders', no:'INV-2026-0841', issued:'2 Aug 2026', due:'1 Sep 2026',
        amounts:[['Subtotal','€18,400.00'],['VAT 19%','€3,496.00'],['Total','€21,896.00']],
        check:'Subtotal + VAT adds up to the total, and the subtotal matches PO-3391.' },
      { file:'IMG_4218.jpg', src:'photo', pages:'photo · read in 1.2s',
        vendor:'Café Lumière', no:'B-118', issued:'11 Aug 2026', due:'paid on the spot',
        amounts:[['Subtotal','€38.50'],['VAT 10%','€3.85'],['Total','€42.35']],
        check:'Subtotal + VAT adds up to the total.' },
      { file:'IMG_4222.jpg', src:'photo', pages:'photo · read in 1.4s',
        vendor:'Acme Supplies', no:'INV-2211', issued:'9 Aug 2026', due:'8 Sep 2026',
        amounts:[['Subtotal','€2,140.00'],['VAT','—','check'],['Total','€2,140.00']],
        note:'No VAT line on the page. The total is booked as exempt — confirm before it goes to accounting.' },
      { file:'capture-01.png', src:'camera', pages:'camera capture · read in 1.1s',
        vendor:'Contoso GmbH', no:'INV-2026-9004', issued:'5 Aug 2026', due:'—', flag:true,
        amounts:[['Subtotal','€7,200.00'],['VAT 19%','€1,368.00'],['Total','€8,568.00']],
        note:'The due date was cropped out of the frame — retake the capture, or fill it in by hand.' },
      { file:'capture-02.png', src:'camera', pages:'camera capture · read in 0.8s',
        vendor:'Maersk Logistics', no:'ML-88412', issued:'12 Aug 2026', due:'11 Sep 2026',
        amounts:[['Subtotal','€12,650.00'],['VAT 0% (reverse charge)','€0.00'],['Total','€12,650.00']],
        check:'Reverse-charge VAT: €0.00 is correct on the invoice, and the total matches the subtotal.' }
    ] },

  ap4:{ s:'files', sub:'7 files · 25.6 MB', foot:'Uploaded in this workspace. Nothing leaves the page.',
    rows:[
      ['q4_forecast.csv','csv','2.1 MB','12m'],
      ['renewals_export.csv','csv','8.4 MB','2h'],
      ['cv-priya-raman.pdf','pdf','740 KB','3h'],
      ['northwind-inv-0841.pdf','pdf','310 KB','1d'],
      ['board-pack-aug.pptx','deck','12.8 MB','2d'],
      ['schema.sql','sql','18 KB','4d'],
      ['dashboard.png','image','1.2 MB','1w']
    ] },

  /* The fourth value is 1 for unread. Marking one read is app state. */
  /* A headline is a card: its picture (drawn in app.js from the tokens),
     the title, where and when, and a summary that Summarize reveals in
     place. `topic` is what the tabs filter on; `unread` seeds the dot. */
  ap5:{ s:'news', foot:'Reuters · Bloomberg · Handelsblatt · Politico · WSJ. The feed is simulated.',
    items:[
      { t:'Northwind Traders names a new CFO', src:'Reuters', when:'34m', topic:'Markets', unread:1,
        sum:'Elena Vasquez moves up from group controller after four years; the outgoing CFO stays through the Q3 close. The street reads it as pre-IPO housekeeping — the release leans on "audit readiness" twice.' },
      { t:'ECB holds rates, signals one cut before year end', src:'Bloomberg', when:'1h', topic:'Markets', unread:1,
        sum:'Rates stay at 3.25%. The statement drops "persistent" before inflation and adds "confidence is firming" — the phrase watchers wanted. Futures now price one cut in December, two by March.' },
      { t:'Contoso Retail closes 40 stores in the DACH region', src:'Handelsblatt', when:'3h', topic:'Retail',
        sum:'A fifth of the estate, framed as a shift to "fewer, larger, digital-first" flagships. 1,200 roles affected, half offered relocation. Online now carries 38% of DACH revenue, up from 24% two years ago.' },
      { t:'EU AI Act: first conformity deadlines land in September', src:'Politico', when:'6h', topic:'AI',
        sum:'Providers of general-purpose models face the first documentation deadlines on 2 September. The codes of practice are still drafts, so counsel is advising conformity files against the Act itself — slower, safer.' },
      { t:'Fabrikam raises a $120M Series D', src:'TechCrunch', when:'1d', topic:'AI',
        sum:'Led by Meridian Growth at a $1.4B valuation, doubling the round before it. The money goes to the agent platform and an EU data-residency build-out; revenue is disclosed only as "north of $60M ARR".' },
      { t:'Snowflake lifts FY guidance on data-sharing revenue', src:'WSJ', when:'1d', topic:'Markets',
        sum:'Product revenue guidance rises 2 points on the back of data-sharing and marketplace consumption, now 11% of revenue. The quarter beat on both lines; NRR steadies at 127%.' }
    ] },

  /* A note's FIRST LINE is its title — the rule every notes app converged
     on, and one less control than a title field. The body is the HTML the
     editor makes; ☐ and ☑ in a list are the checklist, toggled by clicking
     the mark. */
  ap6:{ s:'note', foot:'Kept in this session only.',
    notes:[
      { tags:['finance','q3'],
        html:'<h2>Q3 close — open questions</h2>' +
          '<p>Services <b>$0.6M</b>: Q2 implementation that slipped. Do not count as growth.</p>' +
          '<ul><li>☐ SMB churn 40bps — check against the ledger before the board pack</li>' +
          '<li>☑ Ask Ana whether the two enterprise renewals are signed or verbal</li></ul>' },
      { tags:['sales'],
        html:'<h2>Contoso renewal — call prep</h2>' +
          '<p>Usage down <b>34%</b> over 30 days, admin changed 9 days ago.</p>' +
          '<blockquote>Open with the admin change, not the number: they may not know.</blockquote>' }
    ] },

  ap7:{ s:'todo', foot:'Kept in this session only.',
    items:[
      { t:'Send the Q3 variance table to Ana', due:'today', done:false },
      { t:'Confirm Priya\'s notice period', due:'today', done:false },
      { t:'Check SMB churn against the ledger', due:'tomorrow', done:false },
      { t:'Approve INV-2026-0841', due:'1 Sep', done:false },
      { t:'File the board pack', due:'', done:true },
      { t:'Rotate the warehouse credential', due:'', done:true }
    ] }
};

/* ------------------------------------------------------------- dashboards
   Built in Data Discovery, off a source the user has a grant on. `ds` points
   at DATASETS, so a dashboard can never outlive its source or claim access
   the user does not have. */
const DASHBOARDS = [
  { id:'db1', name:'Q3 revenue by segment', ds:'d1', kind:'Breakdown', updated:'12 min ago',
    tiles:[['ARR','$41.2M'],['vs plan','+12.4%']], bars:[42,48,51,47,55,61,58,66] },
  { id:'db2', name:'Account health drift', ds:'d2', kind:'Trend', updated:'1 h ago',
    tiles:[['Accounts','41,208'],['At risk','312']], bars:[31,29,34,38,41,44,49,52] },
  { id:'db3', name:'Ticket reopen rate', ds:'d3', kind:'Trend', updated:'4 h ago',
    tiles:[['Tickets','96,551'],['Reopened','7.4%']], bars:[12,14,11,18,22,19,26,31] }
];
const DASH_KINDS = ['Trend','Breakdown','Table'];

/* ----------------------------------------------------------------- cloud */
const CLOUD = [
  { id:'c1', name:'Routing defaults', desc:'Which model handles a request when the thread does not override it.' },
  { id:'c2', name:'Tools & permissions', desc:'What the model is allowed to call, and what needs confirmation.' },
  { id:'c3', name:'Connections', desc:'Warehouses, drives and webhooks this workspace can reach.' },
  { id:'c4', name:'Deployment', desc:'Region, egress and the model endpoints solutions are pinned to.' },
  { id:'c5', name:'Appearance', desc:'Theme and interface density.' },
  { id:'c6', name:'Usage & billing', desc:'Token spend by surface, and the caps that stop it.' }
];

/* Cloud → Connections reads CONNECTORS rather than a second list of the same
   endpoints. A connector is configured in Build and reported on here; two
   fixtures would have drifted apart by the second edit. */

/* ---------------------------------------------------------------- account */
const ACCOUNT = {
  name:'Cong Yu', email:'cong.yu@gnomondigital.com', role:'Owner',
  org:'Gnomon Digital', plan:'Team', seats:'3 of 10 seats used',
  sessions:[
    ['This device','macOS · Chrome','now'],
    ['MacBook Pro','macOS · Safari','2 h ago'],
    ['iPhone','iOS · app','yesterday']
  ],
  members:[
    ['cong.yu@gnomondigital.com','Owner','now'],
    ['data-platform@','Editor','2 h ago'],
    ['support-eng@','Viewer','yesterday']
  ]
};

/* The composer routes to whichever model suits the turn, first-party or not.
   "Nebulas Pro" in the status strip is the platform, not the model. */
const MODELS = ['ChatGPT 5','Claude Opus 5','Qwen 3 Max','Nebula Pro','Nebula Fast'];

/* ------------------------------------------------------------- chat cases
   A starter is not a prompt suggestion. Clicking one runs a worked example, so
   a tester can walk into a real conversation without having to invent one.

   Each case carries the question, the tool trace, the answer — and exactly one
   INTERACTIVE block: a form to fill, a questionnaire to answer, a chart to
   switch, a table to sort or a snippet to read. `w.kind` picks the renderer.
   One per turn, deliberately: two things to act on in one answer and neither
   gets acted on.

   Keys are the starter labels in app.js's STARTERS. */
const CASES = {

  /* ---------------------------------------------------------------- work */
  'Documentation':{
    title:'Document the ingest endpoint',
    ask:'Write the quickstart for the ingest webhook. Include the signature check — everyone gets that wrong.',
    steps:[
      { n:'search.repo', d:'ingest/hooks.py, ADR-014, service catalogue', t:'1.2s' },
      { n:'doc.write',   d:'draft quickstart, two runtimes', t:'0.9s' }
    ],
    md:[
      'The endpoint takes a signed POST and nothing else. Three things are worth stating plainly, because all three are where integrations break.',
      '',
      '- **Verify before you parse.** The signature covers the raw body. Parsing first and re-serialising changes the bytes and the check fails for reasons nobody can debug.',
      '- **Compare in constant time.** A plain `==` on the digest leaks timing.',
      '- **The clock matters.** Requests older than five minutes are rejected, so a retry queue that sits for an hour will replay into a wall.'
    ].join('\n'),
    cites:[ { n:'ingest/hooks.py', s:'repo' }, { n:'ADR-014.md', s:'docs' } ],
    w:{ kind:'code', title:'Verify a signed webhook', meta:'2 runtimes',
        res:'Signed-webhook verification',
        variants:{
          Python:[
            'import hmac, hashlib, time',
            '',
            'def verify(raw: bytes, sig: str, ts: str, secret: bytes) -> bool:',
            '    # reject stale requests before spending a hash',
            '    if abs(time.time() - int(ts)) > 300:',
            '        return False',
            '    mac = hmac.new(secret, ts.encode() + b"." + raw, hashlib.sha256)',
            '    # constant time. a plain == leaks the digest one byte at a time',
            '    return hmac.compare_digest(mac.hexdigest(), sig)'
          ].join('\n'),
          'Node.js':[
            'import { createHmac, timingSafeEqual } from "node:crypto";',
            '',
            'export function verify(raw, sig, ts, secret) {',
            '  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;',
            '  const mac = createHmac("sha256", secret)',
            '    .update(`${ts}.`).update(raw)   // raw body, not the parsed object',
            '    .digest("hex");',
            '  return timingSafeEqual(Buffer.from(mac), Buffer.from(sig));',
            '}'
          ].join('\n')
        } }
  },

  'Slide':{
    title:'Q3 board slides',
    ask:'Turn the Q3 close into a short board deck. I have ten minutes and one ask.',
    steps:[
      { n:'search.docs', d:'Q3 close notes, forecast bridge, board deck Q2', t:'1.1s' },
      { n:'code.run',    d:'pull the three figures the ask depends on', t:'0.7s' }
    ],
    md:[
      'Ten minutes is six slides. The shape matters more than the content here, so pick one and I will fill it — the three figures are the same either way.',
      '',
      'What the deck has to survive is the question *"is the beat durable"*, which is why services timing gets its own line rather than being netted out quietly.'
    ].join('\n'),
    cites:[ { n:'q3-close-notes.md', s:'drive' } ],
    w:{ kind:'quiz', title:'Deck shape', meta:'1 question',
        res:'Q3 board deck outline',
        questions:[
          { q:'Which shape fits this board?',
            options:['Problem → evidence → ask','Numbers first','Narrative'] }
        ],
        outcomeBy:{
          'Problem → evidence → ask':{
            text:'Six slides. The ask lands on slide five, once the evidence is in the room.',
            rows:[
              ['1','SMB churn is up 40bps'],
              ['2','Q3 beat $41.2M, and half of it is timing'],
              ['3','Enterprise renewals are the durable half'],
              ['4','Q4 forecast $42.4M, November is the risk'],
              ['5','Ask: two headcount for the renewals desk'],
              ['6','What we will know by the next meeting']
            ] },
          'Numbers first':{
            text:'Six slides, opening on the number. Works for a board that has read the pack.',
            rows:[
              ['1','$41.2M · +12.4% vs plan'],
              ['2','Where it came from, by segment'],
              ['3','What we would discount — services timing'],
              ['4','Q4 $42.4M, and the November cohort'],
              ['5','Ask: two headcount for the renewals desk'],
              ['6','Appendix: the bridge']
            ] },
          Narrative:{
            text:'Five slides and no table. Riskier: it needs the room to trust the telling.',
            rows:[
              ['1','The quarter in one sentence'],
              ['2','The handover problem behind the churn'],
              ['3','What the renewals desk changed'],
              ['4','What it costs to keep doing it'],
              ['5','Ask: two headcount']
            ] }
        } }
  },

  'Visualization':{
    title:'Visualise the Q3 beat',
    ask:'Chart the Q3 variance by segment, and show me expansion against new logo.',
    steps:[
      { n:'warehouse.query', d:'SELECT segment, kind, arr FROM q3_ledger', t:'1.3s' },
      { n:'chart.build',     d:'infer marks from column types', t:'0.4s' }
    ],
    md:[
      'Two views of the same quarter. Variance answers *where the beat came from*; expansion against new logo answers *whether it repeats*.',
      '',
      'The second one is the one I would put in front of the board: three consecutive quarters of expansion outpacing new logo is a trend, and a single quarter of variance is not.'
    ].join('\n'),
    cites:[ { n:'q3_ledger.parquet', s:'warehouse' } ],
    w:{ kind:'chart', title:'Q3 by segment', meta:'2 series',
        res:'Q3 variance and expansion',
        series:[
          { n:'Variance vs plan', unit:'$M',
            bars:[['Enterprise',3.1],['Mid-market',1.0],['Services',0.6],['SMB',-0.4]] },
          { n:'Expansion vs new logo', unit:'$M',
            bars:[['Expansion',8.4],['New logo',5.2],['Upsell',2.1],['Churn',-1.6]] }
        ] }
  },

  'Explanation':{
    title:'What the close terms mean',
    ask:'Explain the terms in the Q3 close the way this company uses them, not the textbook way.',
    steps:[
      { n:'search.docs', d:'finance glossary, close notes, pricing memo', t:'0.8s' },
      { n:'classify',    d:'flag the four that differ from standard usage', t:'0.6s' }
    ],
    md:[
      'Four of these do not mean what they mean elsewhere, and every one of the four has caused a wrong number in the last two quarters.',
      '',
      'The one to watch is **recurring base**: it excludes services *and* the July pricing uplift, so it is smaller than any figure in the board pack. Sort by "differs" to see the four together.'
    ].join('\n'),
    cites:[ { n:'FY25_targets.xlsx', s:'drive' }, { n:'pricing-changes.md', s:'notion' } ],
    w:{ kind:'table', title:'Close glossary', meta:'6 terms',
        res:'Close glossary',
        cols:['Term','How it is used here','Differs'],
        rows:[
          ['recurring base','Q3 actual less services and less the July uplift','yes'],
          ['variance','actual less plan, after FX normalisation','no'],
          ['expansion','seat growth inside an existing contract only','yes'],
          ['bookings','signed, not invoiced — cash lags by a quarter','yes'],
          ['churn (bps)','logo churn, not revenue churn','yes'],
          ['coverage','pipeline over remaining quota','no']
        ] }
  },

  'Sales insight':{
    title:'Northwind renewal risk',
    ask:'Northwind renews in November. What is the risk, and who should own it?',
    steps:[
      { n:'warehouse.query', d:'accounts_health, renewals_export, ticket history', t:'1.4s' },
      { n:'code.run',        d:'score the account against the churn model', t:'1.0s' }
    ],
    md:[
      '**$2.1M, renewing 24 November, and the highest churn score in the book at 0.81.** The signal is not usage — it is that the admin who ran the account left nine days ago.',
      '',
      'Accounts that lose their original admin churn at 4.1x the base rate, and the effect shows up in the CRM about ninety days before it shows up in usage. Usage here is still flat, which is exactly what the pattern looks like at this stage.',
      '',
      'The practical move is a named human on the new admin this week. Add them and I will put the renewal on the desk with the account.'
    ].join('\n'),
    cites:[ { n:'accounts_health.parquet', s:'warehouse' }, { n:'renewals_export.csv', s:'upload' } ],
    w:{ kind:'form', title:'Add the new admin', meta:'writes to HubSpot',
        res:'Contacts added to HubSpot',
        note:'Goes to the renewals desk with the account attached. Nothing is sent to the contact.',
        fields:[
          { k:'Name',  ph:'Priya Raman' },
          { k:'Email', ph:'priya@northwind.example' },
          { k:'Role',  ph:'Head of Operations' },
          { k:'Owner', ph:'Ana' }
        ],
        action:'Add contact', done:'contact added' }
  },

  'CV filter':{
    title:'Screen the platform shortlist',
    ask:'Twelve CVs for the platform role. Filter them on what actually matters for this team.',
    steps:[
      { n:'fs.read',  d:'12 CVs, the role brief, last two hires', t:'1.6s' },
      { n:'classify', d:'score against the brief, flag the ambiguous', t:'1.1s' }
    ],
    md:[
      'Twelve CVs, and the brief is doing most of the filtering badly — it asks for eight years and a language, which is why the last two good hires would not have passed it.',
      '',
      'Answer these three and I will rank against what you actually said rather than what the brief says. I will also tell you which candidates the brief would have dropped.'
    ].join('\n'),
    cites:[ { n:'platform-role-brief.md', s:'drive' } ],
    w:{ kind:'quiz', title:'What matters for this hire', meta:'3 questions',
        res:'Platform shortlist, ranked',
        questions:[
          { q:'Weight experience or evidence of shipping?',
            options:['Evidence of shipping','Years of experience','Both equally'] },
          { q:'Is the language a hard requirement?',
            options:['No — any strong systems background','Yes','Preferred, not required'] },
          { q:'On-call from day one?',
            options:['Yes','After three months','Never'] }
        ],
        outcome:{
          text:'Ranked on {1}, treating the language as "{2}", with on-call "{3}". Four clear, three worth a call, five out — and two of the four would have failed the brief as written.',
          rows:[
            ['R. Okonkwo','strong — shipped two ingest rewrites'],
            ['M. Silva','strong — would fail the brief on years'],
            ['J. Adeyemi','strong'],
            ['T. Bauer','strong — would fail the brief on language'],
            ['3 candidates','worth a call'],
            ['5 candidates','out']
          ] } }
  },

  /* ------------------------------------------------------ data discovery */
  'Profile a table':{
    title:'Profile q3_ledger',
    ask:'Profile q3_ledger. I want to know what I cannot trust before I use it.',
    steps:[
      { n:'warehouse.query', d:'column stats, null counts, cardinality', t:'1.5s' },
      { n:'code.run',        d:'distribution checks, outlier scan', t:'0.9s' }
    ],
    md:[
      '2,431,004 rows, six columns, and two of them will hurt you.',
      '',
      '- **`fx_rate` is 4.1% null** and every null is a EUR line. Those rows are already in reporting currency, so multiplying by a default of 1.0 silently double-counts nothing and multiplying by anything else is wrong.',
      '- **`line_item` has 41 distinct values** where the plan has 12. The extra 29 are free text from three integrations, which is why `services` never reconciles.'
    ].join('\n'),
    cites:[ { n:'q3_ledger.parquet', s:'warehouse' } ],
    w:{ kind:'table', title:'q3_ledger — column profile', meta:'6 columns',
        res:'q3_ledger column profile',
        cols:['Column','Type','Null','Distinct','Trust'],
        rows:[
          ['invoice_id','string','0%','2,431,004','ok'],
          ['segment','string','0%','4','ok'],
          ['line_item','string','0%','41','check'],
          ['arr','decimal','0%','1,204,882','ok'],
          ['booked_at','timestamp','0%','92','ok'],
          ['fx_rate','decimal','4.1%','38','check']
        ] }
  },

  'Find anomalies':{
    title:'Anomalies in the Q3 ledger',
    ask:'Find anything in Q3 that looks wrong rather than just unusual.',
    steps:[
      { n:'warehouse.query', d:'daily aggregates by segment and line item', t:'1.2s' },
      { n:'code.run',        d:'seasonal decomposition, residual scan', t:'1.7s' }
    ],
    md:[
      'Five things break the pattern. Two are real and three are artefacts, which is the more useful half of the answer.',
      '',
      'The one to act on is **14 July**: a single $412k enterprise line booked twice, four minutes apart, with different invoice ids. It is in the Q3 number you are presenting.'
    ].join('\n'),
    cites:[ { n:'q3_ledger.parquet', s:'warehouse' } ],
    w:{ kind:'table', title:'Residual outliers', meta:'5 rows',
        res:'Q3 residual outliers',
        cols:['When','What','Size','Verdict'],
        rows:[
          ['Jul 14','$412k line booked twice, 4 min apart','412,000','real'],
          ['Aug 02','SMB volume −38% for one day','−184,000','real'],
          ['Jul 31','Month-end batch lands at 00:04','2,104,000','artefact'],
          ['Aug 09','FX reload changes 38 rows','12,400','artefact'],
          ['Jul 22','Services line reclassified','96,500','artefact']
        ] }
  },

  'Join two sources':{
    title:'Join the ledger to the renewal book',
    ask:'Join q3_ledger to renewals_export. The keys do not match — tell me what I lose.',
    steps:[
      { n:'warehouse.query', d:'key cardinality on both sides', t:'1.1s' },
      { n:'code.run',        d:'fuzzy match account names, count the misses', t:'1.4s' }
    ],
    md:[
      'There is no shared key. The ledger has `invoice_id` and a segment; the renewal book has an account *name* typed by a human. So the join is on name, and a name join always loses something.',
      '',
      '**812 renewal rows, 786 match, 26 do not** — 18 are legal-entity renames, 6 are subsidiaries billed separately, and 2 are typos. The 26 carry $1.9M, so they cannot be dropped quietly.',
      '',
      'Below is the join I would ship: normalise, match, and keep the misses in a table rather than discarding them.'
    ].join('\n'),
    cites:[ { n:'renewals_export.csv', s:'upload' }, { n:'q3_ledger.parquet', s:'warehouse' } ],
    w:{ kind:'code', title:'The join, with the misses kept', meta:'2 dialects',
        res:'Ledger to renewal book join',
        variants:{
          SQL:[
            'with l as (',
            '  select regexp_replace(lower(account), \'[^a-z0-9]\', \'\') as k, *',
            '  from q3_ledger',
            '), r as (',
            '  select regexp_replace(lower(account), \'[^a-z0-9]\', \'\') as k, *',
            '  from renewals_export',
            ')',
            '-- full outer, not inner: the 26 misses are the finding',
            'select coalesce(l.k, r.k) as k, l.arr, r.acv, r.renews_on,',
            '       case when l.k is null then \'ledger miss\'',
            '            when r.k is null then \'renewal miss\' end as gap',
            'from l full outer join r using (k)'
          ].join('\n'),
          Python:[
            'import pandas as pd',
            '',
            'norm = lambda s: s.str.lower().str.replace(r"[^a-z0-9]", "", regex=True)',
            'l["k"], r["k"] = norm(l.account), norm(r.account)',
            '',
            '# indicator=True keeps the misses instead of dropping them',
            'j = l.merge(r, on="k", how="outer", indicator=True)',
            'misses = j[j._merge != "both"]',
            'assert misses.acv.sum() < 2_000_000, "unmatched book grew"'
          ].join('\n')
        } }
  },

  'Chart a trend':{
    title:'ARR and churn, month by month',
    ask:'Chart ARR by month and put churn next to it. I want to see whether they move together.',
    steps:[
      { n:'warehouse.query', d:'monthly ARR and logo churn, 8 months', t:'1.2s' },
      { n:'chart.build',     d:'two series, shared axis', t:'0.4s' }
    ],
    md:[
      'They do not move together, and that is the finding. ARR is up 57% over the window while churn is up 43% — growth is outrunning a problem rather than fixing it.',
      '',
      'Switch to churn below: the line bends in April, which is the month the SMB self-serve tier opened.'
    ].join('\n'),
    cites:[ { n:'arr_monthly', s:'warehouse' } ],
    w:{ kind:'chart', title:'Eight months', meta:'2 series',
        res:'ARR and churn, eight months',
        series:[
          { n:'ARR by month', unit:'$M',
            bars:[['Jan',42],['Feb',46],['Mar',51],['Apr',47],['May',55],['Jun',58],['Jul',61],['Aug',66]] },
          { n:'Logo churn', unit:'bps',
            bars:[['Jan',28],['Feb',24],['Mar',26],['Apr',31],['May',29],['Jun',35],['Jul',38],['Aug',40]] }
        ] }
  },

  'Explain a metric':{
    title:'Which ARR do you mean?',
    ask:'Explain ARR. Half the dashboards here disagree with each other.',
    steps:[
      { n:'search.docs',     d:'metric definitions across 4 dashboards', t:'0.9s' },
      { n:'warehouse.query', d:'compute all three for Q3', t:'1.1s' }
    ],
    md:[
      'They disagree because there are three definitions in use and none of them is labelled. For Q3 they are **$41.2M**, **$39.8M** and **$38.6M** — a $2.6M spread, which is larger than the beat everyone is discussing.',
      '',
      'Tell me which one you mean and I will show what it includes and which dashboards are using it.'
    ].join('\n'),
    cites:[ { n:'FY25_targets.xlsx', s:'drive' } ],
    w:{ kind:'quiz', title:'Pick a definition', meta:'1 question',
        res:'ARR definition in use',
        questions:[
          { q:'Which ARR are you asking about?',
            options:['Booked ARR','Recurring base','Committed ARR'] }
        ],
        outcomeBy:{
          'Booked ARR':{
            text:'$41.2M. Everything signed in the period, including one-off services. The headline figure, and the flattering one.',
            rows:[
              ['Includes','subscriptions, services, uplift'],
              ['Excludes','nothing'],
              ['Used by','the board pack, Revenue Cockpit'],
              ['Watch','services timing makes it lumpy quarter to quarter']
            ] },
          'Recurring base':{
            text:'$39.8M. Booked less services and less the July uplift. The number a forecast should grow.',
            rows:[
              ['Includes','subscriptions only'],
              ['Excludes','services, July pricing uplift'],
              ['Used by','Forecast Studio'],
              ['Watch','smaller than every figure in the board pack']
            ] },
          'Committed ARR':{
            text:'$38.6M. Only contracts with a signed term remaining. The number to promise against.',
            rows:[
              ['Includes','multi-year and annual commitments'],
              ['Excludes','services, uplift, monthly rolling'],
              ['Used by','nothing yet — this is the gap'],
              ['Watch','drops sharply in November as terms roll']
            ] }
        } }
  },

  /* ------------------------------------------------------- auto program
     The hero's third mode. Each case ends in an editable program widget whose
     one action writes a row into Chat → Schedule — the reply drafts, the
     person decides. Daily-life routines on purpose: the mode's claim is that
     automation is not only for revenue pipelines. */
  'Morning briefing':{
    title:'Morning briefing, every day',
    ask:'Every morning, check the weather and my calendar, then write me a briefing.',
    steps:[
      { n:'routine.parse', d:'every day · 3 steps', t:'0.6s' },
      { n:'program.draft', d:'Daily briefing · 07:40', t:'0.5s' }
    ],
    md:[
      'Read as a program: **Daily briefing**, every day at 07:40, in three steps — the weather, the calendar, then the briefing written from both.',
      '',
      'The steps below are editable, and the cadence is a choice rather than something I extracted. Nothing runs until you press **Create the program**; then it lives in Chat → Schedule, and each morning\'s briefing lands here, in this chat.'
    ].join('\n'),
    w:{ kind:'program', title:'Daily briefing', meta:'3 steps',
        every:'Every day', cron:'daily 07:40',
        steps:['Check the weather','Read the day’s calendar','Write the briefing'],
        out:'A short briefing in this chat' }
  },
  'Friday expense sweep':{
    title:'Expenses, swept on Fridays',
    ask:'Every Friday afternoon, collect the week’s receipts, match them against the card statement, and flag what is missing.',
    steps:[
      { n:'routine.parse', d:'every week · 3 steps', t:'0.6s' },
      { n:'program.draft', d:'Weekly expense sweep · Fri 17:00', t:'0.5s' }
    ],
    md:[
      'Read as a program: **Weekly expense sweep**, Fridays at 17:00 — collect, match, and flag, so the missing receipt is found while the week is still fresh enough to remember.',
      '',
      'Edit any step below, then press **Create the program**. The flag list lands in this chat each Friday; nothing is filed anywhere else.'
    ].join('\n'),
    w:{ kind:'program', title:'Weekly expense sweep', meta:'3 steps',
        every:'Every week', cron:'Fri 17:00',
        steps:['Collect the week’s receipts','Match them against the card statement','Flag what is missing'],
        out:'A flag list in this chat' }
  },
  'Daily LinkedIn post':{
    title:'A LinkedIn post, every morning',
    ask:'Every day at 08:30, write my LinkedIn post for the day.',
    steps:[
      { n:'routine.parse', d:'every day · 1 step', t:'0.6s' },
      { n:'program.draft', d:'Daily LinkedIn post · 08:30', t:'0.5s' }
    ],
    md:[
      'Read as a program: **Daily LinkedIn post**, every day at 08:30, one step — so it files as a task rather than a job.',
      '',
      'Chat → Schedule already holds a *Morning LinkedIn post* row whose history shows what this one’s will look like once it has run: each morning’s post, written in full, with a copy button under it. Press **Create the program** and this one starts its own history.'
    ].join('\n'),
    w:{ kind:'program', title:'Daily LinkedIn post', meta:'1 step',
        every:'Every day', cron:'daily 08:30',
        steps:['Write the day’s LinkedIn post'],
        out:'A post draft in this chat' }
  },
  'Photo tidy script':{
    title:'A photo-tidy script',
    ask:'A script that renames my photos by date, then moves them into folders by month.',
    steps:[
      { n:'script.read',  d:'2 steps to automate', t:'0.6s' },
      { n:'script.write', d:'2 runtimes · skeleton', t:'0.7s' }
    ],
    md:[
      'Here is **Renames my photos by date** as a script skeleton — Python and Bash, each parsed step a named function with a TODO where the work goes, because a real run is more than this prototype can honestly claim.',
      '',
      'It is already filed in the results column, where it downloads as `.py` or `.sh` depending on the runtime showing. Copy takes the one on screen.'
    ].join('\n'),
    /* The variants are the generator's own output for this ask, verbatim, so
       the worked example and a typed sentence produce the same file. */
    w:{ kind:'code', title:'Renames my photos by date', meta:'2 runtimes',
        res:'Renames my photos by date — skeleton',
        variants:{
          Python:[
      "\"\"\"Renames my photos by date \u2014 a skeleton, not a program.",
      "",
      "Generated from: \"A script that renames my photos by date, then moves them into folders by month.\"",
      "Each step is a named hole. Fill them in the order main() calls them.",
      "\"\"\"",
      "# Run it by hand until it earns a schedule.",
      "",
      "def renames_my_photos_by_date():",
      "    \"\"\"Renames my photos by date\"\"\"",
      "    # TODO: this is where \"renames my photos by date\" happens",
      "    pass",
      "",
      "def moves_them_into_folders_by_month():",
      "    \"\"\"Moves them into folders by month\"\"\"",
      "    # TODO: this is where \"moves them into folders by month\" happens",
      "    pass",
      "",
      "def main():",
      "    renames_my_photos_by_date()",
      "    moves_them_into_folders_by_month()",
      "",
      "if __name__ == \"__main__\":",
      "    main()",
      ""
    ].join('\n'),
          Bash:[
      "#!/usr/bin/env bash",
      "# Renames my photos by date \u2014 a skeleton, not a program.",
      "# Generated from: \"A script that renames my photos by date, then moves them into folders by month.\"",
      "# Run it by hand until it earns a schedule.",
      "set -euo pipefail",
      "",
      "renames_my_photos_by_date() {",
      "  # TODO: this is where \"renames my photos by date\" happens",
      "  :",
      "}",
      "",
      "moves_them_into_folders_by_month() {",
      "  # TODO: this is where \"moves them into folders by month\" happens",
      "  :",
      "}",
      "",
      "main() {",
      "  renames_my_photos_by_date",
      "  moves_them_into_folders_by_month",
      "}",
      "",
      "main \"$@\"",
      ""
    ].join('\n')
        } }
  },
  'Step-count widget':{
    title:'A step-count widget',
    ask:'A widget showing my daily step count against a 10,000-step goal.',
    steps:[
      { n:'element.read',  d:'kpi · daily step count', t:'0.6s' },
      { n:'element.draft', d:'previewed with Build’s own canvas', t:'0.5s' }
    ],
    md:[
      'Here is **Daily step count** as a kpi widget, previewed with the same canvas Build uses — the figure is a sample until it is bound to a source.',
      '',
      'Name it below and press **Create in Build**; everything else — accent, theme, width, the numbers — is set in Build’s inspector, because two editors of one element would drift.'
    ].join('\n'),
    w:{ kind:'element', title:'Daily step count', meta:'kpi widget', shape:'kpi',
        name:'Daily step count',
        cfg:{ title:'Daily step count', sub:'today', accent:'Nebulas', radius:'Soft',
              theme:'Follow', width:'Narrow', header:true, credit:true,
              value:'8,412', delta:'+12%', cap:'Against a 10,000-step goal' } }
  },
  'Ticket triage workflow':{
    title:'Tickets, triaged as they arrive',
    ask:'When a ticket arrives, triage it, then post the summary to #support.',
    steps:[
      { n:'routine.parse', d:'on a ticket arrives · 2 steps', t:'0.6s' },
      { n:'program.draft', d:'Ticket triage', t:'0.5s' }
    ],
    md:[
      'Here is your workflow: **Ticket triage**, running each time **a ticket arrives** — two steps, in order.',
      '',
      'The trigger and both steps are editable below. An event has no computable next run, so the schedule will say *when it fires* rather than guess a time. Nothing runs until you press **Create the program**.'
    ].join('\n'),
    w:{ kind:'program', title:'Ticket triage', meta:'2 steps',
        trigger:'a ticket arrives',
        steps:['Triage the ticket','Post the summary to #support'],
        out:'A triage note in this chat' }
  },
  'Sunday meal plan':{
    title:'Meals, planned on Sundays',
    ask:'Every Sunday evening, check what is in the fridge, plan seven dinners, and write the shopping list.',
    steps:[
      { n:'routine.parse', d:'every week · 3 steps', t:'0.6s' },
      { n:'program.draft', d:'Weekly meal plan · Sun 17:00', t:'0.5s' }
    ],
    md:[
      'Read as a program: **Weekly meal plan**, Sundays at 17:00 — what is there, what to cook, what to buy, in that order, because the list only makes sense after the plan.',
      '',
      'Adjust the steps below and press **Create the program**. The plan and the list land here every Sunday, ready for the shop.'
    ].join('\n'),
    w:{ kind:'program', title:'Weekly meal plan', meta:'3 steps',
        every:'Every week', cron:'Sun 17:00',
        steps:['Check what is in the fridge','Plan seven dinners','Write the shopping list'],
        out:'A meal plan and shopping list in this chat' }
  }
};

/* Canned assistant turns, cycled. Deliberately about the prototype itself. */
const REPLIES = [
  { steps:[
      { n:'search.web', d:'gathering current sources', t:'0.9s' },
      { n:'code.run',  d:'cross-check figures against the loaded dataset', t:'1.2s' }
    ],
    md:[
      'Here is what I found, with the caveat that this prototype answers from a fixed script rather than a live model.',
      '',
      'What is worth noticing is the **shape** of the response — an expandable tool trace, a claim-per-bullet body, and citations attached to the answer rather than parked in a side panel. Long output does not inline: it opens in the artifact pane on the right, and the thread keeps only a reference to it.',
      '',
      '- Each bullet carries one claim, so citation and disagreement both have somewhere to attach.',
      '- The trace collapses by default. Nobody reads it until something goes wrong, and then they read all of it.',
      '- The artifact pane persists across turns, so a table you are reading survives the next question.'
    ].join('\n'),
    cites:[ { n:'q3_ledger.parquet', s:'warehouse' }, { n:'pricing-changes.md', s:'notion' } ],
    artifactId:'a5' },
  { steps:[
      { n:'warehouse.query', d:'resolving the entities in your question', t:'1.4s' },
      { n:'code.run', d:'aggregate and rank', t:'0.8s' },
      { n:'search.docs', d:'checking internal definitions', t:'0.6s' }
    ],
    md:[
      'Answered — again, simulated output.',
      '',
      'This turn demonstrates **streaming into a pre-laid-out block**. The paragraph structure exists before the text arrives, so nothing reflows as it fills. That is why the page does not jitter the way naive token-appending does.',
      '',
      '- The caret rides the block being filled, so it sits at the true end of the text.',
      '- Blocks reveal only once they have content, so you never see an empty bullet.',
      '- <code>prefers-reduced-motion</code> collapses the whole thing to an instant render.'
    ].join('\n'),
    cites:[ { n:'accounts_health.parquet', s:'warehouse' } ],
    artifactId:'a3' }
];

return {
  ARTIFACTS, ARTIFACT_BY_ID, THREADS, PROJECTS, ASSISTANTS, ASSISTANT_TEAMS, SKILL_DESC, SCHEDULE,
  KBS, DATASETS, DASHBOARDS, DASH_KINDS, SKILLS, AGENTS, SOLUTIONS, APPS, APP_PANELS, CLOUD,
  CONNECTORS, CONNECTOR_AUTHS, DESIGNS, DESIGN_ACCENTS, SURFACES,
  ACCOUNT, MODELS, CASES, REPLIES
};
})();
