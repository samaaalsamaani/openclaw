# Graph Database Requirements - OpenClaw Conversation

**Send these messages to OpenClaw via Telegram for requirements gathering:**

---

## Message 1: Opening Question

Hey! I'm researching what you need from the graph intelligence layer. You now have:

- 7,273 nodes (Events, Moments, Signals, Beliefs, Lessons)
- 1,000 causal edges (error → cause chains)
- 21 officer signals, 50 beliefs, 26 lessons

**First question: What questions about your life or decisions can't you easily answer right now?**

Like "Why do I keep making the same mistakes?" or "What predicts a bad day?" or "Did this decision actually help?"

What frustrates you because the data exists but isn't connected?

---

## Message 2: Pattern Recognition

You have Beliefs that track what you think is true, and Lessons from past experiences.

**When should the graph actively alert you vs quietly track patterns?**

Examples:

- If a Belief loses confidence (contradicting events) → alert immediately? Weekly?
- If you learned a Lesson but the error happens again → escalate? How urgently?
- If 3+ similar Signals appear in a week → what should trigger?

What's "FYI" vs "ACT NOW"?

---

## Message 3: Causal Depth

The graph has 1,000 causal edges showing what led to what.

**For understanding why something happened, how deep should we trace?**

- 1-hop: "Error caused by deployment" ✓
- 2-hop: "Deployment caused by decision"
- 3-hop: "Decision prompted by signal"
- 5-hop: Full chain belief → decision → action → event → outcome

At what point is it too much detail?

And **what confidence threshold matters?** Show all causes, or only >80% confident ones?

---

## Message 4: Learning Evolution

26 Lessons extracted, tracking if they're applied.

**What makes a lesson worth keeping vs archiving?**

Should I track:

- Successfully applied lessons (keep as playbooks)
- Learned but never applied (review why?)
- Obsolete lessons (evolved into better ones)

**How do you want reminders?**

- Before similar decisions (proactive)
- After errors recur (reactive)
- Weekly review list
- Never, query when needed

---

## Message 5: Entity Intelligence

Will have 2,488 Entities (systems, tools, people, concepts).

**What do you want to know about entities that plain data can't show?**

Like:

- Which tools cause most errors? (reliability score)
- Which people are in successful decisions? (collaboration patterns)
- Which systems have hidden dependencies? (clustering)
- What concepts are central to your thinking? (PageRank)

Should entities have reputation/impact scores?

---

## Message 6: Time Patterns

90 Moments (daily spine).

**What time-based patterns would change your behavior if proven?**

Examples:

- "Errors spike 2 days after infrastructure decisions" → Wait longer?
- "Low scores correlate with >3 CTO signals" → Delegate more?
- "Weekend posts get 2x engagement" → Change schedule?

Which temporal correlations would you actually act on?

Daily/weekly/monthly patterns - which matter most?

---

## Message 7: Decision Outcomes

~2,491 Decisions in the graph.

**How should I prompt you to evaluate decision outcomes?**

Options:

- Auto-prompt after 30 days: "Did 'X' improve things?"
- Weekly review: "Rate these 5 decisions"
- On-demand only
- Triggered when metrics change

What happens with ratings?

- Low → extract lessons?
- High → reinforce beliefs?
- Mixed → deeper analysis?

---

## Message 8: Hidden Correlations

Graph unifies observability, KB, autonomy, social media.

**What hidden connections do you suspect exist but can't prove?**

Like:

- Stress (low day score) → riskier decisions?
- Social success → certain belief types?
- System errors → relationship changes?
- Content drops → autonomy trust issues?

Which cross-system patterns would surprise you?

---

## Message 9: The One Thing

**If the graph could do ONE thing perfectly, what would transform how you operate?**

Is it:

- Predict bad days before they happen?
- Prevent repeating mistakes?
- Validate beliefs with evidence?
- Find root causes faster?
- Track decision quality?
- Something else?

What's the decision you wish you could make better?

---

## Message 10: Daily Workflow

**How should the graph fit into your daily routine?**

Morning briefing:

- Show me patterns from similar past days?
- Highlight unapplied lessons?
- Flag shaky beliefs?

Throughout the day:

- Proactive warnings ("this decision pattern failed before")?
- Just-in-time context ("here's what happened last time")?
- Silent logging?

End of day:

- Reflection prompts?
- Pattern summaries?
- Lesson extraction?

**What rhythm feels right for graph intelligence in your life?**

---

**How to send:**
Copy each message and send to OpenClaw via Telegram. These questions will help us understand what intelligence capabilities matter most and shape the graph to deliver real value.
