# Agent Passport Control: Market & Product Research

Oct 5, 2026 · @ZABO

## Executive summary

There is room for a company that decides what AI agents may do inside logged-in SaaS products, on behalf of a specific user. Agents are verified ("passports") and detected by many vendors, but nobody yet lets a site issue a scoped, revocable permission (a "visa") to a third-party agent acting in a user's browser session.

- **The problem is real and growing.** Agents such as Claude in Chrome, Comet and Atlas use customers' own browsers and logins, so bot detection and authentication both wave them through. Agentic traffic grew 27% in a single month this summer.
- **Passports are being solved by others.** Web Bot Auth, backed by Cloudflare, OpenAI, Google and AWS, lets cloud agents prove their provider. Do not compete with it; consume it.
- **Visas are open.** Payments have them (Visa TAP, AP2) and APIs have them (OAuth, MCP), but ordinary web sessions do not. In-browser agents do not identify themselves at all today.
- **Switchfrog is the nearest competitor** and is detection plus billing only: no user consent, no signed-agent verification, no cross-site reputation. cside, Vouched, HUMAN and Persona each cover part of the space.
- **Recommended position:** border control for agents in logged-in products. Identify every agent (signature or behaviour), let users and admins grant visas in product language, enforce them per action, and log everything. Lead with free visibility for mid-market B2B SaaS; charge for control.
- **First thing to validate:** whether behavioural detection of in-browser agents is accurate enough to hang visas on.

## The problem

AI agents now use products while logged in as real customers, and today's tools cannot say who is driving a session or whether the customer allowed it. Bot detection asks "is this a bot?" and authentication asks "is this the right user?". A browser agent passes both, because it runs on the user's own device, cookies and account.

### Three kinds of agent traffic

| Kind | How it reaches the product | Can it prove who it is today? |
| --- | --- | --- |
| Cloud-hosted agents | Run in the provider's data centre and browse on the user's behalf | Often yes: providers are starting to sign requests ([Web Bot Auth](https://guptadeepak.com/guides/glossary/web-bot-auth/)) |
| In-browser agents | An extension or desktop app drives the user's own browser (Claude in Chrome, Codex, OpenClaw and others, per [Switchfrog](https://switchfrog.com)) | No: same cookies, IP and device as the human, so only behaviour gives it away |
| Rogue automation | Scripts or headless browsers using shared or stolen credentials | No, and it has every reason to hide |

### Why existing tools miss it

- **Bot management** scores the request: IP reputation, device fingerprint, headless-browser signals. An in-browser agent has a clean residential IP, a real device and a real browser.
- **Authentication and SSO** confirm the account. The account is genuine; the hands on the keyboard are not.
- **Analytics** count sessions and events but cannot split human from agent activity on the same login.

Nobody answers the question that now matters: which agent is acting, for which person, and was it allowed to do this?

### Who feels it

| Team | Pain |
| --- | --- |
| Security | Agents exporting data, changing settings or taking destructive actions under a real login; no way to tell a trusted agent from a hijacked session |
| Product | No visibility into agent usage; flows break when agents misclick, and nobody knows which features agents depend on |
| Pricing and finance | Seats are priced for a human working a few hours a day; one agent on that login can run around the clock ([Switchfrog's illustration](https://switchfrog.com): 39 human hours versus 140 agent hours in a week) |
| Compliance | Audit logs record the user, not the agent that acted for them |

## Market timing and signals

The window is open now: agent traffic is growing double digits month over month, every incumbent shipped a first agent feature in the last 15 months, and the standards for site-side permission are not set. Expect the space to look crowded by late 2027.

### Demand signals

| Signal | Figure | Source |
| --- | --- | --- |
| Agentic traffic growth | +27% month over month, Aug 2026; Comet and the Claude Chrome extension the largest sources | [HUMAN Security](https://www.humansecurity.com/learn/blog/state-of-agentic-traffic-august-2026-agentic-traffic-grows-27-reaches-new-high-as-codex-debuts-strongly/) |
| AI-agent requests | 17.7 billion in Q2 2026, +45% on the quarter | [DataDome](https://datadome.co/agent-trust-management/ai-agent-detection/) |
| AI-enabled bot attacks | From 2 million to 25 million a day | [Thales / Imperva Bad Bot Report 2026](https://cpl.thalesgroup.com/blog/cybersecurity/thales-google-protect-ai-agent-ecosystem) |
| Automated share of HTML traffic | About 57.5% automated versus 42.5% human, the first crossover Cloudflare recorded (secondary report) | [Noqta, citing Cloudflare](https://noqta.tn/en/blog/agent-traffic-engineering-web-bot-auth-2026) |

### Recent moves (newest first)

| Date | Event |
| --- | --- |
| Sep 2026 | First Web Bot Auth draft adopted by the IETF working group ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/)) |
| Aug 2026 | Okta announces Agent SSO |
| Jul 2026 | AWS publishes guidance for verifying signed agents in WAF Bot Control |
| Jun 2026 | Akamai Agentic Security Framework; Chrome WebMCP origin trial; Fingerprint AI-assistant detection |
| May 2026 | Thales and Google announce agent protection for Google Cloud |
| Apr 2026 | Google donates AP2 to the FIDO Alliance; W3C Agent Identity Registry group formed |
| Feb 2026 | Vouched Agent Checkpoint; cside in-browser agent detection |
| Jan 2026 | Kasada AI Agent Trust; Sumsub AI Agent Verification |
| Oct 2025 | Visa Trusted Agent Protocol and Mastercard Agent Pay |
| Sep 2025 | Vouched $17M Series A for KYA |
| Aug 2025 | Cloudflare signed agents; OpenAI's ChatGPT agent signs requests |
| Jul 2025 | HUMAN AgenticTrust |

### Pressure from regulation

The EU AI Act requires operator identity in the logs of high-risk AI systems, and NIST lists agent identity management as a priority standards area ([Tiger Research](https://reports.tiger-research.com/p/2026-know-your-agent-eng)). Audit-ready agent records will matter to regulated SaaS buyers (finance, health, HR).

## Standards and protocols

The "passport" (who the agent is) is converging on one standard, Web Bot Auth, but the "visa" (what this site lets this agent do for this user) exists only for payments and API access. No standard covers an agent acting inside an ordinary logged-in web session, and none of the major in-browser agents identifies itself to websites today.

| Standard | What it covers | Status (Oct 2026) | What it leaves open |
| --- | --- | --- | --- |
| [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/) | Agents sign HTTP requests (RFC 9421); a header points to the operator's published keys | IETF working group chartered; first adopted draft dated 1 Sep 2026; registry draft still individual. Signers: [OpenAI ChatGPT agent](https://help.openai.com/en/articles/11845367), [Google-Agent](https://developers.google.com/crawling/docs/crawlers-fetchers/web-bot-auth) (partial, experimental), [Browserbase](https://docs.browserbase.com/platform/identity/overview) (beta), Goose, Anchor | Proves the operator, not the user or the permission. Assumes the operator holds keys, which does not fit agents on the user's own device |
| [WebMCP](https://webmachinelearning.github.io/webmcp/) | Pages register tools that browser agents call instead of clicking | W3C Community Group draft (2 Oct 2026), not standards track; Chrome [origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial) from June 2026, Edge trial; no Firefox or Safari commitment | The agent inherits the user's session, so the page cannot tell which agent is calling |
| [Visa Trusted Agent Protocol](https://corporate.visa.com/en/sites/visa-perspectives/newsroom/visa-unveils-trusted-agent-protocol-for-ai-commerce.html) | Web Bot Auth-style signatures plus consumer recognition and payment data for merchants | Launched Oct 2025 with 10+ partners | Visa-registered agents and commerce only |
| [Mastercard Agent Pay](https://www.mastercard.com/ge/en/news-and-trends/stories/2025/lady-gaga-dance-contest-abracadabra-fan-version/scaling-agentic-commerce-with-trust.html) | Registered agents, agentic payment tokens, signatures checked at the CDN | Rolled out to US cardholders late 2025; 2026 status unconfirmed | Payments only |
| [Google AP2](https://ap2-protocol.org) | Signed "mandates" recording what the user authorised an agent to buy | v0.2; donated to the FIDO Alliance in Apr 2026 | The closest thing to a visa, but payments only |
| [MCP authorization](https://modelcontextprotocol.io) and OAuth agent drafts | OAuth 2.1 for agents calling MCP servers; ID-JAG for enterprise cross-app access; an "on-behalf-of for AI agents" draft | MCP spec 2026-07-28 current; ID-JAG an OAuth WG draft; on-behalf-of draft expired | Scopes API calls, not clicks in a web UI; identifies the client app, not the agent run |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | On-chain registries for agent identity, reputation and validation | Draft, deployed on Ethereum mainnet | No link to HTTP requests or website users |
| Browser self-declaration | A header or client hint saying "an agent is driving" | No proposal found from Chrome, Edge, Atlas or Comet | Everything |

In-browser agents look like the user. Security vendors report that ChatGPT Atlas and Perplexity Comet present a plain Chrome user agent, and Claude in Chrome leaves only page-level traces, not a header. Only cloud-run agents sign today.

Sources disagree on WebMCP uptake. Switchfrog says OpenAI shipped WebMCP in ChatGPT's browser in August 2026, while a May 2026 review found no mainstream agent calling WebMCP tools yet. Treat agent-side WebMCP adoption as early.

### What is open for a new company

- **Identifying agents on the user's own device.** No standard or browser signal exists, so behavioural detection is the only option for now.
- **A general visa.** "Agent X may do Y for user Z on site S" has no standard outside payments and OAuth scopes.
- **Joining the registries up.** Signature Agent Cards, Visa, Mastercard and Cloudflare directories and ERC-8004 do not connect; who vouches for a new agent and how a key is revoked is undecided.
- **Intent.** A signature proves the operator, not that an action reflects the user's instruction rather than a prompt injection.

## Competitor deep dive: Switchfrog

Switchfrog is the most direct competitor: an a16z speedrun company that detects AI agents inside SaaS customers' logged-in sessions and sells the result as a billing opportunity. It catches agents after the fact; it does not let customers or sites grant agents permission.

|  | Switchfrog today |
| --- | --- |
| Positioning | "Logged-in no longer means human"; detect agents using your product, then allow, block or bill them ([site](https://switchfrog.com)) |
| Product 1: agent detection | One script tag; behavioural signals (input timing, pointer movement, navigation); per-session verdict Human, Agent or Unknown with a confidence score and named driver (for example Claude in Chrome); webhook and API |
| Product 2: WebMCP | Learns repeated workflows from real sessions and publishes them as WebMCP tools (for example `export_report`), off until the site enables them; updates tools as the UI changes ([WebMCP page](https://switchfrog.com/webmcp)) |
| Response options | Allow, block, flag the account, or bill as an agent seat; Switchfrog itself never blocks |
| Pricing | Not public; agent-seat billing being priced with beta customers |
| Stage | Early access sign-up; dashboards on the site are labelled illustrative; no named customers |
| Team | Two founders listed by first name only, Tommy and Niklas ([humans](https://switchfrog.com/humans)) |
| Backing | a16z speedrun ([listing](https://speedrun.a16z.com/companies/switchfrog)) |

### Strengths

- Clear, timely problem statement aimed at SaaS, a buyer the bot vendors largely ignore.
- Monetisation story (agent seats) gives pricing and finance teams a reason to buy, not only security.
- Detection and WebMCP fit together: see agent traffic, then offer agents a cheaper path.

### Weaknesses and openings

- **Adversarial only.** Detection is an arms race; agents can mimic human input, especially once detection costs their users money.
- **No identity or consent layer.** It cannot tell a customer-approved agent from an unapproved one on the same login, and has no way for the end user to grant or revoke access.
- **Ignores signed agents.** No mention of Web Bot Auth, Visa TAP or other signals that would make verification cheap and certain where available.
- **Billing framing may meet resistance.** Charging customers more for using an assistant can feel like a penalty; many SaaS companies want visibility and control first.
- **Per-site only.** No cross-site reputation, so every customer starts from zero.

## Bot management and edge vendors

Every major bot vendor shipped an "AI agent" feature between mid-2025 and mid-2026, but most of them verify agents that choose to sign their requests, and few catch an agent quietly driving a real customer's browser. Their buyers are security and fraud teams at commerce, ticketing and publishing companies, not SaaS product or pricing teams.

| Vendor | What it does for agents | Catches in-browser agents in logged-in sessions? | Main buyer | Launched |
| --- | --- | --- | --- | --- |
| [Cloudflare](https://blog.cloudflare.com/signed-agents/) | "Signed agents" category verified by Web Bot Auth; Enterprise rules can target signed agents as a group; pay-per-crawl for crawlers | Only agents that sign (ChatGPT agent, Browserbase and similar hosted agents) | Site operators, publishers | Aug 2025 |
| [Akamai](https://www.akamai.com/newsroom/press-release/akamai-unveils-agentic-security-framework-to-power-trusted-ai-driven-interactions-and-commerce) | Agentic Security Framework: agent identity via Visa TAP, Skyfire and Experian; Auth0 and Ping integrations; trust scoring and edge enforcement | Partly: checks agent actions against the logged-in user, but relies on agents identifying themselves | Large enterprise, commerce | Jun 2026 |
| [HUMAN Security](https://www.humansecurity.com/learn/blog/agentictrust-govern-ai-agents/) | AgenticTrust: classifies agents by behaviour and intent, admins set per-agent permissions and rate limits | Claimed yes (agentic browsers logging in, filling carts); method not disclosed | Security, fraud, product | Jul 2025 |
| [DataDome](https://datadome.co/agent-trust-management/ai-agent-detection/) | Agent Trust Management: a 0 to 100 trust score per agent across web, apps, APIs and MCP servers | Not stated | Retail, ticketing, travel, finance | 2026 |
| [Kasada](https://www.businesswire.com/news/home/20260121445905/en/Kasada-Launches-AI-Agent-Trust-to-Secure-Agentic-Commerce) | AI Agent Trust: known-agent directory, verification, edge policy, reporting | Not stated | Content owners, agentic commerce | Jan 2026 |
| [Fingerprint](https://docs.fingerprint.com/docs/ai-agents) | Labels Web Bot Auth agents signed, verified, unknown or spoofed; separate AI-assistant request detection | Not stated | Developers, fraud teams | Jun 2026 |
| [AWS WAF Bot Control](https://aws.amazon.com/blogs/security/authenticate-legitimate-ai-agent-traffic-with-aws-waf-bot-control) | Verifies Web Bot Auth signatures; verified agents allowed by default | Only signed agents | AWS customers | Nov 2025 |
| [Imperva / Thales](https://cpl.thalesgroup.com/blog/cybersecurity/thales-google-protect-ai-agent-ecosystem) | Human versus agent visibility, allow-lists for verified agents and agentic browsers, inspection of agent-to-LLM and MCP traffic | Unclear | Enterprise security | May 2026 |
| [Arcjet](https://docs.arcjet.com/bot-protection/concepts) | In-app SDK recognising 600+ bots by user agent, IP and reverse DNS | No | Developers | — |

Signals from these vendors' own data: HUMAN reports agentic traffic grew 27% month over month in August 2026, with Perplexity's Comet and the Claude Chrome extension the largest sources ([HUMAN](https://www.humansecurity.com/learn/blog/state-of-agentic-traffic-august-2026-agentic-traffic-grows-27-reaches-new-high-as-codex-debuts-strongly/)). DataDome counted 17.7 billion AI-agent requests in Q2 2026, up 45% on the quarter ([DataDome](https://datadome.co/agent-trust-management/ai-agent-detection/)).

### Direct competitors on in-browser detection

| Startup | Offer | Framing |
| --- | --- | --- |
| [Switchfrog](https://switchfrog.com) | Behavioural detection of agents taking over logged-in sessions; webhook verdict; WebMCP tools | Agent-seat billing for SaaS |
| [cside](https://securitybrief.asia/story/cside-unveils-toolkit-to-spot-ai-agents-in-browsers) | SDK detecting Comet, ChatGPT Atlas, Manus and others in consumer browsers; can add verification to risky actions | Fraud and terms enforcement for retail, travel, regulated industries |
| [Vouched Agent Shield](https://www.vouched.id/agentshield) | Free detection pixel labelling human, bot or agent; paid "Agent Bouncer" blocks, rate-limits or serves different content | Identity and access for finance, healthcare, automotive |
| [Snowplow](https://snowplow.io/videos/demo-detect-ai-browser-agents-in-real-time) | Demo of spotting the human-to-agent switch mid-session from mouse and scroll signals | Behavioural analytics for data teams; productisation unclear |

None of these vendors publishes accuracy or false-positive rates for in-browser agent detection, so claims cannot be compared.

## Agent identity, auth and KYA players

Identity companies have moved fast on agents, but almost all of them govern API, OAuth or MCP access, or payments at checkout. Vouched is the closest to a site-side visa for agents using a human's login; nobody yet offers scoped, revocable permission for a third-party agent clicking through a SaaS product's web UI.

| Company | Offer | Side served | Governs agents in a logged-in browser session? | Date / funding |
| --- | --- | --- | --- | --- |
| [Vouched](https://www.vouched.id/learn/vouched-raises-17m-series-a-to-scale-know-your-agent-and-bring-real-identity-to-ai-agents) | KYA; MCP-I identity extension; KnowThat.ai reputation directory; [Agent Checkpoint](https://www.businesswire.com/news/home/20260224311936/en/Vouched-Launches-Agent-Checkpoint-to-Establish-Trust-in-the-Age-of-AI-Agents) detects agents at login and adds delegated permissions, revocation and audit | Site | Closest overall; scope inside the session unclear | $17M Series A Sep 2025; Checkpoint Feb 2026 |
| [Persona](https://withpersona.com/solutions/know-your-agent/) | Tells agent from human, verifies the human behind it, sets agent scope at onboarding, re-verifies before risky actions | Site, enterprise | Partial | Undated |
| [Prove](https://finovate.com/proves-new-verified-agent-solution-brings-trust-and-verification-for-autonomous-agents/) | Verified Agent: signed credentials linking a verified person, intent and consent to an agent; publisher and relying-party registry | Payments, site | Partial | Oct 2025 |
| [Sumsub](https://www.helpnetsecurity.com/2026/01/29/sumsub-ai-agent-verification/) | Detects automation and binds it to a verified human with liveness re-checks | Site (fintech) | Detection and binding only | Jan 2026 |
| [Ping Identity](https://press.pingidentity.com/2025-11-06-Ping-Identity-Launches-Identity-for-AI-Solution-to-Power-Innovation-and-Trust-in-the-Agent-Economy) | Agent identity and access, MCP gateway, runtime agent detection in PingOne Protect | Enterprise, partly site | Detects; no per-user grant | GA Mar 2026 |
| [Okta / Auth0](https://auth0.com/blog/announcing-auth0-for-ai-agents-powering-the-future-of-ai-securely/) | Auth0 for AI Agents (token vault, async approval); Cross App Access for enterprise agent-to-app tokens; [Agent SSO](https://okta.com/newsroom/press-releases/okta-brings-first-class-identity-to-ai-agents-with-agent-sso/) | Agent builders, enterprise | No (API and MCP) | Agent SSO Aug 2026 |
| [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/whats-new-agent-id) | Agents as directory identities with Conditional Access and on-behalf-of flows | Enterprise | No | GA 2026 |
| [Stytch](https://stytch.com/connected-apps) (now [Twilio](https://www.twilio.com/en-us/blog/company/news/twilio-to-acquire-stytch)) | Connected Apps turns a SaaS app into an OAuth provider for agents and MCP clients | Site | No (API) | Acquired late 2025 |
| [Descope](https://www.descope.com/press-release/agentic-identity-hub) | Agentic Identity Hub: app as OAuth provider for agents, token vault, per-tool scopes | Site, agent builders | No (API) | 2.0 Jan 2026 |
| [WorkOS](https://workos.com/mcp) | AuthKit as OAuth server for MCP with tool-level scopes | MCP builders | No | — |
| [Skyfire](https://www.streetinsider.com/Business+Wire/Skyfire+Launches+Open+KYAPay+Protocol+With+Agent+Checkout/24981183.html) | KYAPay tokens combining verified agent identity and payment | Payments, site | At checkout | Jun 2025; backed by a16z CSX, Coinbase Ventures |
| [World AgentKit](https://hackernoon.com/lite/world-expands-agentkit-so-ai-agents-can-prove-a-unique-human-is-behind-them) | Delegates a World ID to an agent to prove a unique human is behind it | Agent, site | Proves a human; grants nothing | Expanded Jun 2026 |

### Early "passport" and "visa" projects

The naming is already in use, but only by very small projects: [AgentPassport](https://www.producthunt.com/products/agentpassport-identity-for-ai-agents/makers) (scoped passports with trust scores for APIs), [AgentVisa](https://hn.svelte.dev/item/44950254) (short-lived user-tied tokens, MVP), [Kite Passport](https://docs.avax.network/blog/kite-passport-technical-deep-dive) (on-chain user, agent and session keys) and a W3C [Agent Identity Registry](https://www.w3.org/community/agent-identity/2026/04/24/call-for-participation-in-agent-identity-registry-protocol-community-group/) community group (Apr 2026). None is funded at scale or aimed at SaaS web sessions. The name "passport" will not be distinctive on its own.

## Landscape map and white space

Three of the four corners are taken; the open one is permission for agents acting inside a user's own web session.

&#91;embedded content: agent landscape · what players answer × where the agent runs\]

Detection vendors see agents in the browser but grant nothing. Verification vendors prove the provider but not the user. Identity and payments companies grant scoped permission, but only for API calls and checkouts.

### What nobody owns yet

- **A grant tied to one user's session.** Signatures name the platform (ChatGPT, Browserbase), not the customer who sent the agent.
- **Scopes for clicks, not API calls.** No one lets a SaaS site say "this user's agent may read invoices but not change payroll" inside its own web UI.
- **Consent and revocation the user can see.** Vouched Agent Checkpoint is closest; no product offers a visa users can view and revoke across agent providers.
- **A neutral reputation network.** Existing registries are vendor-specific (Visa, Mastercard, Cloudflare, Vouched's KnowThat.ai) and do not connect.
- **Published accuracy.** No vendor reports false-positive rates for in-browser agent detection, so a credible benchmark would itself be a differentiator.

## Product definition

The product is border control for agents in logged-in products: it checks every agent's passport, lets the customer issue it a visa, and enforces that visa on each action. Detection (what Switchfrog does) becomes one input, not the whole product.

### The model

| Concept | Meaning | Who issues it | How it is checked |
| --- | --- | --- | --- |
| Passport | Who the agent is: provider, product, version, how sure we are | The agent's provider (signed request) or us (behavioural detection) | Web Bot Auth / Visa TAP signature where present; behavioural classification otherwise |
| Visa | What this agent may do for this user on this site, until when | The end user or their workspace admin, inside the customer's product | Looked up on every sensitive action |
| Border control | The decision on each action: allow, limit, ask the human, slow, reroute, bill or block | The customer's policy | Real-time decision call from the customer's app |
| Entry log | Record of every agent action tied to agent, visa and human | Automatic | Exportable audit trail |
| Travel history | An agent's behaviour across all sites on the network | The network | Feeds trust tiers (later) |

### Trust tiers

Every session gets one of four tiers, and policy is written against tiers and groups rather than single agents.

1. **Verified**: a cryptographic signature from a known provider (for example OpenAI's ChatGPT agent).
2. **Recognised**: no signature, but behaviour matches a known agent product (for example Claude in Chrome, Comet, Atlas).
3. **Unknown automation**: clearly automated, product unknown.
4. **Human**: no agent detected.

### Who uses it

| Person | What they need |
| --- | --- |
| SaaS security lead (buyer) | Stop unapproved agents touching sensitive actions; audit trail for compliance |
| SaaS product or growth lead (buyer) | See how agents use the product; give good agents a smooth path |
| Pricing or RevOps (buyer) | Measure agent usage and decide whether to charge for it |
| Workspace admin at the SaaS's customer | Set which agents their team may use and for what |
| End user | Approve their agent once, see what it did, revoke it |
| Agent provider | A predictable way to get trusted access instead of being blocked |

### Core capabilities

1. **Passport check.** Verify signed agents; detect and name unsigned in-browser agents; group them by provider, product and tier; flag the switch from human to agent mid-session.
2. **Visa issuance.** An in-product consent prompt the first time an agent is detected ("Claude wants to act on your account: read reports and export CSV for 30 days"); admin-issued visas for a whole workspace; default visas per plan.
3. **Scopes in product language.** Visas name actions people understand (view, export, edit, delete, pay, invite, change settings), not API scopes, so they work without MCP or an API.
4. **Border control.** A decision on each sensitive action: allow, allow read-only, ask the human to confirm in the page, rate-limit, offer a faster route (API or WebMCP tool), bill, or block. Default is observe-only, so nothing breaks on install.
5. **Visa management.** End users and admins see every agent with access, what it did, and revoke with one click; visas expire by default.
6. **Entry log.** Every agent action tagged with agent, tier, visa and the human behind it; exportable for audits.
7. **Agent insights.** Usage by provider, feature, account and time of day; which workflows agents rely on; where they fail.
8. **Fast lane.** Visa holders skip challenges and can use structured tools, giving agents a reason to identify themselves.
9. **Metering (optional).** Count agent actions or agent-hours per visa and pass them to billing.
10. **Network (later).** Shared provider directory, revocation of compromised agent keys across sites, and cross-site reputation.

### MVP versus later

| Capability | MVP | Later |
| --- | --- | --- |
| Passport check | Detect top in-browser agents; verify Web Bot Auth; four tiers | More signals (Visa TAP, World ID, provider attestations); accuracy benchmarks |
| Visa | User consent prompt; admin allow-list by provider and tier; expiry | Fine-grained scopes per workflow; visas carried across devices |
| Border control | Observe mode; allow, block, ask-the-human on a short list of sensitive actions | Full policy engine; reroute to tools; per-plan rules |
| Visibility | Agent sessions dashboard; entry log | Workflow analytics; SIEM and billing integrations |
| Network | — | Shared directory, revocation, reputation |

### Product principles

- **Observe first, enforce second.** Install should never break a customer's users.
- **The human stays in charge.** Users grant and revoke; the site sets the limits.
- **Use the standards, do not compete with them.** Accept every signature scheme agents already send.
- **Collect behaviour, not content.** Classify how a session is driven without reading what people type or see.
- **Neutral on business model.** Billing is an option, not the pitch.

## Business model and go-to-market

Start with mid-market B2B SaaS that holds sensitive data, lead with free visibility, and charge for control. The bot vendors sell to commerce and publishers through enterprise security contracts; B2B SaaS product teams are underserved.

### Beachhead customers

| Segment | Why they buy first |
| --- | --- |
| B2B SaaS with exportable or sensitive data (CRM, finance, HR, analytics) | Agents already export data and change records under real logins; security and compliance pressure |
| Seat-priced SaaS with heavy power users | Agent-hours on one seat break pricing assumptions |
| Regulated SaaS (fintech, health) | Need an audit record of who or what acted |

Later: commerce and marketplaces (overlaps with Visa TAP, Skyfire and bot vendors), and agent providers themselves.

### Pricing shape

| Tier | What it includes | Purpose |
| --- | --- | --- |
| Free | Agent detection and dashboard up to a session cap | Land on the shock value of "X% of your sessions are agents" |
| Growth | Visas, user consent prompts, border control on a set of actions, entry log | Core paid product, priced by monitored active users |
| Enterprise | Full policy engine, SSO, SIEM export, audit packs, SLAs | Security and compliance budget |
| Add-on | Agent metering into the customer's billing | Revenue share or usage fee for customers who charge for agents |

### Wedge and sequence

1. **Land with a free audit.** One tag, observe mode, a report of agent traffic by provider and the sensitive actions they took.
2. **Convert on control.** Turn on visas and ask-the-human for two or three sensitive actions.
3. **Expand on the network.** Once many sites run it, offer agent providers a single way to register and earn a trusted tier everywhere, which makes the product harder to replace.

### How it beats Switchfrog

|  | Switchfrog | This product |
| --- | --- | --- |
| Core question | Is an agent driving? | Which agent, for whom, with what permission? |
| End-user consent | None | Visa granted and revoked by the user |
| Signed agents | Not mentioned | Verified and placed in the top tier |
| Lead buyer | Pricing and finance | Security and product, with pricing as an add-on |
| Response | Allow, block, bill | Allow, limit, ask the human, reroute, bill, block |
| Moat | Detection model | Detection plus visas plus cross-site reputation |

## Risks and open questions

The biggest risk is that behavioural detection of in-browser agents proves unreliable, because visas for unsigned agents depend on it. Validate that before building anything else.

| Risk | Why it matters | How to test or reduce it |
| --- | --- | --- |
| Detection accuracy | Visas for unsigned agents only work if we reliably spot them; false positives annoy real users | Benchmark against Claude in Chrome, Comet, Atlas, Codex on a test app; measure false-positive rate on human sessions |
| Agents learn to look human | Once detection has consequences, agents may mimic input; the fast lane must be worth more than hiding | Make identifying cheaper than evading: fewer challenges and structured tools for visa holders |
| Browsers add a native signal | If Chrome or agents start declaring themselves, detection loses value | Position as the policy and visa layer that consumes any signal, not as a detector |
| Incumbents move in | Cloudflare, HUMAN, Okta or Vouched could add site-side visas | Win on SaaS-native consent and product-language scopes; build the cross-site network early |
| Customers do not want to restrict agents | Many SaaS teams want agent usage to grow | Lead with visibility and the fast lane; enforcement stays optional |
| Privacy and trust | A behavioural tag on every page raises data-protection questions | Collect behaviour only, publish what is collected, offer regional data handling |
| Category confusion | "Agent passport" names are already used by small projects | Choose a distinct brand; describe the product by the job it does |

### Questions to answer with customer interviews

- [ ] Which SaaS teams already see agent traffic, and who owns the problem: security, product or pricing?
- [ ] Would end users accept a consent prompt the first time their agent acts, or does it feel like friction?
- [ ] Which actions do customers consider sensitive enough to gate (export, delete, payments, invites)?
- [ ] Will SaaS companies charge for agent usage, or only want to see it?
- [ ] Would agent providers (Anthropic, OpenAI, Perplexity, Google) integrate with a visa network if it got their users through faster?
- [ ] How accurate is detection today for each major in-browser agent, and how fast does it decay?

## Sources

Vendor capabilities come from each vendor's own pages unless noted, and are claims rather than tested results.

**Switchfrog**

- [Switchfrog home](https://switchfrog.com) · [WebMCP](https://switchfrog.com/webmcp) · [Humans](https://switchfrog.com/humans) · [speedrun listing](https://speedrun.a16z.com/companies/switchfrog)

**Bot management and detection**

- [Cloudflare signed agents](https://blog.cloudflare.com/signed-agents/) · [Cloudflare agentic commerce](https://blog.cloudflare.com/secure-agentic-commerce)
- [Akamai Agentic Security Framework](https://www.akamai.com/newsroom/press-release/akamai-unveils-agentic-security-framework-to-power-trusted-ai-driven-interactions-and-commerce)
- [HUMAN AgenticTrust](https://www.humansecurity.com/learn/blog/agentictrust-govern-ai-agents/) · [HUMAN agentic traffic Aug 2026](https://www.humansecurity.com/learn/blog/state-of-agentic-traffic-august-2026-agentic-traffic-grows-27-reaches-new-high-as-codex-debuts-strongly/)
- [DataDome agent detection](https://datadome.co/agent-trust-management/ai-agent-detection/)
- [Kasada AI Agent Trust](https://www.businesswire.com/news/home/20260121445905/en/Kasada-Launches-AI-Agent-Trust-to-Secure-Agentic-Commerce)
- [Fingerprint AI agents docs](https://docs.fingerprint.com/docs/ai-agents)
- [Arcjet bot protection](https://docs.arcjet.com/bot-protection/concepts)
- [AWS WAF Bot Control and signed agents](https://aws.amazon.com/blogs/security/authenticate-legitimate-ai-agent-traffic-with-aws-waf-bot-control)
- [Thales and Google](https://cpl.thalesgroup.com/blog/cybersecurity/thales-google-protect-ai-agent-ecosystem) · [Imperva Bad Bot Report 2026](https://www.imperva.com/resources/resource-library/reports/2026-bad-bot-report/)
- [cside](https://securitybrief.asia/story/cside-unveils-toolkit-to-spot-ai-agents-in-browsers) · [Vouched Agent Shield](https://www.vouched.id/agentshield) · [Snowplow demo](https://snowplow.io/videos/demo-detect-ai-browser-agents-in-real-time)

**Identity, auth and KYA**

- [Vouched Series A](https://www.vouched.id/learn/vouched-raises-17m-series-a-to-scale-know-your-agent-and-bring-real-identity-to-ai-agents) · [Vouched Agent Checkpoint](https://www.businesswire.com/news/home/20260224311936/en/Vouched-Launches-Agent-Checkpoint-to-Establish-Trust-in-the-Age-of-AI-Agents)
- [Persona KYA](https://withpersona.com/solutions/know-your-agent/) · [Prove Verified Agent](https://finovate.com/proves-new-verified-agent-solution-brings-trust-and-verification-for-autonomous-agents/) · [Sumsub](https://www.helpnetsecurity.com/2026/01/29/sumsub-ai-agent-verification/)
- [Ping Identity for AI](https://press.pingidentity.com/2025-11-06-Ping-Identity-Launches-Identity-for-AI-Solution-to-Power-Innovation-and-Trust-in-the-Agent-Economy)
- [Auth0 for AI Agents](https://auth0.com/blog/announcing-auth0-for-ai-agents-powering-the-future-of-ai-securely/) · [Okta Agent SSO](https://okta.com/newsroom/press-releases/okta-brings-first-class-identity-to-ai-agents-with-agent-sso/)
- [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/whats-new-agent-id)
- [Stytch Connected Apps](https://stytch.com/connected-apps) · [Twilio to acquire Stytch](https://www.twilio.com/en-us/blog/company/news/twilio-to-acquire-stytch)
- [Descope Agentic Identity Hub](https://www.descope.com/press-release/agentic-identity-hub) · [WorkOS MCP](https://workos.com/mcp)
- [Skyfire KYAPay](https://www.streetinsider.com/Business+Wire/Skyfire+Launches+Open+KYAPay+Protocol+With+Agent+Checkout/24981183.html) · [World AgentKit](https://hackernoon.com/lite/world-expands-agentkit-so-ai-agents-can-prove-a-unique-human-is-behind-them)
- [AgentPassport](https://www.producthunt.com/products/agentpassport-identity-for-ai-agents/makers) · [AgentVisa](https://hn.svelte.dev/item/44950254) · [Kite Passport](https://docs.avax.network/blog/kite-passport-technical-deep-dive) · [W3C Agent Identity Registry group](https://www.w3.org/community/agent-identity/2026/04/24/call-for-participation-in-agent-identity-registry-protocol-community-group/)

**Standards**

- [Web Bot Auth protocol draft](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/) · [OpenAI ChatGPT agent signing](https://help.openai.com/en/articles/11845367) · [Google Web Bot Auth](https://developers.google.com/crawling/docs/crawlers-fetchers/web-bot-auth) · [Browserbase identity](https://docs.browserbase.com/platform/identity/overview)
- [WebMCP draft](https://webmachinelearning.github.io/webmcp/) · [Chrome WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial)
- [Visa Trusted Agent Protocol](https://corporate.visa.com/en/sites/visa-perspectives/newsroom/visa-unveils-trusted-agent-protocol-for-ai-commerce.html) · [Mastercard Agent Pay](https://www.mastercard.com/ge/en/news-and-trends/stories/2025/lady-gaga-dance-contest-abracadabra-fan-version/scaling-agentic-commerce-with-trust.html)
- [AP2](https://ap2-protocol.org) · [Model Context Protocol](https://modelcontextprotocol.io) · [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)

**Market**

- [Noqta on Web Bot Auth and traffic share](https://noqta.tn/en/blog/agent-traffic-engineering-web-bot-auth-2026) · [Tiger Research: Know Your Agent 2026](https://reports.tiger-research.com/p/2026-know-your-agent-eng)
