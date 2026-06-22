#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function runTagAndPush(
  argv,
  {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr,
    runCommand = runGit,
  } = {},
) {
  const [tag, ...extraArgs] = argv;

  if (!tag || tag === "--help" || tag === "-h") {
    stdout.write("Usage: node scripts/tag-and-push.js <tag>\n");
    stdout.write("No tag provided; no action taken.\n");
    return 0;
  }

  if (extraArgs.length > 0) {
    stderr.write("Expected exactly one tag argument.\n");
    stderr.write("Usage: node scripts/tag-and-push.js <tag>\n");
    return 1;
  }

  if (tag.startsWith("-")) {
    stderr.write("Tag must not start with '-'.\n");
    return 1;
  }

  stdout.write(`Tagging ${tag}\n`);
  await runCommand(["tag", "-fa", tag, "-m", tag], { cwd });

  stdout.write(`Pushing ${tag} to origin\n`);
  await runCommand(["push", "--force", "origin", `refs/tags/${tag}`], { cwd });

  stdout.write(`Pushed ${tag}\n`);
  return 0;
}

async function runGit(args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git ${args.join(" ")} exited with code ${code}`));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runTagAndPush(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
