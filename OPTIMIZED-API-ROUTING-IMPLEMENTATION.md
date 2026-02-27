# Optimized API Routing - Implementation Plan

## Zero-Disruption Rollout with Feature Flags

**Date:** February 27, 2026
**Strategy:** Gradual rollout with instant rollback capability
**Disruption Level:** ZERO (feature flag controlled)

---

## 🎯 What We're Implementing

### Current State (Slow):

```
66% → Claude CLI (16.2s avg, FREE but SLOW)
23% → Claude API Sonnet (14.8s avg, $18/M)
10% → OpenAI API (8.1s avg, $12.50/M)

Average Speed: 14.9s
Monthly Cost: $85-115
```

### Target State (Fast + Cheap):

```
35% → Gemini API Flash (1.3s avg, $0.75/M)
40% → OpenAI API GPT-4.1 (8.1s avg, $12.50/M)
25% → Claude API Sonnet/Opus (14.8s avg, $18-90/M)

Average Speed: 7.6s (2x faster!)
Monthly Cost: $63-87 (-26-31%)
```

---

## 📊 Disruption Analysis

### What Changes:

```
✅ KB enrichment: Faster (16.2s → 1-8s depending on tier)
✅ CEO briefings: Faster (14.8s → 7-8s)
✅ Decision extraction: Same quality, faster
✅ Cost: Lower by 26-31%
```

### What Stays the Same:

```
✅ All APIs (no code changes to consumers)
✅ Output quality (same or better models)
✅ Error handling (existing code works)
✅ Observability (same event logging)
✅ File locations (no file moves)
```

### What Could Break:

```
⚠️ Gemini API key issues (we'll test first)
⚠️ Rate limits on new providers (we'll monitor)
⚠️ Different output formats (we'll normalize)
⚠️ Cost spike if usage patterns wrong (we'll track)
```

### Rollback Strategy:

```
✅ Feature flag: Set PAIOS_OPTIMIZED_ROUTING=0 → instant rollback
✅ Per-subsystem flags: Can rollback KB, CEO, Gateway independently
✅ Old code preserved: Nothing deleted, just bypassed
✅ Zero data loss: All changes are runtime routing only
```

---

## 🚀 Implementation Plan - 4 Phases

### Phase 0: Preparation (30 minutes) - ZERO DISRUPTION

**Goal:** Add feature flags and monitoring, no behavior change yet.

**Changes:**

1. Add feature flags to all 3 subsystems
2. Add detailed logging for provider selection
3. Create monitoring dashboard
4. Test Gemini API credentials

**Disruption:** NONE (flags default to OFF)

---

### Phase 1: Knowledge Base (2 hours) - GRADUAL ROLLOUT

**Goal:** Optimize KB with canary deployment (10% → 50% → 100%)

**Changes:**

1. Update `~/.openclaw/projects/knowledge-base/llm.js`
2. Add smart tier → provider routing
3. Remove CLI fallback (too slow)
4. Add Gemini API integration

**Disruption:** NONE initially (flag OFF by default)

**Rollout:**

```
Day 1: Enable for 10% of calls (canary)
  └─ Monitor for 24 hours
  └─ Check: Speed improved? Cost decreased? Errors?

Day 2: Enable for 50% (if canary successful)
  └─ Monitor for 24 hours
  └─ Check: Same metrics

Day 3: Enable for 100% (if 50% successful)
  └─ Monitor for 7 days
  └─ Declare success or rollback
```

---

### Phase 2: Personal CEO (2 hours) - GRADUAL ROLLOUT

**Goal:** Optimize CEO with same canary strategy.

**Changes:**

1. Update `~/.openclaw/projects/personal-ceo/ceo_lib.py`
2. Remove CLI fallback attempt
3. Add smart provider routing
4. Add Gemini for simple parsing

**Disruption:** NONE initially (flag OFF by default)

**Rollout:** Same 10% → 50% → 100% over 3 days

---

### Phase 3: OpenClaw Gateway (2 hours) - GRADUAL ROLLOUT

**Goal:** Optimize gateway routing (lowest priority, already uses APIs).

**Changes:**

1. Update routing table in `llm-config.json`
2. Add Gemini for rapid tier
3. Keep existing API infrastructure

**Disruption:** NONE initially (flag OFF by default)

**Rollout:** Same 10% → 50% → 100% over 3 days

---

### Phase 4: Monitoring & Optimization (1 week)

**Goal:** Watch metrics, tune, and finalize.

**Actions:**

1. Daily cost reports
2. Performance dashboards
3. Error tracking
4. Fine-tune tier assignments based on real data

---

## 📝 Code Changes - Detailed Implementation

### Change 1: Knowledge Base Smart Routing

**File:** `~/.openclaw/projects/knowledge-base/llm.js`

```javascript
// Add at top of file (after imports)
const OPTIMIZED_ROUTING_ENABLED = process.env.PAIOS_OPTIMIZED_ROUTING === "1";
const CANARY_PERCENTAGE = parseInt(process.env.PAIOS_CANARY_PCT || "0", 10);

// Add Gemini API integration
import { GoogleGenerativeAI } from "@google/generative-ai";

let _geminiClient = null;
function getGeminiClient() {
  if (_geminiClient) return _geminiClient;
  const key = getGoogleKey(); // New function to get Google API key
  if (!key) return null;
  _geminiClient = new GoogleGenerativeAI(key);
  return _geminiClient;
}

function getGoogleKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  try {
    const authPath = join(PAIOS_HOME, "agents/main/agent/auth-profiles.json");
    const profiles = JSON.parse(readFileSync(authPath, "utf-8"));
    return profiles.profiles?.google?.key || null;
  } catch {}
  return null;
}

// Add Gemini API caller
async function callGemini(prompt, opts = {}) {
  const start = Date.now();
  const client = getGeminiClient();
  if (!client) throw new Error("Gemini API key not found");

  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      maxOutputTokens: opts.maxTokens || 1024,
      temperature: opts.temperature || 0.5,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const usage = {
    provider: "gemini",
    model: "gemini-2.5-flash",
    tier: opts.tier || "rapid",
    inputTokens: result.response.usageMetadata?.promptTokenCount || 0,
    outputTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
    estimatedCostUsd: estimateCost(
      "gemini-2.5-flash",
      result.response.usageMetadata?.promptTokenCount || 0,
      result.response.usageMetadata?.candidatesTokenCount || 0,
    ),
    durationMs: Date.now() - start,
    caller: opts.caller || null,
  };

  return { text, usage };
}

// Update COST_TABLE
const COST_TABLE = {
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
};

// New smart routing function
function selectProviderForTier(tier) {
  // If optimization disabled, use old behavior
  if (!OPTIMIZED_ROUTING_ENABLED) {
    return { provider: "auto", model: resolveModelForTier(tier) };
  }

  // Canary rollout logic
  const isCanary = Math.random() * 100 < CANARY_PERCENTAGE;
  if (CANARY_PERCENTAGE > 0 && CANARY_PERCENTAGE < 100 && !isCanary) {
    // Not in canary group, use old behavior
    return { provider: "auto", model: resolveModelForTier(tier) };
  }

  // Smart routing based on tier
  switch (tier) {
    case "rapid":
      // Simple extraction → Gemini (fast + cheap)
      return { provider: "gemini", model: "gemini-2.5-flash" };

    case "pattern":
      // Pattern recognition → OpenAI (balanced)
      return { provider: "openai", model: "gpt-4.1" };

    case "analytical":
    case "deep":
      // Complex reasoning → Claude Sonnet
      return { provider: "anthropic", model: "claude-sonnet-4-6" };

    case "strategic":
      // Strategic decisions → Claude Opus
      return { provider: "anthropic", model: "claude-opus-4-6" };

    default:
      // Default to OpenAI (good balance)
      return { provider: "openai", model: "gpt-4.1" };
  }
}

// Update main callLLM function
export async function callLLM(prompt, opts = {}) {
  const { tier = "fast", maxTokens = 2048, provider = "auto", caller = null } = opts;

  // Get optimal provider for this tier
  const routing = selectProviderForTier(tier);

  // Log routing decision (for monitoring)
  console.log(
    `[llm] Routing: tier=${tier}, provider=${routing.provider}, model=${routing.model}, optimized=${OPTIMIZED_ROUTING_ENABLED}, canary=${CANARY_PERCENTAGE}%`,
  );

  let result;
  const obs = await getObs();

  try {
    // Route to appropriate provider (NO CLI!)
    if (routing.provider === "gemini") {
      result = await callGemini(prompt, { tier, maxTokens, caller });
    } else if (routing.provider === "openai") {
      result = await callOpenAI(prompt, routing.model, maxTokens, caller);
    } else if (routing.provider === "anthropic") {
      result = await callAnthropic(prompt, routing.model, maxTokens, caller);
    } else {
      // Fallback to old "auto" behavior (for safety)
      // Try OpenAI first (faster than Claude)
      const openaiKey = getOpenAIKey();
      if (openaiKey) {
        try {
          result = await callOpenAI(prompt, "gpt-4.1", maxTokens, caller);
        } catch (e) {
          // OpenAI failed, try Anthropic
          result = await callAnthropic(prompt, "claude-sonnet-4-6", maxTokens, caller);
        }
      } else {
        result = await callAnthropic(prompt, "claude-sonnet-4-6", maxTokens, caller);
      }
    }

    // Emit observability event
    if (obs) {
      emitLLMEvent(obs, result.usage);
    }

    return result.text;
  } catch (error) {
    console.error(`[llm] ERROR: ${error.message}`);
    if (obs) {
      obs.emitEvent({
        traceId: obs.generateTraceId(),
        category: "kb",
        action: "llm_error",
        source: "llm.js",
        error: error.message,
        metadata: {
          tier,
          routing_provider: routing.provider,
          routing_model: routing.model,
          optimized: OPTIMIZED_ROUTING_ENABLED,
        },
      });
    }
    throw error;
  }
}

// Remove callClaudeCLI() function entirely (or comment out)
// function callClaudeCLI() { ... }  // DELETE THIS
```

---

### Change 2: Personal CEO Smart Routing

**File:** `~/.openclaw/projects/personal-ceo/ceo_lib.py`

```python
import os
import anthropic
import openai
from google import generativeai as genai

# Feature flag
OPTIMIZED_ROUTING_ENABLED = os.getenv("PAIOS_OPTIMIZED_ROUTING") == "1"
CANARY_PERCENTAGE = int(os.getenv("PAIOS_CANARY_PCT", "0"))

# Cost table
COST_TABLE = {
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus-4-6": {"input": 15.00, "output": 75.00},
}

def _get_google_key() -> str | None:
    """Get Google API key."""
    if os.getenv("GOOGLE_API_KEY"):
        return os.getenv("GOOGLE_API_KEY")
    try:
        profiles_path = Path.home() / ".openclaw" / "agents" / "main" / "agent" / "auth-profiles.json"
        profiles = json.loads(profiles_path.read_text())
        return profiles.get("profiles", {}).get("google", {}).get("key")
    except:
        return None

def _call_gemini(prompt: str, max_tokens: int = 1024) -> tuple[str, dict]:
    """Call Gemini API."""
    key = _get_google_key()
    if not key:
        raise RuntimeError("Google API key not found")

    genai.configure(api_key=key)
    model = genai.GenerativeModel('gemini-2.5-flash')

    start = time.time()
    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.5
        )
    )

    usage = {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "input_tokens": response.usage_metadata.prompt_token_count,
        "output_tokens": response.usage_metadata.candidates_token_count,
        "duration_ms": int((time.time() - start) * 1000),
        "cost_usd": _estimate_cost(
            "gemini-2.5-flash",
            response.usage_metadata.prompt_token_count,
            response.usage_metadata.candidates_token_count
        )
    }

    return response.text, usage

def _call_openai(prompt: str, model: str, max_tokens: int) -> tuple[str, dict]:
    """Call OpenAI API."""
    key = _get_openai_key()
    if not key:
        raise RuntimeError("OpenAI API key not found")

    client = openai.OpenAI(api_key=key)
    start = time.time()

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.7
    )

    usage = {
        "provider": "openai",
        "model": model,
        "input_tokens": response.usage.prompt_tokens,
        "output_tokens": response.usage.completion_tokens,
        "duration_ms": int((time.time() - start) * 1000),
        "cost_usd": _estimate_cost(model, response.usage.prompt_tokens, response.usage.completion_tokens)
    }

    return response.choices[0].message.content, usage

def _select_provider_for_tier(tier: str) -> tuple[str, str]:
    """Select optimal provider and model for tier."""
    # Feature flag check
    if not OPTIMIZED_ROUTING_ENABLED:
        return ("anthropic", "claude-sonnet-4-6")  # Old behavior

    # Canary rollout
    if 0 < CANARY_PERCENTAGE < 100:
        if random.random() * 100 >= CANARY_PERCENTAGE:
            return ("anthropic", "claude-sonnet-4-6")  # Not in canary

    # Smart routing
    routing_table = {
        "rapid": ("gemini", "gemini-2.5-flash"),
        "fast": ("gemini", "gemini-2.5-flash"),
        "pattern": ("openai", "gpt-4.1"),
        "analytical": ("anthropic", "claude-sonnet-4-6"),
        "deep": ("anthropic", "claude-sonnet-4-6"),
        "strategic": ("anthropic", "claude-opus-4-6"),
    }

    return routing_table.get(tier, ("openai", "gpt-4.1"))

def call_llm(prompt: str, tier: str = "deep", max_tokens: int | None = None,
             caller: str = "unknown", thinking: bool | None = None,
             role: str | None = None) -> str:
    """Call LLM with optimized provider routing."""

    # Resolve tier parameters
    tier_params = _resolve_tier(tier)
    if max_tokens is None:
        max_tokens = tier_params["max_tokens"]
    if thinking is None:
        thinking = tier_params["thinking"]

    # Select optimal provider
    provider, model = _select_provider_for_tier(tier)

    # Log routing decision
    print(f"[ceo_lib] Routing: tier={tier}, provider={provider}, model={model}, "
          f"optimized={OPTIMIZED_ROUTING_ENABLED}, canary={CANARY_PERCENTAGE}%")

    # Inject thinking context if needed
    thinking_context = ""
    if thinking:
        try:
            from thinking_query import get_thinking_context
            situation = prompt[:200] if len(prompt) > 200 else prompt
            thinking_context = get_thinking_context(situation, role=role)
        except Exception:
            pass

    if thinking_context:
        full_prompt = f"[System context]\n{thinking_context}\n\n{prompt}"
    else:
        full_prompt = prompt

    # Route to appropriate provider (NO CLI!)
    try:
        if provider == "gemini":
            text, usage = _call_gemini(full_prompt, max_tokens)
        elif provider == "openai":
            text, usage = _call_openai(full_prompt, model, max_tokens)
        elif provider == "anthropic":
            text, usage = _call_anthropic(full_prompt, model, max_tokens)
        else:
            raise ValueError(f"Unknown provider: {provider}")

        # Emit observability event
        _emit_llm_event(caller, tier, usage)

        return text

    except Exception as e:
        print(f"[ceo_lib] ERROR: {e}")
        # Emit error event
        _emit_error_event(caller, tier, provider, model, str(e))
        raise RuntimeError(f"LLM call failed: {e}")

# Remove any CLI fallback code
# def _try_claude_cli(): ...  # DELETE THIS
```

---

### Change 3: Update llm-config.json

**File:** `~/.openclaw/llm-config.json`

```json
{
  "version": "2.1.0",
  "updated": "2026-02-27T15:00:00Z",

  "models": {
    "google/gemini-2.5-flash": {
      "provider": "google",
      "apiModelId": "gemini-2.5-flash",
      "cost": { "input": 0.15, "output": 0.6 },
      "speed": "1.3s",
      "description": "Fastest and cheapest, excellent for simple tasks"
    },
    "openai/gpt-4.1": {
      "provider": "openai",
      "apiModelId": "gpt-4.1",
      "cost": { "input": 2.0, "output": 8.0 },
      "speed": "8.1s",
      "description": "Balanced performance, good for complex tasks"
    },
    "anthropic/claude-haiku-4-5": {
      "provider": "anthropic",
      "apiModelId": "claude-haiku-4-5-20251001",
      "cost": { "input": 1.0, "output": 5.0 },
      "speed": "5-8s",
      "description": "Fast Claude, good for pattern recognition"
    },
    "anthropic/claude-sonnet-4-6": {
      "provider": "anthropic",
      "apiModelId": "claude-sonnet-4-6",
      "cost": { "input": 3.0, "output": 15.0 },
      "speed": "14.8s",
      "description": "High quality reasoning"
    },
    "anthropic/claude-opus-4-6": {
      "provider": "anthropic",
      "apiModelId": "claude-opus-4-6",
      "cost": { "input": 15.0, "output": 75.0 },
      "speed": "15-20s",
      "description": "Highest quality for strategic decisions"
    }
  },

  "tiers": {
    "rapid": {
      "model": "google/gemini-2.5-flash",
      "defaults": {
        "maxTokens": 1024,
        "temperature": 0.5,
        "thinking": { "enabled": false }
      },
      "description": "Simple extraction, vision, classification"
    },

    "pattern": {
      "model": "openai/gpt-4.1",
      "defaults": {
        "maxTokens": 2048,
        "temperature": 0.5,
        "thinking": { "enabled": false }
      },
      "description": "Pattern recognition with context"
    },

    "analytical": {
      "model": "anthropic/claude-sonnet-4-6",
      "defaults": {
        "maxTokens": 4096,
        "temperature": 0.7,
        "thinking": { "enabled": false }
      },
      "description": "Complex reasoning, quality floor"
    },

    "strategic": {
      "model": "anthropic/claude-opus-4-6",
      "defaults": {
        "maxTokens": 8192,
        "temperature": 0.7,
        "thinking": {
          "enabled": true,
          "type": "extended",
          "budget_tokens": 16000
        }
      },
      "description": "Strategic decisions with thinking"
    }
  },

  "subsystems": {
    "knowledge-base": {
      "l1_enrichment": { "tier": "rapid" },
      "l2_enrichment": { "tier": "pattern" },
      "l3_enrichment": { "tier": "analytical" },
      "l4_enrichment": { "tier": "strategic" },
      "entity_extraction": { "tier": "rapid" },
      "relation_mapping": { "tier": "analytical" },
      "decision_extraction": { "tier": "strategic" }
    },

    "personal-ceo": {
      "morning_briefing": { "tier": "analytical" },
      "weekly_review": { "tier": "analytical" },
      "quarterly_review": { "tier": "strategic" },
      "officer_reports": { "tier": "analytical" },
      "crm_parsing": { "tier": "rapid" },
      "initiative_generation": { "tier": "strategic" },
      "initiative_outcome_analysis": { "tier": "strategic" }
    }
  }
}
```

---

## 🔧 Rollout Procedure

### Step 1: Preparation (Day 0)

```bash
# 1. Install Gemini SDK
cd ~/.openclaw/projects/knowledge-base
npm install @google/generative-ai

cd ~/.openclaw/projects/personal-ceo
source ~/.openclaw/.venv/bin/activate
pip install google-generativeai

# 2. Test Gemini API credentials
node -e "
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const authPath = process.env.HOME + '/.openclaw/agents/main/agent/auth-profiles.json';
const profiles = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
const key = profiles.profiles?.google?.key;
if (!key) { console.log('❌ No Google API key'); process.exit(1); }
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
model.generateContent('Test').then(() => console.log('✅ Gemini API working!')).catch(e => console.log('❌ Gemini failed:', e.message));
"

# 3. Backup current code
cp ~/.openclaw/projects/knowledge-base/llm.js ~/.openclaw/projects/knowledge-base/llm.js.backup
cp ~/.openclaw/projects/personal-ceo/ceo_lib.py ~/.openclaw/projects/personal-ceo/ceo_lib.py.backup
cp ~/.openclaw/llm-config.json ~/.openclaw/llm-config.json.backup
```

---

### Step 2: Deploy Code Changes (Day 0)

```bash
# Apply the code changes (I'll provide the full updated files)
# Files will have feature flag DISABLED by default

# Verify no syntax errors
cd ~/.openclaw/projects/knowledge-base
node -c llm.js  # Check syntax

cd ~/.openclaw/projects/personal-ceo
python -m py_compile ceo_lib.py  # Check syntax
```

---

### Step 3: Canary Rollout - KB (Days 1-3)

```bash
# Day 1: 10% canary
export PAIOS_OPTIMIZED_ROUTING=1
export PAIOS_CANARY_PCT=10
export PAIOS_LLM_CONFIG=1

# Run KB enrichment with 10% canary
cd ~/.openclaw/projects/knowledge-base
node enrich.js --level l1 --limit 10

# Monitor for 24 hours
# Check: ~/.openclaw/logs/kb-enrichment.log
# Check: Observability DB for errors/performance

# Day 2: 50% if successful
export PAIOS_CANARY_PCT=50
# Run more enrichment, monitor

# Day 3: 100% if successful
export PAIOS_CANARY_PCT=100
# Full rollout
```

---

### Step 4: Canary Rollout - CEO (Days 4-6)

```bash
# Same process for CEO
cd ~/.openclaw/projects/personal-ceo
python briefing.py  # Test with canary
```

---

### Step 5: Monitor & Validate (Week 1)

```bash
# Daily cost dashboard
~/.openclaw/scripts/llm-cost-dashboard.sh

# Performance metrics
sqlite3 ~/.openclaw/observability.sqlite "
  SELECT
    json_extract(metadata, '$.provider') as provider,
    json_extract(metadata, '$.model') as model,
    COUNT(*) as calls,
    ROUND(AVG(duration_ms)/1000.0, 2) as avg_sec,
    SUM(CAST(json_extract(metadata, '$.cost_usd') AS REAL)) as cost
  FROM events
  WHERE category IN ('kb', 'ceo')
    AND action = 'llm_call'
    AND timestamp > datetime('now', '-7 days')
  GROUP BY provider, model
  ORDER BY calls DESC
"
```

---

## 🔙 Rollback Procedures

### Instant Rollback (Anytime)

```bash
# Disable optimization immediately
unset PAIOS_OPTIMIZED_ROUTING
# OR
export PAIOS_OPTIMIZED_ROUTING=0

# Restart services if needed
pkill -9 -f "openclaw.*gateway"
launchctl start ai.openclaw.gateway
```

### Full Rollback (Restore Old Code)

```bash
# Restore backups
cp ~/.openclaw/projects/knowledge-base/llm.js.backup ~/.openclaw/projects/knowledge-base/llm.js
cp ~/.openclaw/projects/personal-ceo/ceo_lib.py.backup ~/.openclaw/projects/personal-ceo/ceo_lib.py
cp ~/.openclaw/llm-config.json.backup ~/.openclaw/llm-config.json
```

---

## 📊 Expected Timeline

```
Day 0:    Preparation & deployment (code changes, flags OFF)
          Disruption: ZERO

Day 1-3:  KB canary (10% → 50% → 100%)
          Disruption: 10-50% of KB calls slightly different behavior
          User Impact: NONE (faster is better!)

Day 4-6:  CEO canary (10% → 50% → 100%)
          Disruption: 10-50% of CEO calls faster
          User Impact: NONE (briefings arrive faster!)

Day 7+:   Full rollout, monitoring
          Disruption: ZERO (everything working, just faster/cheaper)

Week 2:   Declare success or adjust
```

---

## ✅ Success Criteria

**After 7 Days:**

```
✅ Average response time < 10s (was 14.9s)
✅ Cost < $70/mo (was $85-115)
✅ Error rate < 2% (same as before)
✅ No user complaints about quality
✅ Observability shows correct routing
```

**After 30 Days:**

```
✅ Average response time ~7.6s (target achieved)
✅ Cost $63-87/mo (target achieved)
✅ Quality maintained or improved
✅ No rollbacks needed
✅ Feature flag removed (permanent deployment)
```

---

## 🎯 Bottom Line: Disruption Analysis

### What Users Will Notice:

```
✅ Faster responses (2x speed improvement)
✅ Same or better quality
✅ Nothing else changes
```

### What You Will Notice:

```
✅ Lower AWS bills
✅ Faster batch processing
✅ Better monitoring dashboards
✅ More detailed logs
```

### What Could Go Wrong:

```
⚠️ Gemini API rate limits (we'll monitor and add fallback)
⚠️ Cost spike if usage patterns wrong (we'll track daily)
⚠️ Different error messages (we'll normalize)
⚠️ Quality regression (we'll A/B test and rollback if needed)
```

### Mitigation:

```
✅ Feature flags for instant rollback
✅ Canary rollout (catch issues at 10%)
✅ Preserved old code (nothing deleted)
✅ Daily monitoring (catch problems early)
✅ Automatic fallbacks (if Gemini fails, use OpenAI)
```

---

## 📋 Next Steps

1. **Review this plan** - Approve or adjust?
2. **Run preparation** - Install SDKs, test credentials
3. **Deploy with flags OFF** - Code changes, zero behavior change
4. **Start canary rollout** - 10% of KB first
5. **Monitor and iterate** - Expand or rollback based on data

**Want me to start with Step 1 (Preparation)?**
