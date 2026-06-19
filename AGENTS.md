# Agent Instructions

This file is the source of truth for repo-local agent guidance. Keep shared instructions here; `CLAUDE.md` is only a thin wrapper that points Claude Code back to this file.

## Project Commands

- `npm run lint` checks JavaScript syntax for the CLI, source files, and tests.
- `npm test` runs the Node test suite.
- `node bin/skill-organizer.js --help` verifies CLI flag discovery from `providers.json`.

## Agent skills

### Issue tracker

Issues and implementation tickets live in the Obsidian Kanban board at `~/obsidian_notes/pocock-skills-vault/projects/utilities/skill-organizer/Skill Organizer Kanban.md`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary with the Kanban color mapping in `docs/agents/triage-labels.md`: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and `docs/adr/` if they exist. See `docs/agents/domain.md`.
