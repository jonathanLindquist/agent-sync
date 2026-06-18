import os from "node:os";
import path from "node:path";

export const PROVIDERS = [
  {
    id: "claude-code",
    flag: "--claude-code",
    label: "Claude Code",
    defaultSkillsDir: "~/.claude/skills",
  },
];

export function getHomeDir(env = process.env) {
  return env.HOME || os.homedir();
}

export function expandHome(inputPath, homeDir) {
  if (inputPath === "~") {
    return homeDir;
  }

  if (inputPath.startsWith("~/")) {
    return path.join(homeDir, inputPath.slice(2));
  }

  return inputPath;
}

export function sourceSkillsDir(homeDir) {
  return path.join(homeDir, ".agents", "skills");
}

export function providerWithResolvedPath(provider, homeDir) {
  return {
    ...provider,
    skillsDir: expandHome(provider.defaultSkillsDir, homeDir),
  };
}
