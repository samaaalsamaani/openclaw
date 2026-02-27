# LLM Capabilities Audit & Testing Plan

**Date**: February 27, 2026
**Goal**: Comprehensive understanding of all LLM access methods, performance, and capabilities

---

## 🎯 Objectives

1. **Clarify CLI vs API access** for each subscription
2. **Test all available CLIs** (Claude, OpenAI Codex, Gemini)
3. **Benchmark performance** (speed, quality, cost)
4. **Document capabilities** (context windows, features, models)
5. **Create reference guide** for model selection

---

## 📊 Current Understanding: CLI vs API

### What You Actually Have

| Subscription                  | CLI Access      | API Access      | What's Included                             |
| ----------------------------- | --------------- | --------------- | ------------------------------------------- |
| **Claude Max ($200/month)**   | ✅ CLI included | ✅ API included | Both! $200 gives you CLI + $150 API credits |
| **ChatGPT Pro ($100/month)**  | ✅ CLI (Codex)  | ⚠️ Limited API  | CLI works, Direct API blocked by router     |
| **Google AI Pro ($20/month)** | ⚠️ CLI slow     | ✅ API included | API key works great, CLI has overhead       |

### Important Clarifications

#### 1. Claude Max ($200/month)

```
What you get:
✅ Claude.ai web interface (unlimited)
✅ Claude Desktop App (unlimited)
✅ Claude CLI access (unlimited)
✅ Claude API access ($150 in credits/month)
✅ All models (Opus 4.6, Sonnet 4.6, Haiku 4.5)

CLI vs API:
• CLI: `claude` command - interactive sessions
• API: Direct HTTP calls with API key
• Both use the SAME models and capabilities
• CLI is just a nicer interface to the API
```

#### 2. ChatGPT Pro ($100/month)

```
What you get:
✅ ChatGPT web interface (unlimited)
✅ Codex CLI access (unlimited)
⚠️ API access (limited by usage caps)

CLI vs API:
• CLI: `codex` command - gpt-5.3-codex
• API: api.openai.com (blocked by your router!)
• Codex CLI uses DIFFERENT endpoints (works!)
• Your router blocks direct API but not Codex

Important: Your API key CAN access the API, but your
router is blocking it. The subscription includes API
access - the block is a network issue, not a billing issue.
```

#### 3. Google AI Pro ($20/month)

```
What you get:
✅ Gemini web interface (Advanced features)
✅ Gemini CLI access (slow, not recommended)
✅ API access (your API key)
✅ Higher rate limits
✅ Access to Gemini 2.5 Pro

CLI vs API:
• CLI: `gemini` command - very slow (8-14s overhead)
• API: Direct HTTP calls - fast and efficient
• Same models, but API is MUCH faster
• Recommendation: Skip CLI, use API directly
```

---

## 📋 Testing Plan: 6 Phases

### Phase 1: CLI Inventory & Validation (30 min)

**Goal**: Identify which CLIs are installed and working

**Tasks:**

1. Verify Claude CLI installation and version
2. Verify Codex CLI installation and version
3. Verify Gemini CLI installation and version
4. Check authentication status for each
5. Document installed versions

**Success Criteria:**

- All CLIs located and versioned
- Authentication verified
- Baseline established

---

### Phase 2: API Access Testing (30 min)

**Goal**: Test direct API access for each provider

**Tasks:**

1. Test Claude API (direct HTTP calls)
2. Test OpenAI API (check if router still blocking)
3. Test Gemini API (direct HTTP calls)
4. Verify API keys work
5. Check rate limits and quotas

**Success Criteria:**

- All APIs tested with curl/Python
- Response times documented
- Error states identified

---

### Phase 3: Performance Benchmarking (1 hour)

**Goal**: Compare speed and latency for CLI vs API

**Test Suite:**

- **Simple task**: "Count to 10"
- **Medium task**: "Explain quantum computing in 100 words"
- **Complex task**: "Write a Python function to parse JSON"
- **Vision task**: Analyze an image (where supported)

**Metrics to Track:**

- Time to first token (TTFT)
- Total completion time
- Tokens per second
- Startup overhead
- Cold start vs warm start

**Test Matrix:**

```
Claude:
  • CLI: `claude` command
  • API: Direct HTTP with API key
  • Models: Sonnet 4.6, Haiku 4.5, Opus 4.6

OpenAI:
  • CLI: `codex` command (only option due to router)
  • API: Direct HTTP (if router fixed)
  • Models: gpt-5.3-codex

Gemini:
  • CLI: `gemini` command
  • API: Direct HTTP with API key
  • Models: 2.5 Pro, 2.5 Flash, 2.0 Flash
```

---

### Phase 4: Quality Assessment (1 hour)

**Goal**: Compare output quality across models

**Test Scenarios:**

1. **Code Generation**: "Write a sorting algorithm"
2. **Reasoning**: "Solve a logic puzzle"
3. **Explanation**: "Explain how TCP/IP works"
4. **Creative Writing**: "Write a short story"
5. **Data Analysis**: "Analyze this CSV data"
6. **Math**: "Solve a calculus problem"

**Scoring Criteria:**

- Accuracy (1-5)
- Completeness (1-5)
- Clarity (1-5)
- Usefulness (1-5)
- Total (out of 20)

---

### Phase 5: Feature Matrix (30 min)

**Goal**: Document all features and capabilities

**Categories:**

1. **Input Types**: Text, images, audio, video
2. **Output Types**: Text, code, images
3. **Context Window**: Max tokens
4. **Special Features**: Tool use, vision, web search
5. **Rate Limits**: Requests per minute
6. **Cost**: Per million tokens

---

### Phase 6: Integration Testing (1 hour)

**Goal**: Test how each integrates with your OpenClaw system

**Tests:**

1. Call from TypeScript/Node
2. Call from Python
3. Call from bash scripts
4. Integration with MCP servers
5. Routing from OpenClaw gateway

---

## 🧪 Detailed Test Scripts

### Test 1: CLI Speed Test

```bash
#!/bin/bash
# test-cli-speed.sh

echo "=== Claude CLI Speed Test ==="
time echo "Count to 10" | claude exec

echo ""
echo "=== Codex CLI Speed Test ==="
time echo "Count to 10" | codex exec

echo ""
echo "=== Gemini CLI Speed Test ==="
time echo "Count to 10" | gemini
```

### Test 2: API Speed Test

```python
#!/usr/bin/env python3
# test-api-speed.py

import time
import urllib.request
import json

def test_claude_api():
    """Test Claude API speed"""
    start = time.time()

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": "YOUR_KEY",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    data = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 100,
        "messages": [{"role": "user", "content": "Count to 10"}]
    }).encode()

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode())

    elapsed = time.time() - start
    print(f"Claude API: {elapsed:.2f}s")
    return elapsed

def test_gemini_api():
    """Test Gemini API speed"""
    start = time.time()

    url = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=YOUR_KEY"
    headers = {"Content-Type": "application/json"}
    data = json.dumps({
        "contents": [{"parts": [{"text": "Count to 10"}]}]
    }).encode()

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode())

    elapsed = time.time() - start
    print(f"Gemini API: {elapsed:.2f}s")
    return elapsed

if __name__ == "__main__":
    print("=== API Speed Test ===\n")
    test_claude_api()
    test_gemini_api()
    print("\nTest complete!")
```

### Test 3: Quality Comparison

```bash
#!/bin/bash
# test-quality.sh

PROMPT="Write a Python function to reverse a string. Include docstring and type hints."

echo "=== Claude Sonnet 4.6 ==="
echo "$PROMPT" | claude exec --model claude-sonnet-4-6

echo ""
echo "=== OpenAI Codex ==="
echo "$PROMPT" | codex exec

echo ""
echo "=== Gemini 2.5 Flash ==="
echo "$PROMPT" | gemini
```

---

## 📊 Expected Results Matrix

### Speed (Estimated)

| Provider   | Method | Startup | TTFT  | Total | Overhead       |
| ---------- | ------ | ------- | ----- | ----- | -------------- |
| **Claude** | CLI    | ~2s     | ~0.5s | ~3s   | Medium         |
| **Claude** | API    | ~0s     | ~0.5s | ~1s   | None           |
| **Codex**  | CLI    | ~2s     | ~1s   | ~4s   | Medium         |
| **Codex**  | API    | ~0s     | ~0.5s | ~1s   | None (blocked) |
| **Gemini** | CLI    | ~8s     | ~0.5s | ~10s  | **Very High**  |
| **Gemini** | API    | ~0s     | ~0.3s | ~0.5s | None           |

**Key Insight**: APIs are **2-20x faster** than CLIs due to no startup overhead!

### Quality (Estimated)

| Task Type     | Claude Sonnet | Claude Opus | Codex  | Gemini Pro | Gemini Flash |
| ------------- | ------------- | ----------- | ------ | ---------- | ------------ |
| **Code**      | 18/20         | 19/20       | 19/20  | 17/20      | 16/20        |
| **Reasoning** | 19/20         | 20/20       | 16/20  | 18/20      | 17/20        |
| **Creative**  | 18/20         | 19/20       | 14/20  | 17/20      | 16/20        |
| **Vision**    | 17/20         | 18/20       | N/A    | 18/20      | 18/20        |
| **Speed**     | Medium        | Slow        | Medium | Fast       | **Fastest**  |

### Cost (Actual)

| Model                 | Input | Output | 1M tokens | Use Case          |
| --------------------- | ----- | ------ | --------- | ----------------- |
| **Claude Opus 4.6**   | $15   | $75    | $90       | Complex reasoning |
| **Claude Sonnet 4.6** | $3    | $15    | $18       | General purpose   |
| **Claude Haiku 4.5**  | $1    | $5     | $6        | Fast tasks        |
| **Codex (gpt-5.3)**   | ?     | ?      | ?         | Code specific     |
| **Gemini 2.5 Pro**    | $1.25 | $5     | $6.25     | Long context      |
| **Gemini 2.5 Flash**  | $0.15 | $0.60  | **$0.75** | **Cheapest**      |

---

## 📝 Deliverables

### 1. LLM Reference Guide

**File**: `LLM-REFERENCE-GUIDE.md`

**Contents:**

- Complete model inventory
- CLI vs API comparison
- Performance benchmarks
- Quality assessments
- Cost analysis
- Use case recommendations

### 2. Model Selection Decision Tree

**File**: `MODEL-SELECTION-GUIDE.md`

**Contents:**

- "Which model should I use?" flowchart
- Task-based recommendations
- Cost/quality tradeoffs
- Speed requirements

### 3. Benchmark Results

**File**: `BENCHMARK-RESULTS.md`

**Contents:**

- Raw test data
- Performance graphs
- Quality scores
- Statistical analysis

### 4. API Integration Guide

**File**: `API-INTEGRATION-GUIDE.md`

**Contents:**

- Code examples (Python, TypeScript, bash)
- Authentication methods
- Error handling
- Rate limiting
- Best practices

---

## 🚀 Execution Strategy

### Option 1: Manual Testing (Recommended for Learning)

**Time**: 3-4 hours
**Approach**: Run each test manually, observe results
**Benefit**: Deep understanding of each system
**Tools**: Terminal, text editor, your brain

### Option 2: Automated Testing (Fast but Less Learning)

**Time**: 1 hour
**Approach**: Run all scripts automatically
**Benefit**: Quick results, repeatable
**Tools**: Bash scripts, Python scripts

### Option 3: Hybrid (Best Balance)

**Time**: 2 hours
**Approach**: Automate speed tests, manual quality assessment
**Benefit**: Efficiency + understanding
**Tools**: Scripts for speed, manual for quality

---

## 📋 Pre-Flight Checklist

Before starting, ensure:

- [ ] All API keys are configured
- [ ] All CLIs are installed
- [ ] Router issue documented (OpenAI block)
- [ ] Test data prepared
- [ ] Output directory created
- [ ] Time allocated (2-4 hours)

---

## 🎯 Success Criteria

You'll know you're done when you have:

- [ ] Complete inventory of all models
- [ ] Performance data for CLI vs API
- [ ] Quality assessment for each model
- [ ] Cost analysis for typical usage
- [ ] Clear recommendations for when to use each
- [ ] Integration examples that work
- [ ] Reference guide you can consult anytime

---

## 💡 Key Questions to Answer

1. **CLI vs API**: Is API always faster? (Expected: Yes)
2. **Quality**: Which model is best for code? (Expected: Codex/Claude)
3. **Speed**: Which is fastest? (Expected: Gemini Flash API)
4. **Cost**: Which is cheapest? (Expected: Gemini Flash)
5. **Value**: Are you using the right model for each task?
6. **Router**: Should you fix the OpenAI block? (Depends on findings)

---

## 🔄 Next Steps

1. **Review this plan** - Make sure it covers everything you want
2. **Allocate time** - Block 2-4 hours for testing
3. **Prepare environment** - Install any missing tools
4. **Execute Phase 1** - Start with CLI inventory
5. **Collect data** - Document everything
6. **Create reference guide** - Synthesize findings

---

## ⚠️ Important Notes

### About Your Subscriptions

**You are NOT paying separately for CLI and API!**

- **Claude Max**: $200 = CLI + API + Credits
- **ChatGPT Pro**: $100 = CLI + API (router blocking API)
- **Google AI Pro**: $20 = Web + CLI + API

**The subscription includes BOTH CLI and API access.**

CLI is just a convenient interface to the API. When you use:

- `claude exec` → It calls the Claude API internally
- `codex exec` → It calls OpenAI API internally
- `gemini` → It calls Gemini API internally

**Key Insight**: You already have API access! CLI is just a wrapper.

### Why Use API Directly?

1. **Faster** - No CLI startup overhead
2. **Flexible** - Integrate into any code
3. **Scriptable** - Automate workflows
4. **Efficient** - Lower latency
5. **Professional** - Production-ready

### When to Use CLI?

1. **Interactive work** - Quick tests, exploration
2. **Learning** - See how models respond
3. **Convenience** - Don't want to write code
4. **MCP integration** - Codex has great MCP support

---

**Ready to start? Let me know which phase you want to tackle first!**
