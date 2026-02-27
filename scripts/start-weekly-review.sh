#!/usr/bin/env bash

WEEK_DATE=$(date +%Y-%m-%d)
TEMPLATE="docs/templates/WEEKLY-REVIEW.md"
OUTPUT="docs/reviews/weekly-review-$WEEK_DATE.md"

mkdir -p docs/reviews
cp "$TEMPLATE" "$OUTPUT"

echo "Weekly review created: $OUTPUT"
echo "Fill it out and commit when done!"
