# AS-0003 Package CLI For Daily Use

- Ticket: AS-0003
- Board: derived from `$PROJECT_WORKFLOW_OBSIDIAN_VAULT` and this repository's path relative to `$HOME`
- Card: AS-0003 Package CLI For Daily Use
- Created: 2026-06-19

## Summary

Decide how this CLI should be invoked day to day, such as a global pnpm link, pnpm script, or shell alias.

## Context

The primary CLI entrypoint is `bin/agent-sync.js`, and the primary package bin name is `agent-sync`. The old `skill-organizer` bin remains as a compatibility alias.

## Plan

- [ ] Pick the preferred invocation path
- [ ] Document the chosen setup in `README.md`
- [ ] Verify the command from outside the project directory

## Acceptance Criteria

- [ ] The preferred daily invocation path is chosen and documented in `README.md`
- [ ] `agent-sync` works from outside the project directory
- [ ] The `skill-organizer` compatibility alias still works from outside the project directory

## Verification

- [ ] `agent-sync --help`
- [ ] `agent-sync --dry-run --all-providers`
- [ ] `skill-organizer --help`
- [ ] `skill-organizer --dry-run --all-providers`

## Outcome

Pending.
