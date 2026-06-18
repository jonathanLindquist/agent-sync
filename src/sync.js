import fs from "node:fs/promises";
import path from "node:path";

export async function syncProviders({ sourceDir, providers, dryRun = false }) {
  const results = [];

  for (const provider of providers) {
    results.push(await syncProvider({ sourceDir, provider, dryRun }));
  }

  return results;
}

export async function syncProvider({ sourceDir, provider, dryRun = false }) {
  const actions = [];
  const destinationDir = provider.skillsDir;

  await ensureDirectory(sourceDir, { dryRun });
  await ensureDirectory(destinationDir, { dryRun });

  const sourceEntries = await readEntries(sourceDir);
  const destinationEntries = await readEntries(destinationDir);
  const sourceNames = new Set(sourceEntries.skills.map((entry) => entry.name));
  const destinationNames = new Set(destinationEntries.allNames);
  const importedNames = new Set();

  for (const destinationEntry of destinationEntries.skills) {
    if (sourceNames.has(destinationEntry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, destinationEntry.name);
    const destinationPath = path.join(destinationDir, destinationEntry.name);

    if (sourceEntries.allNames.has(destinationEntry.name)) {
      actions.push({
        type: "skipped",
        skill: destinationEntry.name,
        reason: "source path already exists",
        path: sourcePath,
      });
      continue;
    }

    if (!dryRun) {
      await moveSkillToSource(destinationEntry, destinationPath, sourcePath);
      await linkSkill(sourcePath, destinationPath);
    }

    sourceNames.add(destinationEntry.name);
    sourceEntries.allNames.add(destinationEntry.name);
    importedNames.add(destinationEntry.name);
    actions.push({
      type: "imported",
      skill: destinationEntry.name,
      from: destinationPath,
      to: sourcePath,
    });
  }

  for (const sourceName of [...sourceNames].sort()) {
    if (importedNames.has(sourceName)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, sourceName);
    const destinationPath = path.join(destinationDir, sourceName);

    if (destinationNames.has(sourceName)) {
      actions.push({
        type: "skipped",
        skill: sourceName,
        reason: "destination already exists",
        path: destinationPath,
      });
      continue;
    }

    if (!dryRun) {
      await linkSkill(sourcePath, destinationPath);
    }

    actions.push({
      type: "linked",
      skill: sourceName,
      from: sourcePath,
      to: destinationPath,
    });
  }

  return {
    provider,
    sourceDir,
    destinationDir,
    dryRun,
    actions,
  };
}

async function ensureDirectory(directoryPath, { dryRun }) {
  if (dryRun) {
    return;
  }

  await fs.mkdir(directoryPath, { recursive: true });
}

async function readEntries(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const visibleEntries = entries.filter((entry) => !entry.name.startsWith("."));

    return {
      allNames: new Set(visibleEntries.map((entry) => entry.name)),
      skills: visibleEntries
        .filter((entry) => isSkillEntry(entry))
        .map((entry) => ({
          name: entry.name,
          isSymbolicLink: entry.isSymbolicLink(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        allNames: new Set(),
        skills: [],
      };
    }

    throw error;
  }
}

function isSkillEntry(entry) {
  return entry.isDirectory() || entry.isSymbolicLink();
}

async function moveSkillToSource(entry, destinationPath, sourcePath) {
  if (!entry.isSymbolicLink) {
    await moveEntry(destinationPath, sourcePath);
    return;
  }

  const targetPath = await fs.realpath(destinationPath);
  const targetStat = await fs.stat(targetPath);

  if (!targetStat.isDirectory()) {
    throw new Error(`Destination symlink does not point to a skill directory: ${destinationPath}`);
  }

  await moveEntry(targetPath, sourcePath);
  await fs.rm(destinationPath, {
    force: true,
  });
}

async function moveEntry(fromPath, toPath) {
  try {
    await fs.rename(fromPath, toPath);
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }

    await fs.cp(fromPath, toPath, {
      recursive: true,
      verbatimSymlinks: true,
    });
    await fs.rm(fromPath, {
      recursive: true,
      force: true,
    });
  }
}

async function linkSkill(sourcePath, destinationPath) {
  await fs.symlink(sourcePath, destinationPath, "dir");
}
