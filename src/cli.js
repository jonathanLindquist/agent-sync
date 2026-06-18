import { PROVIDERS, getHomeDir, providerWithResolvedPath, sourceSkillsDir } from "./providers.js";
import { syncProviders } from "./sync.js";

export async function runCli(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    stdout.write(helpText());
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      stderr.write(`${error}\n`);
    }
    stderr.write("\n");
    stderr.write(helpText());
    return 1;
  }

  if (parsed.selectedProviderIds.length === 0) {
    stdout.write("No provider flags selected; nothing to sync.\n");
    return 0;
  }

  const homeDir = getHomeDir(env);
  const selectedProviders = PROVIDERS
    .filter((provider) => parsed.selectedProviderIds.includes(provider.id))
    .map((provider) => providerWithResolvedPath(provider, homeDir));

  const results = await syncProviders({
    sourceDir: sourceSkillsDir(homeDir),
    providers: selectedProviders,
    dryRun: parsed.dryRun,
  });

  for (const result of results) {
    writeProviderSummary(stdout, result);
  }

  return 0;
}

function parseArgs(argv) {
  const selectedProviderIds = [];
  const errors = [];
  let dryRun = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    const provider = PROVIDERS.find((candidate) => candidate.flag === arg);

    if (provider) {
      selectedProviderIds.push(provider.id);
      continue;
    }

    errors.push(`Unknown option: ${arg}`);
  }

  return {
    dryRun,
    errors,
    help,
    selectedProviderIds: [...new Set(selectedProviderIds)],
  };
}

function writeProviderSummary(stdout, result) {
  const counts = countActions(result.actions);
  const mode = result.dryRun ? "dry run" : "synced";

  stdout.write(`${result.provider.label} ${mode}: ${counts.imported} imported, ${counts.linked} linked, ${counts.skipped} skipped.\n`);

  for (const action of result.actions) {
    if (action.type === "imported") {
      stdout.write(`  imported ${action.skill}: ${action.from} -> ${action.to}\n`);
      continue;
    }

    if (action.type === "linked") {
      stdout.write(`  linked ${action.skill}: ${action.to} -> ${action.from}\n`);
      continue;
    }

    if (action.type === "skipped") {
      stdout.write(`  skipped ${action.skill}: ${action.reason}\n`);
    }
  }
}

function countActions(actions) {
  return {
    imported: actions.filter((action) => action.type === "imported").length,
    linked: actions.filter((action) => action.type === "linked").length,
    skipped: actions.filter((action) => action.type === "skipped").length,
  };
}

function helpText() {
  const providerFlags = PROVIDERS
    .map((provider) => `  ${provider.flag.padEnd(18)} sync ${provider.label} skills at ${provider.defaultSkillsDir}`)
    .join("\n");

  return `Usage: skill-organizer [provider flags] [options]

By default, skill-organizer does nothing. Pass one provider flag for each target you want to sync.

Provider flags:
${providerFlags}

Options:
  --dry-run            show the actions without changing files
  -h, --help           show this help

Source of truth:
  ~/.agents/skills
`;
}
