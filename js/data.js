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
    from:'Churn signals in enterprise accounts', when:'1d', size:'8 features',
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
    from:'Onboarding copy pass', when:'2d', size:'9 states',
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
    from:'Q3 revenue analysis', when:'2d', size:'6 rows',
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
    from:'Refactor the ingestion pipeline', when:'3d', size:'2 pages',
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
  { id:'t6', title:'Cohort retention v2', when:'1w', group:'Earlier', project:'p3', msgs:[] }
];

/* --------------------------------------------------------------- projects
   A project scopes threads, sources and an assistant. It is the unit people
   actually organise work into, which is why it sits above the thread list. */
const PROJECTS = [
  { id:'p1', name:'Q3 close', desc:'Everything feeding the Q3 revenue close and the Q4 forecast handed to the board.',
    assistant:'Revenue analyst', sources:['q3_ledger','renewals_export'], when:'2m' },
  { id:'p2', name:'Pipeline health', desc:'Ingestion reliability work — backpressure, adapter budgets, the ADR-014 follow-through.',
    assistant:'Code reviewer', sources:['support_tickets'], when:'1h' },
  { id:'p3', name:'Churn program', desc:'Enterprise retention: signals, the account watchlist, and what the CRM knows before usage does.',
    assistant:'Revenue analyst', sources:['accounts_health','support_tickets'], when:'1d' }
];

/* ------------------------------------------------------------- assistants
   An assistant is a named binding of model, skills and knowledge. The rail
   has no icon for it — it belongs to the conversation, so it lives in the
   chat sidebar next to the threads it governs. */
const ASSISTANTS = [
  { id:'as1', name:'Revenue analyst', state:'ok', model:'Nebula Pro',
    desc:'Answers from the finance warehouse. Refuses to attribute growth without stripping non-recurring lines first.',
    skills:['warehouse.query','code.run','chart.build'], kb:'Finance corpus', threads:4 },
  { id:'as2', name:'Code reviewer', state:'ok', model:'Nebula Pro (extended thinking)',
    desc:'Reads the repo before answering. Ordered findings, no style commentary unless asked.',
    skills:['fs.read','code.analyze','search.repo'], kb:'Engineering docs', threads:2 },
  { id:'as3', name:'Support triage', state:'ok', model:'Nebula Fast',
    desc:'Labels inbound tickets by product area and urgency, and escalates anything it is unsure about.',
    skills:['classify','search.docs'], kb:'Support corpus', threads:1 },
  { id:'as4', name:'Board writer', state:'idle', model:'Nebula Pro',
    desc:'Drafts the leadership digest from the week\'s analyses. Plain register, no adjectives.',
    skills:['search.docs','doc.write'], kb:'Finance corpus', threads:0 }
];

/* --------------------------------------------------------------- schedule */
const SCHEDULE = [
  { id:'sc1', name:'Weekly revenue digest', cron:'Mon 07:00', next:'in 2 d', state:'ok',
    target:'#leadership', assistant:'Board writer', last:'1:12' },
  { id:'sc2', name:'Ingest new drive documents', cron:'every 15 min', next:'in 4 min', state:'run',
    target:'Finance corpus', assistant:'—', last:'1:58' },
  { id:'sc3', name:'Churn watchlist refresh', cron:'daily 06:00', next:'in 16 h', state:'ok',
    target:'Churn program', assistant:'Revenue analyst', last:'2:41' },
  { id:'sc4', name:'Ticket backlog sweep', cron:'hourly', next:'in 22 min', state:'ok',
    target:'Support triage', assistant:'Support triage', last:'0:38' },
  { id:'sc5', name:'Corpus re-embed', cron:'manual', next:'—', state:'err',
    target:'Finance corpus', assistant:'—', last:'0:04' },
  { id:'sc6', name:'Forecast bridge rebuild', cron:'Fri 18:00', next:'in 5 d', state:'idle',
    target:'Q3 close', assistant:'Revenue analyst', last:'—' }
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

/* -------------------------------------------------------------- solutions
   A solution is what ships to an end user: an assistant, its skills, its
   knowledge and a surface. The app rail on the right is where they land. */
const SOLUTIONS = [
  { id:'so1', name:'Revenue Cockpit', state:'live', app:'RC', users:'42 users',
    desc:'The finance team\'s standing view: variance by segment, the forecast bridge, and a question box wired to the revenue analyst.',
    parts:{ assistant:'Revenue analyst', skills:['warehouse.query','code.run','chart.build'], kb:'Finance corpus', surface:'App + scheduled digest' } },
  { id:'so2', name:'Churn Radar', state:'live', app:'CR', users:'18 users',
    desc:'Account watchlist ranked by churn probability, with the signal that put each account on the list.',
    parts:{ assistant:'Revenue analyst', skills:['warehouse.query','code.run'], kb:'Support corpus', surface:'App + daily refresh' } },
  { id:'so3', name:'Ticket Triage', state:'live', app:'TT', users:'64 users',
    desc:'Labels inbound tickets and escalates the uncertain ones to a human queue instead of guessing.',
    parts:{ assistant:'Support triage', skills:['classify','search.docs'], kb:'Support corpus', surface:'Webhook + review queue' } },
  { id:'so4', name:'Board Digest', state:'beta', app:'BD', users:'6 users',
    desc:'Assembles the weekly leadership note from the week\'s analyses. Drafts only — a human sends it.',
    parts:{ assistant:'Board writer', skills:['search.docs','doc.write'], kb:'Finance corpus', surface:'Scheduled draft' } },
  { id:'so5', name:'Pricing Lab', state:'draft', app:'PL', users:'—',
    desc:'Scenario tool for the November pricing cohort. Still wiring the renewal exposure model.',
    parts:{ assistant:'Revenue analyst', skills:['warehouse.query','code.run'], kb:'Finance corpus', surface:'App' } }
];

/* ------------------------------------------------------------------- apps
   The right rail. Circular tiles, initials only — an app is identified by
   position and name, not by a colour we would have to invent. */
/* An app carries a colour and a glyph, keyed to what it is for rather than to
   its position in the rail: money is amber wherever it appears, authoring is
   red. `c` indexes --app-1..5 in tokens.css. */
const APPS = [
  { id:'ap1',  short:'RC', name:'Revenue Cockpit', state:'live', c:3, icon:'dollar',   desc:'Variance, bridge and a question box.' },
  { id:'ap2',  short:'CR', name:'Churn Radar',     state:'live', c:5, icon:'feather',  desc:'Account watchlist by churn probability.' },
  { id:'ap3',  short:'PH', name:'Pipeline Health', state:'live', c:4, icon:'checksq',  desc:'Ingestion throughput and adapter budgets.' },
  { id:'ap4',  short:'TT', name:'Ticket Triage',   state:'live', c:2, icon:'filetext', desc:'Inbound labelling and escalation queue.' },
  { id:'ap5',  short:'FS', name:'Forecast Studio', state:'live', c:3, icon:'dollar',   desc:'Scenario forecasting off the recurring base.' },
  { id:'ap6',  short:'DQ', name:'Data Quality',    state:'warn', c:4, icon:'checksq',  desc:'Freshness and completeness per source.' },
  { id:'ap7',  short:'BD', name:'Board Digest',    state:'beta', c:2, icon:'filetext', desc:'Weekly leadership note, drafted.' },
  { id:'ap8',  short:'PL', name:'Pricing Lab',     state:'draft',c:3, icon:'dollar',   desc:'November cohort exposure model.' },
  { id:'ap9',  short:'RD', name:'Renewals Desk',   state:'live', c:1, icon:'calendar', desc:'The renewal book, by month and owner.' },
  { id:'ap10', short:'CE', name:'Corpus Explorer', state:'live', c:5, icon:'feather',  desc:'Search across every knowledge base.' }
];

/* An app opens as a sheet, so each one needs a surface rather than a page.
   Six shapes cover all ten: a ledger of amounts, a triage queue, a health
   readout, a month, a drafted note, a search. `s` picks the renderer. */
const APP_PANELS = {
  ap1:{ s:'ledger', sub:'Q3 · by segment',
    stats:[['Q3 actual','$41.2M'],['vs plan','+12.4%'],['Q4 forecast','$42.4M']],
    rows:[
      ['Enterprise','142 accounts · renewals','$22.4M','ok'],
      ['Mid-market','388 accounts · expansion','$12.8M','ok'],
      ['SMB','2,140 accounts · churn 40bps','$4.6M','err'],
      ['Services','one-off implementations','$1.4M','warn']
    ] },

  ap2:{ s:'queue', sub:'5 accounts above threshold',
    stats:[['At risk ARR','$6.2M'],['Above 0.6','5'],['New this week','2']],
    rows:[
      ['Northwind Traders','admin changed 9d ago · usage flat','0.81','err'],
      ['Contoso Retail','usage −34% over 30d','0.74','err'],
      ['Fabrikam','exec sponsor left in July','0.63','warn'],
      ['Tailspin Toys','2 tickets reopened, 1 escalated','0.61','warn'],
      ['Adventure Works','seats +12, no other signal','0.22','ok']
    ] },

  ap3:{ s:'health', sub:'ingestion · last 24h',
    meters:[['Ingest throughput',82,''],['Adapter credits',54,''],['Queue depth',91,'warn'],['Sink latency',37,'']],
    rows:[
      ['warehouse','committed 2m ago','ok'],
      ['drive','committed 4m ago','ok'],
      ['support_api','backlog 1,840 batches','warn'],
      ['billing_export','failed 3 retries','err']
    ] },

  ap4:{ s:'queue', sub:'4 open · 2 breaching',
    stats:[['Open','4'],['Breaching','2'],['Median first reply','18m']],
    rows:[
      ['Export fails above 50k rows','#4812 · billing · 2h','P1','err'],
      ['SSO loop after password reset','#4809 · auth · 3h','P1','err'],
      ['Webhook retries duplicate events','#4801 · api · 1d','P2','warn'],
      ['Docs reference a removed endpoint','#4796 · docs · 2d','P3','']
    ] },

  ap5:{ s:'ledger', sub:'off the recurring base',
    stats:[['Recurring base','$39.8M'],['Trailing rate','+5.3%'],['Band','$42.1–43.4M']],
    rows:[
      ['Base case','trailing three-quarter rate','$42.4M','ok'],
      ['Pricing slips to Q1','November cohort delayed','$41.8M','warn'],
      ['SMB stabilises','churn back to 20bps','$43.1M','ok'],
      ['Renewal slip 10%','two enterprise deals move','$40.2M','err']
    ] },

  ap6:{ s:'health', sub:'4 sources · 1 failing',
    meters:[['Freshness',96,''],['Completeness',88,''],['Schema drift',12,'warn']],
    rows:[
      ['q3_ledger','fresh · 2m · 0 nulls','ok'],
      ['renewals_export','stale · 6h behind','warn'],
      ['support_tickets','fresh · 4m · 12 nulls','ok'],
      ['pricing_cohorts','3 columns missing since 07-30','err']
    ] },

  ap7:{ s:'note', sub:'week 33 · drafted, not sent',
    md:[
      'Q3 closed **$41.2M**, 12.4% over plan. Two segments carry the beat and one of them is timing.',
      '',
      '### What to tell the board',
      '- The durable half is enterprise renewals — $3.1M, mostly multi-year, signed before the July pricing change.',
      '- Mid-market expansion is the third consecutive quarter outpacing new logo. That is the trend worth naming.',
      '- SMB is $0.4M under plan with churn up 40bps. It is small, and it is the only line moving the wrong way.',
      '',
      '### What not to claim',
      'The $0.6M in services is a Q2 implementation that slipped. Counting it as growth would flatter Q3 and cost us Q4.'
    ].join('\n') },

  ap8:{ s:'ledger', sub:'November cohort',
    stats:[['Exposed ARR','$8.9M'],['Cohorts','12'],['Blended uplift','2.1%']],
    rows:[
      ['November renewals','412 accounts · uplift applies','$3.9M','warn'],
      ['December renewals','280 accounts · uplift applies','$2.6M','warn'],
      ['Grandfathered','98 accounts · exempt to 2027','$1.8M','ok'],
      ['Opted out','14 accounts · negotiated','$0.6M','err']
    ] },

  ap9:{ s:'calendar', sub:'August 2026 · $4.6M in book',
    month:'August 2026', offset:5, days:31, today:13,
    marks:{ 5:'$0.4M', 12:'$1.2M', 18:'$0.6M', 24:'$2.1M', 27:'$0.3M' },
    rows:[
      ['Aug 12','Contoso Retail','$1.2M · Ana'],
      ['Aug 18','Fabrikam','$0.6M · Ravi'],
      ['Aug 24','Northwind Traders','$2.1M · Ana'],
      ['Aug 27','Tailspin Toys','$0.3M · Ravi']
    ] },

  ap10:{ s:'search', sub:'6 knowledge bases · 1,284 docs',
    placeholder:'Search every knowledge base…',
    rows:[
      ['Adapter credit scheme','ADR-014 · Engineering ADRs','3d'],
      ['FY25 pricing changes','pricing-changes.md · Revenue','1w'],
      ['Renewal playbook','renewals.md · Sales enablement','2w'],
      ['Ingestion runbook','runbook-ingest.md · Engineering','1mo']
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

const CONNECTIONS = [
  ['warehouse', 'Snowflake · eu-west-1', 'ok',   'read-only role, 40 GB scan cap'],
  ['drive',     'Google Drive · Finance', 'ok',   'service account, 1 folder'],
  ['zendesk',   'Zendesk · support',      'warn', 'June backfill incomplete'],
  ['notion',    'Notion · Product',       'ok',   'read-only integration token'],
  ['webhook',   'ingest.nebulas.app',     'ok',   'signed, 318 calls today']
];

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
  ARTIFACTS, ARTIFACT_BY_ID, THREADS, PROJECTS, ASSISTANTS, SCHEDULE,
  KBS, DATASETS, DASHBOARDS, DASH_KINDS, SKILLS, AGENTS, SOLUTIONS, APPS, APP_PANELS, CLOUD, CONNECTIONS,
  ACCOUNT, MODELS, REPLIES
};
})();
