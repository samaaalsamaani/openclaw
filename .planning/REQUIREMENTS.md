# Requirements: OpenClaw — Consumer Foundation

**Defined:** 2026-03-02
**Milestone:** v4.0
**Core Value:** The AI OS for Communication — persistent intelligence present inside every messaging platform users already use, that knows them across channels, acts proactively, and compounds in value the longer it runs.
**Source:** `docs/plans/2026-03-02-platform-vision.md`

---

## v4.0 Requirements (Horizon 1 — Consumer Foundation)

### Platform Foundations

- [ ] **FOUND-01**: `fetchWithSsrFGuard()` used in all files that make outbound requests — no direct `fetch()` bypasses (currently 9+ files)
- [x] **FOUND-02**: `better-sqlite3` moved from `devDependencies` to `dependencies` in production packages
- [x] **FOUND-03**: All 28 extensions use `peerDependencies`/`devDependencies` for `openclaw` — no `workspace:*` in `dependencies`
- [ ] **FOUND-04**: `resolveEffectiveHomeDir()` used everywhere instead of `process.env.HOME` (20+ sites)
- [ ] **FOUND-05**: SSRF guard test coverage confirms bypass is closed across all affected files

### Cross-Channel Memory

- [x] **MEM-01**: Session files from all connected channels feed a shared cross-channel memory index
- [x] **MEM-02**: When a user asks a question on any channel, the agent retrieves relevant context from all channels (not just the current one)
- [ ] **MEM-03**: Replies include a visible signal when the AI is drawing on cross-channel history (e.g. "Based on your Slack conversation last week…")
- [x] **MEM-04**: Cross-channel context injection works without degrading response latency by more than 500ms
- [x] **MEM-05**: Memory index stays consistent when channels are added or removed

### Connect Everything Onboarding

- [ ] **ONBD-01**: New user can connect their first channel in under 3 minutes via a guided flow
- [ ] **ONBD-02**: After each channel connection, user sees a value message explaining what their AI can now do that it couldn't before
- [ ] **ONBD-03**: Onboarding flow tracks and displays "channels connected" as the primary activation metric
- [ ] **ONBD-04**: User can reach the channel connection wizard from the macOS app, iOS app, and web control panel
- [ ] **ONBD-05**: Onboarding completion (≥3 channels connected) is tracked as an event in the observability system

### Proactive AI

- [ ] **PRO-01**: Users can configure one or more scheduled intelligence jobs (what to run, when, to which channel)
- [ ] **PRO-02**: Daily digest job runs on schedule and delivers a summary of cross-channel activity to the user's preferred channel
- [ ] **PRO-03**: Daily digest includes: open loops from yesterday, key conversations, anything flagged for follow-up
- [ ] **PRO-04**: User can configure digest delivery time and target channel from a preference UI
- [ ] **PRO-05**: Proactive jobs survive gateway restarts (persisted configuration, not in-memory)

### Consumer Billing

- [ ] **BILL-01**: Stripe integration handles subscription creation, upgrades, downgrades, and cancellations
- [ ] **BILL-02**: Three tiers implemented: Free (1 channel, BYOK, 7-day memory), Personal ($12–15/mo), Power ($25–30/mo)
- [ ] **BILL-03**: Free tier enforces channel and memory limits; paid tiers have defined entitlements
- [ ] **BILL-04**: Billing portal lets users view their plan, payment history, and manage their subscription
- [ ] **BILL-05**: Subscription state is checked at gateway startup and on each request — tier limits enforced at runtime
- [ ] **BILL-06**: Stripe webhooks update subscription state reliably (payment failure, renewal, cancellation)

### macOS App Polish

- [ ] **APP-01**: Channel connection setup flow is self-explanatory without documentation
- [ ] **APP-02**: Menubar icon shows clear status: connected / partial / degraded / offline
- [ ] **APP-03**: Quick-message UI lets user send a message to their AI in ≤2 clicks from the menubar
- [ ] **APP-04**: macOS notifications are delivered for proactive AI messages and important alerts
- [ ] **APP-05**: Channel health view shows all connected channels and their current status in one glance
- [ ] **APP-06**: App launches at login by default and maintains gateway connection reliably

### Developer Platform Groundwork

- [ ] **DEV-01**: Plugin SDK published to npm as a standalone versioned package with semver
- [ ] **DEV-02**: Developer documentation site covers: quickstart, ChannelPlugin interface, hooks API, publishing guide
- [ ] **DEV-03**: Plugin submission flow exists (developer can submit a plugin for review via a defined process)
- [ ] **DEV-04**: Gateway web control panel shows an initial marketplace UI with 5+ featured plugins
- [ ] **DEV-05**: Developer-facing analytics show install count and active user count per plugin

---

## v5.0 Requirements (Horizon 2 — Developer Platform)

Deferred. Tracked but not in current roadmap.

### Marketplace

- **MKT-01**: Plugin marketplace with full category browsing, install/uninstall, and plugin ratings
- **MKT-02**: Stripe Connect integration for developer revenue sharing (80/20 split on paid plugins)
- **MKT-03**: Plugin certification and security review program

### Team Features

- **TEAM-01**: Shared agents scoped to a team with team-level memory
- **TEAM-02**: Shared channel connections (one Slack workspace for a whole team)
- **TEAM-03**: Team admin dashboard with per-user permission controls
- **TEAM-04**: Per-seat team billing with admin-managed subscriptions

### Public API

- **API-01**: OpenAI-compatible HTTP API endpoint documented and publicly available
- **API-02**: API key management UI in gateway web control panel
- **API-03**: Usage-based API pricing tier

---

## Out of Scope (v4.0)

| Feature                             | Reason                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| Multi-tenant gateway                | v5.0 / Enterprise track — requires significant architecture change |
| Enterprise SSO (SAML/OIDC)          | v5.0+ — complexity not justified until team features land          |
| On-premises / air-gapped deployment | Already partially works; full story is Horizon 3                   |
| White-label distribution            | Horizon 3 enterprise track                                         |
| Compliance / audit layer            | Horizon 3 — requires legal and compliance investment               |
| Android app improvements            | iOS/macOS first — power users are on Apple platforms               |
| New messaging channel adapters      | 24+ already sufficient for Horizon 1                               |
| Rewriting gateway internals         | We integrate, not rewrite                                          |
| Local LLM UX improvements           | Ollama already works; polish is not Horizon 1 priority             |

---

## Traceability

| Requirement | Phase    | Status   |
| ----------- | -------- | -------- |
| FOUND-01    | Phase 22 | Pending  |
| FOUND-02    | Phase 22 | Complete |
| FOUND-03    | Phase 22 | Complete |
| FOUND-04    | Phase 22 | Pending  |
| FOUND-05    | Phase 22 | Pending  |
| MEM-01      | Phase 23 | Complete |
| MEM-02      | Phase 23 | Complete |
| MEM-03      | Phase 23 | Pending  |
| MEM-04      | Phase 23 | Complete |
| MEM-05      | Phase 23 | Complete |
| ONBD-01     | Phase 24 | Pending  |
| ONBD-02     | Phase 24 | Pending  |
| ONBD-03     | Phase 24 | Pending  |
| ONBD-04     | Phase 24 | Pending  |
| ONBD-05     | Phase 24 | Pending  |
| PRO-01      | Phase 25 | Pending  |
| PRO-02      | Phase 25 | Pending  |
| PRO-03      | Phase 25 | Pending  |
| PRO-04      | Phase 25 | Pending  |
| PRO-05      | Phase 25 | Pending  |
| BILL-01     | Phase 26 | Pending  |
| BILL-02     | Phase 26 | Pending  |
| BILL-03     | Phase 26 | Pending  |
| BILL-04     | Phase 26 | Pending  |
| BILL-05     | Phase 26 | Pending  |
| BILL-06     | Phase 26 | Pending  |
| APP-01      | Phase 27 | Pending  |
| APP-02      | Phase 27 | Pending  |
| APP-03      | Phase 27 | Pending  |
| APP-04      | Phase 27 | Pending  |
| APP-05      | Phase 27 | Pending  |
| APP-06      | Phase 27 | Pending  |
| DEV-01      | Phase 28 | Pending  |
| DEV-02      | Phase 28 | Pending  |
| DEV-03      | Phase 28 | Pending  |
| DEV-04      | Phase 28 | Pending  |
| DEV-05      | Phase 28 | Pending  |

**Coverage:**

- v4.0 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-02_
_Source: docs/plans/2026-03-02-platform-vision.md — 7 Priority Bets_
