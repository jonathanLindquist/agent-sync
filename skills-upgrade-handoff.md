# Handoff: Shared Skill Installation For Codex And Claude

Date: 2026-06-18

## Context

The user has existing Matt Pocock-style agent skills installed in their home directory, visible in both:

- `~/.codex/skills`
- `~/.claude/skills`

They wanted to know whether running:

```bash
npx skills@latest add mattpocock/skills
```

would overwrite existing skills or create cumulative side-by-side installs, and then asked whether Codex and Claude could reference one shared skill location via symlinks.

## What Was Verified

`skills@latest` currently resolved to npm package version `1.5.11`, from `vercel-labs/skills`.

The CLI README says:

- default install scope is project-level
- `-g` / `--global` installs to the user/home directory
- Codex global path is `~/.codex/skills`
- Claude Code global path is `~/.claude/skills`
- the CLI supports a symlink install method, using one canonical copy and agent-specific links

The package source was inspected locally from the npm tarball. The relevant installer behavior:

- before installing a selected skill, it calls a cleanup function equivalent to:

```ts
await rm(path, { recursive: true, force: true });
await mkdir(path, { recursive: true });
```

- the source comment says this is intentional so renamed/deleted files from prior installs are removed
- therefore, same-name skill folders are replaced, not merged cumulatively

Important nuance:

- `npx skills@latest add mattpocock/skills` without `-g` may install into the current project unless the interactive prompt chooses Global
- `-y` / non-interactive mode without `-g` defaults to project scope
- to upgrade home/global installs, use `-g`

## Current Machine Observations

The user had overlapping skill folders in both `~/.claude/skills` and `~/.codex/skills`.

Examples included:

- `migrate-to-shoehorn`
- `setup-pre-commit`
- `triage-issue`
- `github-triage`
- `obsidian-vault`
- `ubiquitous-language`
- `domain-model`
- `request-refactor-plan`
- `improve-codebase-architecture`
- `qa`
- `edit-article`
- `to-issues`
- `zoom-out`
- `write-a-skill`
- `scaffold-exercises`
- `design-an-interface`
- `caveman`
- `tdd`
- `grill-me`
- `to-prd`

Codex also had Codex-specific skills such as:

- `playwright`
- `playwright-interactive`

No global `skills-lock.json` metadata was found under the inspected `~/.codex`, `~/.claude`, `~/.agents`, or `~/.config/agents` locations, so `npx skills update -g` may not know how to update these as tracked installs. Re-running `add -g` is more predictable for matching skill names.

## Recommended Upgrade Command

For upgrading matching global Codex and Claude skills from Matt Pocock's repo:

```bash
npx skills@latest add mattpocock/skills -g -a codex -a claude-code
```

Expected behavior:

- if a selected skill name already exists at the target path, that target folder is removed and recreated
- this means same-name skills are overwritten with the new version
- if an upstream skill was renamed, the old folder will remain beside the new one and may need manual cleanup

## Recommended Shared-Location Setup

Use per-skill symlinks, not a whole-directory symlink.

Recommended shape:

```text
~/.agent-skills/migrate-to-shoehorn
~/.codex/skills/migrate-to-shoehorn  -> ~/.agent-skills/migrate-to-shoehorn
~/.claude/skills/migrate-to-shoehorn -> ~/.agent-skills/migrate-to-shoehorn
```

Reasoning:

- per-skill links avoid replacing Codex or Claude's entire `skills` directory
- whole-directory symlinks are riskier because Codex has its own system/plugin-managed skills and Claude may have its own expected directory state
- per-skill links are easy to inspect, update, or undo

Example command for one skill, using Codex as the canonical source:

```bash
ln -s ~/.codex/skills/migrate-to-shoehorn ~/.claude/skills/migrate-to-shoehorn
```

Before doing that, remove or move the existing Claude copy for that same skill. Do not overwrite blindly if local edits matter.

Better neutral canonical location:

```text
~/.agent-skills/<skill-name>
```

Then link both agents to it:

```bash
ln -s ~/.agent-skills/migrate-to-shoehorn ~/.codex/skills/migrate-to-shoehorn
ln -s ~/.agent-skills/migrate-to-shoehorn ~/.claude/skills/migrate-to-shoehorn
```

## Best Next Step For Another Chat

Ask the next agent to:

1. Inventory `~/.codex/skills` and `~/.claude/skills`.
2. Identify duplicate skill names and Codex-only / Claude-only skill names.
3. Pick a canonical shared folder, preferably `~/.agent-skills`.
4. Back up the current skill directories.
5. Move shared skills into the canonical folder.
6. Replace duplicate agent skill folders with per-skill symlinks.
7. Leave Codex-specific and Claude-specific skill folders as real local folders unless intentionally shared.

Suggested prompt:

```text
I want to consolidate my global agent skills so Codex and Claude Code reference one canonical copy where appropriate. Use this handoff. Please inspect ~/.codex/skills and ~/.claude/skills, identify duplicates, back them up, move shared skills to ~/.agent-skills, and replace only duplicate shared skills with per-skill symlinks. Do not symlink the entire skills directories. Leave agent-specific skills alone.
```

