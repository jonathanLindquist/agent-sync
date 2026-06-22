# AS-0002 Add More Providers

- Ticket: AS-0002
- Board: derived from `$PROJECT_WORKFLOW_OBSIDIAN_VAULT` and this repository's path relative to `$HOME`
- Card: AS-0002 Add More Providers
- Created: 2026-06-19

## Summary

Add additional provider entries to `agent-sync.json` as new agent skill destinations become useful.

## Context

The sync engine already supports config-backed providers that use the same per-skill directory model.

Current project facts:

- Project path: `~/projects/utilities/agent-sync`
- Source of truth: `~/.agents/skills`
- Config file: `agent-sync.json`
- Current provider: `--claude-code` -> `~/.claude/skills`

## Plan

- [ ] Add the provider entry to `agent-sync.json`
- [ ] Run `node bin/agent-sync.js --help`
- [ ] Add or update tests if the provider uses a different directory model

## Acceptance Criteria

- [ ] The new provider is configured in `agent-sync.json`
- [ ] CLI help exposes the new provider flag
- [ ] Tests cover any provider behavior that differs from the existing per-skill directory model

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `node bin/agent-sync.js --help`

## Outcome

Pending.
