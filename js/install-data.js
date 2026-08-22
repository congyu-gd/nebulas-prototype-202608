/* ============================================================================
   install-data.js — the deployment mind map, as configuration.

   Thirteen modules, each one an admin UI page group. A module's `groups` map
   1:1 to the PRD bullets, so the checklist and the form are the same object —
   nothing has to be kept in sync by hand.

   `phase` groups the modules in the menu: foundation · platform · operations.
   Initialisation has none — it is the gate, pinned above them.

   Field types: select · input · seg · switch · multi · range
   `half:true` puts two fields on one row. `v` is the default value.
   ========================================================================= */

const MODULES = [
{
  id:'init', n:'01', label:'Initialisation', icon:'flag',
  page:'Tenant Onboarding',
  desc:'Stand up the enterprise tenant, its billing identity and the regions everything else inherits.',
  groups:[
    { t:'Cloud provider', f:[
      { t:'select', l:'Provider', v:'AWS', half:true,
        o:['AWS','Azure','GCP','Aliyun','Tencent Cloud','Huawei Cloud'],
        h:'Every downstream default — regions, registry, KMS — follows this choice.' },
      { t:'select', l:'Account model', v:'Organisation + sub-accounts', half:true,
        o:['Single account','Organisation + sub-accounts','Landing zone'] }
    ]},
    { t:'Enterprise tenant & KYC', f:[
      { t:'input', l:'Legal entity name', v:'', ph:'Acme Industrial Co., Ltd', half:true },
      { t:'input', l:'Tenant slug', v:'', ph:'acme', half:true, h:'Used in subdomains and resource names.' },
      { t:'switch', l:'KYC documents submitted', v:false },
      { t:'switch', l:'Signed DPA on file', v:false }
    ]},
    { t:'Payment & invoicing', f:[
      { t:'select', l:'Payment method', v:'Invoice / PO', half:true,
        o:['Credit card','Bank transfer','Invoice / PO','Cloud marketplace'] },
      { t:'select', l:'Billing currency', v:'USD', half:true, o:['USD','EUR','CNY','GBP','JPY'] },
      { t:'input', l:'Invoice email', v:'', ph:'ap@acme.com', half:true },
      { t:'input', l:'Tax / VAT number', v:'', ph:'', half:true }
    ]},
    { t:'Regions', f:[
      { t:'select', l:'Primary region', v:'ap-southeast-1', half:true,
        o:['us-east-1','us-west-2','eu-west-1','eu-central-1','ap-southeast-1','ap-northeast-1','cn-north-1'] },
      { t:'select', l:'Disaster-recovery region', v:'ap-northeast-1', half:true,
        o:['us-east-1','us-west-2','eu-west-1','eu-central-1','ap-southeast-1','ap-northeast-1','cn-north-1'],
        h:'Must differ from primary for the DR drills in module 12 to mean anything.' }
    ]},
    { t:'Resource projects & tagging', f:[
      { t:'input', l:'Project prefix', v:'acme-ai', half:true },
      { t:'select', l:'Environments', v:'dev · staging · prod', half:true,
        o:['prod only','dev · prod','dev · staging · prod'] },
      { t:'switch', l:'Enforce tag policy at creation', v:true,
        h:'Untagged resources cannot be charged back in module 13.' }
    ]},
    { t:'Initial administrators', f:[
      { t:'input', l:'Invite by email', v:'', ph:'name@acme.com, name2@acme.com' },
      { t:'select', l:'Role granted', v:'Platform admin', half:true,
        o:['Owner','Platform admin','Security admin','Billing admin'] },
      { t:'switch', l:'Require MFA before first login', v:true, half:true }
    ]}
  ]
},
{
  id:'network', n:'02', phase:'foundation', label:'Network & Security', icon:'globe',
  page:'Network & Security Configuration',
  desc:'The perimeter: topology, names, certificates and the identities allowed to change any of it.',
  groups:[
    { t:'VPC topology', f:[
      { t:'seg', l:'Topology', v:'Hub-Spoke', o:['Hub-Spoke','Mesh'] },
      { t:'input', l:'VPC CIDR', v:'10.0.0.0/16', half:true, mono:true },
      { t:'select', l:'Availability zones', v:'3', half:true, o:['2','3','4'] },
      { t:'multi', l:'Subnet tiers', v:['Public','Private','Database'], o:['Public','Private','Database','Transit'] }
    ]},
    { t:'Routing & egress', f:[
      { t:'select', l:'Internet egress', v:'NAT gateway', half:true,
        o:['NAT gateway','Internet gateway','Egress proxy','None (private only)'] },
      { t:'select', l:'NAT redundancy', v:'One per AZ', half:true, o:['Single','One per AZ'] },
      { t:'switch', l:'Private endpoints for storage and KMS', v:true }
    ]},
    { t:'Security groups & ACLs', f:[
      { t:'switch', l:'Default-deny baseline', v:true },
      { t:'switch', l:'Block lateral traffic between tiers', v:true },
      { t:'input', l:'Admin access CIDR allow-list', v:'', ph:'203.0.113.0/24', mono:true }
    ]},
    { t:'Domain & DNS', f:[
      { t:'input', l:'Primary domain', v:'', ph:'ai.acme.com', half:true },
      { t:'select', l:'DNS provider', v:'Cloud DNS (managed)', half:true,
        o:['Cloud DNS (managed)','Cloudflare','External / delegated'] },
      { t:'multi', l:'Record types to provision', v:['A','CNAME','CAA'], o:['A','AAAA','CNAME','CAA','TXT','MX'] }
    ]},
    { t:'TLS certificates', f:[
      { t:'select', l:'Certificate source', v:'Cloud-managed', half:true,
        o:['Cloud-managed','Let’s Encrypt (ACME)','Upload own'] },
      { t:'select', l:'Minimum TLS version', v:'1.3', half:true, o:['1.2','1.3'] },
      { t:'switch', l:'HSTS with preload', v:true, half:true },
      { t:'switch', l:'OCSP stapling', v:true, half:true }
    ]},
    { t:'IAM & keys', f:[
      { t:'switch', l:'Least-privilege generated policies', v:true },
      { t:'switch', l:'No long-lived access keys (workload identity only)', v:true },
      { t:'select', l:'Key rotation interval', v:'90 days', half:true, o:['30 days','90 days','180 days','365 days'] },
      { t:'select', l:'Break-glass account', v:'Sealed, alert on use', half:true,
        o:['None','Sealed, alert on use','Sealed, dual approval'] }
    ]}
  ]
},
{
  id:'compute', n:'03', phase:'foundation', label:'Compute Resources', icon:'cube',
  page:'Infrastructure',
  desc:'Where workloads run, how they grow, and what is allowed to be pulled into the cluster.',
  groups:[
    { t:'Orchestrator', f:[
      { t:'seg', l:'Runtime', v:'Kubernetes', o:['Kubernetes','ECS','Nomad'] },
      { t:'select', l:'Control plane', v:'Managed', half:true, o:['Managed','Self-hosted'] },
      { t:'select', l:'Version channel', v:'Stable (n-1)', half:true, o:['Latest','Stable (n-1)','Extended support'] }
    ]},
    { t:'Node pools', f:[
      { t:'input', l:'General pool — instance type', v:'8 vCPU / 32 GB', half:true },
      { t:'input', l:'General pool — size', v:'3 – 12', half:true, mono:true },
      { t:'select', l:'GPU inference pool', v:'2 × L40S', half:true,
        o:['None','1 × A10G','2 × L40S','4 × L40S','2 × H100','8 × H100'] },
      { t:'input', l:'System pool — size', v:'2', half:true, mono:true,
        h:'Ingress, monitoring and the registry run here, isolated from tenant load.' }
    ]},
    { t:'Autoscaling', f:[
      { t:'multi', l:'Scalers enabled', v:['HPA','Cluster Autoscaler'], o:['HPA','VPA','Cluster Autoscaler','KEDA'] },
      { t:'range', l:'Target CPU utilisation', v:65, min:40, max:90, step:5, unit:'%' },
      { t:'switch', l:'Scale GPU pool to zero when idle', v:true }
    ]},
    { t:'Image registry', f:[
      { t:'select', l:'Registry', v:'Harbor', half:true, o:['Harbor','ECR','ACR','GCR / Artifact Registry'] },
      { t:'select', l:'Retention', v:'30 tags per repo', half:true,
        o:['10 tags per repo','30 tags per repo','90 days','Keep all'] },
      { t:'switch', l:'Require signed images (cosign)', v:true },
      { t:'switch', l:'Block deploy on critical CVE', v:true }
    ]},
    { t:'Spot capacity', f:[
      { t:'switch', l:'Use Spot for elastic workloads', v:true },
      { t:'range', l:'Spot share of elastic capacity', v:60, min:0, max:100, step:10, unit:'%',
        h:'Batch and evaluation jobs only — interactive inference stays on-demand.' }
    ]}
  ]
},
{
  id:'data', n:'04', phase:'foundation', label:'Data Layer', icon:'data',
  page:'Data Services',
  desc:'Business state, cache, vectors and objects — plus the backup posture they are all judged by.',
  groups:[
    { t:'PostgreSQL', f:[
      { t:'select', l:'Version', v:'16', half:true, o:['14','15','16','17'] },
      { t:'select', l:'Instance class', v:'8 vCPU / 64 GB', half:true,
        o:['2 vCPU / 8 GB','4 vCPU / 16 GB','8 vCPU / 64 GB','16 vCPU / 128 GB'] },
      { t:'select', l:'Replicas', v:'1 sync + 1 async', half:true,
        o:['None','1 async','1 sync + 1 async','2 sync'] },
      { t:'input', l:'Storage', v:'500 GB', half:true, mono:true },
      { t:'switch', l:'Connection pooler (PgBouncer)', v:true }
    ]},
    { t:'Redis', f:[
      { t:'select', l:'Topology', v:'Cluster (3 shards)', half:true,
        o:['Single','Sentinel','Cluster (3 shards)','Cluster (6 shards)'] },
      { t:'select', l:'Eviction policy', v:'allkeys-lru', half:true,
        o:['noeviction','allkeys-lru','volatile-lru','allkeys-lfu'] },
      { t:'multi', l:'Used for', v:['Cache','Rate limiting','Distributed locks'],
        o:['Cache','Rate limiting','Distributed locks','Sessions','Queues'] }
    ]},
    { t:'Vector database', f:[
      { t:'select', l:'Engine', v:'Qdrant', half:true, o:['Qdrant','Milvus','pgvector','Weaviate'] },
      { t:'select', l:'Index type', v:'HNSW', half:true, o:['HNSW','IVF-Flat','IVF-PQ'] },
      { t:'input', l:'Vector dimension', v:'1536', half:true, mono:true },
      { t:'select', l:'Distance metric', v:'Cosine', half:true, o:['Cosine','Dot product','Euclidean'] },
      { t:'switch', l:'Per-tenant collections', v:true,
        h:'Retrieval leaking across tenants is the failure nobody recovers from.' }
    ]},
    { t:'Object storage', f:[
      { t:'select', l:'Service', v:'S3', half:true, o:['S3','OSS','COS','Azure Blob','GCS'] },
      { t:'input', l:'Bucket prefix', v:'acme-ai', half:true, mono:true },
      { t:'multi', l:'Buckets', v:['Documents','Logs','Model weights'],
        o:['Documents','Logs','Model weights','Exports','Backups'] },
      { t:'select', l:'Lifecycle to cold storage', v:'After 90 days', half:true,
        o:['Never','After 30 days','After 90 days','After 180 days'] }
    ]},
    { t:'Backups', f:[
      { t:'select', l:'Target RPO', v:'1 hour', half:true,
        o:['15 minutes','1 hour','6 hours','24 hours'], h:'1 hour or better is recommended.' },
      { t:'select', l:'Retention', v:'35 days', half:true, o:['7 days','35 days','90 days','1 year'] },
      { t:'switch', l:'Point-in-time recovery (WAL archive)', v:true },
      { t:'switch', l:'Verify restores automatically each week', v:false }
    ]}
  ]
},
{
  id:'ai', n:'05', phase:'platform', label:'AI Capabilities', icon:'spark',
  page:'Model Management',
  desc:'Model sources, the gateway everything calls through, and the retrieval pipeline behind answers.',
  groups:[
    { t:'LLM source', f:[
      { t:'seg', l:'Sourcing', v:'Commercial API', o:['Commercial API','Self-hosted','Hybrid'] },
      { t:'multi', l:'Commercial providers', v:['Anthropic'],
        o:['OpenAI','Anthropic','Tongyi','DeepSeek','Gemini'] },
      { t:'multi', l:'Self-hosted open models', v:[], o:['Qwen','Llama','Mistral','DeepSeek'] }
    ]},
    { t:'LLM gateway', f:[
      { t:'select', l:'Gateway', v:'LiteLLM', half:true, o:['LiteLLM','OpenRouter','Portkey','None (direct)'] },
      { t:'input', l:'Default rate limit', v:'120000 tokens/min', half:true, mono:true },
      { t:'switch', l:'Per-tenant cost tracking', v:true, half:true },
      { t:'switch', l:'Log prompts and completions', v:false, half:true,
        h:'Off by default — turning it on makes module 10 responsible for the contents.' }
    ]},
    { t:'Inference service', f:[
      { t:'select', l:'Server', v:'vLLM', half:true, o:['vLLM','TGI','Triton','SGLang'] },
      { t:'select', l:'Quantisation', v:'FP8', half:true, o:['None (FP16)','FP8','INT8','INT4 / AWQ'] },
      { t:'input', l:'Max context length', v:'32768', half:true, mono:true },
      { t:'input', l:'Concurrent requests per replica', v:'64', half:true, mono:true }
    ]},
    { t:'Embedding & multimodal', f:[
      { t:'select', l:'Embedding model', v:'bge-m3', half:true,
        o:['text-embedding-3-large','bge-m3','gte-large','Cohere embed v3'] },
      { t:'multi', l:'Multimodal models', v:['Whisper'], o:['CLIP','Whisper','SigLIP','Paddle OCR'] }
    ]},
    { t:'RAG pipeline', f:[
      { t:'select', l:'Parser', v:'Unstructured', half:true, o:['Unstructured','Tika','Docling','LlamaParse'] },
      { t:'select', l:'Chunking', v:'Semantic', half:true, o:['Fixed window','Recursive','Semantic','Layout-aware'] },
      { t:'input', l:'Chunk size / overlap', v:'800 / 120', half:true, mono:true },
      { t:'input', l:'Retrieve top-k', v:'20', half:true, mono:true },
      { t:'switch', l:'Rerank before generation', v:true },
      { t:'switch', l:'Require citations in answers', v:true }
    ]},
    { t:'Routing & fallback', f:[
      { t:'select', l:'Routing strategy', v:'Cost-aware by task', half:true,
        o:['Single model','Cost-aware by task','Latency-first','Quality-first'] },
      { t:'select', l:'On provider failure', v:'Fail over to secondary', half:true,
        o:['Return error','Retry same provider','Fail over to secondary','Degrade to self-hosted'] },
      { t:'range', l:'Monthly spend cap alert', v:80, min:50, max:100, step:5, unit:'% of budget' }
    ]}
  ]
},
{
  id:'app', n:'06', phase:'platform', label:'Application Services', icon:'layers',
  page:'Application Configuration',
  desc:'The gateway, the services behind it, and the asynchronous machinery between them.',
  groups:[
    { t:'API gateway', f:[
      { t:'select', l:'Gateway', v:'APISIX', half:true, o:['Kong','APISIX','Envoy','Traefik'] },
      { t:'input', l:'Rate limit per tenant', v:'600 req/min', half:true, mono:true },
      { t:'switch', l:'Circuit breaker', v:true, half:true },
      { t:'switch', l:'Canary routing by header', v:true, half:true },
      { t:'switch', l:'Request/response size limits', v:true }
    ]},
    { t:'Core microservices', f:[
      { t:'multi', l:'Services to deploy', v:['Auth','Chat','Agent','Tools','Billing','Notify'],
        o:['Auth','Chat','Agent','Tools','Billing','Notify','Admin'] },
      { t:'select', l:'Service mesh', v:'None', half:true, o:['None','Istio','Linkerd','Cilium'] },
      { t:'select', l:'Replicas per service', v:'3', half:true, o:['2','3','5'] }
    ]},
    { t:'Message queue', f:[
      { t:'select', l:'Broker', v:'Kafka', half:true, o:['Kafka','RabbitMQ','RocketMQ','NATS'] },
      { t:'input', l:'Retention', v:'7 days', half:true, mono:true },
      { t:'switch', l:'Dead-letter queue with replay', v:true }
    ]},
    { t:'Search engine', f:[
      { t:'select', l:'Engine', v:'OpenSearch', half:true, o:['Elasticsearch','OpenSearch','Meilisearch'] },
      { t:'select', l:'Shards / replicas', v:'3 / 1', half:true, o:['1 / 1','3 / 1','5 / 2'] },
      { t:'switch', l:'Hybrid search (BM25 + vector)', v:true }
    ]},
    { t:'Task scheduler', f:[
      { t:'select', l:'Scheduler', v:'Temporal', half:true, o:['Airflow','Temporal','Dagster','Prefect'] },
      { t:'input', l:'Max parallel workflows', v:'50', half:true, mono:true },
      { t:'switch', l:'Retry with exponential backoff', v:true }
    ]}
  ]
},
{
  /* Not a form: the design system is EXTRACTED from a site the tenant owns,
     then read here — palette swatches with roles and provenance on the left,
     the extraction run on the right. install.js renders it via `custom`. */
  id:'design', n:'07', phase:'platform', label:'Design Assets', icon:'feather',
  page:'Design System', custom:'design',
  desc:'The design system read from your site, not typed in: crawl a URL, parse the tokens, assign the roles — and every tenant-facing surface inherits it.',
  groups:[]
},
{
  id:'identity', n:'08', phase:'platform', label:'Identity & Multi-tenancy', icon:'user',
  page:'Organization & Permissions',
  desc:'Who gets in, what they may touch, how tenants stay apart and how usage becomes an invoice.',
  groups:[
    { t:'Enterprise SSO', f:[
      { t:'seg', l:'Protocol', v:'OIDC', o:['SAML 2.0','OIDC'] },
      { t:'select', l:'Identity provider', v:'Azure AD', half:true,
        o:['Okta','Azure AD','Feishu','DingTalk','WeCom','Google Workspace','Keycloak'] },
      { t:'input', l:'Metadata / discovery URL', v:'', ph:'https://login.…/.well-known/openid-configuration', half:true },
      { t:'switch', l:'Just-in-time user provisioning', v:true, half:true },
      { t:'switch', l:'SCIM directory sync', v:true, half:true }
    ]},
    { t:'Permission model', f:[
      { t:'seg', l:'Model', v:'RBAC', o:['RBAC','ABAC','RBAC + ABAC'] },
      { t:'input', l:'Hierarchy', v:'Org → Dept → User → Role → Resource', mono:true,
        h:'Roles are granted at any level and inherit downward.' },
      { t:'switch', l:'Allow custom roles per tenant', v:true }
    ]},
    { t:'Tenant isolation', f:[
      { t:'select', l:'Strategy', v:'Schema-per-tenant', half:true,
        o:['Row-level','Schema-per-tenant','DB-per-tenant'] },
      { t:'select', l:'Isolation for enterprise plan', v:'DB-per-tenant', half:true,
        o:['Same as default','DB-per-tenant','Dedicated cluster'] },
      { t:'switch', l:'Separate encryption key per tenant', v:false }
    ]},
    { t:'Billing dimensions', f:[
      { t:'multi', l:'Metered on', v:['Token usage','API calls','Seats'],
        o:['Token usage','API calls','Storage','Seats','GPU minutes'] },
      { t:'select', l:'Billing period', v:'Monthly', half:true, o:['Monthly','Quarterly','Annual'] },
      { t:'switch', l:'Hard stop at quota', v:false, half:true,
        h:'Off means overage is billed; on means requests are rejected.' }
    ]},
    { t:'Member lifecycle', f:[
      { t:'select', l:'Invitation flow', v:'Admin approval required', half:true,
        o:['Open link','Admin approval required','Domain auto-join'] },
      { t:'select', l:'Offboarding', v:'Immediate revoke + 30-day hold', half:true,
        o:['Immediate revoke','Immediate revoke + 30-day hold','Scheduled'] },
      { t:'switch', l:'Transfer owned resources on departure', v:true }
    ]}
  ]
},
{
  id:'observe', n:'09', phase:'operations', label:'Observability', icon:'chart',
  page:'Monitoring & Alerts',
  desc:'Metrics, logs and traces that cover model calls too — plus what tenants get to see of it.',
  groups:[
    { t:'Metrics', f:[
      { t:'switch', l:'Prometheus + Grafana', v:true },
      { t:'select', l:'Scrape interval', v:'30s', half:true, o:['15s','30s','60s'] },
      { t:'select', l:'Retention', v:'90 days', half:true, o:['15 days','30 days','90 days','1 year'] },
      { t:'multi', l:'Golden signals tracked', v:['QPS','Latency','Error rate','Token rate'],
        o:['QPS','Latency','Error rate','Token rate','GPU utilisation','Queue depth'] }
    ]},
    { t:'Log aggregation', f:[
      { t:'select', l:'Stack', v:'Loki', half:true, o:['Loki','EFK','OpenSearch','Cloud-native'] },
      { t:'select', l:'Retention', v:'30 days', half:true, o:['7 days','30 days','90 days','1 year'] },
      { t:'switch', l:'Structured JSON logs only', v:true },
      { t:'switch', l:'PII masking at ingest', v:true,
        h:'Masking downstream is a cleanup job; masking at ingest is a guarantee.' }
    ]},
    { t:'Distributed tracing', f:[
      { t:'select', l:'Backend', v:'Tempo', half:true, o:['Jaeger','Tempo','Zipkin','Cloud X-Ray'] },
      { t:'range', l:'Sample rate', v:10, min:1, max:100, step:1, unit:'%' },
      { t:'switch', l:'Trace LLM and tool calls as spans', v:true }
    ]},
    { t:'Alerts', f:[
      { t:'multi', l:'Alert on', v:['SLO breach','Error rate','GPU saturation','Cost anomaly'],
        o:['SLO breach','Error rate','GPU saturation','Cost anomaly','Queue backlog','Certificate expiry'] },
      { t:'multi', l:'Notification channels', v:['Slack','Email'],
        o:['Slack','Email','PagerDuty','Webhook','Feishu','DingTalk'] },
      { t:'input', l:'Availability SLO', v:'99.9%', half:true, mono:true },
      { t:'input', l:'p95 latency objective', v:'2.5s', half:true, mono:true }
    ]},
    { t:'Tenant-facing observability', f:[
      { t:'switch', l:'Expose per-tenant usage dashboard', v:true },
      { t:'switch', l:'Expose health and incident history', v:true },
      { t:'switch', l:'Expose per-tenant error logs', v:false }
    ]}
  ]
},
{
  id:'compliance', n:'10', phase:'operations', label:'Compliance & Audit', icon:'shield',
  page:'Security & Compliance',
  desc:'Evidence that the platform behaved: audit trails, encryption, frameworks and content controls.',
  groups:[
    { t:'Audit logging', f:[
      { t:'select', l:'Cloud audit trail', v:'CloudTrail', half:true,
        o:['CloudTrail','ActionTrail','Azure Monitor','GCP Audit Logs'] },
      { t:'select', l:'Retention', v:'1 year', half:true, o:['90 days','1 year','3 years','7 years'] },
      { t:'switch', l:'Application-level audit log', v:true },
      { t:'switch', l:'Write-once (immutable) storage', v:true }
    ]},
    { t:'Encryption', f:[
      { t:'select', l:'Key management', v:'Cloud KMS', half:true, o:['Cloud KMS','BYOK','HSM (dedicated)'] },
      { t:'select', l:'In transit', v:'TLS 1.3 only', half:true, o:['TLS 1.2+','TLS 1.3 only'] },
      { t:'switch', l:'Encrypt all volumes and snapshots at rest', v:true },
      { t:'switch', l:'Encrypt inter-service traffic (mTLS)', v:true }
    ]},
    { t:'Compliance frameworks', f:[
      { t:'multi', l:'In scope', v:['GDPR','SOC 2'],
        o:['GDPR','SOC 2','ISO 27001','等保 2.0','HIPAA','PCI DSS'] },
      { t:'select', l:'Automated control checks', v:'Daily', half:true, o:['Hourly','Daily','Weekly'] },
      { t:'select', l:'Data residency', v:'Region-pinned', half:true,
        o:['No constraint','Region-pinned','Country-pinned'] }
    ]},
    { t:'Vulnerability scanning', f:[
      { t:'select', l:'Scanner', v:'Trivy', half:true, o:['Trivy','Snyk','Grype','Prisma Cloud'] },
      { t:'select', l:'Fail build at', v:'High', half:true, o:['Critical','High','Medium'] },
      { t:'switch', l:'Dependency and licence audit', v:true },
      { t:'switch', l:'Scan running workloads, not just images', v:true }
    ]},
    { t:'Data loss & prompt safety', f:[
      { t:'switch', l:'DLP on uploads and outputs', v:true },
      { t:'switch', l:'Prompt injection detection', v:true },
      { t:'switch', l:'Block secrets in prompts', v:true },
      { t:'select', l:'On violation', v:'Block and notify admin', half:true,
        o:['Log only','Redact and continue','Block and notify admin'] }
    ]}
  ]
},
{
  id:'cicd', n:'11', phase:'operations', label:'CI/CD Pipeline', icon:'branch',
  page:'Deployment Management',
  desc:'How code reaches the cluster, and how it comes back out again when it misbehaves.',
  groups:[
    { t:'Repository', f:[
      { t:'select', l:'Host', v:'GitLab', half:true, o:['GitHub','GitLab','Gitea','Bitbucket'] },
      { t:'input', l:'Repository', v:'', ph:'acme/ai-platform', half:true, mono:true },
      { t:'seg', l:'Branching strategy', v:'Trunk-based', o:['Trunk-based','Git flow','Release branches'] },
      { t:'switch', l:'Require signed commits', v:false }
    ]},
    { t:'Continuous integration', f:[
      { t:'multi', l:'Pipeline stages', v:['lint','test','build','scan','push'],
        o:['lint','test','build','scan','push','e2e','load test'] },
      { t:'input', l:'Minimum test coverage', v:'70%', half:true, mono:true },
      { t:'select', l:'Required approvals', v:'1', half:true, o:['0','1','2'] }
    ]},
    { t:'GitOps', f:[
      { t:'select', l:'Controller', v:'ArgoCD', half:true, o:['ArgoCD','FluxCD','None (push-based)'] },
      { t:'select', l:'Sync', v:'Auto with self-heal', half:true,
        o:['Manual','Auto','Auto with self-heal'] },
      { t:'switch', l:'Drift detection alerts', v:true }
    ]},
    { t:'Rollout strategy', f:[
      { t:'select', l:'Strategy', v:'Canary', half:true, o:['Rolling','Blue-green','Canary','Progressive'] },
      { t:'input', l:'Canary steps', v:'5% → 25% → 50% → 100%', half:true, mono:true },
      { t:'switch', l:'Auto-abort on SLO regression', v:true }
    ]},
    { t:'Rollback & flags', f:[
      { t:'switch', l:'One-click rollback to previous revision', v:true },
      { t:'select', l:'Revisions kept', v:'10', half:true, o:['3','5','10','20'] },
      { t:'select', l:'Feature flag service', v:'Unleash', half:true, o:['None','Unleash','LaunchDarkly','Flagsmith'] }
    ]}
  ]
},
{
  id:'dr', n:'12', phase:'operations', label:'Backup & Disaster Recovery', icon:'clock',
  page:'Backup & Recovery',
  desc:'The targets, the mechanics that meet them, and the rehearsal that proves they are real.',
  groups:[
    { t:'Database backups', f:[
      { t:'multi', l:'Backup types', v:['Logical dump','Physical snapshot','WAL archive'],
        o:['Logical dump','Physical snapshot','WAL archive'] },
      { t:'select', l:'Full backup schedule', v:'Daily 02:00', half:true,
        o:['Every 6 hours','Daily 02:00','Weekly'] },
      { t:'select', l:'Copy to second region', v:'Yes, nightly', half:true,
        o:['No','Yes, nightly','Yes, continuous'] }
    ]},
    { t:'Object storage protection', f:[
      { t:'switch', l:'Cross-region replication', v:true },
      { t:'switch', l:'Object versioning', v:true },
      { t:'switch', l:'Delete protection / object lock', v:true },
      { t:'select', l:'Lock duration', v:'30 days', half:true, o:['7 days','30 days','90 days'] }
    ]},
    { t:'RTO / RPO targets', f:[
      { t:'input', l:'RTO target', v:'4 hours', half:true, mono:true },
      { t:'input', l:'RPO target', v:'1 hour', half:true, mono:true,
        h:'Must be consistent with the backup interval set in module 04.' },
      { t:'switch', l:'DR runbook written and linked', v:false },
      { t:'input', l:'Runbook location', v:'', ph:'https://wiki.acme.com/dr-runbook' }
    ]},
    { t:'Traffic failover', f:[
      { t:'switch', l:'DNS health-check failover', v:true },
      { t:'select', l:'Global traffic manager', v:'Cloud GTM', half:true,
        o:['None','Cloud GTM','Cloudflare Load Balancer'] },
      { t:'input', l:'DNS TTL', v:'60s', half:true, mono:true,
        h:'A long TTL silently caps your RTO, whatever the target says.' }
    ]},
    { t:'DR drills', f:[
      { t:'select', l:'Drill cadence', v:'Quarterly', half:true,
        o:['Monthly','Quarterly','Semi-annual','Annual'] },
      { t:'select', l:'Drill scope', v:'Region failover', half:true,
        o:['Restore test only','Region failover','Full game day'] },
      { t:'switch', l:'Record measured recovery time each drill', v:true }
    ]}
  ]
},
{
  id:'cost', n:'13', phase:'operations', label:'Cost Management', icon:'coin',
  page:'Cost Center',
  desc:'Visibility, budgets and the limits that keep one tenant from spending everyone’s money.',
  groups:[
    { t:'Cost visibility', f:[
      { t:'switch', l:'Enable cost analysis and billing API', v:true },
      { t:'select', l:'Granularity', v:'Daily per tag', half:true,
        o:['Monthly','Daily','Daily per tag','Hourly per tag'] },
      { t:'select', l:'Show amortised or unblended', v:'Amortised', half:true, o:['Amortised','Unblended','Both'] }
    ]},
    { t:'Budgets & anomalies', f:[
      { t:'input', l:'Monthly budget', v:'25000', half:true, mono:true, pre:'$' },
      { t:'input', l:'Alert thresholds', v:'50% / 80% / 100%', half:true, mono:true },
      { t:'switch', l:'Anomaly detection', v:true, half:true },
      { t:'select', l:'Anomaly sensitivity', v:'Medium', half:true, o:['Low','Medium','High'] }
    ]},
    { t:'Tagging & chargeback', f:[
      { t:'multi', l:'Required tags', v:['tenant','department','environment','service'],
        o:['tenant','department','environment','service','owner','cost-center'] },
      { t:'select', l:'Chargeback model', v:'Showback then chargeback', half:true,
        o:['Showback only','Chargeback','Showback then chargeback'] },
      { t:'switch', l:'Block resources missing required tags', v:true, half:true }
    ]},
    { t:'Tenant quotas', f:[
      { t:'input', l:'Tokens per minute', v:'60000', half:true, mono:true },
      { t:'input', l:'API calls per day', v:'250000', half:true, mono:true },
      { t:'input', l:'Storage per tenant', v:'250 GB', half:true, mono:true },
      { t:'select', l:'On quota exhaustion', v:'Throttle', half:true, o:['Throttle','Reject','Bill overage'] }
    ]},
    { t:'Optimisation', f:[
      { t:'multi', l:'Recommendations to surface', v:['Reserved instances','Savings Plans','Idle resources'],
        o:['Reserved instances','Savings Plans','Idle resources','Rightsizing','Storage tiering'] },
      { t:'select', l:'Review cadence', v:'Monthly', half:true, o:['Weekly','Monthly','Quarterly'] },
      { t:'switch', l:'Auto-stop idle GPU nodes', v:true, half:true }
    ]}
  ]
}
];

/* ===================================================== design extraction
   Module 07's fixture: the design system as last extracted. The palette is
   what the parser read — share of colour declarations, and where each was
   read (a variable or the selector that used it). Roles are the editable
   part: extraction proposes, a person can repoint. The run is the pipeline
   the Extract button replays. */
const DESIGN_ROLES = ['primary','secondary','accent','background','surface',
  'border','text','text_muted','danger','muted','surface_alt','accent_deep'];

const DESIGN_EXTRACT = {
  name:'nebulas-design', uid:'637c504c-e02e-44d0-a59e-713459ec28fb',
  site:'https://nebulas.ai/', pages:5,
  stamp:'22/08/2026, 08:46:02',
  swatches:[
    { hex:'#5a47cd', nm:'brand violet',   role:'primary',     share:'3.2%',
      read:'.dark\\:bg-[radial-gradient(ellipse_at_bottom,rgba(90,71,205,.3)_0%,rgba(90,71,205,.1)_30%)*]' },
    { hex:'#ffe082', nm:'warm yellow',    role:'secondary',   share:'1.6%',  read:'--brand-yellow' },
    { hex:'#ffcf3e', nm:'gold highlight', role:'accent',      share:'1.6%',  read:'.gradient-text' },
    { hex:'#000000', nm:'midnight',       role:'background',  share:'37.1%', read:'--tw-gradient-from' },
    { hex:'#ffffff', nm:'paper',          role:'surface',     share:'16.9%', read:'--tw-ring-offset-color' },
    { hex:'#a1a1aa', nm:'soft border',    role:'border',      share:'1.6%',  read:'--border-light' },
    { hex:'#09090b', nm:'ink',            role:'text',        share:'1.6%',  read:'--text-primary' },
    { hex:'#99a1af', nm:'muted gray',     role:'text_muted',  share:'0.81%', read:'--color-gray-400' },
    { hex:'#ef4444', nm:'signal red',     role:'danger',      share:'0.4%',  read:'--color-red-500' },
    { hex:'#808080', nm:'mid gray',       role:'muted',       share:'0.3%',  read:'.text-neutral' },
    { hex:'#fffbeb', nm:'cream',          role:'surface_alt', share:'0.3%',  read:'--color-amber-50' },
    { hex:'#7b3306', nm:'umber',          role:'accent_deep', share:'0.2%',  read:'--color-amber-900' }
  ],
  run:[
    { n:'discover_pages',      d:'1 page(s) fetched',                           t:170 },
    { n:'collect_stylesheets', d:'1 stylesheet(s), 57651 bytes',                t:55 },
    { n:'parse_tokens',        d:'24 color(s), 4 font(s), 174 CSS variable(s)', t:25 },
    { n:'find_images',         d:'1 image(s) imported, 0 skipped',              t:821 },
    { n:'extract_copy',        d:'2 snippet(s)',                                t:0 },
    { n:'synthesize',          d:'9 role(s) assigned; voice inferred; no corrections needed', t:10470 },
    { n:'merge',               d:'Design system and voice applied',             t:21 }
  ],
  /* Beyond colour: the faces, the spacing scale, the corner radii and the
     imported marks — each with the same provenance discipline as the
     palette, because a token you can trace is a token you can trust. */
  fonts:[
    { face:'Sohne',          fam:'"Sohne","Inter",system-ui,sans-serif', role:'display',
      share:'31 rule(s)',  read:'--font-display' },
    { face:'Inter',          fam:'"Inter",system-ui,sans-serif',         role:'body',
      share:'204 rule(s)', read:'--font-sans' },
    { face:'JetBrains Mono', fam:'"JetBrains Mono",ui-monospace,monospace', role:'mono',
      share:'18 rule(s)',  read:'--font-mono' },
    { face:'Georgia',        fam:'Georgia,serif',                        role:'serif accent',
      share:'2 rule(s)',   read:'.pullquote' }
  ],
  spacing:{ base:4, read:'--spacing · 174 declaration(s) land on the scale',
    vals:[4,8,12,16,24,32,48,64] },
  radii:[
    { v:4,    l:'4px',  read:'--radius-sm · inputs, chips' },
    { v:8,    l:'8px',  read:'--radius-md · cards, menus' },
    { v:16,   l:'16px', read:'--radius-xl · hero panels' },
    { v:9999, l:'full', read:'--radius-full · pills, avatars' }
  ],
  logos:[
    { nm:'nebulas-wordmark.svg', kind:'wordmark', size:'12.4 KB', on:'light' },
    { nm:'nebulas-mark.svg',     kind:'mark',     size:'3.1 KB',  on:'dark' }
  ],
  prev:[
    { when:'21/08/2026, 17:02', note:'5 pages · 24 colors · succeeded' },
    { when:'19/08/2026, 09:38', note:'3 pages · 21 colors · succeeded' }
  ]
};
