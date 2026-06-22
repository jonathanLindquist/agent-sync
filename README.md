# agent-sync

`agent-sync` keeps shared agent artifacts in `~/.agents` as the source of truth and syncs provider-specific files or directories into the harnesses that consume them.

The default command intentionally does nothing. You must pass a provider flag for every destination you want to sync. For compatibility, the old `skill-organizer` command still runs the same CLI without a deprecation warning.

```bash
agent-sync --claude-code
agent-sync --claude-code --skill tdd
agent-sync --all-providers
```

## Behavior

By default, selected provider flags sync only the default `skills` artifact:

- source skills in `~/.agents/skills` are symlinked into the provider destination
- source skills that are symlinks are linked into providers using the symlink target, which keeps skill repo links direct
- existing destination entries with matching source skill names are replaced with symlinks to the source skill
- destination-only skills are moved into `~/.agents/skills`, then symlinked back to the original provider location
- destination-only skills that clash with non-skill source entries are removed from the provider destination
- the entire provider `skills` directory is never symlinked or replaced

Claude Code is the first supported provider:

```text
~/.agents/skills/<skill-name>
~/.claude/skills/<skill-name> -> ~/.agents/skills/<skill-name>
```

If the source skill is already a symlink, provider links point directly at the underlying target:

```text
~/.agents/skills/<skill-name> -> ~/projects/skills/<skill-name>
~/.claude/skills/<skill-name> -> ~/projects/skills/<skill-name>
```

Non-default artifacts must be selected explicitly. The first non-skill artifact is `global-instructions`:

```text
~/.agents/AGENTS.md
~/.codex/AGENTS.md -> ~/.agents/AGENTS.md
~/.claude/CLAUDE.md contains @~/.agents/AGENTS.md
```

Claude Code reads `CLAUDE.md`, not `AGENTS.md`, so its global instruction sync uses a thin import wrapper instead of naming the provider file `AGENTS.md`.

## Usage

```bash
pnpm test
pnpm lint
node bin/agent-sync.js --help
node bin/agent-sync.js --dry-run --claude-code
node bin/agent-sync.js --dry-run --claude-code --skill tdd
node bin/agent-sync.js --dry-run --artifact global-instructions --codex
node bin/agent-sync.js --dry-run --artifact global-instructions --claude-code
node bin/agent-sync.js --all-providers
```

Use `--skill <name>` to limit a sync to one skill directory name. The option can be repeated when you need a small explicit set, and it works with provider flags or `--all-providers`.

Use `--artifact <id>` to opt into a non-default artifact group. Use `--all-artifacts` when you intentionally want every configured artifact group for the selected providers.

## Tagging

```bash
node scripts/tag-and-push.js v0.1.0
# or
pnpm tag:push v0.1.0
```

The tag utility force-updates the local tag at `HEAD`, then force-pushes that tag to `origin`. If no tag is provided, it prints usage and takes no action.

## Configuration

Artifact groups and provider destinations live in `agent-sync.json`:

```json
{
  "artifacts": [
    {
      "id": "skills",
      "label": "skills",
      "type": "skills",
      "default": true,
      "sourceDir": "~/.agents/skills",
      "providers": [
        {
          "id": "claude-code",
          "flag": "--claude-code",
          "label": "Claude Code",
          "destinationDir": "~/.claude/skills"
        }
      ]
    },
    {
      "id": "global-instructions",
      "label": "global instructions",
      "type": "file",
      "sourceFile": "~/.agents/AGENTS.md",
      "providers": [
        {
          "id": "codex",
          "flag": "--codex",
          "label": "Codex",
          "destinationFile": "~/.codex/AGENTS.md",
          "mode": "symlink"
        }
      ]
    }
  ]
}
```

The CLI loads provider flags from `agent-sync.json` at startup. Provider flags are shared across artifacts, so `--claude-code` can target skills by default and global instructions only when `--artifact global-instructions` or `--all-artifacts` is present.
