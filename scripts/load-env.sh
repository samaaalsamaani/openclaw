#!/bin/bash
# Auth-profiles.json is single source of truth (no plist fallback)
#
# PURPOSE: Load API credentials from auth-profiles.json into environment
# USAGE: source scripts/load-env.sh
# NOTE: This script must be sourced, not executed
#
# Exports environment variables for:
#   - ANTHROPIC_API_KEY
#   - OPENAI_API_KEY
#   - GOOGLE_API_KEY (if using Google Direct API)
#   - BRAVE_API_KEY (search API)
#   - Other API keys from auth-profiles

set -euo pipefail

# Resolve auth-profiles.json path
AUTH_PROFILES_PATH="${HOME}/.openclaw/auth-profiles.json"

# Verify auth-profiles.json exists
if [ ! -f "$AUTH_PROFILES_PATH" ]; then
  echo "ERROR: auth-profiles.json not found at $AUTH_PROFILES_PATH"
  echo "Auth-profiles.json is the single source of truth for API credentials."
  echo "Cannot fall back to plist or other sources."
  return 1 2>/dev/null || exit 1
fi

# Parse auth-profiles.json and export API keys
# Use jq to extract API keys from profiles

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required to parse auth-profiles.json"
  echo "Install with: brew install jq"
  return 1 2>/dev/null || exit 1
fi

# Export Anthropic API key
ANTHROPIC_KEY=$(jq -r '.profiles.anthropic.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$ANTHROPIC_KEY" ]; then
  export ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
fi

# Export OpenAI API key
OPENAI_KEY=$(jq -r '.profiles.openai.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$OPENAI_KEY" ]; then
  export OPENAI_API_KEY="$OPENAI_KEY"
fi

# Export Google API key (if using Direct API)
GOOGLE_KEY=$(jq -r '.profiles.google.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$GOOGLE_KEY" ]; then
  export GOOGLE_API_KEY="$GOOGLE_KEY"
fi

# Export Brave Search API key
BRAVE_KEY=$(jq -r '.profiles.brave.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$BRAVE_KEY" ]; then
  export BRAVE_API_KEY="$BRAVE_KEY"
fi

# Export ElevenLabs API key
ELEVENLABS_KEY=$(jq -r '.profiles.elevenlabs.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$ELEVENLABS_KEY" ]; then
  export ELEVENLABS_API_KEY="$ELEVENLABS_KEY"
fi

# Export Deepgram API key
DEEPGRAM_KEY=$(jq -r '.profiles.deepgram.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$DEEPGRAM_KEY" ]; then
  export DEEPGRAM_API_KEY="$DEEPGRAM_KEY"
fi

# Export OpenRouter API key
OPENROUTER_KEY=$(jq -r '.profiles.openrouter.key // empty' "$AUTH_PROFILES_PATH")
if [ -n "$OPENROUTER_KEY" ]; then
  export OPENROUTER_API_KEY="$OPENROUTER_KEY"
fi

echo "✓ Loaded API credentials from auth-profiles.json"
