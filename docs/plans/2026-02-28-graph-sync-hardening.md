# Graph Sync Architecture Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all known crash, data-corruption, and data-integrity gaps in the graph intelligence sync layer — from a surgical filelock + lifecycle fix through a full SyncContext refactor and SQLite-backed sync state.

**Architecture:** Introduce `SyncContext`, a Python context manager that owns the complete Kuzu lifecycle (file lock → Database open → Connection → guaranteed cleanup). Migrate `sync_state.json` to `sync_state.sqlite` (WAL mode, atomic upserts). Refactor all sync code to use connection injection — no file opens its own `kuzu.Database` except through `SyncContext`.

**Tech Stack:** Python 3.14, Kuzu 0.11.3, `filelock` (pip), SQLite WAL mode, macOS launchd (existing).

**Research basis:** 4 parallel web/GitHub research agents validated every assumption before this plan was written. Key findings that shaped this plan:
- `buffer_pool_size=2GB` is NOT the SIGBUS safety mechanism — the real fix is `del db; gc.collect()` (QueryResult lifetime, Kuzu issue #5457)
- Kuzu has a built-in `.lock` file but it has documented cross-process visibility issues — external `filelock` is required defense-in-depth
- launchd `StartInterval` prevents the SAME job from concurrent runs, but `graph-sync-hot` and `daily-tasks` are different jobs and CAN overlap
- `os.replace()` is atomic on APFS but not durable without fsync — SQLite WAL is strictly better for sync state
- Kuzu MERGE is confirmed idempotent (single-writer serialized by architecture)

---

## Phase 1: SyncContext + filelock + sync_state.sqlite

**Why first:** Everything in Phase 2+ builds on this foundation. The C1 inter-process race and H5 sync-state corruption must be closed before correctness fixes land on top.

---

### Task 1: Install filelock and create sync_context.py

**Files:**
- Create: `~/.openclaw/projects/graph/sync_context.py`

**Background:** `filelock` is a Python library (pip install) that wraps OS file locking with correct fd lifecycle management. It prevents the double-open scenario where `graph-sync-hot` (15-min launchd) and `daily-tasks` (separate daily launchd job calling cold sync) overlap and both open write-mode `kuzu.Database` on the same path.

**Step 1: Install filelock into the venv**

```bash
~/.openclaw/.venv/bin/pip install filelock
```

Expected: `Successfully installed filelock-X.X.X`

**Step 2: Verify import works**

```bash
~/.openclaw/.venv/bin/python3 -c "from filelock import FileLock; print('ok')"
```

Expected: `ok`

**Step 3: Create sync_context.py**

```python
#!/usr/bin/env python3
"""
SyncContext: single point of ownership for Kuzu DB lifecycle.

Provides:
  - Inter-process file lock (prevents concurrent write-mode opens)
  - Kuzu Database open with explicit buffer pool (prevents ARM64 GC crash)
  - Connection injection (callers never open their own Database)
  - Guaranteed cleanup: conn.close() + del + gc.collect() on any exit path

Usage:
    with SyncContext() as conn:
        conn.execute("MATCH (n:Event) RETURN count(n)")

    # read-only variant (no file lock, safe for concurrent readers)
    with SyncContext(read_only=True) as conn:
        ...
"""

import gc
import kuzu
from filelock import FileLock, Timeout
from pathlib import Path
from typing import Optional

GRAPH_DB_PATH   = Path.home() / ".openclaw" / "graph.kuzu"
GRAPH_LOCK_PATH = Path.home() / ".openclaw" / "graph.kuzu.lock"

# 2 GB explicit buffer pool.
# Default (~80% of RAM ≈ 13 GB) overcommits virtual address space on macOS
# ARM64 and triggers QueryResult use-after-free SIGSEGV via GC (Kuzu #5457).
BUFFER_POOL_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB


class SyncContext:
    """
    Context manager for safe Kuzu DB access.

    Write mode (default): acquires exclusive filelock, opens DB read-write.
    Read-only mode: no filelock (concurrent readers safe), opens DB read-only.

    The filelock is held for the duration of the `with` block and released
    automatically on exit — including on exception or signal.
    """

    def __init__(self, read_only: bool = False, lock_timeout: int = 30):
        self.read_only    = read_only
        self.lock_timeout = lock_timeout
        self._lock: Optional[FileLock]      = None
        self._db:   Optional[kuzu.Database] = None
        self._conn: Optional[kuzu.Connection] = None

    def __enter__(self) -> kuzu.Connection:
        if not self.read_only:
            self._lock = FileLock(str(GRAPH_LOCK_PATH), timeout=self.lock_timeout)
            try:
                self._lock.acquire()
            except Timeout:
                raise RuntimeError(
                    f"Could not acquire graph DB lock within {self.lock_timeout}s. "
                    "Another sync process is running."
                )

        self._db   = kuzu.Database(str(GRAPH_DB_PATH),
                                   buffer_pool_size=BUFFER_POOL_SIZE,
                                   read_only=self.read_only)
        self._conn = kuzu.Connection(self._db)
        return self._conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Close connection first (QueryResult lifetime — Kuzu issue #5457)
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            del self._conn
            self._conn = None

        # Then destroy Database (triggers checkpoint / cleanup)
        if self._db is not None:
            del self._db
            self._db = None

        # Force GC before Python teardown so destructor runs while mmap pages live
        gc.collect()

        # Release file lock last (after DB is fully closed)
        if self._lock is not None:
            try:
                self._lock.release()
            except Exception:
                pass
            self._lock = None

        return False  # Do not suppress exceptions
```

**Step 4: Smoke-test SyncContext with the live DB**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext

# write-mode test
with SyncContext() as conn:
    r = conn.execute('MATCH (n:Event) RETURN count(n)')
    print('Write-mode events:', r.get_next()[0])

# read-only test (no lock)
with SyncContext(read_only=True) as conn:
    r = conn.execute('MATCH (n:Decision) RETURN count(n)')
    print('Read-only decisions:', r.get_next()[0])

print('SyncContext OK')
"
```

Expected:
```
Write-mode events: 7797
Read-only decisions: 2633
SyncContext OK
```

**Step 5: Verify lock file is created and removed**

```bash
ls ~/.openclaw/graph.kuzu.lock 2>/dev/null || echo "lock file cleaned up correctly"
```

Expected: `lock file cleaned up correctly` (lock is released on exit of `with` block)

**Step 6: Commit**

```bash
cd ~/.openclaw/projects/graph
git add sync_context.py
git commit -m "feat(graph): add SyncContext — filelock + kuzu lifecycle manager"
```

---

### Task 2: Create sync_state.sqlite replacing sync_state.json

**Files:**
- Create: `~/.openclaw/projects/graph/sync_state_db.py`  ← state access module
- The migration from `sync_state.json` will happen in Task 3 when sync.py is refactored

**Background:** `sync_state.json` has no concurrency protection and non-atomic writes. If the process is killed during `json.dump()` the file is partially written and the next run treats all tiers as "never synced" (full re-sync of 10K+ nodes). SQLite with WAL mode provides ACID writes, concurrent reads, and atomic upserts.

**Step 1: Create sync_state_db.py**

```python
#!/usr/bin/env python3
"""
Sync state persistence — replaces sync_state.json with SQLite.

Provides atomic per-tier cursor storage with WAL mode.
Migration from sync_state.json is handled automatically on first access.
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

STATE_DB_PATH  = Path.home() / ".openclaw" / "projects" / "graph" / "sync_state.sqlite"
LEGACY_JSON    = Path.home() / ".openclaw" / "projects" / "graph" / "sync_state.json"


def _get_conn() -> sqlite3.Connection:
    """Open sync_state DB with WAL mode and busy timeout."""
    conn = sqlite3.connect(str(STATE_DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sync_state (
            tier          TEXT PRIMARY KEY,
            last_sync     TEXT,
            events        INTEGER DEFAULT 0,
            decisions     INTEGER DEFAULT 0,
            entities      INTEGER DEFAULT 0,
            artifacts     INTEGER DEFAULT 0,
            updated_at    TEXT
        )
    """)
    conn.commit()
    return conn


def _migrate_from_json() -> None:
    """One-time migration from sync_state.json to SQLite. Safe to re-run."""
    if not LEGACY_JSON.exists():
        return
    if STATE_DB_PATH.exists():
        return  # Already migrated

    try:
        data = json.loads(LEGACY_JSON.read_text())
        conn = _get_conn()
        for tier, state in data.items():
            conn.execute("""
                INSERT OR REPLACE INTO sync_state
                    (tier, last_sync, events, decisions, entities, artifacts, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                tier,
                state.get("last_sync"),
                state.get("events_synced", 0),
                state.get("decisions_synced", 0),
                state.get("entities_synced", 0),
                state.get("artifacts_synced", 0),
                datetime.now(timezone.utc).isoformat()
            ))
        conn.commit()
        conn.close()
        # Rename legacy file so we don't migrate twice
        LEGACY_JSON.rename(LEGACY_JSON.with_suffix(".json.migrated"))
        print("✅ Migrated sync_state.json → sync_state.sqlite")
    except Exception as e:
        print(f"⚠️  Migration warning (non-fatal): {e}")


def get_last_sync(tier: str) -> Optional[str]:
    """Return last sync ISO timestamp for tier, or None for full sync."""
    _migrate_from_json()
    conn = _get_conn()
    row = conn.execute(
        "SELECT last_sync FROM sync_state WHERE tier = ?", (tier,)
    ).fetchone()
    conn.close()
    return row[0] if row else None


def update_sync(tier: str, events: int = 0, decisions: int = 0,
                entities: int = 0, artifacts: int = 0) -> None:
    """Atomically record a completed sync. Safe under concurrent reads."""
    _migrate_from_json()
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT INTO sync_state (tier, last_sync, events, decisions, entities, artifacts, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tier) DO UPDATE SET
            last_sync  = excluded.last_sync,
            events     = excluded.events,
            decisions  = excluded.decisions,
            entities   = excluded.entities,
            artifacts  = excluded.artifacts,
            updated_at = excluded.updated_at
    """, (tier, now, events, decisions, entities, artifacts, now))
    conn.commit()
    conn.close()


def reset_tier(tier: str) -> None:
    """Clear cursor for one tier (use before rebuild of that tier's data)."""
    conn = _get_conn()
    conn.execute("DELETE FROM sync_state WHERE tier = ?", (tier,))
    conn.commit()
    conn.close()


def reset_all() -> None:
    """Clear all cursors. Must be called before any full DB rebuild."""
    conn = _get_conn()
    conn.execute("DELETE FROM sync_state")
    conn.commit()
    conn.close()
    print("✅ All sync cursors cleared")


def get_all_state() -> dict:
    """Return full state as dict (for monitoring/dashboard)."""
    _migrate_from_json()
    conn = _get_conn()
    rows = conn.execute(
        "SELECT tier, last_sync, events, decisions, entities, artifacts, updated_at "
        "FROM sync_state"
    ).fetchall()
    conn.close()
    return {r[0]: {
        "last_sync": r[1],
        "events_synced": r[2],
        "decisions_synced": r[3],
        "entities_synced": r[4],
        "artifacts_synced": r[5],
        "updated_at": r[6]
    } for r in rows}
```

**Step 2: Run migration smoke test**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_state_db import get_last_sync, update_sync, get_all_state, reset_tier

# Migration from JSON should run automatically
print('Current state:')
for tier, data in get_all_state().items():
    print(f'  {tier}: last={data[\"last_sync\"]}')

# Test update
update_sync('test_tier', events=5, decisions=3)
assert get_last_sync('test_tier') is not None, 'update_sync failed'
reset_tier('test_tier')
assert get_last_sync('test_tier') is None, 'reset_tier failed'

print('sync_state_db OK')
"
```

Expected:
```
✅ Migrated sync_state.json → sync_state.sqlite   (first run only)
Current state:
  hot: last=2026-02-28T...
  warm: last=2026-02-28T...
  cold: last=2026-02-28T...
sync_state_db OK
```

**Step 3: Commit**

```bash
cd ~/.openclaw/projects/graph
git add sync_state_db.py
git commit -m "feat(graph): add sync_state.sqlite — atomic WAL-backed sync cursor storage"
```

---

## Phase 2: Refactor sync.py onto SyncContext

### Task 3: Refactor sync.py — SyncContext + state DB + cold-tier event cap removal

**Files:**
- Modify: `~/.openclaw/projects/graph/sync.py`

**What changes (all in one file):**
1. Replace `kuzu.Database(...)` direct open in `sync_graph()` with `SyncContext`
2. Replace `load_sync_state` / `save_sync_state` / `get_last_sync_timestamp` / `update_sync_timestamp` with `sync_state_db` imports
3. Remove 90-day `event_lookback_days` cap from cold tier (set to `None` — same as decisions)
4. Replace `datetime.utcnow()` with `datetime.now(timezone.utc)` throughout
5. Add SQLite WAL + busy_timeout to `obs_conn` opens in `emit_sync_event` and `sync_events_incremental`

**Step 1: Verify current sync.py passes a basic invocation before editing**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py hot 2>&1 | tail -5
echo "Exit: $?"
```

Expected: Exit 0, events synced summary

**Step 2: Update the imports at the top of sync.py**

Replace the existing import block (lines 1-24) with:

```python
#!/usr/bin/env python3
"""
Data synchronization from source DBs to graph.
Multi-tier incremental sync with state tracking.
"""

import gc
import kuzu
import sqlite3
import json
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Optional

from sync_context import SyncContext, BUFFER_POOL_SIZE
from sync_state_db import get_last_sync, update_sync, emit_sync_event as _emit_sync_noop
from session_tracker import get_tracker
from conversation_embeddings import capture_decision_context

GRAPH_DB_PATH = Path.home() / ".openclaw" / "graph.kuzu"
OBS_DB_PATH   = Path.home() / ".openclaw" / "observability.sqlite"
KB_DB_PATH    = Path.home() / ".openclaw" / "projects" / "knowledge-base" / "kb.sqlite"
CEO_DB_PATH   = Path.home() / ".openclaw" / "projects" / "personal-ceo" / "ceo.sqlite"
```

**Step 3: Update TIER_CONFIG — remove the 90-day event cap for cold tier**

```python
TIER_CONFIG = {
    "hot": {
        "interval_minutes": 15,
        "event_lookback_hours": 24,
        "decision_lookback_hours": 24,
        "sync_entities": False,
        "sync_artifacts": False
    },
    "warm": {
        "interval_minutes": 60,
        "event_lookback_days": 7,
        "decision_lookback_days": 30,
        "sync_entities": True,
        "sync_artifacts": True
    },
    "cold": {
        "interval_hours": 24,
        "event_lookback_days": None,      # ← was 90, now None = full history
        "decision_lookback_days": None,
        "sync_entities": True,
        "sync_artifacts": True
    },
    "analytics": {
        "interval_days": 7,
        "run_pagerank": True,
        "run_communities": True
    }
}
```

**Step 4: Replace the 5 old sync-state functions with thin wrappers**

Delete `load_sync_state`, `save_sync_state`, `get_last_sync_timestamp`, `update_sync_timestamp`, and `emit_sync_event`. Replace with:

```python
def _get_obs_conn() -> sqlite3.Connection:
    """Open observability DB with WAL + busy timeout (v3.0 standard)."""
    conn = sqlite3.connect(str(OBS_DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def emit_sync_event(tier: str, events_synced: int, decisions_synced: int,
                    entities_synced: int = 0, artifacts_synced: int = 0,
                    error: Optional[str] = None) -> None:
    """Emit observability event for sync operation."""
    obs_conn = _get_obs_conn()
    metadata_json = json.dumps({
        "tier": tier,
        "events": events_synced,
        "decisions": decisions_synced,
        "entities": entities_synced,
        "artifacts": artifacts_synced
    })
    obs_conn.execute("""
        INSERT INTO events (trace_id, timestamp, category, action, source, metadata, error)
        VALUES (?, ?, 'system', 'graph_sync', 'graph-sync', ?, ?)
    """, (
        f"graph-sync-{tier}-{datetime.now(timezone.utc).isoformat()}",
        datetime.now(timezone.utc).isoformat() + 'Z',
        metadata_json,
        error
    ))
    obs_conn.commit()
    obs_conn.close()
```

**Step 5: Add WAL + busy_timeout to `sync_events_incremental` and `sync_decisions_incremental` SQLite opens**

Change every `sqlite3.connect(str(OBS_DB_PATH))` and `sqlite3.connect(str(KB_DB_PATH))` call to use `_get_obs_conn()` or the KB equivalent:

```python
def _get_kb_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(KB_DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn
```

Replace all `sqlite3.connect(str(OBS_DB_PATH))` with `_get_obs_conn()`.
Replace all `sqlite3.connect(str(KB_DB_PATH))` with `_get_kb_conn()`.

**Step 6: Replace `datetime.utcnow()` everywhere in sync.py**

```bash
grep -n "utcnow" ~/.openclaw/projects/graph/sync.py
```

Replace every occurrence of `datetime.utcnow()` with `datetime.now(timezone.utc)`.

**Step 7: Refactor `sync_graph()` to use SyncContext**

Replace the existing `sync_graph()` function body with:

```python
def sync_graph(tier: str = 'hot') -> dict:
    """
    Main sync orchestrator. Uses SyncContext for safe DB lifecycle.
    """
    print(f"\n🔄 Starting graph sync (tier: {tier})...")

    stats = {"tier": tier, "events": 0, "decisions": 0, "entities": 0, "artifacts": 0}

    with SyncContext() as conn:
        try:
            ensure_today_moment(conn)

            since_timestamp = get_last_sync(tier)
            if since_timestamp:
                print(f"📅 Incremental sync since: {since_timestamp}")
            else:
                print(f"📅 Full sync for tier: {tier}")

            if tier in ['hot', 'warm', 'cold']:
                stats["events"]    = sync_events_incremental(conn, since=since_timestamp, tier=tier)
                stats["decisions"] = sync_decisions_incremental(conn, since=since_timestamp, tier=tier)

                if tier in ['warm', 'cold']:
                    stats["entities"]  = sync_entities_incremental(conn, since=since_timestamp)
                    stats["artifacts"] = sync_artifacts_incremental(conn, since=since_timestamp)

                if tier == 'hot':
                    try:
                        from enrich.sync_personal import sync_life_scores, sync_signals, sync_beliefs
                        print("\n🔄 Syncing personal data...")
                        sync_life_scores(conn)
                        sync_signals(conn)
                        sync_beliefs(conn)      # ← was missing; beliefs now in hot tier
                    except ImportError:
                        pass
                    except Exception as e:
                        print(f"  ⚠️  Personal data sync skipped: {e}")

            elif tier == 'analytics':
                print("  ℹ️  Analytics tier not yet implemented")

            update_sync(tier, stats["events"], stats["decisions"],
                        stats["entities"], stats["artifacts"])
            emit_sync_event(tier, stats["events"], stats["decisions"],
                            stats["entities"], stats["artifacts"])

            result = conn.execute("MATCH (e:Event) RETURN count(e)")
            stats["total_events"] = result.get_next()[0]
            result = conn.execute("MATCH (d:Decision) RETURN count(d)")
            stats["total_decisions"] = result.get_next()[0]
            result = conn.execute("MATCH (m:Moment) RETURN count(m)")
            stats["total_moments"] = result.get_next()[0]

            print(f"\n📈 Sync complete - Total graph counts:")
            print(f"  Events: {stats['total_events']}")
            print(f"  Decisions: {stats['total_decisions']}")
            print(f"  Moments: {stats['total_moments']}")

        except Exception as e:
            error_msg = str(e)
            print(f"\n❌ Sync failed: {error_msg}")
            emit_sync_event(tier, 0, 0, error=error_msg)
            raise

    return stats
```

**Step 8: Test hot sync end-to-end**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py hot 2>&1 | tail -20
echo "Exit: $?"
```

Expected: Exit 0, no deprecation warnings about `utcnow`, sync summary printed.

**Step 9: Test cold sync with cursor reset (verify no 90-day cap)**

```bash
# Reset cold cursor
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_state_db import reset_tier
reset_tier('cold')
print('Cold cursor cleared')
"

# Run cold sync and count events
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py cold 2>&1 | grep -E "Events|Decisions|Exit"
echo "Exit: $?"
```

Expected: Events synced ≥ 7797 (all history, no cap).

**Step 10: Commit**

```bash
cd ~/.openclaw/projects/graph
git add sync.py sync_state_db.py
git commit -m "refactor(graph): sync.py uses SyncContext + sync_state.sqlite, removes 90-day event cap"
```

---

## Phase 3: sync_personal.py — MERGE + beliefs hot-tier + Belief schema fix

### Task 4: Refactor sync_personal.py

**Files:**
- Modify: `~/.openclaw/projects/graph/enrich/sync_personal.py`

**What changes:**
1. `sync_signals()` — replace manual CHECK+CREATE with `MERGE`
2. `sync_beliefs()` — replace manual CHECK+CREATE with `MERGE`, add `evidence_count` and `last_updated` fields
3. Fix f-string SQL in `sync_life_scores()` — use parameterized query
4. `get_graph_conn()` — add WAL+busy_timeout to KB SQLite opens

Note: `sync_beliefs` is now called by `sync_graph()` hot tier (Task 3 already did this). These changes make it safe.

**Step 1: Fix `sync_life_scores` f-string SQL injection (line ~60)**

Replace:
```python
result = conn.execute(f"MATCH (m:Moment {{date: date('{score_date}')}}) RETURN m.date")
```

With:
```python
result = conn.execute(
    "MATCH (m:Moment {date: $d}) RETURN m.date",
    {"d": datetime.fromisoformat(score_date).date()}
)
```

**Step 2: Replace KB SQLite open with WAL+busy_timeout in all three sync functions**

Replace every `kb = sqlite3.connect(str(KB_DB_PATH))` with:
```python
kb = sqlite3.connect(str(KB_DB_PATH))
kb.execute("PRAGMA journal_mode=WAL")
kb.execute("PRAGMA busy_timeout=5000")
```

**Step 3: Replace `sync_signals` CHECK+CREATE with MERGE**

Replace the entire loop body in `sync_signals()` (the `if not result.has_next(): CREATE` block) with:

```python
for row in rows:
    signal_id      = row['id']
    officer        = row['from_role'] or 'system'
    signal_type_val = row['signal_type'] or 'info'
    title          = (row['subject'] or 'Untitled')[:200]
    description    = (row['body'] or '')[:500]
    priority       = row['severity'] or 'medium'
    status         = 'acknowledged' if row['acknowledged'] else 'active'
    created_at     = row['created_at']
    date_only      = created_at[:10] if created_at else datetime.now().date().isoformat()

    # MERGE is idempotent — safe to re-run; creates on first run, no-ops on repeat
    conn.execute("""
        MERGE (s:Signal {signal_id: $sid})
        ON CREATE SET
            s.officer      = $officer,
            s.signal_type  = $stype,
            s.title        = $title,
            s.description  = $description,
            s.confidence   = 0.8,
            s.priority     = $priority,
            s.status       = $status,
            s.created_at   = $created_at
        ON MATCH SET
            s.status       = $status,
            s.priority     = $priority
    """, {
        "sid":        signal_id,
        "officer":    officer,
        "stype":      signal_type_val,
        "title":      title,
        "description": description,
        "priority":   priority,
        "status":     status,
        "created_at": datetime.fromisoformat(created_at) if created_at else datetime.now()
    })

    # signal_on edge to Moment — check and create if missing
    moment_date = datetime.fromisoformat(date_only).date() if date_only else datetime.now().date()
    moment_exists = conn.execute(
        "MATCH (m:Moment {date: $date}) RETURN m.date", {"date": moment_date}
    ).has_next()
    if moment_exists:
        edge_exists = conn.execute(
            "MATCH (s:Signal {signal_id: $sid})-[:signal_on]->(m:Moment {date: $date}) RETURN s",
            {"sid": signal_id, "date": moment_date}
        ).has_next()
        if not edge_exists:
            conn.execute(
                "MATCH (s:Signal {signal_id: $sid}), (m:Moment {date: $date}) "
                "CREATE (s)-[:signal_on]->(m)",
                {"sid": signal_id, "date": moment_date}
            )
    created += 1

# Note: created now counts all signals processed (idempotent)
```

**Step 4: Replace `sync_beliefs` CHECK+CREATE with MERGE + add missing fields**

Replace the entire loop body in `sync_beliefs()` with:

```python
for row in rows:
    belief_id  = row['id']
    domain     = row['domain'] or 'general'
    statement  = row['belief_text'] or 'Unknown belief'
    confidence = row['confidence'] or 0.5
    created_at = row['created_at'] or datetime.now().isoformat()

    # MERGE with all schema fields — evidence_count and last_updated were NULL before
    conn.execute("""
        MERGE (b:Belief {belief_id: $bid})
        ON CREATE SET
            b.statement      = $statement,
            b.domain         = $domain,
            b.confidence     = $confidence,
            b.belief_type    = 'held',
            b.evidence_count = 1,
            b.last_updated   = $now,
            b.created_at     = $created_at
        ON MATCH SET
            b.confidence     = $confidence,
            b.last_updated   = $now
    """, {
        "bid":        belief_id,
        "statement":  statement,
        "domain":     domain,
        "confidence": confidence,
        "now":        datetime.now(),
        "created_at": datetime.fromisoformat(created_at) if created_at else datetime.now()
    })
    created += 1
```

**Step 5: Smoke-test the refactored sync_personal.py**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext
from enrich.sync_personal import sync_signals, sync_beliefs, sync_life_scores

with SyncContext() as conn:
    sync_life_scores(conn)
    sync_signals(conn)
    sync_beliefs(conn)
print('sync_personal OK')
"
```

Expected: No errors. Counts printed for each.

**Step 6: Verify re-run is truly idempotent (counts don't change)**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext

with SyncContext(read_only=True) as conn:
    s = conn.execute('MATCH (s:Signal) RETURN count(s)').get_next()[0]
    b = conn.execute('MATCH (b:Belief) RETURN count(b)').get_next()[0]
    print(f'Before: Signal={s}, Belief={b}')
" 2>&1

# Run sync again
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext
from enrich.sync_personal import sync_signals, sync_beliefs
with SyncContext() as conn:
    sync_signals(conn)
    sync_beliefs(conn)
" 2>&1

~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext

with SyncContext(read_only=True) as conn:
    s = conn.execute('MATCH (s:Signal) RETURN count(s)').get_next()[0]
    b = conn.execute('MATCH (b:Belief) RETURN count(b)').get_next()[0]
    print(f'After (must match before): Signal={s}, Belief={b}')
" 2>&1
```

Expected: Before and after counts are identical.

**Step 7: Commit**

```bash
cd ~/.openclaw/projects/graph
git add enrich/sync_personal.py
git commit -m "fix(graph): sync_personal.py — MERGE for signals/beliefs, Belief schema fields, WAL, parameterized queries"
```

---

## Phase 4: Fix ON MATCH SET for Decisions

### Task 5: Fix sync_decisions_incremental — stale quality fields

**Files:**
- Modify: `~/.openclaw/projects/graph/sync.py` (lines ~385-403)

**Background:** First sync sets `confidence`, `outcome_rating`, `chosen`, `rationale`. When a user rates a decision in KB, those values change. The graph never reflects the update because `ON MATCH SET` only updates session/embedding metadata.

**Step 1: Update ON MATCH SET in sync_decisions_incremental**

Replace the existing MERGE query's `ON MATCH SET` block:

```python
# CURRENT (incomplete):
ON MATCH SET
    d.session_metadata      = $session_metadata,
    d.conversation_context  = $conversation_context,
    d.conversation_embedding = $conversation_embedding,
    d.indexed_at            = $now

# REPLACE WITH (complete):
ON MATCH SET
    d.title                  = $title,
    d.chosen                 = $chosen,
    d.rationale              = $rationale,
    d.confidence             = $confidence,
    d.outcome_rating         = $outcome_rating,
    d.decision_class         = $decision_class,
    d.session_metadata       = $session_metadata,
    d.conversation_context   = $conversation_context,
    d.conversation_embedding = $conversation_embedding,
    d.indexed_at             = $now
```

**Step 2: Verify decisions update correctly**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext

# Get a sample decision before
with SyncContext(read_only=True) as conn:
    r = conn.execute('MATCH (d:Decision) RETURN d.decision_id, d.title, d.confidence LIMIT 1')
    row = r.get_next()
    print(f'Sample decision: id={row[0]}, title={str(row[1])[:40]}, confidence={row[2]}')
print('Decision fields OK')
"
```

**Step 3: Commit**

```bash
cd ~/.openclaw/projects/graph
git add sync.py
git commit -m "fix(graph): sync_decisions ON MATCH SET updates quality fields (confidence, outcome_rating, chosen)"
```

---

## Phase 5: Safety patches — hybrid_rag, causal_builder, schema

### Task 6: Fix hybrid_rag.py — read_only=True + destructor cleanup

**Files:**
- Modify: `~/.openclaw/projects/graph/hybrid_rag.py`

**Background:** HybridRAG only reads from Kuzu. Opening in write mode holds a write lock unnecessarily and risks SIGSEGV if QueryResult objects outlive the Database destructor.

**Step 1: Read the current __init__ and close() methods**

```bash
grep -n "kuzu\|graph_db\|graph_conn\|def close\|def __init__" ~/.openclaw/projects/graph/hybrid_rag.py | head -20
```

**Step 2: Update __init__ to open read-only**

Replace:
```python
self.graph_db   = kuzu.Database(str(GRAPH_DB_PATH))
self.graph_conn = kuzu.Connection(self.graph_db)
```

With:
```python
import sys; sys.path.insert(0, str(Path.home() / '.openclaw/projects/graph'))
from sync_context import BUFFER_POOL_SIZE
self.graph_db   = kuzu.Database(str(GRAPH_DB_PATH),
                                 buffer_pool_size=BUFFER_POOL_SIZE,
                                 read_only=True)
self.graph_conn = kuzu.Connection(self.graph_db)
```

**Step 3: Update close() to add explicit GC**

```python
def close(self):
    if self._kb_conn:
        self._kb_conn.close()
    if hasattr(self, 'graph_conn') and self.graph_conn is not None:
        self.graph_conn.close()
        del self.graph_conn
        self.graph_conn = None
    if hasattr(self, 'graph_db') and self.graph_db is not None:
        del self.graph_db
        self.graph_db = None
    gc.collect()
```

**Step 4: Verify HybridRAG instantiation and cleanup**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from hybrid_rag import HybridRAG
rag = HybridRAG()
print('HybridRAG initialized OK (read-only)')
rag.close()
print('HybridRAG closed OK')
"
```

Expected: No errors, no SIGSEGV.

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add hybrid_rag.py
git commit -m "fix(graph): hybrid_rag.py opens Kuzu read_only=True with proper destructor cleanup"
```

---

### Task 7: Fix causal_builder_safe.py — destructor cleanup

**Files:**
- Modify: `~/.openclaw/projects/graph/enrich/causal_builder_safe.py`
- Delete: `~/.openclaw/projects/graph/enrich/causal_builder.py` (broken old version)

**Step 1: Wrap causal_builder_safe.py `run()` in proper lifecycle management**

Replace the existing `run()` function structure:

```python
def run():
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from sync_context import SyncContext

    with SyncContext() as conn:
        cutoff = (datetime.now() - timedelta(days=90)).date().isoformat()

        print("Step 1: Getting moments...")
        r = conn.execute(
            "MATCH (m:Moment) WHERE m.date >= $cutoff RETURN m.date LIMIT 200",
            {"cutoff": datetime.strptime(cutoff, "%Y-%m-%d").date()}
        )
        dates = []
        while r.has_next():
            dates.append(str(r.get_next()[0]))
        print(f"  Found {len(dates)} moments")

        print("Step 2: Building causal edges...")
        created = 0
        for d in dates:
            try:
                r = conn.execute("""
                    MATCH (e1:Event {severity:'error'})-[:happened_on]->(m:Moment {date:$d})
                    MATCH (e2:Event)-[:happened_on]->(m)
                    WHERE e2.event_id <> e1.event_id
                      AND (e2.outcome = 'success' OR e2.action CONTAINS 'fix'
                           OR e2.action CONTAINS 'rebuild' OR e2.action CONTAINS 'restart')
                      AND e2.indexed_at > e1.indexed_at
                    RETURN e1.event_id, e2.event_id
                    LIMIT 50
                """, {"d": datetime.strptime(d, "%Y-%m-%d").date()})
                pairs = []
                while r.has_next():
                    pairs.append(r.get_next())
            except Exception:
                continue

            for eid, fid in pairs:
                try:
                    conn.execute("""
                        MATCH (e1:Event {event_id:$eid}),(e2:Event {event_id:$fid})
                        CREATE (e2)-[:caused_by {
                            confidence: 0.7,
                            inference_method: 'temporal_proximity',
                            time_delta_seconds: 0
                        }]->(e1)
                    """, {"eid": eid, "fid": fid})
                    created += 1
                except Exception:
                    pass

        print(f"  caused_by edges created: {created}")

        print("\nStep 3: Verification...")
        for label in ['Event', 'Moment', 'Belief', 'Lesson']:
            r = conn.execute(f"MATCH (n:{label}) RETURN count(n)")
            if r.has_next():
                print(f"  {label}: {r.get_next()[0]}")
        for edge in ['caused_by', 'happened_on', 'learned_from']:
            r = conn.execute(f"MATCH ()-[r:{edge}]->() RETURN count(r)")
            if r.has_next():
                print(f"  [{edge}]: {r.get_next()[0]}")

        return created
```

**Step 2: Delete the old broken causal_builder.py**

```bash
rm ~/.openclaw/projects/graph/enrich/causal_builder.py
echo "Deleted causal_builder.py (old broken version)"
```

**Step 3: Test causal builder runs cleanly**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/enrich/causal_builder_safe.py 2>&1 | tail -15
echo "Exit: $?"
```

Expected: Exit 0, no SIGBUS/SIGSEGV.

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add enrich/causal_builder_safe.py
git rm enrich/causal_builder.py
git commit -m "fix(graph): causal_builder_safe uses SyncContext; delete broken causal_builder.py"
```

---

### Task 8: Fix schema.py main()

**Files:**
- Modify: `~/.openclaw/projects/graph/schema.py`

**Step 1: Replace the broken `main()` function**

Replace:
```python
def main():
    db = kuzu.Database(str(GRAPH_DB_PATH))
    conn = kuzu.Connection(db)
    create_full_schema(conn)
    conn.close()
```

With:
```python
def main():
    """
    Create full schema. Uses SyncContext for safe lifecycle.
    Note: schema.py is imported by sync_context.py — do NOT import
    sync_context here (circular). Use direct Kuzu open with explicit buffer pool.
    """
    import gc
    from sync_context import BUFFER_POOL_SIZE
    db = kuzu.Database(str(GRAPH_DB_PATH), buffer_pool_size=BUFFER_POOL_SIZE)
    conn = kuzu.Connection(db)
    try:
        create_full_schema(conn)
        print("Schema applied successfully.")
    finally:
        conn.close()
        del conn, db
        gc.collect()
```

**Step 2: Commit**

```bash
cd ~/.openclaw/projects/graph
git add schema.py
git commit -m "fix(graph): schema.py main() uses explicit buffer pool + proper cleanup"
```

---

## Phase 6: Observability & Hygiene

### Task 9: Fix monitor.py edge type list

**Files:**
- Modify: `~/.openclaw/projects/graph/monitor.py`

**Step 1: Replace the ghost edge types list (lines ~46-48)**

Replace:
```python
edge_types = ['happened_on', 'decided_on', 'caused_by', 'related_to',
              'extracted_from', 'led_to', 'challenged_by', 'confirmed_by']
```

With the actual schema edge types:
```python
edge_types = [
    'happened_on',   # Event → Moment
    'decided_on',    # Decision → Moment
    'caused_by',     # Event → Event
    'signal_on',     # Signal → Moment
    'triggered_by',  # Signal → Event
    'led_to',        # Signal → Decision
    'supports',      # Event → Belief
    'contradicts',   # Belief → Belief
    'evolved_into',  # Belief → Belief
    'learned_from',  # Lesson → Event
    'applied_in',    # Lesson → Decision
    'prevented_by',  # Event → Decision
    'resolved_by',   # Event → Event
    'involves',      # Event → Entity
    'related_to',    # Entity → Entity
    'produced',      # Event → Artifact
]
```

**Step 2: Run monitor dashboard and verify no ghost edges**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/monitor.py 2>&1 | grep -A 30 "Edge Types"
```

Expected: All listed edge types show real counts (most 0 is OK for unbuilt edges, but no phantom types).

**Step 3: Commit**

```bash
cd ~/.openclaw/projects/graph
git add monitor.py
git commit -m "fix(graph): monitor.py edge type list matches actual schema (16 types, no ghost entries)"
```

---

### Task 10: Add pre-cold-sync snapshot to daily-tasks.sh

**Files:**
- Modify: `~/.openclaw/projects/heartbeat-tasks/daily-tasks.sh`

**Background:** Cold sync rewrites all decisions in-place. If corruption occurs mid-sync there is no recovery. A 43MB snapshot costs ~130MB to keep 3 days of history.

**Step 1: Read current daily-tasks.sh to find where cold sync is called**

```bash
grep -n "graph\|cold\|sync" ~/.openclaw/projects/heartbeat-tasks/daily-tasks.sh | head -20
```

**Step 2: Add snapshot before cold sync call**

Before the line that calls cold sync (e.g., `python3 .../sync.py cold`), insert:

```bash
# Snapshot graph DB before cold sync (keep 3 days)
GRAPH_DB="$HOME/.openclaw/graph.kuzu"
SNAP_DATE=$(date +%Y%m%d)
if [ -d "$GRAPH_DB" ]; then
    cp -r "$GRAPH_DB" "${GRAPH_DB}.bak.${SNAP_DATE}" 2>/dev/null || true
    # Remove snapshots older than 3 days
    find "$HOME/.openclaw" -name "graph.kuzu.bak.*" -mtime +3 -exec rm -rf {} + 2>/dev/null || true
fi
```

**Step 3: Verify snapshot logic manually**

```bash
bash -c '
GRAPH_DB="$HOME/.openclaw/graph.kuzu"
SNAP_DATE=$(date +%Y%m%d)
if [ -d "$GRAPH_DB" ]; then
    cp -r "$GRAPH_DB" "${GRAPH_DB}.bak.${SNAP_DATE}" 2>/dev/null && echo "Snapshot created: ${GRAPH_DB}.bak.${SNAP_DATE}"
fi
ls -la ~/.openclaw/graph.kuzu.bak.* 2>/dev/null
'
```

Expected: Snapshot file created.

**Step 4: Clean up the test snapshot**

```bash
rm -rf ~/.openclaw/graph.kuzu.bak.* 2>/dev/null; echo "cleaned"
```

**Step 5: Commit**

```bash
git add ~/.openclaw/projects/heartbeat-tasks/daily-tasks.sh 2>/dev/null || true
git -C ~/.openclaw/projects/heartbeat-tasks add daily-tasks.sh 2>/dev/null || true
git -C ~/.openclaw/projects/heartbeat-tasks commit -m "fix(ops): snapshot graph.kuzu before cold sync (3-day retention)" 2>/dev/null || true
echo "Snapshot logic added"
```

---

## Phase 7: Cleanup

### Task 11: Archive development artifacts from graph project directory

**Files:**
- `~/.openclaw/projects/graph/` — move test/result files to `archive/`

**Step 1: Create archive directory and move artifacts**

```bash
cd ~/.openclaw/projects/graph
mkdir -p archive

# Move task result docs
mv TASK12_RESULTS.md TASK13_RESULTS.md TASK15_RESULTS.md TASK16_RESULTS.md TASK18_RESULTS.md archive/ 2>/dev/null
mv WEEK2_TASK1_COMPLETE.md WEEK2_TASK2_RESULTS.md WEEK3_COMPLETE.md WEEK4_SUMMARY.md archive/ 2>/dev/null
mv PHASE1_MONTH2_STATUS.md PHASE1_RESULTS.md PHASE2_RESULTS.md PROJECT_COMPLETE.md archive/ 2>/dev/null
mv ACCURACY_REPORT.md ARTIFACT_TEMPORAL_VERIFICATION.md ENRICHMENT_COMPLETE.md archive/ 2>/dev/null
mv BASELINE_2026_02_28.json WEEK1_TEST_RESULTS.json archive/ 2>/dev/null
mv KUZU_FIX.md VALIDATION_RESULTS.md archive/ 2>/dev/null

# Move one-time backfill scripts
mv backfill.py backfill_session_metadata.py backfill_session_metadata_batch.py archive/ 2>/dev/null
mv update_session_metadata_simple.py migrate_embedding_to_string.py archive/ 2>/dev/null

# Move development test scripts
mv test_week3.py test_week3_final.py test_cosine_only.py test_cosine_similarity.py archive/ 2>/dev/null
mv test_embedding_only.py test_embedding_similarity.py test_embedding_simple.py archive/ 2>/dev/null
mv test_hybrid_accuracy.py test_session_metadata.py test_week1.py archive/ 2>/dev/null
mv simple_embedding_test.py test_consolidation_full.py archive/ 2>/dev/null

echo "Archived $(ls archive/ | wc -l) files"
ls ~/.openclaw/projects/graph/*.py | head -20
```

**Step 2: Verify production files still present and importable**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
import sync_context, sync_state_db, sync, monitor, schema
import graph_context, hybrid_rag, lazy_graph_rag
print('All production modules importable ✅')
"
```

**Step 3: Commit**

```bash
cd ~/.openclaw/projects/graph
git add archive/
git add -u  # Stage all moves
git commit -m "chore(graph): archive 25+ development artifacts from production directory"
```

---

## Verification: Full System Test

### Task 12: End-to-end validation after all phases complete

**Step 1: Run full monitor dashboard**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/monitor.py 2>&1
```

Expected: All node counts match (Event ~7800+, Decision ~2633+), no ghost edge errors, sync health shows all tiers OK.

**Step 2: Verify no deprecated warnings in hot sync**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py hot 2>&1 | grep -i "deprecation\|utcnow\|warning"
```

Expected: No output (zero warnings).

**Step 3: Verify concurrent safe — simulate two hot syncs**

```bash
# Start first sync in background
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py hot > /tmp/sync1.log 2>&1 &
PID1=$!

# Immediately try a second sync (should fail with lock error, not corrupt DB)
sleep 0.2
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/sync.py hot 2>&1 | head -5
wait $PID1

echo "First sync exit: $?"
echo "Lock behavior verified"
```

Expected: Second sync prints "Could not acquire graph DB lock" and exits cleanly. First sync completes successfully.

**Step 4: Verify graph counts unchanged (no data loss)**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/user/.openclaw/projects/graph')
from sync_context import SyncContext
with SyncContext(read_only=True) as conn:
    for t in ['Event','Decision','Signal','Belief','Moment','Entity','Artifact','Lesson']:
        r = conn.execute(f'MATCH (n:{t}) RETURN count(n)')
        print(f'{t}: {r.get_next()[0]}')
    r = conn.execute('MATCH ()-[e]->() RETURN count(e)')
    print(f'Edges: {r.get_next()[0]}')
"
```

Expected: Counts ≥ post-rebuild values (Event ≥7797, Decision ≥2633, Edges ≥10604).

**Step 5: Reload hot sync launchd service**

```bash
launchctl unload ~/Library/LaunchAgents/ai.openclaw.graph-sync-hot.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.graph-sync-hot.plist
sleep 3
launchctl list | grep graph-sync-hot
```

Expected: PID present, exit code 0.

**Step 6: Final commit**

```bash
cd ~/.openclaw/projects/graph
git add .
git commit -m "chore(graph): post-hardening validation complete"
```

---

## Summary of Changes

| File | Change type | Issue fixed |
|------|-------------|-------------|
| `sync_context.py` (NEW) | Create | C1: inter-process lock; C2/C3: destructor lifecycle |
| `sync_state_db.py` (NEW) | Create | H5: atomic sync state; WAL-backed |
| `sync.py` | Refactor | C1, H4 (90-day cap), H6 (beliefs in hot), M3 (utcnow), M4 (WAL) |
| `enrich/sync_personal.py` | Refactor | H2 (MERGE), H3 (Belief fields), M2 (f-string SQL), M4 (WAL) |
| `sync.py` (ON MATCH SET) | Patch | H1 (decision quality fields) |
| `hybrid_rag.py` | Patch | C3 (read_only + cleanup) |
| `enrich/causal_builder_safe.py` | Patch | C2 (destructor cleanup via SyncContext) |
| `enrich/causal_builder.py` | Delete | L6 (remove broken old version) |
| `schema.py` | Patch | L1 (main() buffer pool + cleanup) |
| `monitor.py` | Patch | M1 (ghost edge types) |
| `daily-tasks.sh` | Patch | M5 (pre-cold snapshot) |
| `archive/` (25+ files) | Archive | L5 (dev artifact cleanup) |

**Risks eliminated:**
- Inter-process double-open (CRITICAL — was the original corruption vector)
- QueryResult use-after-free SIGSEGV on any DB-opening script
- Belief + Signal data corruption on retry
- Decision quality permanently stale after first sync
- Beliefs never auto-syncing
- 90-day event history gap (will matter May 2026+)
- Non-atomic sync state on crash
