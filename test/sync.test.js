import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/cli.js";
import { syncProvider } from "../src/sync.js";

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

test("does not replace a destination skill that already exists", async (t) => {
  const workspace = await tempHome(t);
  const sourceDir = path.join(workspace, ".agents", "skills");
  const destinationDir = path.join(workspace, ".claude", "skills");

  await writeSkill(sourceDir, "tdd", "source skill");
  await writeSkill(destinationDir, "tdd", "local destination skill");

  const result = await syncProvider({
    sourceDir,
    provider: provider(destinationDir),
  });

  assert.deepEqual(result.actions.map((action) => action.type), ["skipped"]);

  const destinationStat = await fs.lstat(path.join(destinationDir, "tdd"));
  const destinationBody = await fs.readFile(path.join(destinationDir, "tdd", "SKILL.md"), "utf8");

  assert.equal(destinationStat.isDirectory(), true);
  assert.equal(destinationStat.isSymbolicLink(), false);
  assert.equal(destinationBody, "local destination skill\n");
});

test("does not link over a non-skill destination entry", async (t) => {
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

  assert.deepEqual(result.actions.map((action) => action.type), ["skipped"]);
  assert.equal(await fs.readFile(path.join(destinationDir, "tdd"), "utf8"), "destination file\n");
});

test("does not move a destination-only skill over a non-skill source entry", async (t) => {
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

  assert.deepEqual(result.actions.map((action) => action.type), ["skipped"]);
  assert.equal(await fs.readFile(path.join(sourceDir, "qa"), "utf8"), "source file\n");
  assert.equal(await fs.readFile(path.join(destinationDir, "qa", "SKILL.md"), "utf8"), "destination-only skill\n");
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

test("leaves an existing destination symlink in place when the source skill exists", async (t) => {
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

  assert.deepEqual(result.actions.map((action) => action.type), ["skipped"]);
  assert.equal(await fs.readlink(path.join(destinationDir, "triage")), path.join(externalDir, "triage"));
  assert.equal(await fs.readFile(path.join(sourceDir, "triage", "SKILL.md"), "utf8"), "source skill\n");
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
  const configPath = path.join(homeDir, "providers.json");

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

function createWritable() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    },
  };
}
