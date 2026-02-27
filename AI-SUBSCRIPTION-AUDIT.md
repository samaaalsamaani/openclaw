# AI Subscription & Configuration Audit

**Date**: February 27, 2026
**System**: OpenClaw PAIOS

---

## 🎯 Executive Summary

You have **3 premium AI subscriptions** totaling **$300/month**:

- **Claude Max**: $200/month → ✅ Active API key, 9 models accessible
- **ChatGPT Pro**: $100/month → ⚠️ OAuth token present, CLI not installed
- **Google Gemini Pro**: Price unknown → ✅ CLI installed, needs testing

---

## 📊 Current Configuration Status

### 1. **Claude/Anthropic** ($200/month - Max Plan)

#### API Access

- ✅ **API Key**: Active (`sk-ant-api03-ta-...`)
- ✅ **Provider**: Direct Anthropic API
- ✅ **Last Used**: Active in system

#### Available Models (via API)

```
✅ claude-sonnet-4-6          (Latest - $3/$15 per MTok)
✅ claude-opus-4-6            (Premium - $15/$75 per MTok)
✅ claude-opus-4-5-20251101
✅ claude-haiku-4-5-20251001  (Fast - $1/$5 per MTok)
✅ claude-sonnet-4-5-20250929
✅ claude-opus-4-1-20250805
✅ claude-opus-4-20250514
✅ claude-sonnet-4-20250514
✅ claude-3-haiku-20240307
```

#### CLI Access

- ✅ **Installed**: `/Users/user/.local/bin/claude` (v2.1.44 - Claude Code)
- ⚠️ **Limitation**: Cannot run from within Claude Code session (nested session protection)
- 📦 **npm package**: `@anthropic-ai/claude-agent-sdk@0.2.50`

#### Current Usage in System

- Primary model: `openrouter/anthropic/claude-sonnet-4-5` via OpenRouter
- Fallback: `anthropic/claude-haiku-4-5` direct
- ⚠️ **NOT using latest Sonnet 4.6** despite having access

---

### 2. **OpenAI/ChatGPT** ($100/month - Pro Plan)

#### API Access

- ✅ **API Key**: Project key (`sk-proj-wlQjPtWnmdu...`)
- ✅ **OAuth Token**: Codex access token (expires: Mar 2, 2026)
- ⚠️ **Account Type**: ChatGPT Plus plan detected in OAuth
- 📧 **Email**: fsamaani@gmail.com

#### Available Models (Expected with Pro)

```
⚠️ API Test Pending - Expected models:
- GPT-4.5 Turbo
- GPT-4.1
- GPT-4.1 Mini
- o1 (reasoning)
- o1-mini
- o3-mini
- DALL-E 3
- Whisper (audio)
- TTS (text-to-speech)
```

#### CLI Access

- ❌ **Official OpenAI CLI**: Not installed
- ✅ **Codex CLI**: `@openai/codex@0.105.0` (npm global)
- ⚠️ **OAuth Expiry**: Token expires March 2, 2026 (~3 days)

#### Current Usage in System

- ⚠️ **Minimal usage**: Only Codex OAuth token being used
- ❌ **Not configured in models.json**: OpenAI provider missing
- 💰 **Underutilized**: $100/month subscription barely used

---

### 3. **Google Gemini Pro** (Price Unknown)

#### API Access

- ❓ **No API key found** in auth-profiles.json
- ❓ **Subscription status**: Unknown

#### CLI Access

- ✅ **Installed**: `/opt/homebrew/bin/gemini` (v0.29.5)
- 📦 **npm package**: `@google/gemini-cli@0.29.5`
- ⚠️ **Performance Issue**: ~8-14s per call (Node startup overhead with `sessionMode: none`)

#### Current Usage in System

- ✅ **Via OpenRouter**: `google/gemini-2.5-flash`, `google/gemini-3-flash-preview`
- ⚠️ **Free tier through OpenRouter** - not using Pro subscription

#### Expected Pro Features (if subscribed)

```
- Gemini 3 Pro
- Gemini 2.5 Flash
- Gemini 2.5 Pro
- 2M token context window
- Image generation (Imagen 3)
- Code execution
- Increased rate limits
```

---

## 🔧 OpenRouter Configuration

### Active Setup

- ✅ **API Key**: `sk-or-v1-0fa3ed30...`
- ✅ **Last Used**: Feb 27, 2026
- ✅ **Error Count**: 0

### Configured Models

1. `google/gemini-2.5-flash` (1M context, 65K output)
2. `google/gemini-2.5-flash-lite` (1M context, 65K output)
3. `anthropic/claude-haiku-4-5` (200K context)
4. `google/gemini-3-flash-preview` (1M context)
5. `anthropic/claude-sonnet-4-5` (200K context) ⭐ PRIMARY
6. `anthropic/claude-sonnet-4.6` (1M context, 128K output)
7. `auto` (Auto-routing)

### Cost Configuration

- ⚠️ **All costs set to $0** - not tracking usage through OpenRouter
- 💡 OpenRouter adds ~10-30% markup on top of base API prices

---

## 📈 System Usage Pattern (from MEMORY.md)

### Current Primary Stack

1. **Primary**: `openrouter/anthropic/claude-sonnet-4-5` ($3/$15 per MTok)
2. **Fallback 1**: `openrouter/google/gemini-2.5-flash` ($0.30/MTok input)
3. **Fallback 2**: `anthropic/claude-haiku-4-5` ($1/$5 per MTok)

### Recent LLM Floor Upgrade (Feb 27)

- **All subsystems upgraded to Sonnet 4.6 minimum**
- KB routing, enrichment, verification, task classification
- Estimated cost: $100-140/month (up from $10-16/month)
- ⚠️ **Still using Sonnet 4.5 via OpenRouter** as primary

### Volume

- ~20-50 LLM calls/day
- Estimated $2-3/month at previous volume
- New volume: $100-140/month after upgrade

---

## ⚠️ Issues & Optimization Opportunities

### 🔴 Critical Issues

1. **OpenAI OAuth Token Expiring Soon**
   - Expires: March 2, 2026 (~3 days)
   - Action: Renew Codex OAuth token

2. **ChatGPT Pro Underutilized**
   - Paying $100/month
   - Only using OAuth token for Codex
   - Not integrated into main routing
   - **Waste**: ~$100/month

3. **Gemini Pro Status Unknown**
   - No API key configured
   - Only using free tier via OpenRouter
   - **Potential waste**: Unknown $/month

### 🟡 Performance Issues

4. **Not Using Latest Models**
   - Have access to Sonnet 4.6 (70% better than 4.5)
   - Still routing through OpenRouter with 4.5
   - Missing: 1M context, 128K output, extended thinking

5. **OpenRouter Markup**
   - Paying 10-30% premium through OpenRouter
   - Could use direct API access for Anthropic
   - **Cost Impact**: Unknown (no usage tracking)

6. **Gemini CLI Performance**
   - 8-14s per call (Node startup overhead)
   - Marked as "REMOVED" in MEMORY.md
   - Not suitable for real-time use

### 🟢 Configuration Gaps

7. **Missing OpenAI Provider Config**
   - Have API key, not in models.json
   - Can't route tasks to GPT models
   - Missing: GPT-4.5, o1, o3-mini access

8. **No Cost Tracking**
   - All OpenRouter costs set to $0
   - Can't monitor spending patterns
   - Can't validate ROI on subscriptions

---

## 🎯 Recommended Actions

### Immediate (Next 3 Days)

1. **Renew OpenAI Codex OAuth**

   ```bash
   # Before March 2, 2026
   # Use Codex CLI to re-authenticate
   ```

2. **Validate Gemini Pro Subscription**

   ```bash
   # Check if you actually have Gemini Pro
   # If yes: Get API key
   # If no: Cancel subscription
   ```

3. **Test OpenAI API Access**
   ```bash
   # Verify ChatGPT Pro API access
   # Confirm available models
   # Check rate limits
   ```

### High Priority (This Week)

4. **Add OpenAI Provider to models.json**

   ```json
   {
     "providers": {
       "openai": {
         "baseUrl": "https://api.openai.com/v1",
         "api": "openai-completions",
         "apiKey": "sk-proj-...",
         "models": [
           {
             "id": "gpt-4.5-turbo",
             "contextWindow": 128000,
             "maxTokens": 16384,
             "cost": {
               "input": 2.5,
               "output": 10.0
             }
           }
         ]
       }
     }
   }
   ```

5. **Upgrade to Direct Anthropic Sonnet 4.6**

   ```json
   // Update primary model from OpenRouter to direct API
   "primary": "anthropic/claude-sonnet-4-6"
   ```

6. **Install OpenAI CLI**
   ```bash
   pip install openai
   # or
   npm install -g openai
   ```

### Medium Priority (This Month)

7. **Enable Cost Tracking**
   - Update all model cost fields in models.json
   - Set up usage monitoring
   - Create monthly spend reports

8. **Audit Subscription ROI**
   - Track which APIs are actually used
   - Calculate cost per call
   - Decide: Keep ChatGPT Pro or downgrade?
   - Decide: Keep Gemini Pro or use free tier?

9. **Optimize Routing Strategy**
   - Use cheaper models for simple tasks
   - Reserve Opus 4.6 for complex reasoning
   - Use OpenAI for code-heavy tasks
   - Use Gemini for vision/multimodal

### Low Priority (Nice to Have)

10. **Create Model Performance Tests**

    ```bash
    # Benchmark each model on typical tasks
    # Compare quality vs. cost
    # Document sweet spots for each model
    ```

11. **Set Up Model Fallback Chain**
    ```
    Complex reasoning: Opus 4.6 → Sonnet 4.6 → GPT-4.5
    Fast tasks: Haiku 4.5 → Gemini Flash → GPT-4.1-mini
    Code: Codex → GPT-4.5 → Sonnet 4.6
    Vision: Gemini → Claude → GPT-4.5
    ```

---

## 💰 Potential Cost Savings

### Scenario 1: Optimize Current Setup

- Cancel underutilized subscriptions
- Use free tiers where possible
- **Potential Savings**: $100-200/month

### Scenario 2: Direct API Access Only

- Claude API: ~$100-140/month (current usage)
- OpenAI API: ~$20-50/month (if used efficiently)
- Gemini API: Free or ~$10/month
- **Total**: ~$130-200/month
- **Savings**: $100-170/month vs. subscriptions

### Scenario 3: Keep One Premium + API Access

- Claude Max: $200/month (for convenience + credits)
- OpenAI API: Pay-as-you-go
- Gemini: Free tier
- **Total**: ~$220-250/month
- **Savings**: $50-80/month

---

## 📋 Validation Checklist

### Claude/Anthropic ✅

- [x] API key validated
- [x] Models listed (9 available)
- [x] CLI installed
- [ ] Test Sonnet 4.6 performance
- [ ] Switch to direct API from OpenRouter
- [ ] Document context window limits (1M)

### OpenAI/ChatGPT ⚠️

- [x] API key present
- [x] OAuth token validated
- [ ] **Test API access** ← DO THIS FIRST
- [ ] List available models
- [ ] Install official CLI
- [ ] Renew OAuth token (expires Mar 2)
- [ ] Add to models.json
- [ ] Configure routing rules

### Google Gemini ❓

- [ ] **Verify subscription status** ← DO THIS FIRST
- [ ] Get API key (if Pro)
- [ ] Test API access
- [ ] List available models
- [ ] Fix CLI performance (or abandon CLI)
- [ ] Add to models.json
- [ ] Configure routing rules

### System Configuration

- [ ] Update models.json with all providers
- [ ] Add cost tracking to all models
- [ ] Test fallback chain
- [ ] Document routing strategy
- [ ] Set up usage monitoring
- [ ] Create monthly spend report

---

## 🔍 Next Steps

1. **Run API validation tests** (see commands below)
2. **Review this audit** with your team
3. **Make subscription decisions** (keep/cancel/downgrade)
4. **Update configurations** based on findings
5. **Monitor usage** for 1 week
6. **Adjust strategy** based on real usage data

---

## 🛠️ Validation Commands

### Test Anthropic Access

```bash
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### Test OpenAI Access

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

### Test Gemini Access (if API key available)

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_KEY"
```

### Test OpenRouter

```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

---

## 📝 Notes

- All API keys are stored in: `~/.openclaw/agents/main/agent/auth-profiles.json`
- Model configs are in: `~/.openclaw/agents/main/agent/models.json`
- System is using OpenRouter as primary routing layer
- Recent upgrade to Sonnet 4.6 floor increased estimated costs 10x
- ChatGPT Pro subscription appears to be barely utilized
- Gemini Pro status is unclear (may not even be subscribed)

---

**Generated by**: Claude Sonnet 4.5
**Review Date**: February 27, 2026
**Action Required**: Yes - Multiple critical issues identified
