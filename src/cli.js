import { artifactProviderSummaries, configWithResolvedPaths, getHomeDir, loadConfig } from "./providers.js";
import { syncArtifacts } from "./sync.js";

const ALL_PROVIDERS_FLAG = "--all-providers";
const ALL_ARTIFACTS_FLAG = "--all-artifacts";
const ARTIFACT_FLAG = "--artifact";
const SKILL_FLAG = "--skill";
const ACTION_DISPLAY_ORDER = ["warning", "imported", "linked", "replaced", "removed", "skipped"];
const BOLD_ACTION_TYPES = new Set(["warning", "imported", "linked", "replaced"]);

export async function runCli(
  argv,
  {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    providerConfigPath,
    configPath = providerConfigPath,
    commandName = "agent-sync",
  } = {},
) {
  const config = await loadConfig(configPath);
  const providerSummaries = artifactProviderSummaries(config);
  const parsed = parseArgs(argv, config, providerSummaries);

  if (parsed.help) {
    stdout.write(helpText(config, providerSummaries, commandName));
    return 0;
  }

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      stderr.write(`${error}\n`);
    }
    stderr.write("\n");
    stderr.write(helpText(config, providerSummaries, commandName));
    return 1;
  }

  if (!parsed.allProviders && parsed.selectedProviderIds.length === 0) {
    stdout.write("No provider flags selected; nothing to sync.\n");
    return 0;
  }

  const homeDir = getHomeDir(env);
  const resolvedConfig = configWithResolvedPaths(config, homeDir);
  const selectedProviderIds = parsed.allProviders
    ? providerSummaries.map((provider) => provider.id)
    : parsed.selectedProviderIds;
  const selectedArtifactIds = parsed.allArtifacts
    ? resolvedConfig.artifacts.map((artifact) => artifact.id)
    : parsed.selectedArtifactIds;
  const selectedProviderIdSet = new Set(selectedProviderIds);
  const selectedArtifactIdSet = new Set(selectedArtifactIds);
  const selectedArtifacts = resolvedConfig.artifacts
    .filter((artifact) => selectedArtifactIdSet.has(artifact.id))
    .map((artifact) => ({
      ...artifact,
      providers: artifact.providers.filter((provider) => selectedProviderIdSet.has(provider.id)),
    }))
    .filter((artifact) => artifact.providers.length > 0);

  const results = await syncArtifacts({
    artifacts: selectedArtifacts,
    dryRun: parsed.dryRun,
    skillNames: parsed.skillNames,
  });

  for (const result of results) {
    writeProviderSummary(stdout, result);
  }

  return 0;
}

function parseArgs(argv, config, providerSummaries) {
  const selectedProviderIds = [];
  const selectedArtifactIds = [];
  const skillNames = [];
  const errors = [];
  let allProviders = false;
  let allArtifacts = false;
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

    if (arg === ALL_ARTIFACTS_FLAG) {
      allArtifacts = true;
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

    if (arg === ARTIFACT_FLAG) {
      const artifactId = argv[index + 1];

      if (!artifactId || artifactId.startsWith("--")) {
        errors.push(`${ARTIFACT_FLAG} requires an artifact id`);
        continue;
      }

      addArtifactId(artifactId, config, { errors, selectedArtifactIds });
      index += 1;
      continue;
    }

    if (arg.startsWith(`${ARTIFACT_FLAG}=`)) {
      addArtifactId(arg.slice(`${ARTIFACT_FLAG}=`.length), config, { errors, selectedArtifactIds });
      continue;
    }

    if (arg.startsWith(`${SKILL_FLAG}=`)) {
      addSkillName(arg.slice(`${SKILL_FLAG}=`.length), { errors, skillNames });
      continue;
    }

    const provider = providerSummaries.find((candidate) => candidate.flag === arg);

    if (provider) {
      selectedProviderIds.push(provider.id);
      continue;
    }

    errors.push(`Unknown option: ${arg}`);
  }

  return {
    allArtifacts,
    allProviders,
    dryRun,
    errors,
    help,
    selectedArtifactIds: [...new Set(selectedArtifactIds.length > 0 ? selectedArtifactIds : defaultArtifactIds(config))],
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

function addArtifactId(value, config, { errors, selectedArtifactIds }) {
  const artifactId = value.trim();

  if (!artifactId) {
    errors.push(`${ARTIFACT_FLAG} requires an artifact id`);
    return;
  }

  if (!config.artifacts.some((artifact) => artifact.id === artifactId)) {
    errors.push(`Unknown artifact: ${artifactId}`);
    return;
  }

  selectedArtifactIds.push(artifactId);
}

function defaultArtifactIds(config) {
  return config.artifacts.filter((artifact) => artifact.default).map((artifact) => artifact.id);
}

function writeProviderSummary(stdout, result) {
  const counts = countActions(result.actions);
  const mode = result.dryRun ? "dry run" : "synced";
  const subject = result.artifact && result.artifact.type !== "skills"
    ? `${result.provider.label} ${result.artifact.label}`
    : result.provider.label;
  const warningCount = `${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}`;

  stdout.write(
    `${subject} ${mode}: ${counts.imported} imported, ${counts.linked} linked, ${counts.replaced} replaced, ${counts.removed} removed, ${counts.skipped} skipped, ${warningCount}.\n`,
  );

  let previousActionType;

  for (const action of sortActionsForDisplay(result.actions)) {
    if (previousActionType && previousActionType !== action.type) {
      stdout.write("\n");
    }

    previousActionType = action.type;

    if (action.type === "warning") {
      const target = action.target ? ` -> ${action.target}` : "";
      stdout.write(
        `  ${formatActionType(action.type)} ${actionName(action)}: ${action.path}${target} (${action.reason})\n`,
      );
      continue;
    }

    if (action.type === "imported") {
      stdout.write(`  ${formatActionType(action.type)} ${actionName(action)}: ${action.from} -> ${action.to}\n`);
      continue;
    }

    if (action.type === "linked") {
      stdout.write(`  ${formatActionType(action.type)} ${actionName(action)}: ${action.to} -> ${action.from}\n`);
      continue;
    }

    if (action.type === "replaced") {
      stdout.write(`  ${formatActionType(action.type)} ${actionName(action)}: ${action.to} -> ${action.from}\n`);
      continue;
    }

    if (action.type === "removed") {
      const target = action.target ? ` -> ${action.target}` : "";
      stdout.write(`  removed ${actionName(action)}: ${action.path}${target} (${action.reason})\n`);
      continue;
    }

    if (action.type === "skipped") {
      stdout.write(`  skipped ${actionName(action)}: ${action.reason}\n`);
    }
  }
}

function actionName(action) {
  return action.skill ?? action.item;
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

    return actionName(left).localeCompare(actionName(right));
  });
}

function actionDisplayRank(type) {
  const index = ACTION_DISPLAY_ORDER.indexOf(type);

  return index === -1 ? ACTION_DISPLAY_ORDER.length : index;
}

function countActions(actions) {
  return {
    warnings: actions.filter((action) => action.type === "warning").length,
    imported: actions.filter((action) => action.type === "imported").length,
    linked: actions.filter((action) => action.type === "linked").length,
    replaced: actions.filter((action) => action.type === "replaced").length,
    removed: actions.filter((action) => action.type === "removed").length,
    skipped: actions.filter((action) => action.type === "skipped").length,
  };
}

function helpText(config, providerSummaries, commandName) {
  const providerFlags = providerSummaries
    .map((provider) => {
      const artifacts = [...provider.artifactLabels].join(", ");
      return `  ${provider.flag.padEnd(18)} sync ${provider.label} artifacts (${artifacts})`;
    })
    .join("\n");
  const artifactLines = config.artifacts
    .map((artifact) => {
      const defaultLabel = artifact.default ? " (default)" : "";
      return `  ${artifact.id.padEnd(18)} ${artifact.label}${defaultLabel}`;
    })
    .join("\n");

  return `Usage: ${commandName} [provider flags] [options]

By default, ${commandName} syncs only default artifacts. Pass one provider flag for each target you want to sync.

Provider flags:
  ${ALL_PROVIDERS_FLAG.padEnd(18)} sync every configured provider
${providerFlags}

Options:
  ${ALL_ARTIFACTS_FLAG.padEnd(18)} sync every configured artifact
  ${ARTIFACT_FLAG.padEnd(18)} sync one artifact id; can be repeated
  ${SKILL_FLAG.padEnd(18)} sync only this skill name; can be repeated
  --dry-run          show the actions without changing files
  -h, --help         show this help

Artifacts:
${artifactLines}

Default source of truth:
  ~/.agents/skills
`;
}
