import assert from "node:assert/strict";
import { test } from "node:test";

import { runTagAndPush } from "../scripts/tag-and-push.js";

test("tag utility does nothing without a tag", async () => {
  const commands = [];
  const stdout = createWritable();
  const stderr = createWritable();

  const exitCode = await runTagAndPush([], {
    stdout,
    stderr,
    runCommand: async (args) => commands.push(args),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, []);
  assert.match(stdout.text, /No tag provided; no action taken/);
  assert.equal(stderr.text, "");
});

test("tag utility force-updates and pushes the provided tag", async () => {
  const commands = [];
  const stdout = createWritable();
  const stderr = createWritable();

  const exitCode = await runTagAndPush(["v0.1.0"], {
    cwd: "/repo",
    stdout,
    stderr,
    runCommand: async (args, options) => commands.push({ args, options }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    {
      args: ["tag", "-fa", "v0.1.0", "-m", "v0.1.0"],
      options: { cwd: "/repo" },
    },
    {
      args: ["push", "--force", "origin", "refs/tags/v0.1.0"],
      options: { cwd: "/repo" },
    },
  ]);
  assert.match(stdout.text, /Pushed v0\.1\.0/);
  assert.equal(stderr.text, "");
});

test("tag utility rejects extra arguments without running git", async () => {
  const commands = [];
  const stdout = createWritable();
  const stderr = createWritable();

  const exitCode = await runTagAndPush(["v0.1.0", "extra"], {
    stdout,
    stderr,
    runCommand: async (args) => commands.push(args),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(commands, []);
  assert.match(stderr.text, /Expected exactly one tag argument/);
});

test("tag utility rejects option-like tags without running git", async () => {
  const commands = [];
  const stdout = createWritable();
  const stderr = createWritable();

  const exitCode = await runTagAndPush(["--delete"], {
    stdout,
    stderr,
    runCommand: async (args) => commands.push(args),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(commands, []);
  assert.match(stderr.text, /Tag must not start with '-'/);
});

test("tag utility stops before push when tagging fails", async () => {
  const commands = [];

  await assert.rejects(
    runTagAndPush(["v0.1.0"], {
      stdout: createWritable(),
      stderr: createWritable(),
      runCommand: async (args) => {
        commands.push(args);
        throw new Error("tag failed");
      },
    }),
    /tag failed/,
  );

  assert.deepEqual(commands, [["tag", "-fa", "v0.1.0", "-m", "v0.1.0"]]);
});

function createWritable() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    },
  };
}
