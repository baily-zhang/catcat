#!/usr/bin/env node

const fs = require("fs");
const { detectSource, sendNotification } = require("../src/notification/client");

function usage() {
  return [
    "Usage: petsona-say [options] <message>",
    "",
    "Options:",
    "  --level <info|success|warning|error>",
    "  --title <title>",
    "  --source <source>",
    "  --ttl <milliseconds>",
    "  --stdin",
    "  --quiet",
    "  --help"
  ].join("\n");
}

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    level: "info",
    source: detectSource(),
    quiet: false,
    stdin: false,
    messageParts: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--level" || arg === "-l") {
      options.level = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--title" || arg === "-t") {
      options.title = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--source" || arg === "-s") {
      options.source = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--ttl") {
      options.ttlMs = Number(readValue(argv, index, arg));
      index += 1;
    } else if (arg === "--stdin") {
      options.stdin = true;
    } else if (arg === "--quiet" || arg === "-q") {
      options.quiet = true;
    } else {
      options.messageParts.push(arg);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const stdin = options.stdin ? fs.readFileSync(0, "utf8").trim() : "";
  const body = [options.messageParts.join(" "), stdin].filter(Boolean).join("\n").trim();
  if (!body && !options.title) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  await sendNotification({
    source: options.source,
    level: options.level,
    title: options.title,
    body,
    ttlMs: options.ttlMs
  });

  if (!options.quiet) {
    console.log("sent to 77");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
