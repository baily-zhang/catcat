#!/usr/bin/env node

const { spawn } = require("child_process");
const { detectSource, sendNotification } = require("../src/notification/client");

function usage() {
  return [
    "Usage: petsona-run [--min-seconds <seconds>] [--source <source>] -- <command> [args...]",
    "       petsona-run npm test",
    "",
    "Runs a command and asks 77 to report the result."
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    minSeconds: 0,
    source: detectSource()
  };
  const command = [];
  let passthrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthrough) {
      command.push(arg);
    } else if (arg === "--") {
      passthrough = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--min-seconds") {
      options.minSeconds = Number(argv[index + 1] || 0);
      index += 1;
    } else if (arg === "--source") {
      options.source = argv[index + 1] || options.source;
      index += 1;
    } else {
      command.push(arg);
      passthrough = true;
    }
  }

  return { options, command };
}

function elapsedSeconds(startedAt) {
  return Math.max(0, (Date.now() - startedAt) / 1000);
}

async function notifyResult({ command, code, signal, seconds, source }) {
  const commandText = command.join(" ");
  const failed = code !== 0 || signal;
  const title = failed ? "命令失败" : "命令完成";
  const result = signal ? `signal ${signal}` : `exit ${code}`;
  await sendNotification({
    source,
    level: failed ? "error" : "success",
    title,
    body: `${commandText}\n${result} · ${seconds.toFixed(1)}s`,
    ttlMs: failed ? 12000 : 6200
  });
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2));
  if (options.help || command.length === 0) {
    console.log(usage());
    process.exitCode = options.help ? 0 : 2;
    return;
  }

  const startedAt = Date.now();
  let failedToStart = false;
  const child = spawn(command[0], command.slice(1), {
    stdio: "inherit",
    shell: false
  });

  child.on("error", async (error) => {
    failedToStart = true;
    await sendNotification({
      source: options.source,
      level: "error",
      title: "命令无法启动",
      body: `${command.join(" ")}\n${error.message}`,
      ttlMs: 12000
    }).catch(() => {});
    process.exitCode = 127;
  });

  child.on("close", async (code, signal) => {
    if (failedToStart) return;
    const seconds = elapsedSeconds(startedAt);
    if (seconds >= options.minSeconds) {
      await notifyResult({
        command,
        code,
        signal,
        seconds,
        source: options.source
      }).catch((error) => {
        console.error(error.message);
      });
    }
    process.exitCode = signal ? 1 : code;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
