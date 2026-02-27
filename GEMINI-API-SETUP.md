# Gemini Pro API Setup Guide

**Date**: February 27, 2026
**Subscription**: ✅ Google AI Pro (Confirmed)
**Status**: Need to configure API access

---

## ✅ Subscription Confirmed

You have **Google AI Pro** which includes:

- Gemini Advanced (most capable model)
- Deep Research capabilities
- Veo 3 video generation
- 2M token context window
- Higher API rate limits
- Priority access to new features

**Cost:** ~$20/month
**Value:** Premium Gemini access

---

## 🔑 Get Your API Key (5 Minutes)

### Step 1: Open AI Studio

Browser should have opened: https://aistudio.google.com/app/apikey

Or visit manually:

```bash
open https://aistudio.google.com/app/apikey
```

### Step 2: Create API Key

1. Click **"Create API Key"** button
2. Select **"Create API key in new project"** (or use existing project)
3. Click **"Create API Key"**
4. **Copy the key** (starts with `AIza...`)

⚠️ **IMPORTANT:** Copy the key immediately - you can't see it again!

### Step 3: Test the API Key

Paste your key here and run:

```bash
# Replace YOUR_KEY with the actual key
export GEMINI_API_KEY='YOUR_KEY_HERE'

# Test it
python3 /tmp/test_gemini.py
```

You should see:

```
✅ API Access: Working
🌟 GEMINI PRO DETECTED
   Features:
   • Access to Gemini 2.5 Pro
   • Higher rate limits
   • Priority access to new models
   • 2M token context window
```

---

## 🔧 Configure in Your System

### Option 1: Add to auth-profiles.json (Recommended)

```bash
# Add to ~/.openclaw/agents/main/agent/auth-profiles.json
```

Update the file:

```json
{
  "version": 1,
  "profiles": {
    "google:default": {
      "type": "api_key",
      "provider": "google",
      "key": "YOUR_GEMINI_API_KEY_HERE"
    }
  }
}
```

### Option 2: Add to Environment

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export GEMINI_API_KEY='YOUR_KEY_HERE'
```

Then reload:

```bash
source ~/.zshrc
```

### Option 3: Add to models.json

Update `~/.openclaw/agents/main/agent/models.json`:

```json
{
  "providers": {
    "google": {
      "baseUrl": "https://generativelanguage.googleapis.com/v1",
      "api": "google-genai",
      "apiKey": "YOUR_KEY_HERE",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "api": "google-genai",
          "input": ["text", "image"],
          "contextWindow": 2097152,
          "maxTokens": 8192,
          "reasoning": false,
          "cost": {
            "input": 1.25,
            "output": 5.0,
            "cacheRead": 0.3125,
            "cacheWrite": 2.5
          }
        },
        {
          "id": "gemini-2.5-flash",
          "name": "Gemini 2.5 Flash",
          "api": "google-genai",
          "input": ["text", "image"],
          "contextWindow": 1048576,
          "maxTokens": 8192,
          "reasoning": false,
          "cost": {
            "input": 0.15,
            "output": 0.6,
            "cacheRead": 0.0375,
            "cacheWrite": 0.3
          }
        },
        {
          "id": "gemini-3-flash-preview",
          "name": "Gemini 3 Flash Preview",
          "api": "google-genai",
          "input": ["text", "image"],
          "contextWindow": 1048576,
          "maxTokens": 8192,
          "reasoning": false,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

---

## 📊 Available Models with Google AI Pro

### Gemini 2.5 Pro (Premium)

```
Model: gemini-2.5-pro
Context: 2M tokens
Output: 8K tokens
Features: Most capable, advanced reasoning
Best for: Complex tasks, deep analysis
Cost: $1.25/M in, $5.00/M out
```

### Gemini 2.5 Flash (Fast)

```
Model: gemini-2.5-flash
Context: 1M tokens
Output: 8K tokens
Features: Fast, efficient
Best for: Quick tasks, high volume
Cost: $0.15/M in, $0.60/M out
```

### Gemini 3 Flash Preview (Latest)

```
Model: gemini-3-flash-preview
Context: 1M tokens
Output: 8K tokens
Features: Newest preview
Best for: Testing latest features
Cost: Free during preview
```

---

## 🎯 Integration Strategy

### Replace OpenRouter Gemini

**Before (via OpenRouter):**

```typescript
model: "openrouter/google/gemini-2.5-flash"
cost: OpenRouter markup (10-30%)
limits: OpenRouter rate limits
```

**After (direct API):**

```typescript
model: "google/gemini-2.5-flash"
cost: Direct pricing (cheaper)
limits: Pro tier limits (higher)
```

### Routing Strategy

```typescript
// Use Gemini for:
- Vision/image tasks (excellent vision capabilities)
- Long context (2M tokens with Pro)
- Fast iteration (Flash is very fast)
- Cost-sensitive tasks (Flash is cheap)

// Use Claude for:
- Complex reasoning (Opus 4.6)
- Code generation (Sonnet 4.6)
- Long-form writing

// Use OpenAI Codex for:
- Code-specific tasks (gpt-5.3-codex)
```

---

## 💰 Cost Comparison

### Current (via OpenRouter)

```
Gemini 2.5 Flash: $0.20/M in (estimated with markup)
Access: Free tier via OpenRouter
Limits: Shared rate limits
Value: Low (not using Pro subscription)
```

### With Direct API

```
Gemini 2.5 Flash: $0.15/M in (direct)
Gemini 2.5 Pro: $1.25/M in (premium)
Access: Pro tier
Limits: Higher rate limits
Value: High (using $20/month subscription)
```

### Savings

- **10-30% cheaper** than OpenRouter
- **Higher rate limits** with Pro
- **Access to Pro models** (2.5 Pro, Deep Research)

---

## 🧪 Test Commands

### Test Basic Completion

```bash
export GEMINI_API_KEY='your-key'

curl "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{
      "parts": [{"text": "Say hello"}]
    }]
  }'
```

### Test with Python

```bash
python3 /tmp/test_gemini.py
```

### Test with curl (list models)

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}"
```

---

## 📋 Post-Setup Checklist

- [ ] **Got API key** from AI Studio
- [ ] **Tested API key** (runs without errors)
- [ ] **Confirmed Pro tier** (sees 2.5 Pro model)
- [ ] **Added to auth-profiles.json**
- [ ] **Updated models.json** (added Google provider)
- [ ] **Configured routing** (use Gemini for appropriate tasks)
- [ ] **Tested integration** (can call Gemini from code)
- [ ] **Documented models** (which to use when)
- [ ] **Set up monitoring** (track usage/costs)

---

## 🎯 Integration with OpenClaw

### Update Your Routing

Add Gemini as a provider option:

```typescript
// For vision tasks
if (hasImages) {
  return model: "google/gemini-2.5-flash"
}

// For long context
if (contextLength > 500000) {
  return model: "google/gemini-2.5-pro"
}

// For fast/cheap tasks
if (tier === "fast") {
  return model: "google/gemini-2.5-flash"
}
```

### Update Cost Tracking

Enable cost tracking in models.json:

```json
"cost": {
  "input": 0.15,
  "output": 0.60
}
```

---

## 🚨 Important Notes

### API Key Security

- **Never commit** API key to git
- **Store securely** in auth-profiles.json
- **Rotate periodically** for security

### Rate Limits (Pro Tier)

- **Higher limits** than free tier
- **Still has limits** - monitor usage
- **Costs apply** after free tier

### Model Availability

- **2.5 Pro** requires Pro subscription
- **Deep Research** may be web-only
- **Veo 3** may be separate API

---

## 💡 Pro Tips

### 1. Use Flash for Development

```
Gemini 2.5 Flash: $0.15/M input
8x cheaper than Sonnet 4.6 ($3/M)
Perfect for: Testing, prototyping, high volume
```

### 2. Use Pro for Production

```
Gemini 2.5 Pro: $1.25/M input
More capable than Flash
Best for: Complex tasks, critical paths
```

### 3. Cache Long Contexts

```
Cache reads: 75% cheaper
Cache writes: Some cost
Best for: Repeated long prompts
```

### 4. Leverage 2M Context

```
Can fit: Entire codebases
Use for: Comprehensive analysis
Remember: Costs scale with context
```

---

## 🎉 Success Indicators

Once configured, you should be able to:

```bash
# Call Gemini directly
curl with your API key → Success

# See in models list
Check models.json → Google provider listed

# Use in code
Your code → Calls Gemini → Gets response

# Track costs
Usage logs → Show Gemini API calls

# Verify Pro tier
API response → Includes 2.5 Pro model
```

---

## 📞 Next Steps

1. **Get API key** (do this now - browser should be open)
2. **Test with Python script** (verify Pro tier)
3. **Add to auth-profiles.json** (configure in system)
4. **Update models.json** (add Google provider)
5. **Test integration** (make a test call)
6. **Update routing** (use Gemini for appropriate tasks)

---

**Generated by**: Claude Sonnet 4.5
**Status**: ✅ Subscription confirmed, API key needed
**Next Action**: Get API key from AI Studio (browser opened)
**Expected Value**: $20/month worth of Gemini Pro access
