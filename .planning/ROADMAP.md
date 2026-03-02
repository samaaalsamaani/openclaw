# Roadmap: PAIOS — Personal AI Operating System

## Milestones

- ✅ **v1.0 The Mesh** — Phases 1-9 (shipped 2026-02-22)
- ✅ **v2.0 Observability & Automation** — Phases 10-15 (shipped 2026-02-22)
- ✅ **v3.0 System Reliability & Hardening** — Phases 16-21 (shipped 2026-03-01)
- 🚀 **v4.0 Consumer Foundation** — Phases 22-28 (planning)

## Archived Milestones

<details>
<summary>✅ v1.0 The Mesh (Phases 1-9) — SHIPPED 2026-02-22</summary>

- [x] Phase 1: MCP Mesh Foundation — 5 plans
- [x] Phase 2: Heartbeat & KB Seeding — 2 plans
- [x] Phase 3: Agent SDK Integration — 5 plans
- [x] Phase 4: Claude Code Native Skills — 4 plans
- [x] Phase 5: Hooks & Auto-Ingestion — 3 plans
- [x] Phase 6: Task Router — 3 plans
- [x] Phase 7: Content Automation Pipeline — 3 plans
- [x] Phase 8: Cross-Session Knowledge — 2 plans
- [x] Phase 9: Dual-Brain Code Review — 2 plans

See: `.planning/milestones/v3.0-ROADMAP.md` for full phase details

</details>

<details>
<summary>✅ v2.0 Observability & Automation (Phases 10-15) — SHIPPED 2026-02-22</summary>

- [x] Phase 10: Observability Foundation — 3 plans
- [x] Phase 11: File Automation — 3 plans
- [x] Phase 12: Progressive Autonomy — 3 plans
- [x] Phase 13: Unified CLI — 2 plans
- [x] Phase 14: Agent Teams — 3 plans
- [x] Phase 15: Dashboard & Self-Reflection — 2 plans

See: `.planning/milestones/v3.0-ROADMAP.md` for full phase details

</details>

<details>
<summary>✅ v3.0 System Reliability & Hardening (Phases 16-21) — SHIPPED 2026-03-01</summary>

- [x] Phase 16: Service Hardening — 4 plans (completed 2026-02-27)
- [x] Phase 17: Integration Reliability — 3 plans (completed 2026-02-27)
- [x] Phase 18: Data Integrity & Config Safety — 3 plans (completed 2026-02-27)
- [x] Phase 19: Monitoring & Alerting — 3 plans (completed 2026-02-28)
- [~] Phase 20: Recovery & Runbooks — 0/3 plans (accepted tech debt)
- [~] Phase 21: Change Management — 2/3 tasks ad-hoc (CHANGE-01–03 done; 04–07 deferred)

See: `.planning/milestones/v3.0-ROADMAP.md` for full phase details

</details>

## v4.0 — Consumer Foundation

**Goal:** Make OpenClaw compelling enough for individual users to pay for it and tell others about it. Close the gap between platform capability and user-visible value. Ship the commercial infrastructure that funds everything that follows.

**Source:** `docs/plans/2026-03-02-platform-vision.md` — 7 Priority Bets

- [ ] **Phase 22: platform-foundations** — Close SSRF gaps, move better-sqlite3 to production deps, fix 28 extensions with workspace:\* in dependencies, replace process.env.HOME with resolveEffectiveHomeDir() across 20+ sites. Security and reliability pre-conditions before any growth investment.
- [ ] **Phase 23: cross-channel-memory** — Activate the memory system across all connected channels. Cross-channel session indexing, context injection regardless of channel origin, visible signal in replies when AI draws on cross-channel history. The single capability that makes our value proposition unique and legible.
- [ ] **Phase 24: connect-everything-onboarding** — Guided multi-step flow that gets a new user connected to their 5 most-used platforms in under 10 minutes. Real-time value messaging after each connection. Activation metric: channels-connected-in-first-session.
- [ ] **Phase 25: proactive-ai** — Scheduled intelligence job system. Daily digest as the first job: summarizes cross-channel activity, surfaces open loops, delivers to preferred channel on schedule. Builds daily habit formation. Infrastructure already exists (cron, memory, channel senders).
- [ ] **Phase 26: consumer-billing** — Stripe integration, 3-tier model (Free / Personal $12-15/mo / Power $25-30/mo), billing portal, subscription management, tier enforcement at runtime. Monetization infrastructure and value signal.
- [ ] **Phase 27: macos-app-polish** — Connection setup flow, status indicators, quick-message UI, notification handling, channel health view. The highest-visibility surface for word-of-mouth among power users who generate tech community spread.
- [ ] **Phase 28: developer-platform-groundwork** — Plugin SDK on npm with versioning, developer documentation site, plugin submission flow, initial marketplace UI in web control panel. Lays the Horizon 2 flywheel foundation while building in Horizon 1.

## Phase Details

### Phase 22: platform-foundations

**Goal**: Close all known security and reliability gaps before any growth investment — SSRF exposure fixed in 9+ files, `better-sqlite3` in production deps, 28 extensions with correct dependency declarations, and `resolveEffectiveHomeDir()` used everywhere `process.env.HOME` was hardcoded.
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05
**Plans:** 1/3 plans executed
**Success Criteria** (what must be TRUE):

1. Every file that makes outbound HTTP requests uses `fetchWithSsrFGuard()` — no unguarded `fetch()` calls on user-controlled URLs remain in src/
2. `better-sqlite3` appears in `dependencies` (not `devDependencies`) in all production packages that use it
3. All 28 affected extensions have `openclaw` in `peerDependencies` or `devDependencies`, not in `dependencies` with `workspace:*`
4. `process.env.HOME` replaced with `resolveEffectiveHomeDir()` across all 20+ sites in src/
5. Existing test suite passes with no regressions after all changes

Plans:

- [ ] 22-01-PLAN.md — Fix SSRF gaps: replace direct fetch() with fetchWithSsrFGuard() in all affected files, add per-module guard call tests
- [ ] 22-02-PLAN.md — Fix dependency declarations: verify better-sqlite3 in prod deps, add peerDependencies to 26 extensions
- [ ] 22-03-PLAN.md — Fix home dir resolution: replace process.env.HOME with resolveRequiredHomeDir() across all 31 sites

---

### Phase 23: cross-channel-memory

**Goal**: Activate the memory system across all connected channels — session files from every channel feed a shared index, the agent retrieves context regardless of which channel it originated from, and replies show a visible signal when drawing on cross-channel history.
**Depends on**: Phase 22
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05
**Success Criteria** (what must be TRUE):

1. A question asked on Slack retrieves relevant context from a Telegram session from the prior week (cross-channel retrieval demonstrated end-to-end)
2. Context injection adds no more than 500ms to median response latency
3. The agent's reply includes an attribution signal when cross-channel context is used
4. Adding or removing a channel from config causes the memory index to update without manual intervention
5. Existing per-channel memory behavior is unchanged for users with only one channel connected

Plans:

- [ ] 23-01: Cross-channel session indexing — all channel sessions feed unified memory store
- [ ] 23-02: Cross-channel context injection — agent retrieves context regardless of origin channel
- [ ] 23-03: Reply attribution signal — visible indicator when AI draws on cross-channel history

---

### Phase 24: connect-everything-onboarding

**Goal**: A new user can connect their first channel in under 3 minutes via a guided flow; the flow shows value messaging after each connection; channels-connected-in-first-session is tracked as an activation metric.
**Depends on**: Phase 23
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05
**Success Criteria** (what must be TRUE):

1. A first-time user can complete channel setup in under 3 minutes with no documentation
2. After each channel connection, a message appears explaining what the AI can now do that it couldn't before
3. The onboarding flow is accessible from macOS app, iOS app, and web control panel
4. channels-connected-in-first-session is emitted as an observability event for each new user session
5. The flow handles auth failures and partial connections gracefully

Plans:

- [ ] 24-01: Channel connection wizard — guided multi-step setup flow
- [ ] 24-02: Value messaging layer — per-connection context messages showing capability delta
- [ ] 24-03: Activation metric tracking — channels-connected event in observability system

---

### Phase 25: proactive-ai

**Goal**: Users can configure scheduled intelligence jobs that run on the gateway and deliver results to their preferred channel; daily digest is the first job implemented and survives gateway restarts.
**Depends on**: Phase 23
**Requirements**: PRO-01, PRO-02, PRO-03, PRO-04, PRO-05
**Success Criteria** (what must be TRUE):

1. A user can configure a daily digest job (delivery time + target channel) from a preference UI
2. The digest runs on schedule and delivers a message summarizing cross-channel activity, open loops, and follow-ups
3. Proactive job configuration survives a gateway restart (persisted, not in-memory)
4. A user can add a second scheduled job type using the same infrastructure
5. Job failures are logged and surfaced to the user (no silent failures)

Plans:

- [ ] 25-01: Scheduled intelligence job system — configuration, persistence, scheduler integration
- [ ] 25-02: Daily digest job — cross-channel activity summary delivered to preferred channel
- [ ] 25-03: Proactive AI preferences UI — configure jobs from macOS app and web control panel

---

### Phase 26: consumer-billing

**Goal**: Stripe integration handles the full subscription lifecycle; three tiers are implemented with defined entitlements; tier limits are enforced at runtime; billing portal is self-serve.
**Depends on**: Phase 22
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Success Criteria** (what must be TRUE):

1. A user can subscribe to Personal or Power tier via Stripe Checkout and immediately receive the entitlements for that tier
2. Free tier users are blocked from connecting more than 1 channel and have 7-day memory limit enforced at runtime
3. Stripe webhooks update subscription state reliably — payment failure downgrades the user, renewal extends access
4. A billing portal lets users view their plan, payment history, and cancel their subscription
5. Subscription state is checked at gateway startup and enforced on each relevant request

Plans:

- [ ] 26-01: Stripe integration — checkout, webhooks, subscription state persistence
- [ ] 26-02: Tier entitlement enforcement — channel limits, memory limits, feature gates at runtime
- [ ] 26-03: Billing portal — plan management, payment history, upgrade/downgrade/cancel

---

### Phase 27: macos-app-polish

**Goal**: The macOS menubar app is self-explanatory, fast, and reliable — connection setup requires no documentation, status is always legible, quick-message UI works in 2 clicks, proactive notifications delivered.
**Depends on**: Phase 22, Phase 23
**Requirements**: APP-01, APP-02, APP-03, APP-04, APP-05, APP-06
**Success Criteria** (what must be TRUE):

1. A first-time user can connect a channel without reading documentation
2. The menubar icon unambiguously communicates connected / partial / degraded / offline state
3. A user can send a message to their AI within 2 clicks from the menubar
4. macOS notifications are delivered for proactive AI messages and alert conditions
5. The channel health view shows all connected channels and their status in a single view
6. The app launches at login by default and maintains gateway connection without manual restart

Plans:

- [ ] 27-01: Connection setup flow polish — self-guided channel setup with no documentation required
- [ ] 27-02: Status indicators and quick-message UI — menubar icon states, 2-click message entry
- [ ] 27-03: Notifications and channel health view — proactive delivery, per-channel status panel

---

### Phase 28: developer-platform-groundwork

**Goal**: The plugin SDK is on npm as a standalone versioned package; a documentation site covers quickstart through publishing; a plugin submission flow exists; the web control panel shows an initial marketplace UI with 5+ featured plugins.
**Depends on**: Phase 22
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05
**Success Criteria** (what must be TRUE):

1. `npm install @openclaw/plugin-sdk` installs a versioned, documented SDK that a developer can use to build a channel plugin
2. A documentation site covers: quickstart, ChannelPlugin interface, hooks API, and publishing guide
3. A developer can submit a plugin for review via a defined process (form, API, or CLI)
4. The gateway web control panel shows a marketplace section with at least 5 featured plugins installable from the UI
5. Plugin install count and active user count are visible to the plugin developer in a basic analytics view

Plans:

- [ ] 28-01: Plugin SDK package — extract, version, document, and publish to npm
- [ ] 28-02: Developer documentation site — quickstart, API reference, publishing guide
- [ ] 28-03: Plugin marketplace UI — web control panel section with featured plugins and install flow

---

## Progress

| Phase | Milestone | Plans       | Status   | Completed  |
| ----- | --------- | ----------- | -------- | ---------- |
| 1–9   | v1.0      | 29/29       | Complete | 2026-02-22 |
| 10–15 | v2.0      | 17/17       | Complete | 2026-02-22 |
| 16–19 | v3.0      | 13/13       | Complete | 2026-02-28 |
| 20    | v3.0      | 0/3         | Deferred | —          |
| 21    | v3.0      | ~2/3        | Partial  | 2026-03-01 |
| 22    | 1/3       | In Progress |          | —          |
| 23    | v4.0      | TBD         | Pending  | —          |
| 24    | v4.0      | TBD         | Pending  | —          |
| 25    | v4.0      | TBD         | Pending  | —          |
| 26    | v4.0      | TBD         | Pending  | —          |
| 27    | v4.0      | TBD         | Pending  | —          |
| 28    | v4.0      | TBD         | Pending  | —          |
