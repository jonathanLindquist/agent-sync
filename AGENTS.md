# Agent Instructions

This file is the source of truth for repo-local agent guidance. Keep shared instructions here; `CLAUDE.md` is only a thin wrapper that points Claude Code back to this file.

## Project Commands

- `pnpm lint` checks JavaScript syntax for the CLI, source files, and tests.
- `pnpm test` runs the Node test suite.
- `node bin/agent-sync.js --help` verifies CLI flag discovery from `agent-sync.json`.

## Agent skills

### Issue tracker

Issues and implementation tickets live in the Obsidian Kanban board derived from `$PROJECT_WORKFLOW_OBSIDIAN_VAULT` and this repository's path relative to `$HOME`. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Ticket workflow

Create tickets with `new_project_ticket.mjs`; it allocates stable IDs, appends a Kanban card, creates a linked plan in `docs/plans/`, and advances `docs/agents/ticket-sequence.json`. Use repeatable `--todo`, `--acceptance`, and `--verification` fields when a ticket is ready for agent implementation. Update ticket status with `update_project_ticket.mjs` after code changes and during closeout. See `docs/agents/ticket-workflow.md`.

When working from a ticket, read the Kanban card and linked plan before implementation. After making implementation changes, move the card to `In Progress` unless it is already there. Before calling the ticket complete, verify the acceptance criteria and verification items; add completion notes to the linked plan; move the Kanban card to `Completed`; check applicable TODO, Acceptance Criteria, and Verification boxes; and re-read the board to confirm the lane.

### Execution plans

Execution plan Markdown files live under stable paths in `docs/plans/`, for example `docs/plans/AS-0001-initialize-project-workflow.md`. Do not use lane-named status folders for new plans; old `docs/plans/Backlog/`, `docs/plans/In Progress/`, and `docs/plans/Completed/` folders are legacy.

### Triage labels

Use the default five-role triage vocabulary as Obsidian tags configured with Kanban plugin colors: `#needs-triage`, `#needs-info`, `#ready-for-agent`, `#ready-for-human`, and `#wontfix`. Add, remove, or replace those tags in the card's `Description` section. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and `docs/adr/` if they exist. See `docs/agents/domain.md`.
