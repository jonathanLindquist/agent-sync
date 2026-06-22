import fs from "node:fs/promises";
import path from "node:path";

export async function syncArtifacts({ artifacts, dryRun = false, skillNames = [] }) {
  const results = [];

  for (const artifact of artifacts) {
    if (artifact.type === "skills") {
      results.push(
        ...(await syncProviders({
          artifact,
          sourceDir: artifact.sourceDir,
          providers: artifact.providers,
          dryRun,
          skillNames,
        })),
      );
      continue;
    }

    if (artifact.type === "file") {
      for (const provider of artifact.providers) {
        results.push(await syncFileProvider({ artifact, provider, dryRun }));
      }
    }
  }

  return results;
}

export async function syncProviders({ artifact = null, sourceDir, providers, dryRun = false, skillNames = [] }) {
  const results = [];

  for (const provider of providers) {
    results.push(await syncProvider({ sourceDir, provider, dryRun, skillNames, artifact }));
  }

  return results;
}

export async function syncProvider({ sourceDir, provider, dryRun = false, skillNames = [], artifact = null }) {
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
  const sourceSkillsByName = new Map(sourceSkills.map((entry) => [entry.name, entry]));
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

    if (destinationEntry.isSymbolicLink && (await isDanglingSymlink(destinationPath))) {
      if (!dryRun) {
        await removeEntry(destinationPath);
      }

      actions.push({
        type: "removed",
        skill: destinationEntry.name,
        reason: "destination symlink target missing",
        path: destinationPath,
      });
      continue;
    }

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
    const linkSourcePath = await linkSourcePathForSkill(sourceSkillsByName.get(sourceName), sourcePath);

    if (destinationNames.has(sourceName)) {
      if (await isSymlinkToSource(destinationPath, linkSourcePath)) {
        actions.push({
          type: "skipped",
          skill: sourceName,
          reason: "destination already links to source",
          path: destinationPath,
        });
        continue;
      }

      if (!dryRun) {
        await replaceWithSourceLink(linkSourcePath, destinationPath);
      }

      actions.push({
        type: "replaced",
        skill: sourceName,
        from: linkSourcePath,
        to: destinationPath,
      });
      continue;
    }

    if (!dryRun) {
      await linkSkill(linkSourcePath, destinationPath);
    }

    actions.push({
      type: "linked",
      skill: sourceName,
      from: linkSourcePath,
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
    artifact,
    provider,
    sourceDir,
    destinationDir,
    dryRun,
    actions,
  };
}

export async function syncFileProvider({ artifact, provider, dryRun = false }) {
  const sourcePath = artifact.sourceFile;
  const destinationPath = provider.destinationFile;
  const item = artifact.id;
  const actions = [];
  const sourceExists = await fileExists(sourcePath);
  const destinationExists = await pathExists(destinationPath);

  if (!sourceExists && !destinationExists) {
    actions.push({
      type: "skipped",
      item,
      reason: "source and destination missing",
    });

    return fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions });
  }

  if (!sourceExists && destinationExists) {
    if (!dryRun) {
      await ensureDirectory(path.dirname(sourcePath), { dryRun });
      await moveFileToSource(destinationPath, sourcePath);
      await replaceDestinationWithManagedFile({ sourcePath, destinationPath, provider });
    }

    actions.push({
      type: "imported",
      item,
      from: destinationPath,
      to: sourcePath,
    });

    return fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions });
  }

  if (destinationExists && (await isManagedFileDestination({ sourcePath, destinationPath, provider }))) {
    actions.push({
      type: "skipped",
      item,
      reason: "destination already matches source",
      path: destinationPath,
    });

    return fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions });
  }

  if (destinationExists) {
    if (!dryRun) {
      await replaceDestinationWithManagedFile({ sourcePath, destinationPath, provider });
    }

    actions.push({
      type: "replaced",
      item,
      from: sourcePath,
      to: destinationPath,
    });

    return fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions });
  }

  if (!dryRun) {
    await replaceDestinationWithManagedFile({ sourcePath, destinationPath, provider });
  }

  actions.push({
    type: "linked",
    item,
    from: sourcePath,
    to: destinationPath,
  });

  return fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions });
}

function fileResult({ artifact, provider, sourcePath, destinationPath, dryRun, actions }) {
  return {
    artifact,
    provider,
    sourcePath,
    destinationPath,
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

async function linkSourcePathForSkill(entry, sourcePath) {
  if (!entry?.isSymbolicLink) {
    return sourcePath;
  }

  const linkTarget = await fs.readlink(sourcePath);
  const targetPath = path.resolve(path.dirname(sourcePath), linkTarget);
  const targetStat = await fs.stat(targetPath);

  if (!targetStat.isDirectory()) {
    throw new Error(`Source symlink does not point to a skill directory: ${sourcePath}`);
  }

  return targetPath;
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

async function moveFileToSource(destinationPath, sourcePath) {
  const destinationStat = await fs.lstat(destinationPath);

  if (!destinationStat.isSymbolicLink()) {
    await moveEntry(destinationPath, sourcePath);
    return;
  }

  const targetPath = await fs.realpath(destinationPath);
  const targetStat = await fs.stat(targetPath);

  if (!targetStat.isFile()) {
    throw new Error(`Destination symlink does not point to a file: ${destinationPath}`);
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

async function replaceDestinationWithManagedFile({ sourcePath, destinationPath, provider }) {
  await removeEntry(destinationPath);
  await ensureDirectory(path.dirname(destinationPath), { dryRun: false });

  if (provider.mode === "symlink") {
    await fs.symlink(sourcePath, destinationPath, "file");
    return;
  }

  await fs.writeFile(destinationPath, provider.template);
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

async function isDanglingSymlink(inputPath) {
  try {
    const inputStat = await fs.lstat(inputPath);

    if (!inputStat.isSymbolicLink()) {
      return false;
    }

    await fs.stat(inputPath);
    return false;
  } catch (error) {
    if (error.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

async function isManagedFileDestination({ sourcePath, destinationPath, provider }) {
  if (provider.mode === "symlink") {
    return isSymlinkToSource(destinationPath, sourcePath);
  }

  try {
    const destinationStat = await fs.lstat(destinationPath);

    if (!destinationStat.isFile()) {
      return false;
    }

    return (await fs.readFile(destinationPath, "utf8")) === provider.template;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EINVAL") {
      return false;
    }

    throw error;
  }
}

async function pathExists(inputPath) {
  try {
    await fs.lstat(inputPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function fileExists(inputPath) {
  try {
    return (await fs.stat(inputPath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function linkSkill(sourcePath, destinationPath) {
  await fs.symlink(sourcePath, destinationPath, "dir");
}
