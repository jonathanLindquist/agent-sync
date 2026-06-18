# skill-organizer

`skill-organizer` keeps `~/.agents/skills` as the source of truth for agent skills and creates per-skill symlinks into provider-specific skill directories.

The default command intentionally does nothing. You must pass a provider flag for every destination you want to sync.

```bash
skill-organizer --claude-code
```

## Behavior

For each selected provider:

- source skills in `~/.agents/skills` are symlinked into the provider destination only when that destination skill does not already exist
- existing destination skills with matching source names are left untouched
- destination-only skills are moved into `~/.agents/skills`, then symlinked back to the original provider location
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
node bin/skill-organizer.js --claude-code
```

## Adding Providers

Add a provider entry in `src/providers.js`:

```js
{
  id: "new-provider",
  flag: "--new-provider",
  label: "New Provider",
  defaultSkillsDir: "~/.new-provider/skills",
}
```

The sync engine operates on resolved provider definitions, so new providers do not need provider-specific sync logic unless their filesystem model is different.
