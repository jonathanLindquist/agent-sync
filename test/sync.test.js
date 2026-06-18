import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { runCli } from "../src/cli.js";
import { syncProvider } from "../src/sync.js";

test("running without provider flags does nothing", async () => {
  const homeDir = await tempHome();
  const output = createWritable();

  const exitCode = await runCli([], {
    env: { HOME: homeDir },
    stdout: output,
    stderr: createWritable(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.text, /nothing to sync/);
  await assert.rejects(fs.stat(path.join(homeDir, ".agents")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(homeDir, ".claude")), { code: "ENOENT" });
});

test("links source skills that do not exist in the destination", async () => {
  const workspace = await tempHome();
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

test("does not replace a destination skill that already exists", async () => {
  const workspace = await tempHome();
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

test("does not link over a non-skill destination entry", async () => {
  const workspace = await tempHome();
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

test("moves destination-only skills into source and symlinks them back", async () => {
  const workspace = await tempHome();
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

test("imports the target directory for destination-only symlinked skills", async () => {
  const workspace = await tempHome();
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

test("dry-run reports actions without creating directories or links", async () => {
  const workspace = await tempHome();
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

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "skill-organizer-"));
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

function createWritable() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    },
  };
}
