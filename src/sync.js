import fs from "node:fs/promises";
import path from "node:path";

export async function syncProviders({ sourceDir, providers, dryRun = false, skillNames = [] }) {
  const results = [];

  for (const provider of providers) {
    results.push(await syncProvider({ sourceDir, provider, dryRun, skillNames }));
  }

  return results;
}

export async function syncProvider({ sourceDir, provider, dryRun = false, skillNames = [] }) {
  const actions = [];
  const destinationDir = provider.skillsDir;
  const selectedSkillNames = [...new Set(skillNames)];
  const selectedSkillNameSet = selectedSkillNames.length > 0 ? new Set(selectedSkillNames) : null;

  await ensureDirectory(sourceDir, { dryRun });
  await ensureDirectory(destinationDir, { dryRun });

  const sourceEntries = await readEntries(sourceDir);
  const destinationEntries = await readEntries(destinationDir);
  const sourceSkills = filterSkillEntries(sourceEntries.skills, selectedSkillNameSet);
  const destinationSkills = filterSkillEntries(destinationEntries.skills, selectedSkillNameSet);
  const allSourceSkillNames = new Set(sourceEntries.skills.map((entry) => entry.name));
  const allDestinationSkillNames = new Set(destinationEntries.skills.map((entry) => entry.name));
  const sourceNames = new Set(sourceSkills.map((entry) => entry.name));
  const sourceAllNames = new Set(sourceEntries.allNames);
  const destinationNames = new Set(destinationEntries.allNames);
  const importedNames = new Set();

  for (const destinationEntry of destinationSkills) {
    if (sourceNames.has(destinationEntry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, destinationEntry.name);
    const destinationPath = path.join(destinationDir, destinationEntry.name);

    if (sourceAllNames.has(destinationEntry.name)) {
      if (!dryRun) {
        await removeEntry(destinationPath);
      }

      actions.push({
        type: "removed",
        skill: destinationEntry.name,
        reason: "source path already exists",
        path: destinationPath,
      });
      continue;
    }

    if (!dryRun) {
      await moveSkillToSource(destinationEntry, destinationPath, sourcePath);
      await linkSkill(sourcePath, destinationPath);
    }

    sourceNames.add(destinationEntry.name);
    sourceAllNames.add(destinationEntry.name);
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
      if (await isSymlinkToSource(destinationPath, sourcePath)) {
        actions.push({
          type: "skipped",
          skill: sourceName,
          reason: "destination already links to source",
          path: destinationPath,
        });
        continue;
      }

      if (!dryRun) {
        await replaceWithSourceLink(sourcePath, destinationPath);
      }

      actions.push({
        type: "replaced",
        skill: sourceName,
        from: sourcePath,
        to: destinationPath,
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

  for (const skillName of selectedSkillNames) {
    if (!allSourceSkillNames.has(skillName) && !allDestinationSkillNames.has(skillName)) {
      actions.push({
        type: "skipped",
        skill: skillName,
        reason: "skill not found in source or destination",
      });
    }
  }

  return {
    provider,
    sourceDir,
    destinationDir,
    dryRun,
    actions,
  };
}

function filterSkillEntries(entries, selectedSkillNameSet) {
  if (!selectedSkillNameSet) {
    return entries;
  }

  return entries.filter((entry) => selectedSkillNameSet.has(entry.name));
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

async function replaceWithSourceLink(sourcePath, destinationPath) {
  await removeEntry(destinationPath);
  await linkSkill(sourcePath, destinationPath);
}

async function removeEntry(entryPath) {
  await fs.rm(entryPath, {
    recursive: true,
    force: true,
  });
}

async function isSymlinkToSource(destinationPath, sourcePath) {
  try {
    const destinationStat = await fs.lstat(destinationPath);

    if (!destinationStat.isSymbolicLink()) {
      return false;
    }

    const linkTarget = await fs.readlink(destinationPath);
    const resolvedTarget = path.resolve(path.dirname(destinationPath), linkTarget);

    return resolvedTarget === sourcePath;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EINVAL") {
      return false;
    }

    throw error;
  }
}

async function linkSkill(sourcePath, destinationPath) {
  await fs.symlink(sourcePath, destinationPath, "dir");
}
