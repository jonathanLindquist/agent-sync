import { getHomeDir, loadProviders, providerWithResolvedPath, sourceSkillsDir } from "./providers.js";
import { syncProviders } from "./sync.js";

const ALL_PROVIDERS_FLAG = "--all-providers";
const SKILL_FLAG = "--skill";
const ACTION_DISPLAY_ORDER = ["imported", "linked", "replaced", "removed", "skipped"];
const BOLD_ACTION_TYPES = new Set(["imported", "linked", "replaced"]);

export async function runCli(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, providerConfigPath } = {}) {
  const providers = await loadProviders(providerConfigPath);
  const parsed = parseArgs(argv, providers);

  if (parsed.help) {
    stdout.write(helpText(providers));
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      stderr.write(`${error}\n`);
    }
    stderr.write("\n");
    stderr.write(helpText(providers));
    return 1;
  }

  if (!parsed.allProviders && parsed.selectedProviderIds.length === 0) {
    stdout.write("No provider flags selected; nothing to sync.\n");
    return 0;
  }

  const homeDir = getHomeDir(env);
  const selectedProviderIds = parsed.allProviders
    ? providers.map((provider) => provider.id)
    : parsed.selectedProviderIds;
  const selectedProviders = providers
    .filter((provider) => selectedProviderIds.includes(provider.id))
    .map((provider) => providerWithResolvedPath(provider, homeDir));

  const results = await syncProviders({
    sourceDir: sourceSkillsDir(homeDir),
    providers: selectedProviders,
    dryRun: parsed.dryRun,
    skillNames: parsed.skillNames,
  });

  for (const result of results) {
    writeProviderSummary(stdout, result);
  }

  return 0;
}

function parseArgs(argv, providers) {
  const selectedProviderIds = [];
  const skillNames = [];
  const errors = [];
  let allProviders = false;
  let dryRun = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === ALL_PROVIDERS_FLAG) {
      allProviders = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === SKILL_FLAG) {
      const skillName = argv[index + 1];

      if (!skillName || skillName.startsWith("--")) {
        errors.push(`${SKILL_FLAG} requires a skill name`);
        continue;
      }

      addSkillName(skillName, { errors, skillNames });
      index += 1;
      continue;
    }

    if (arg.startsWith(`${SKILL_FLAG}=`)) {
      addSkillName(arg.slice(`${SKILL_FLAG}=`.length), { errors, skillNames });
      continue;
    }

    const provider = providers.find((candidate) => candidate.flag === arg);

    if (provider) {
      selectedProviderIds.push(provider.id);
      continue;
    }

    errors.push(`Unknown option: ${arg}`);
  }

  return {
    allProviders,
    dryRun,
    errors,
    help,
    selectedProviderIds: [...new Set(selectedProviderIds)],
    skillNames: [...new Set(skillNames)],
  };
}

function addSkillName(value, { errors, skillNames }) {
  const skillName = value.trim();

  if (!skillName) {
    errors.push(`${SKILL_FLAG} requires a skill name`);
    return;
  }

  if (skillName === "." || skillName === ".." || skillName.includes("/") || skillName.includes("\\")) {
    errors.push(`Invalid skill name for ${SKILL_FLAG}: ${value}`);
    return;
  }

  skillNames.push(skillName);
}

function writeProviderSummary(stdout, result) {
  const counts = countActions(result.actions);
  const mode = result.dryRun ? "dry run" : "synced";

  stdout.write(
    `${result.provider.label} ${mode}: ${counts.imported} imported, ${counts.linked} linked, ${counts.replaced} replaced, ${counts.removed} removed, ${counts.skipped} skipped.\n`,
  );

  let previousActionType;

  for (const action of sortActionsForDisplay(result.actions)) {
    if (previousActionType && previousActionType !== action.type) {
      stdout.write("\n");
    }

    previousActionType = action.type;

    if (action.type === "imported") {
      stdout.write(`  ${formatActionType(action.type)} ${action.skill}: ${action.from} -> ${action.to}\n`);
      continue;
    }

    if (action.type === "linked") {
      stdout.write(`  ${formatActionType(action.type)} ${action.skill}: ${action.to} -> ${action.from}\n`);
      continue;
    }

    if (action.type === "replaced") {
      stdout.write(`  ${formatActionType(action.type)} ${action.skill}: ${action.to} -> ${action.from}\n`);
      continue;
    }

    if (action.type === "removed") {
      stdout.write(`  removed ${action.skill}: ${action.path} (${action.reason})\n`);
      continue;
    }

    if (action.type === "skipped") {
      stdout.write(`  skipped ${action.skill}: ${action.reason}\n`);
    }
  }
}

function formatActionType(type) {
  if (!BOLD_ACTION_TYPES.has(type)) {
    return type;
  }

  return `\x1b[1m${type}\x1b[22m`;
}

function sortActionsForDisplay(actions) {
  return [...actions].sort((left, right) => {
    const typeComparison = actionDisplayRank(left.type) - actionDisplayRank(right.type);

    if (typeComparison !== 0) {
      return typeComparison;
    }

    return left.skill.localeCompare(right.skill);
  });
}

function actionDisplayRank(type) {
  const index = ACTION_DISPLAY_ORDER.indexOf(type);

  return index === -1 ? ACTION_DISPLAY_ORDER.length : index;
}

function countActions(actions) {
  return {
    imported: actions.filter((action) => action.type === "imported").length,
    linked: actions.filter((action) => action.type === "linked").length,
    replaced: actions.filter((action) => action.type === "replaced").length,
    removed: actions.filter((action) => action.type === "removed").length,
    skipped: actions.filter((action) => action.type === "skipped").length,
  };
}

function helpText(providers) {
  const providerFlags = providers
    .map((provider) => `  ${provider.flag.padEnd(18)} sync ${provider.label} skills at ${provider.skillsDir}`)
    .join("\n");

  return `Usage: skill-organizer [provider flags] [options]

By default, skill-organizer does nothing. Pass one provider flag for each target you want to sync.

Provider flags:
  ${ALL_PROVIDERS_FLAG.padEnd(18)} sync every configured provider
${providerFlags}

Options:
  --skill <name>      sync only this skill name; can be repeated
  --dry-run            show the actions without changing files
  -h, --help           show this help

Source of truth:
  ~/.agents/skills
`;
}
