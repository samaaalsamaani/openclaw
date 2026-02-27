#!/usr/bin/env bash

# Determine which week we're in based on a start date
START_DATE="2026-02-27"  # Adjust to actual start date
CURRENT_DATE=$(date +%s)
START_TIMESTAMP=$(date -j -f "%Y-%m-%d" "$START_DATE" +%s 2>/dev/null || date -d "$START_DATE" +%s)
DAYS_SINCE_START=$(( ($CURRENT_DATE - $START_TIMESTAMP) / 86400 ))
WEEK=$(( ($DAYS_SINCE_START / 7) + 1 ))

echo "════════════════════════════════════════"
echo "   Daily Skills Checklist - Week $WEEK"
echo "════════════════════════════════════════"
echo ""

if [[ $WEEK -le 2 ]]; then
    echo "🎯 Focus: Core Skills"
    echo ""
    echo "[ ] Starting feature work? Used brainstorming?"
    echo "[ ] Hit a bug? Used systematic-debugging?"
    echo "[ ] Checked /kb for relevant knowledge?"
elif [[ $WEEK -le 4 ]]; then
    echo "🎯 Focus: GSD Basics + Core Skills"
    echo ""
    echo "[ ] Multi-phase work? Using GSD?"
    echo "[ ] Claiming 'done'? Ran verification?"
    echo "[ ] Still using core skills from Week 1-2?"
elif [[ $WEEK -le 6 ]]; then
    echo "🎯 Focus: PAIOS Skills + Previous"
    echo ""
    echo "[ ] Found useful content? Used /capture?"
    echo "[ ] Creating content? Used /brand + /post?"
    echo "[ ] Ran /health check this week?"
else
    echo "🎯 Focus: Full Integration"
    echo ""
    echo "[ ] All skills becoming automatic?"
    echo "[ ] Cross-system workflows smooth?"
    echo "[ ] Time saved increasing?"
fi

echo ""
echo "Quick access: \`skills\`, \`gsd-help\`, \`validate-gsd\`"
echo "════════════════════════════════════════"
