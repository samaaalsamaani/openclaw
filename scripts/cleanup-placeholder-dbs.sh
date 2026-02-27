#!/bin/bash
# PAIOS Phase 18 - Remove placeholder SQLite files
#
# PURPOSE: Clean up legacy 0-byte placeholder databases from old architecture
# USAGE: ./scripts/cleanup-placeholder-dbs.sh
# SAFETY: Checks file size (0 bytes) and open handles (lsof) before removal
# RUN ONCE: This is a one-time migration, not for repeated use
#
# Files removed:
#   - ~/.openclaw/projects/social-history.sqlite (0 bytes, real db is ~/.openclaw/social-history.sqlite)
#   - ~/.openclaw/social.sqlite (0 bytes, placeholder from old architecture)
#   - ~/.openclaw/knowledge-base.sqlite (0 bytes, real db is ~/.openclaw/projects/knowledge-base/kb.sqlite)
#
# Prerequisites: Stop all services before running
#   launchctl stop ai.openclaw.gateway
#   launchctl stop ai.openclaw.embedding-server
#   launchctl stop ai.openclaw.file-watcher

set -e

echo "=== PAIOS Phase 18: Placeholder Database Cleanup ==="
echo ""

# Define placeholder files to remove
PLACEHOLDERS=(
  "$HOME/.openclaw/projects/social-history.sqlite"
  "$HOME/.openclaw/social.sqlite"
  "$HOME/.openclaw/knowledge-base.sqlite"
)

REMOVED_COUNT=0
SKIPPED_COUNT=0

# Process each placeholder file
for file in "${PLACEHOLDERS[@]}"; do
  echo "Checking: $file"

  # Check if file exists
  if [ ! -f "$file" ]; then
    echo "  → File does not exist (already removed or never created)"
    continue
  fi

  # Check file size is 0 bytes
  if [ -s "$file" ]; then
    echo "  ⚠️  WARNING: File not empty, skipping: $file"
    ((SKIPPED_COUNT++))
    continue
  fi

  # Check if any process has file open
  if lsof "$file" 2>/dev/null | grep -q .; then
    echo "  ⚠️  WARNING: File in use, skipping: $file"
    echo "     Stop services first: launchctl stop ai.openclaw.gateway"
    ((SKIPPED_COUNT++))
    continue
  fi

  # Safe to remove
  rm "$file"
  echo "  ✓ Removed placeholder: $file"
  ((REMOVED_COUNT++))
done

echo ""
echo "=== Cleanup Summary ==="
echo "Files removed: $REMOVED_COUNT"
echo "Files skipped: $SKIPPED_COUNT"
echo ""

echo "=== Verification ==="
echo "Real databases that should remain:"
ls -lh "$HOME/.openclaw/observability.sqlite" 2>/dev/null || echo "WARNING: observability.sqlite missing"
ls -lh "$HOME/.openclaw/social-history.sqlite" 2>/dev/null || echo "WARNING: social-history.sqlite missing"
ls -lh "$HOME/.openclaw/autonomy.sqlite" 2>/dev/null || echo "WARNING: autonomy.sqlite missing"
ls -lh "$HOME/.openclaw/projects/knowledge-base/kb.sqlite" 2>/dev/null || echo "WARNING: kb.sqlite missing"
ls -lh "$HOME/.openclaw/memory/main.sqlite" 2>/dev/null || echo "WARNING: memory main.sqlite missing"
ls -lh "$HOME/.openclaw/projects/personal-ceo/ceo.sqlite" 2>/dev/null || echo "WARNING: ceo.sqlite missing"

echo ""
echo "Placeholders that should be gone:"
for file in "${PLACEHOLDERS[@]}"; do
  if [ -f "$file" ]; then
    echo "  ⚠️  $file STILL EXISTS (unexpected)"
  else
    echo "  ✓ $file removed"
  fi
done

echo ""
echo "=== Cleanup Complete ==="
