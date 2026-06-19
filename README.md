# skill-organizer

`skill-organizer` keeps `~/.agents/skills` as the source of truth for agent skills and creates per-skill symlinks into provider-specific skill directories.

The default command intentionally does nothing. You must pass a provider flag for every destination you want to sync.

```bash
skill-organizer --claude-code
skill-organizer --claude-code --skill tdd
skill-organizer --all-providers
```

## Behavior

For each selected provider:

- source skills in `~/.agents/skills` are symlinked into the provider destination
- existing destination entries with matching source skill names are replaced with symlinks to the source skill
- destination-only skills are moved into `~/.agents/skills`, then symlinked back to the original provider location
- destination-only skills that clash with non-skill source entries are removed from the provider destination
- the entire provider `skills` directory is never symlinked or replaced

Claude Code is the first supported provider:

```text
~/.agents/skills/<skill-name>
~/.claude/skills/<skill-name> -> ~/.agents/skills/<skill-name>
```

## Usage

```bash
npm test
npm run lint
node bin/skill-organizer.js --help
node bin/skill-organizer.js --dry-run --claude-code
node bin/skill-organizer.js --dry-run --claude-code --skill tdd
node bin/skill-organizer.js --claude-code
node bin/skill-organizer.js --all-providers
```

Use `--skill <name>` to limit a sync to one skill directory name. The option can be repeated when you need a small explicit set, and it works with provider flags or `--all-providers`.

## Adding Providers

Add a provider entry in `providers.json`:

```json
{
  "providers": [
    {
      "id": "claude-code",
      "flag": "--claude-code",
      "label": "Claude Code",
      "skillsDir": "~/.claude/skills"
    },
    {
      "id": "new-provider",
      "flag": "--new-provider",
      "label": "New Provider",
      "skillsDir": "~/.new-provider/skills"
    }
  ]
}
```

The CLI loads provider flags from `providers.json` at startup, so updating that file is enough for providers that use the same per-skill directory model.
