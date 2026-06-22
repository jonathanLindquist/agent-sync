import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/cli.js";
import { syncFileProvider, syncProvider } from "../src/sync.js";

const TEST_TMP_ROOT = path.resolve(".tmp", "tests");

test("running without provider flags does nothing", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();

  const exitCode = await runCli([], {
    env: { HOME: homeDir },
    providerConfigPath: await writeProviderConfig(homeDir),
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /nothing to sync/);
  await assert.rejects(fs.stat(path.join(homeDir, ".agents")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
});

test("help text uses the invoked command name", async (t) => {
  const homeDir = await tempHome(t);
  const agentSyncOutput = createWritable();
  const skillOrganizerOutput = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);

  assert.equal(
    await runCli(["--help"], {
      commandName: "agent-sync",
      env: { HOME: homeDir },
      providerConfigPath,
      stdout: agentSyncOutput,
      stderr: createWritable(),
    }),
    0,
  );
  assert.equal(
    await runCli(["--help"], {
      commandName: "skill-organizer",
      env: { HOME: homeDir },
      providerConfigPath,
      stdout: skillOrganizerOutput,
      stderr: createWritable(),
    }),
    0,
  );

  assert.match(agentSyncOutput.text, /^Usage: agent-sync/m);
  assert.match(skillOrganizerOutput.text, /^Usage: skill-organizer/m);
});

test("package exposes agent-sync and skill-organizer bin names", async () => {
  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));

  assert.equal(packageJson.name, "agent-sync");
  assert.equal(packageJson.bin["agent-sync"], "bin/agent-sync.js");
  assert.equal(packageJson.bin["skill-organizer"], "bin/skill-organizer.js");
});

test("provider flags are loaded from config", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, [
    {
      id: "custom-agent",
      flag: "--custom-agent",
      label: "Custom Agent",
      skillsDir: "~/.custom-agent/skills",
    },
  ]);

  await writeSkill(path.join(homeDir, ".agents", "skills"), "tdd", "source skill");

  const exitCode = await runCli(["--custom-agent"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Custom Agent synced/);
  assert.equal(
    await fs.readlink(path.join(homeDir, ".custom-agent", "skills", "tdd")),
    path.join(homeDir, ".agents", "skills", "tdd"),
  );
});

test("artifact registry syncs selected global instructions", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeAgentSyncConfig(homeDir);

  await fs.mkdir(path.join(homeDir, ".agents"), { recursive: true });
  await fs.writeFile(path.join(homeDir, ".agents", "AGENTS.md"), "shared global instructions\n");

  const exitCode = await runCli(["--artifact", "global-instructions", "--codex"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Codex global instructions synced: 0 imported, 1 linked, 0 replaced, 0 removed, 0 skipped/);
  assert.equal(
    await fs.readlink(path.join(homeDir, ".codex", "AGENTS.md")),
    path.join(homeDir, ".agents", "AGENTS.md"),
  );
  await assert.rejects(fs.stat(path.join(homeDir, ".claude", "skills")), { code: "ENOENT" });
});

test("provider flag alone only syncs default skill artifacts", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeAgentSyncConfig(homeDir);

  await writeSkill(path.join(homeDir, ".agents", "skills"), "tdd", "source skill");
  await fs.mkdir(path.join(homeDir, ".agents"), { recursive: true });
  await fs.writeFile(path.join(homeDir, ".agents", "AGENTS.md"), "shared global instructions\n");

  const exitCode = await runCli(["--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced: 0 imported, 1 linked, 0 replaced, 0 removed, 0 skipped/);
  assert.doesNotMatch(output.text, /global instructions/);
  assert.equal(await fs.readlink(path.join(homeDir, ".claude", "skills", "tdd")), path.join(homeDir, ".agents", "skills", "tdd"));
  await assert.rejects(fs.stat(path.join(homeDir, ".claude", "CLAUDE.md")), { code: "ENOENT" });
});

test("--all-providers syncs every configured provider", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, twoProviders());

  await writeSkill(path.join(homeDir, ".agents", "skills"), "tdd", "source skill");

  const exitCode = await runCli(["--all-providers"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced/);
  assert.match(output.text, /Custom Agent synced/);
  assert.equal(
    await fs.readlink(path.join(homeDir, ".claude", "skills", "tdd")),
    path.join(homeDir, ".agents", "skills", "tdd"),
  );
  assert.equal(
    await fs.readlink(path.join(homeDir, ".custom-agent", "skills", "tdd")),
    path.join(homeDir, ".agents", "skills", "tdd"),
  );
});

test("--all-providers is idempotent with specific provider flags", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, twoProviders());

  await writeSkill(path.join(homeDir, ".agents", "skills"), "tdd", "source skill");

  const exitCode = await runCli(["--all-providers", "--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.equal(countMatches(output.text, "Claude Code synced"), 1);
  assert.equal(countMatches(output.text, "Custom Agent synced"), 1);
  assert.equal(
    await fs.readlink(path.join(homeDir, ".claude", "skills", "tdd")),
    path.join(homeDir, ".agents", "skills", "tdd"),
  );
  assert.equal(
    await fs.readlink(path.join(homeDir, ".custom-agent", "skills", "tdd")),
    path.join(homeDir, ".agents", "skills", "tdd"),
  );
});

test("--dry-run --all-providers reports actions without changing providers", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, twoProviders());

  await writeSkill(path.join(homeDir, ".agents", "skills"), "tdd", "source skill");

  const exitCode = await runCli(["--dry-run", "--all-providers"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.equal(countMatches(output.text, "dry run"), 2);
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".custom-agent")), { code: "ENOENT" });
});

test("--skill limits sync to the requested source skill", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);
  const sourceDir = path.join(homeDir, ".agents", "skills");
  const destinationDir = path.join(homeDir, ".claude", "skills");

  await writeSkill(sourceDir, "qa", "unrequested source skill");
  await writeSkill(sourceDir, "tdd", "requested source skill");

  const exitCode = await runCli(["--claude-code", "--skill", "tdd"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced: 0 imported, 1 linked, 0 replaced, 0 removed, 0 skipped/);
  assert.match(output.text, /linked.*tdd/);
  assert.doesNotMatch(output.text, /qa/);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
  await assert.rejects(fs.stat(path.join(destinationDir, "qa")), { code: "ENOENT" });
});

test("--skill imports only the requested destination-only skill", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);
  const sourceDir = path.join(homeDir, ".agents", "skills");
  const destinationDir = path.join(homeDir, ".claude", "skills");

  await writeSkill(destinationDir, "qa", "requested destination skill");
  await writeSkill(destinationDir, "tdd", "unrequested destination skill");

  const exitCode = await runCli(["--skill=qa", "--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced: 1 imported, 0 linked, 0 replaced, 0 removed, 0 skipped/);
  assert.match(output.text, /imported.*qa/);
  assert.doesNotMatch(output.text, /tdd/);
  assert.equal(await fs.readFile(path.join(sourceDir, "qa", "SKILL.md"), "utf8"), "requested destination skill\n");
  assert.equal(await fs.readlink(path.join(destinationDir, "qa")), path.join(sourceDir, "qa"));
  assert.equal(await fs.readFile(path.join(destinationDir, "tdd", "SKILL.md"), "utf8"), "unrequested destination skill\n");
  await assert.rejects(fs.stat(path.join(sourceDir, "tdd")), { code: "ENOENT" });
});

test("--skill replaces only the requested destination clash", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);
  const sourceDir = path.join(homeDir, ".agents", "skills");
  const destinationDir = path.join(homeDir, ".claude", "skills");

  await writeSkill(sourceDir, "qa", "unrequested source skill");
  await writeSkill(destinationDir, "qa", "unrequested destination skill");
  await writeSkill(sourceDir, "tdd", "requested source skill");
  await writeSkill(destinationDir, "tdd", "requested destination skill");

  const exitCode = await runCli(["--claude-code", "--skill", "tdd"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced: 0 imported, 0 linked, 1 replaced, 0 removed, 0 skipped/);
  assert.match(output.text, /replaced.*tdd/);
  assert.doesNotMatch(output.text, /qa/);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
  assert.equal(await fs.readFile(path.join(destinationDir, "qa", "SKILL.md"), "utf8"), "unrequested destination skill\n");
});

test("repeated --skill syncs a deduplicated explicit set", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);
  const sourceDir = path.join(homeDir, ".agents", "skills");
  const destinationDir = path.join(homeDir, ".claude", "skills");

  await writeSkill(sourceDir, "qa", "requested source skill");
  await writeSkill(sourceDir, "tdd", "requested source skill");
  await writeSkill(sourceDir, "zoom-out", "unrequested source skill");

  const exitCode = await runCli(["--claude-code", "--skill", "qa", "--skill", "tdd", "--skill=tdd"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code synced: 0 imported, 2 linked, 0 replaced, 0 removed, 0 skipped/);
  assert.match(output.text, /linked.*qa/);
  assert.match(output.text, /linked.*tdd/);
  assert.doesNotMatch(output.text, /zoom-out/);
  assert.equal(await fs.readlink(path.join(destinationDir, "qa")), path.join(sourceDir, "qa"));
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
  await assert.rejects(fs.stat(path.join(destinationDir, "zoom-out")), { code: "ENOENT" });
});

test("--all-providers combines with --skill", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, twoProviders());
  const sourceDir = path.join(homeDir, ".agents", "skills");

  await writeSkill(sourceDir, "qa", "unrequested source skill");
  await writeSkill(sourceDir, "tdd", "requested source skill");

  const exitCode = await runCli(["--all-providers", "--skill", "tdd"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.equal(countMatches(output.text, "synced: 0 imported, 1 linked, 0 replaced, 0 removed, 0 skipped"), 2);
  assert.match(output.text, /Claude Code synced/);
  assert.match(output.text, /Custom Agent synced/);
  assert.doesNotMatch(output.text, /qa/);
  assert.equal(await fs.readlink(path.join(homeDir, ".claude", "skills", "tdd")), path.join(sourceDir, "tdd"));
  assert.equal(await fs.readlink(path.join(homeDir, ".custom-agent", "skills", "tdd")), path.join(sourceDir, "tdd"));
  await assert.rejects(fs.stat(path.join(homeDir, ".claude", "skills", "qa")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".custom-agent", "skills", "qa")), { code: "ENOENT" });
});

test("--skill reports a skipped action when the requested skill does not exist", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir);

  const exitCode = await runCli(["--dry-run", "--skill", "missing", "--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /Claude Code dry run: 0 imported, 0 linked, 0 replaced, 0 removed, 1 skipped/);
  assert.match(output.text, /skipped missing: skill not found in source or destination/);
  await assert.rejects(fs.stat(path.join(homeDir, ".agents")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
});

test("--skill rejects path-like skill names", async (t) => {
  const homeDir = await tempHome(t);
  const stderr = createWritable();

  const exitCode = await runCli(["--skill=../tdd", "--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath: await writeProviderConfig(homeDir),
    stdout: createWritable(),
    stderr,
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.text, /Invalid skill name for --skill: \.\.\/tdd/);
  await assert.rejects(fs.stat(path.join(homeDir, ".agents")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
});

test("--skill requires a skill name", async (t) => {
  const homeDir = await tempHome(t);
  const stderr = createWritable();

  const exitCode = await runCli(["--skill", "--claude-code"], {
    env: { HOME: homeDir },
    providerConfigPath: await writeProviderConfig(homeDir),
    stdout: createWritable(),
    stderr,
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.text, /--skill requires a skill name/);
  await assert.rejects(fs.stat(path.join(homeDir, ".agents")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
});

test("dry-run groups action details by type and skill name with spacing and bold labels", async (t) => {
  await assertCliActionOrder(t, ["--dry-run", "--claude-code"], "Claude Code dry run");
});

test("sync groups action details by type and skill name with spacing and bold labels", async (t) => {
  await assertCliActionOrder(t, ["--claude-code"], "Claude Code synced");
});

test("links source skills that do not exist in the destination", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "tdd", "source skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["linked"]);

  const linkPath = path.join(destinationDir, "tdd");
  const linkStat = await fs.lstat(linkPath);

  assert.equal(linkStat.isSymbolicLink(), true);
  assert.equal(await fs.readlink(linkPath), path.join(sourceDir, "tdd"));
});

test("links source symlinked skills directly to their targets", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const skillRepoDir = path.join(workspace, "skill-repos");

  await writeSkill(skillRepoDir, "tdd", "repo skill");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.symlink(path.join(skillRepoDir, "tdd"), path.join(sourceDir, "tdd"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["linked"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(skillRepoDir, "tdd"));
  assert.equal(await fs.readFile(path.join(sourceDir, "tdd", "SKILL.md"), "utf8"), "repo skill\n");
});

test("replaces provider links to source symlinks with direct target links", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const skillRepoDir = path.join(workspace, "skill-repos");

  await writeSkill(skillRepoDir, "tdd", "repo skill");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(skillRepoDir, "tdd"), path.join(sourceDir, "tdd"), "dir");
  await fs.symlink(path.join(sourceDir, "tdd"), path.join(destinationDir, "tdd"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(skillRepoDir, "tdd"));
  assert.equal(await fs.readFile(path.join(skillRepoDir, "tdd", "SKILL.md"), "utf8"), "repo skill\n");
});

test("replaces provider links to old targets when source symlinks become folders", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const skillRepoDir = path.join(workspace, "skill-repos");

  await writeSkill(sourceDir, "tdd", "source folder skill");
  await writeSkill(skillRepoDir, "tdd", "old repo skill");
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(skillRepoDir, "tdd"), path.join(destinationDir, "tdd"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
  assert.equal(await fs.readFile(path.join(sourceDir, "tdd", "SKILL.md"), "utf8"), "source folder skill\n");
});

test("replaces a destination skill clash with a source symlink", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "tdd", "source skill");
  await writeSkill(destinationDir, "tdd", "local destination skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);

  const destinationStat = await fs.lstat(path.join(destinationDir, "tdd"));

  assert.equal(destinationStat.isSymbolicLink(), true);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
  assert.equal(await fs.readFile(path.join(sourceDir, "tdd", "SKILL.md"), "utf8"), "source skill\n");
});

test("replaces a non-skill destination clash with a source symlink", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "tdd", "source skill");
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, "tdd"), "destination file\n");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "tdd")), path.join(sourceDir, "tdd"));
});

test("removes a destination-only skill that clashes with a non-skill source entry", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "qa"), "source file\n");
  await writeSkill(destinationDir, "qa", "destination-only skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["removed"]);
  assert.equal(await fs.readFile(path.join(sourceDir, "qa"), "utf8"), "source file\n");
  await assert.rejects(fs.stat(path.join(destinationDir, "qa")), { code: "ENOENT" });
});

test("moves destination-only skills into source and symlinks them back", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(destinationDir, "qa", "destination-only skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["imported"]);

  const sourceBody = await fs.readFile(path.join(sourceDir, "qa", "SKILL.md"), "utf8");
  const destinationStat = await fs.lstat(path.join(destinationDir, "qa"));

  assert.equal(sourceBody, "destination-only skill\n");
  assert.equal(destinationStat.isSymbolicLink(), true);
  assert.equal(await fs.readlink(path.join(destinationDir, "qa")), path.join(sourceDir, "qa"));
});

test("leaves an existing source symlink in place when the source skill exists", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "triage", "source skill");
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(sourceDir, "triage"), path.join(destinationDir, "triage"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["skipped"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "triage")), path.join(sourceDir, "triage"));
  assert.equal(await fs.readFile(path.join(sourceDir, "triage", "SKILL.md"), "utf8"), "source skill\n");
});

test("replaces an existing destination symlink that points away from the source", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const externalDir = path.join(workspace, "external-skills");

  await writeSkill(sourceDir, "triage", "source skill");
  await writeSkill(externalDir, "triage", "external target");
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(externalDir, "triage"), path.join(destinationDir, "triage"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "triage")), path.join(sourceDir, "triage"));
  assert.equal(await fs.readFile(path.join(externalDir, "triage", "SKILL.md"), "utf8"), "external target\n");
});

test("imports the target directory for destination-only symlinked skills", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const externalDir = path.join(workspace, "external-skills");

  await writeSkill(externalDir, "triage", "external symlink target");
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(externalDir, "triage"), path.join(destinationDir, "triage"), "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["imported"]);

  const sourceBody = await fs.readFile(path.join(sourceDir, "triage", "SKILL.md"), "utf8");
  const destinationStat = await fs.lstat(path.join(destinationDir, "triage"));

  assert.equal(sourceBody, "external symlink target\n");
  assert.equal(destinationStat.isSymbolicLink(), true);
  assert.equal(await fs.readlink(path.join(destinationDir, "triage")), path.join(sourceDir, "triage"));
  await assert.rejects(fs.stat(path.join(externalDir, "triage")), { code: "ENOENT" });
});

test("removes dangling destination-only symlinks instead of importing them", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const destinationPath = path.join(destinationDir, "stale");

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(sourceDir, "stale"), destinationPath, "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions, [
    {
      type: "removed",
      skill: "stale",
      reason: "destination symlink target missing",
      path: destinationPath,
    },
  ]);
  await assert.rejects(fs.lstat(destinationPath), { code: "ENOENT" });
  await assert.rejects(fs.lstat(path.join(sourceDir, "stale")), { code: "ENOENT" });
});

test("dry-run reports dangling destination-only symlink removal", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");
  const destinationPath = path.join(destinationDir, "stale");

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.symlink(path.join(sourceDir, "stale"), destinationPath, "dir");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
    dryRun: true,
  });

  assert.deepEqual(result.actions, [
    {
      type: "removed",
      skill: "stale",
      reason: "destination symlink target missing",
      path: destinationPath,
    },
  ]);
  assert.equal((await fs.lstat(destinationPath)).isSymbolicLink(), true);
  await assert.rejects(fs.lstat(path.join(sourceDir, "stale")), { code: "ENOENT" });
});

test("--all-providers imports once, then source truth replaces same-name provider-only clashes", async (t) => {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const providerConfigPath = await writeProviderConfig(homeDir, twoProviders());

  await writeSkill(path.join(homeDir, ".claude", "skills"), "qa", "claude source");
  await writeSkill(path.join(homeDir, ".custom-agent", "skills"), "qa", "custom clash");

  const exitCode = await runCli(["--all-providers"], {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.equal(await fs.readFile(path.join(homeDir, ".agents", "skills", "qa", "SKILL.md"), "utf8"), "claude source\n");
  assert.equal(await fs.readlink(path.join(homeDir, ".claude", "skills", "qa")), path.join(homeDir, ".agents", "skills", "qa"));
  assert.equal(await fs.readlink(path.join(homeDir, ".custom-agent", "skills", "qa")), path.join(homeDir, ".agents", "skills", "qa"));
});

test("dry-run reports link actions without creating directories or links", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "zoom-out", "source skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
    dryRun: true,
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["linked"]);
  await assert.rejects(fs.stat(destinationDir), { code: "ENOENT" });
});

test("dry-run reports import actions without moving or linking skills", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(destinationDir, "qa", "destination-only skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
    dryRun: true,
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["imported"]);
  assert.equal(await fs.readFile(path.join(destinationDir, "qa", "SKILL.md"), "utf8"), "destination-only skill\n");
  await assert.rejects(fs.stat(path.join(sourceDir, "qa")), { code: "ENOENT" });
});

test("links source file artifacts into a missing destination", async (t) => {
  const workspace = await tempHome(t);
  const sourcePath = path.join(workspace, ".agents", "AGENTS.md");
  const destinationPath = path.join(workspace, ".codex", "AGENTS.md");

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "shared global instructions\n");

  const result = await syncFileProvider({
    artifact: fileArtifact(sourcePath),
    provider: fileProvider(destinationPath, { mode: "symlink" }),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["linked"]);
  assert.equal((await fs.lstat(destinationPath)).isSymbolicLink(), true);
  assert.equal(await fs.readlink(destinationPath), sourcePath);
});

test("dry-run reports file artifact imports without moving or linking", async (t) => {
  const workspace = await tempHome(t);
  const sourcePath = path.join(workspace, ".agents", "AGENTS.md");
  const destinationPath = path.join(workspace, ".codex", "AGENTS.md");

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.writeFile(destinationPath, "destination-only instructions\n");

  const result = await syncFileProvider({
    artifact: fileArtifact(sourcePath),
    provider: fileProvider(destinationPath, { mode: "symlink" }),
    dryRun: true,
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["imported"]);
  assert.equal(await fs.readFile(destinationPath, "utf8"), "destination-only instructions\n");
  await assert.rejects(fs.stat(sourcePath), { code: "ENOENT" });
});

test("replaces file artifact clashes with provider templates", async (t) => {
  const workspace = await tempHome(t);
  const sourcePath = path.join(workspace, ".agents", "AGENTS.md");
  const destinationPath = path.join(workspace, ".claude", "CLAUDE.md");

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.writeFile(sourcePath, "shared global instructions\n");
  await fs.writeFile(destinationPath, "old claude instructions\n");

  const result = await syncFileProvider({
    artifact: fileArtifact(sourcePath),
    provider: fileProvider(destinationPath, {
      mode: "template",
      template: "@~/.agents/AGENTS.md\n",
    }),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["replaced"]);
  assert.equal(await fs.readFile(destinationPath, "utf8"), "@~/.agents/AGENTS.md\n");
});

async function tempHome(t) {
  await fs.mkdir(TEST_TMP_ROOT, { recursive: true });

  const homeDir = await fs.mkdtemp(path.join(TEST_TMP_ROOT, "home-"));

  assert.ok(homeDir.startsWith(TEST_TMP_ROOT));

  t.after(async () => {
    await fs.rm(homeDir, {
      recursive: true,
      force: true,
    });
    await removeEmptyDirectory(TEST_TMP_ROOT);
    await removeEmptyDirectory(path.dirname(TEST_TMP_ROOT));
  });

  return homeDir;
}

async function removeEmptyDirectory(directoryPath) {
  try {
    await fs.rmdir(directoryPath);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) {
      throw error;
    }
  }
}

async function writeSkill(skillsDir, name, body) {
  const skillDir = path.join(skillsDir, name);

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `${body}\n`);
}

function provider(destinationDir) {
  return {
    id: "test-provider",
    label: "Test Provider",
    skillsDir: destinationDir,
  };
}

async function writeProviderConfig(homeDir, providers = defaultProviders()) {
  const configPath = path.join(homeDir, "legacy-provider-config.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({ providers }, null, 2)}\n`,
  );

  return configPath;
}

function defaultProviders() {
  return [
    {
      id: "claude-code",
      flag: "--claude-code",
      label: "Claude Code",
      skillsDir: "~/.claude/skills",
    },
  ];
}

function twoProviders() {
  return [
    ...defaultProviders(),
    {
      id: "custom-agent",
      flag: "--custom-agent",
      label: "Custom Agent",
      skillsDir: "~/.custom-agent/skills",
    },
  ];
}

async function writeAgentSyncConfig(homeDir) {
  const configPath = path.join(homeDir, "agent-sync.json");

  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      artifacts: [
        {
          id: "skills",
          label: "skills",
          type: "skills",
          default: true,
          sourceDir: "~/.agents/skills",
          providers: defaultProviders().map((provider) => ({
            id: provider.id,
            flag: provider.flag,
            label: provider.label,
            destinationDir: provider.skillsDir,
          })),
        },
        {
          id: "global-instructions",
          label: "global instructions",
          type: "file",
          sourceFile: "~/.agents/AGENTS.md",
          providers: [
            {
              id: "codex",
              flag: "--codex",
              label: "Codex",
              destinationFile: "~/.codex/AGENTS.md",
              mode: "symlink",
            },
            {
              id: "claude-code",
              flag: "--claude-code",
              label: "Claude Code",
              destinationFile: "~/.claude/CLAUDE.md",
              mode: "template",
              template: "@~/.agents/AGENTS.md\n",
            },
          ],
        },
      ],
    }, null, 2)}\n`,
  );

  return configPath;
}

function fileArtifact(sourcePath) {
  return {
    id: "global-instructions",
    label: "global instructions",
    type: "file",
    sourceFile: sourcePath,
  };
}

function fileProvider(destinationPath, options) {
  return {
    id: "test-provider",
    label: "Test Provider",
    destinationFile: destinationPath,
    ...options,
  };
}

function createWritable() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    },
  };
}

function countMatches(text, pattern) {
  return text.split(pattern).length - 1;
}

async function assertCliActionOrder(t, argv, summaryText) {
  const homeDir = await tempHome(t);
  const output = createWritable();
  const sourceDir = path.join(homeDir, ".agents", "skills");
  const destinationDir = path.join(homeDir, ".claude", "skills");
  const providerConfigPath = await writeProviderConfig(homeDir);

  await writeSkill(destinationDir, "a-imported", "destination-only skill");
  await writeSkill(destinationDir, "z-imported", "destination-only skill");
  await writeSkill(sourceDir, "a-replaced", "source skill");
  await writeSkill(destinationDir, "a-replaced", "destination skill");
  await writeSkill(sourceDir, "b-linked", "source skill");
  await writeSkill(sourceDir, "c-replaced", "source skill");
  await writeSkill(destinationDir, "c-replaced", "destination skill");
  await writeSkill(sourceDir, "d-linked", "source skill");

  const exitCode = await runCli(argv, {
    env: { HOME: homeDir },
    providerConfigPath,
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, new RegExp(summaryText));
  assert.match(output.text, /\x1b\[1mimported\x1b\[22m a-imported/);
  assert.match(output.text, /\x1b\[1mlinked\x1b\[22m b-linked/);
  assert.match(output.text, /\x1b\[1mreplaced\x1b\[22m a-replaced/);
  assert.deepEqual(
    output.text
      .trimEnd()
      .split("\n")
      .slice(1)
      .map((line) => (line === "" ? "" : stripAnsi(line).trim().split(":")[0])),
    [
      "imported a-imported",
      "imported z-imported",
      "",
      "linked b-linked",
      "linked d-linked",
      "",
      "replaced a-replaced",
      "replaced c-replaced",
    ],
  );
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
