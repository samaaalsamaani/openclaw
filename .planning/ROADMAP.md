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

## Progress

| Phase | Milestone | Plans | Status   | Completed  |
| ----- | --------- | ----- | -------- | ---------- |
| 1–9   | v1.0      | 29/29 | Complete | 2026-02-22 |
| 10–15 | v2.0      | 17/17 | Complete | 2026-02-22 |
| 16–19 | v3.0      | 13/13 | Complete | 2026-02-28 |
| 20    | v3.0      | 0/3   | Deferred | —          |
| 21    | v3.0      | ~2/3  | Partial  | 2026-03-01 |
| 22    | v4.0      | TBD   | Pending  | —          |
| 23    | v4.0      | TBD   | Pending  | —          |
| 24    | v4.0      | TBD   | Pending  | —          |
| 25    | v4.0      | TBD   | Pending  | —          |
| 26    | v4.0      | TBD   | Pending  | —          |
| 27    | v4.0      | TBD   | Pending  | —          |
| 28    | v4.0      | TBD   | Pending  | —          |
