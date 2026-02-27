# Skills Management Guide

Complete guide to installing, developing, organizing, and integrating Claude Code skills.

## Quick Navigation

- [What Are Skills?](#what-are-skills)
- [Installation](#installation)
- [Skill Anatomy](#skill-anatomy)
- [Development Guide](#development-guide)
- [Organization](#organization)
- [Integration Patterns](#integration-patterns)
- [Real-World Examples](#real-world-examples)
- [Troubleshooting](#troubleshooting)

## What Are Skills?

**Skills** are custom workflows and commands that extend Claude Code's capabilities. Think of them as structured prompts with specific tools and permissions.

### Key Concepts

- **Invocation:** Skills are invoked with `/skill-name [arguments]` in Claude Code
- **YAML Frontmatter:** Metadata defines skill behavior (name, tools, arguments)
- **Markdown Body:** Instructions for Claude on how to execute the skill
- **Tool Restrictions:** Skills can restrict which tools Claude may use
- **Permissions:** Skills inherit parent session permissions

### When to Use Skills vs Prompts

| Use Skill When...       | Use Direct Prompt When... |
| ----------------------- | ------------------------- |
| Workflow is repeatable  | One-off request           |
| Specific tools required | General-purpose           |
| Need argument parsing   | No parameters             |
| Team needs consistency  | Personal exploration      |
| Complex multi-step flow | Simple single action      |

---

## Installation

### Method 1: Manual Installation

```bash
# 1. Create skill directory
mkdir -p ~/.claude/skills/my-skill

# 2. Create SKILL.md file
cat > ~/.claude/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Brief description shown in skill listings
allowed-tools: Bash, Read
---

# My Skill

Instructions for Claude...
EOF

# 3. Verify installation
ls -la ~/.claude/skills/my-skill/
```

### Method 2: Clone from Repository

```bash
# Clone skill pack
git clone https://github.com/example/claude-skills ~/.claude/skills-temp

# Copy desired skill
cp -r ~/.claude/skills-temp/my-skill ~/.claude/skills/

# Cleanup
rm -rf ~/.claude/skills-temp
```

### Method 3: Symlink (Development)

```bash
# Link from development directory
ln -s ~/projects/my-claude-skill ~/.claude/skills/my-skill

# Now edits in ~/projects/my-claude-skill are live
```

### Verification

```bash
# List all installed skills
ls -d ~/.claude/skills/*/

# Test skill invocation
# In Claude Code: /my-skill test
```

---

## Skill Anatomy

### Directory Structure

```
~/.claude/skills/my-skill/
├── SKILL.md          # Required: Skill definition
├── README.md         # Optional: Documentation
├── scripts/          # Optional: Helper scripts
│   ├── helper.sh
│   └── validator.py
└── tests/            # Optional: Test cases
    └── test.sh
```

### SKILL.md Format

```markdown
---
name: skill-name
description: Brief description (shown in skill listings)
argument-hint: [optional hint for arguments]
allowed-tools: Tool1, Tool2, ToolPattern*
---

# Skill Title

Detailed instructions for Claude on how to execute this skill.

## Usage

The user invokes this with `/skill-name $ARGUMENTS`

## Workflow

### Step 1: Parse Arguments

Extract parameters from `$ARGUMENTS`...

### Step 2: Execute Logic

Run the main workflow...

### Step 3: Present Results

Format and display output...
```

### YAML Frontmatter Reference

| Field           | Type   | Required | Purpose                                |
| --------------- | ------ | -------- | -------------------------------------- |
| `name`          | string | Yes      | Skill invocation name (use kebab-case) |
| `description`   | string | Yes      | Brief description (1-2 sentences)      |
| `argument-hint` | string | No       | Hint for expected arguments            |
| `allowed-tools` | string | No       | Comma-separated list of allowed tools  |

### allowed-tools Patterns

**Exact match:**

```yaml
allowed-tools: Read, Write, Bash
```

**Wildcard (all):**

```yaml
allowed-tools: "*"
```

**Glob patterns:**

```yaml
allowed-tools: mcp__knowledge-base__*, Task*
```

**Inherit from parent:**

```yaml
# Omit allowed-tools field
```

**Restrict heavily (read-only):**

```yaml
allowed-tools: Read, Glob, Grep
```

### Decision Tree: Tool Permissions

```
What tools does this skill need?
├─ Read-only operations (query, search)
│  └─ allowed-tools: Read, Glob, Grep, Bash
├─ File modifications
│  └─ allowed-tools: Read, Write, Edit, Bash
├─ External API calls
│  └─ allowed-tools: WebFetch, Bash
├─ MCP server tools
│  └─ allowed-tools: mcp__server-name__*
├─ Task management
│  └─ allowed-tools: Task*, Read, Write
└─ Unrestricted (inherit from parent)
   └─ Omit allowed-tools field
```

---

## Development Guide

### Step 1: Identify Need

**Questions to ask:**

- Is this workflow repeatable?
- Do I invoke this often?
- Would teammates benefit from this?
- Does it require specific tools/order?

**If yes to 2+, create a skill.**

### Step 2: Design Workflow

**Break down into steps:**

1. **Parse arguments** - Extract parameters from `$ARGUMENTS`
2. **Validate inputs** - Check for required data
3. **Execute logic** - Run the core workflow
4. **Present results** - Format output for user
5. **Offer follow-ups** - Suggest next actions

**Example:**

````markdown
## Workflow

### 1. Parse the query

Extract search query from `$ARGUMENTS`. If empty, show recent items.

### 2. Run the search

```bash
node ~/.openclaw/projects/kb/query.js --json "$ARGUMENTS"
```
````

### 3. Present results

For each result, show:

- Title and type
- Summary
- Tags

### 4. Offer follow-up actions

- "Want the full article?" — read content
- "Search again?" — run another query

````

### Step 3: Write SKILL.md

**Template:**

```markdown
---
name: my-skill
description: Brief one-liner for skill listings
argument-hint: [parameters]
allowed-tools: Bash, Read, Write
---

# My Skill Title

High-level description of what this skill does.

## Usage

The user invokes this with `/my-skill $ARGUMENTS`

## Workflow

### 1. Step One

Detailed instructions...

```bash
# Example command
command --flag "$ARGUMENTS"
````

### 2. Step Two

More instructions...

## Examples

- `/my-skill example1` — does X
- `/my-skill example2` — does Y

## Notes

- Important caveats
- Performance considerations
- Error handling

````

### Step 4: Test Skill

**Manual testing:**

```bash
# 1. Create test directory
mkdir -p ~/.claude/skills/my-skill

# 2. Copy SKILL.md
cp my-skill.md ~/.claude/skills/my-skill/SKILL.md

# 3. Test in Claude Code
# Open Claude Code, type: /my-skill test
````

**Edge cases to test:**

- No arguments
- Invalid arguments
- Empty results
- Error conditions
- Long outputs
- Special characters

### Step 5: Document

**README.md template:**

````markdown
# My Skill

One-paragraph description.

## Installation

```bash
mkdir -p ~/.claude/skills/my-skill
cp SKILL.md ~/.claude/skills/my-skill/
```
````

## Usage

```
/my-skill [arguments]
```

## Examples

- `/my-skill example1` - Description
- `/my-skill example2` - Description

## Requirements

- Tool X must be installed
- API key Y must be configured
- Database Z must be accessible

## Troubleshooting

### Issue 1

**Symptoms:** Description

**Solution:** Steps to fix

```

### Step 6: Iterate

**Gather feedback:**
- Does it work as expected?
- Is output format clear?
- Are errors handled gracefully?
- Can teammates use it successfully?

**Refine:**
- Add error messages
- Improve output formatting
- Add examples
- Handle edge cases

---

## Organization

### Naming Conventions

**Skill name (YAML):**
- Use kebab-case: `my-skill-name`
- Be specific: `kb-search` not `search`
- Avoid generic names: `system-health` not `check`

**Directory name:**
- Match skill name: `~/.claude/skills/my-skill-name/`

**File names:**
- `SKILL.md` - Required (uppercase)
- `README.md` - Optional documentation
- `scripts/` - Helper scripts (lowercase)

### Categorization

**By function:**

```

~/.claude/skills/
├── knowledge/
│ ├── kb-search/
│ ├── kb-stats/
│ └── capture/
├── development/
│ ├── codex-review/
│ └── test-runner/
├── system/
│ ├── health/
│ └── diagnostics/
└── content/
├── post/
└── calendar/

```

**By team:**

```

~/.claude/skills/
├── shared/ # Team-wide skills
├── personal/ # Your custom skills
└── experimental/ # WIP skills

````

### Version Control

**Recommended structure:**

```bash
# In your project repo
mkdir -p .claude/skills

# Add skills to repo
cp -r ~/.claude/skills/my-skill .claude/skills/

# Symlink to local config
ln -s $(pwd)/.claude/skills/my-skill ~/.claude/skills/my-skill
````

**Gitignore patterns:**

```gitignore
# Exclude personal skills
.claude/skills/personal/

# Exclude experimental skills
.claude/skills/experimental/

# Include shared skills
!.claude/skills/shared/
```

---

## Integration Patterns

### Pattern 1: MCP Tool Wrapper

**Use case:** Simplify MCP tool invocation with friendly interface.

**Example:**

```markdown
---
name: kb
description: Query knowledge base with natural language
allowed-tools: mcp__knowledge-base__*
---

# Knowledge Base Query

## Workflow

### 1. Parse query

Extract search terms from `$ARGUMENTS`

### 2. Call MCP tool

Use `mcp__knowledge-base__kb_smart_query` with the query

### 3. Format results

Present in user-friendly format
```

**Benefits:**

- Hides MCP complexity
- Adds argument parsing
- Customizes output format
- Provides examples

### Pattern 2: Script Orchestrator

**Use case:** Execute complex bash/node scripts with proper error handling.

**Example:**

````markdown
---
name: health
description: System health check for all services
allowed-tools: Bash, Read
---

# System Health Check

## Workflow

### 1. Check Gateway

```bash
curl -s http://127.0.0.1:18789/health
```
````

### 2. Check API Keys

Test each API key with minimal call...

### 3. Check MCP Servers

```bash
ps aux | grep mcp-server
```

### 4. Present Report

Format results as table...

````

**Benefits:**
- Orchestrates multiple checks
- Handles errors gracefully
- Formats output consistently
- Provides actionable feedback

### Pattern 3: Workflow Pipeline

**Use case:** Multi-step workflows with decision points.

**Example:**

```markdown
---
name: capture
description: Capture and analyze web content into KB
allowed-tools: WebFetch, mcp__knowledge-base__*, Bash
---

# Content Capture

## Workflow

### 1. Fetch content
Use `WebFetch` to retrieve URL

### 2. Analyze content
Extract key points, themes, entities

### 3. Generate metadata
Create title, summary, tags

### 4. Confirm with user
Show preview, ask "Ingest to KB?"

### 5. Ingest to KB
Use `mcp__knowledge-base__kb_article_create`
````

**Benefits:**

- Breaks complex task into steps
- Adds human-in-the-loop
- Provides feedback at each step
- Handles failures gracefully

### Pattern 4: Decision Tree

**Use case:** Skills that branch based on input/context.

**Example:**

```markdown
---
name: gsd-phase
description: GSD phase navigation (plan, execute, verify)
allowed-tools: Read, Write, Bash, Task*
---

# GSD Phase Navigation

## Workflow

### 1. Detect current phase

Read `~/.claude/get-shit-done/PROJECT.md`, extract phase number

### 2. Route to appropriate workflow

- Phase 1 (Planning) → Load `planning-agent` skill
- Phase 2 (Execution) → Load `execution-agent` skill
- Phase 3 (Verification) → Load `verification-agent` skill

### 3. Execute phase-specific logic

Follow phase workflow...
```

**Benefits:**

- Single entry point for complex system
- Context-aware routing
- Simplifies user experience

---

## Real-World Examples

### Example 1: Knowledge Base Query

**Location:** `~/.claude/skills/kb/SKILL.md`

**Purpose:** Natural language search over knowledge base.

**Key Features:**

- Argument parsing (query, filters)
- MCP tool integration
- Formatted output
- Follow-up suggestions

**Usage:**

```
/kb machine learning
/kb --para project
/kb --recent 10
```

**Design Patterns:**

- MCP Tool Wrapper
- User-friendly interface
- Multiple invocation modes

---

### Example 2: System Health Check

**Location:** `~/.claude/skills/health/SKILL.md`

**Purpose:** Comprehensive health check for all AI services, APIs, and databases.

**Key Features:**

- Multiple API tests
- Process monitoring
- Database connectivity
- Formatted report

**Usage:**

```
/health
```

**Design Patterns:**

- Script Orchestrator
- Error handling
- Tabular output

---

### Example 3: Content Capture

**Location:** `~/.claude/skills/capture/SKILL.md`

**Purpose:** Capture web content, analyze, and ingest to knowledge base.

**Key Features:**

- WebFetch integration
- Content analysis
- User confirmation
- KB ingestion

**Usage:**

```
/capture https://example.com/article
```

**Design Patterns:**

- Workflow Pipeline
- Human-in-the-loop
- Multi-tool orchestration

---

### Example 4: Codex Review

**Location:** `~/.claude/skills/codex-review/SKILL.md`

**Purpose:** Dual-brain code review (Claude + Codex perspectives).

**Key Features:**

- MCP codex-cli integration
- Parallel reviews
- Comparative analysis
- Actionable feedback

**Usage:**

```
/codex-review src/file.ts
```

**Design Patterns:**

- MCP Tool Wrapper
- Multi-perspective analysis
- Structured output

---

## Troubleshooting

### Skill Not Found

**Symptoms:** `/my-skill` shows "Skill not found" error.

**Solutions:**

1. Check skill directory exists:

   ```bash
   ls -la ~/.claude/skills/my-skill/
   ```

2. Check SKILL.md exists and is named correctly (uppercase):

   ```bash
   ls -la ~/.claude/skills/my-skill/SKILL.md
   ```

3. Verify YAML frontmatter is valid:

   ```bash
   head -10 ~/.claude/skills/my-skill/SKILL.md
   ```

4. Restart Claude Code completely

---

### Tool Permission Denied

**Symptoms:** Skill tries to use tool but gets permission error.

**Solutions:**

1. Check `allowed-tools` in YAML frontmatter:

   ```yaml
   allowed-tools: Read, Write, Bash
   ```

2. Verify tool name is correct (case-sensitive):
   - Correct: `Bash`, `Read`, `Write`
   - Wrong: `bash`, `read`, `write`

3. Use wildcard if needed:

   ```yaml
   allowed-tools: "*"
   ```

4. Omit `allowed-tools` to inherit parent permissions

---

### Arguments Not Parsing

**Symptoms:** Skill receives wrong arguments or `$ARGUMENTS` is empty.

**Solutions:**

1. Check skill invocation syntax:

   ```
   /my-skill argument1 argument2
   ```

2. Extract arguments correctly in SKILL.md:

   ```bash
   QUERY="$ARGUMENTS"
   ```

3. Handle empty arguments:

   ```bash
   if [ -z "$ARGUMENTS" ]; then
     echo "Usage: /my-skill [query]"
     exit 1
   fi
   ```

4. Quote arguments with spaces:
   ```
   /my-skill "multi word query"
   ```

---

### Skill Output Not Showing

**Symptoms:** Skill runs but no output appears.

**Solutions:**

1. Verify script prints to stdout:

   ```bash
   echo "Output text"
   ```

2. Check for errors redirected to /dev/null:

   ```bash
   # Wrong:
   command 2>/dev/null

   # Right:
   command 2>&1
   ```

3. Test script manually:

   ```bash
   bash ~/.claude/skills/my-skill/scripts/helper.sh
   ```

4. Add debug output:
   ```bash
   echo "DEBUG: Script reached this point"
   ```

---

### MCP Tool Not Available

**Symptoms:** Skill tries to use MCP tool but it's not found.

**Solutions:**

1. Check MCP server is running:

   ```bash
   ps aux | grep mcp-server
   ```

2. Verify MCP server configuration:

   ```bash
   cat ~/.claude/.mcp.json
   ```

3. Test MCP tool directly:

   ```
   # In Claude Code:
   Use mcp__knowledge-base__kb_query
   ```

4. Restart Claude Code to reconnect MCP servers

---

### Skill Times Out

**Symptoms:** Skill execution exceeds timeout and gets killed.

**Solutions:**

1. Check timeout in parent session (settings.json)
2. Optimize slow operations:
   - Cache expensive calls
   - Limit result counts
   - Use async operations
3. Add progress indicators:
   ```bash
   echo "Searching... (this may take a moment)"
   ```
4. Consider splitting into multiple skills

---

## Best Practices

### Design Principles

1. **Single Responsibility** - One skill, one clear purpose
2. **Fail Gracefully** - Handle errors, show helpful messages
3. **User-Friendly** - Clear output, actionable feedback
4. **Fast Execution** - Optimize for speed, cache when possible
5. **Self-Documenting** - Include examples, usage notes

### Naming Guidelines

**DO:**

- Use descriptive names: `kb-search`, `system-health`
- Be specific: `codex-review` not `review`
- Use kebab-case: `my-skill-name`

**DON'T:**

- Use generic names: `check`, `run`, `do`
- Use camelCase or snake_case
- Use abbreviations: `sys-hlth` instead of `system-health`

### Documentation Standards

**Minimum documentation:**

- YAML frontmatter (name, description)
- Usage section (how to invoke)
- Workflow section (steps to execute)
- Examples section (sample invocations)

**Recommended additions:**

- README.md for installation instructions
- Requirements section (dependencies, API keys)
- Troubleshooting section (common issues)
- Notes section (caveats, performance tips)

### Security Considerations

1. **Never hardcode secrets** - Use environment variables
2. **Validate inputs** - Check for injection attacks
3. **Restrict tools** - Use `allowed-tools` to limit scope
4. **Audit external calls** - Review WebFetch, Bash usage
5. **Version control carefully** - Don't commit API keys

---

## See Also

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) - Hooks documentation
- [MCP-SERVERS.md](./MCP-SERVERS.md) - MCP server configuration
- [KEYBINDINGS-GUIDE.md](./KEYBINDINGS-GUIDE.md) - Keybinding setup
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Configuration best practices
