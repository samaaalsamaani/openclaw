# Quick Reference Cheatsheet

## 🎯 Before You Start ANY Task

**Ask yourself:** "Should I be using a skill for this?"

- Building → `brainstorming`
- Bug → `systematic-debugging`
- Project → `/gsd:new-project`
- Query → `/kb`
- Content → `/brand` → `/post`

## 🚀 Common Workflows

### Feature Development

```
brainstorming → writing-plans → executing-plans → verification
```

### Bug Fix

```
systematic-debugging → TDD → verification
```

### Multi-Phase Project

```
/gsd:new-project → /gsd:plan-phase → /gsd:execute-phase → /gsd:verify-work
```

## 📚 Essential Skills

| Skill                | When                     | Invoke                                        |
| -------------------- | ------------------------ | --------------------------------------------- |
| brainstorming        | Before building anything | Auto at session start                         |
| systematic-debugging | Hit a bug                | `@superpowers:systematic-debugging`           |
| verification         | Before claiming done     | `@superpowers:verification-before-completion` |
| /kb                  | Query knowledge          | `/kb <query>`                                 |
| /health              | Check systems            | `/health`                                     |

## ⚙️ GSD Commands

| Command                | Purpose               |
| ---------------------- | --------------------- |
| `/gsd:progress`        | Check project status  |
| `/gsd:plan-phase N`    | Plan phase N          |
| `/gsd:execute-phase N` | Execute phase N       |
| `/gsd:verify-work`     | Verify implementation |

## 🔧 Quick Checks

- Config valid? → `validate-gsd`
- Skills list? → `skills`
- System health? → `/health`
- View docs? → `docs`, `audit`, `plans`

## 🎬 Remember

1. **Skills first, code second**
2. **TDD always** (write test → fail → implement → pass)
3. **Verify before "done"**
4. **Commit frequently**
5. **When in doubt, ask** (don't rationalize skipping workflows)
