# Claude Configuration Documentation

Comprehensive guide to Claude CLI configuration, customization, and maintenance.

## Quick Start

New to Claude configuration? Start here:

1. [Quick Reference](QUICK-REFERENCE.md) - Essential commands and settings at a glance
2. [Best Practices](BEST-PRACTICES.md) - Recommended patterns for organizing your configuration
3. [Configuration Reference](CONFIG-REFERENCE.md) - Complete settings.json reference

## Core Documentation

### Configuration Files

- **[Configuration Reference](CONFIG-REFERENCE.md)** - Complete documentation of all configuration options
  - Global settings (`~/.claude/settings.json`)
  - Project-specific settings
  - Auth profiles and credentials
  - Environment variables
  - Configuration inheritance and precedence

### Customization

- **[Skills Guide](SKILLS-GUIDE.md)** - Creating and managing custom Claude skills
  - Skill structure and anatomy
  - Built-in vs custom skills
  - Skill development workflow
  - Debugging and testing skills
  - Advanced skill patterns

- **[Hooks Playbook](HOOKS-PLAYBOOK.md)** - Automating workflows with hooks
  - Hook types (PreToolUse, PostToolUse, SessionStart, etc.)
  - Common hook patterns
  - Knowledge base auto-ingestion
  - Tool routing and filtering
  - Context injection
  - Error handling in hooks

- **[Keybindings Guide](KEYBINDINGS-GUIDE.md)** - Customizing keyboard shortcuts
  - Default keybindings reference
  - Creating custom keybindings
  - Platform-specific bindings
  - Multi-key sequences
  - Context-aware bindings

### Integration

- **[MCP Servers](MCP-SERVERS.md)** - Integrating Model Context Protocol servers
  - MCP architecture overview
  - Configuring MCP servers
  - Built-in MCP servers
  - Custom MCP server development
  - Troubleshooting MCP connections
  - Security considerations

## Maintenance

- **[Maintenance Checklist](MAINTENANCE-CHECKLIST.md)** - Regular maintenance procedures
  - Weekly health checks
  - Monthly configuration review
  - Quarterly deep audits
  - Post-update validation
  - Emergency recovery procedures

- **[Update Procedures](UPDATE-PROCEDURES.md)** - Safe update workflows
  - Updating settings
  - Updating hooks
  - Updating skills
  - Updating MCP servers
  - Updating auth profiles
  - Rollback procedures

## Best Practices

- **[Best Practices](BEST-PRACTICES.md)** - Recommended patterns and anti-patterns
  - Configuration organization
  - Security best practices
  - Performance optimization
  - Project structure
  - Team collaboration
  - Debugging strategies

## Common Tasks

### Getting Started

- Install Claude CLI: [Official Installation Guide](https://docs.anthropic.com/claude/docs/claude-cli)
- Configure your first project: [Quick Reference](QUICK-REFERENCE.md#project-setup)
- Set up API authentication: [Configuration Reference](CONFIG-REFERENCE.md#auth-profiles)

### Customization

- Create a custom skill: [Skills Guide](SKILLS-GUIDE.md#creating-custom-skills)
- Add a hook for auto-ingestion: [Hooks Playbook](HOOKS-PLAYBOOK.md#knowledge-base-ingestion)
- Connect an MCP server: [MCP Servers](MCP-SERVERS.md#adding-mcp-servers)
- Customize keybindings: [Keybindings Guide](KEYBINDINGS-GUIDE.md#custom-keybindings)

### Maintenance

- Run a health check: [Maintenance Checklist](MAINTENANCE-CHECKLIST.md#weekly-maintenance)
- Update your configuration: [Update Procedures](UPDATE-PROCEDURES.md#general-update-principles)
- Troubleshoot MCP servers: [MCP Servers](MCP-SERVERS.md#troubleshooting)
- Recover from corruption: [Update Procedures](UPDATE-PROCEDURES.md#emergency-recovery)

## Advanced Topics

### Multi-Project Setups

- [Configuration Reference - Project Settings](CONFIG-REFERENCE.md#project-specific-settings)
- [Best Practices - Project Organization](BEST-PRACTICES.md#project-structure)

### Knowledge Base Integration

- [Hooks Playbook - KB Auto-Ingestion](HOOKS-PLAYBOOK.md#knowledge-base-ingestion)
- [MCP Servers - Knowledge Base Server](MCP-SERVERS.md#knowledge-base-server)

### Automation

- [Hooks Playbook - Automation Patterns](HOOKS-PLAYBOOK.md#automation-patterns)
- [Skills Guide - Workflow Automation](SKILLS-GUIDE.md#workflow-automation-skills)

### Security

- [Best Practices - Security](BEST-PRACTICES.md#security-best-practices)
- [Configuration Reference - Credentials](CONFIG-REFERENCE.md#credentials-and-secrets)

## Validation & Testing

### Configuration Validators

This documentation references several validation scripts:

- `~/.claude/scripts/validate-all-configs.sh` - Run all validators
- `~/.claude/scripts/validate-settings.sh` - Validate settings.json
- `~/.claude/scripts/validate-hooks.sh` - Validate hook configurations
- `~/.claude/scripts/validate-skills.sh` - Validate skill configurations
- `~/.claude/scripts/validate-mcp.sh` - Validate MCP server configurations

See [Maintenance Checklist](MAINTENANCE-CHECKLIST.md) for validation procedures.

### Health Checks

- `~/.claude/scripts/claude-health-check.sh` - Comprehensive health check

See [Maintenance Checklist](MAINTENANCE-CHECKLIST.md#automated-monitoring) for automated monitoring setup.

## Templates & Examples

### Configuration Templates

- Minimal settings: [Quick Reference](QUICK-REFERENCE.md#minimal-configuration)
- Full settings: [Configuration Reference](CONFIG-REFERENCE.md#example-configuration)
- Project settings: [Best Practices](BEST-PRACTICES.md#project-templates)

### Hook Examples

- Auto-ingestion: [Hooks Playbook](HOOKS-PLAYBOOK.md#knowledge-base-ingestion)
- Tool routing: [Hooks Playbook](HOOKS-PLAYBOOK.md#tool-routing)
- Context injection: [Hooks Playbook](HOOKS-PLAYBOOK.md#session-context)

### Skill Examples

- Simple command: [Skills Guide](SKILLS-GUIDE.md#basic-skill-example)
- MCP integration: [Skills Guide](SKILLS-GUIDE.md#mcp-integration-skills)
- Async workflow: [Skills Guide](SKILLS-GUIDE.md#async-skills)

## Troubleshooting

### Common Issues

**Configuration not loading:**

- Verify JSON syntax: `jq '.' ~/.claude/settings.json`
- Check file permissions: `ls -la ~/.claude/settings.json`
- Review logs for errors

**MCP server not connecting:**

- Check server status: [MCP Servers - Troubleshooting](MCP-SERVERS.md#troubleshooting)
- Verify server logs
- Test server standalone

**Hook not executing:**

- Enable hook logging
- Verify hook registration in settings
- Check for JavaScript/TypeScript errors

**Skill not found:**

- Verify skill registration: `/skills`
- Check skill directory structure
- Restart Claude CLI to reload skills

See detailed troubleshooting guides in each document.

## Migration & Compatibility

### Upgrading Claude CLI

See [Update Procedures - Post-Update Checklist](UPDATE-PROCEDURES.md#post-update-checklist) for upgrade procedures.

### Breaking Changes

When upgrading, check the [official changelog](https://github.com/anthropics/claude-cli/releases) for breaking changes.

### Configuration Migration

Some configuration changes require migration. See [Update Procedures](UPDATE-PROCEDURES.md) for safe migration workflows.

## Contributing

### Improving Documentation

Found an issue or have a suggestion? Please:

1. File an issue using the [configuration issue template](../../.github/ISSUE_TEMPLATE/claude-config-issue.md)
2. Include specific examples and context
3. Reference relevant documentation sections

### Sharing Best Practices

Have a useful pattern or workflow? Consider:

1. Documenting it in your project
2. Sharing with the community
3. Contributing back via pull request

## Additional Resources

### Official Documentation

- [Claude CLI Official Docs](https://docs.anthropic.com/claude/docs/claude-cli)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Anthropic API Documentation](https://docs.anthropic.com)

### Community Resources

- [Claude CLI GitHub](https://github.com/anthropics/claude-cli)
- [MCP Servers Directory](https://github.com/modelcontextprotocol/servers)
- Community forums and discussions

### OpenClaw Integration

This documentation is part of the OpenClaw project. For OpenClaw-specific configuration:

- OpenClaw repository documentation
- PAIOS integration guides
- Knowledge base integration

## Document Index

All documentation files in this directory:

- `README.md` (this file) - Master index
- `QUICK-REFERENCE.md` - Quick reference guide
- `CONFIG-REFERENCE.md` - Complete configuration reference
- `BEST-PRACTICES.md` - Best practices and patterns
- `SKILLS-GUIDE.md` - Skills development guide
- `HOOKS-PLAYBOOK.md` - Hooks and automation playbook
- `KEYBINDINGS-GUIDE.md` - Keybindings customization
- `MCP-SERVERS.md` - MCP server integration
- `MAINTENANCE-CHECKLIST.md` - Maintenance procedures
- `UPDATE-PROCEDURES.md` - Safe update workflows

---

**Last Updated:** 2026-02-27
**Documentation Version:** 1.0
**Compatible with:** Claude CLI 0.9+
