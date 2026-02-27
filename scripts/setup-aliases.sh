#!/usr/bin/env bash

cat << 'EOF'
# Superpowers & GSD Aliases

# Quick skill access (use in Claude Code sessions)
alias skills='cat ~/Desktop/projects/openclaw/docs/SKILLS-PLAYBOOK.md'
alias gsd-help='cat ~/Desktop/projects/openclaw/docs/GSD-GUIDE.md'

# GSD shortcuts
alias gsd:progress='/gsd:progress'
alias gsd:plan='/gsd:plan-phase'
alias gsd:exec='/gsd:execute-phase'
alias gsd:verify='/gsd:verify-work'

# PAIOS skills (when in CLI)
alias kb='~/.openclaw/bin/ai kb'
alias capture='~/.openclaw/bin/ai capture'
alias health='~/.openclaw/bin/ai health'

# Config validation
alias validate-gsd='~/Desktop/projects/openclaw/scripts/validate-config.sh'

# Documentation shortcuts
alias docs='cd ~/Desktop/projects/openclaw/docs && ls -la'
alias audit='cd ~/Desktop/projects/openclaw/docs/audit && ls -la'
alias plans='cd ~/Desktop/projects/openclaw/docs/plans && ls -la'

EOF
