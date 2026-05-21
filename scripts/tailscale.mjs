#!/usr/bin/env node
import {
  DEFAULT_HTTPS_PORT,
  DEFAULT_PORT,
  commandExists,
  getTailscaleOrigin,
  run,
} from "./lib/setup-utils.mjs";

const [command = "status", ...rest] = process.argv.slice(2);
const getArgValue = (name, fallback) => {
  const index = rest.indexOf(name);
  return index >= 0 && rest[index + 1] ? rest[index + 1] : fallback;
};
const port = getArgValue("--port", DEFAULT_PORT);
const httpsPort = getArgValue("--https-port", DEFAULT_HTTPS_PORT);

if (!(await commandExists("tailscale"))) {
  console.error("Tailscale CLI was not found on PATH.");
  process.exit(1);
}

if (command === "setup") {
  const target = `http://127.0.0.1:${port}`;
  const result = await run("tailscale", ["serve", "--bg", `--https=${httpsPort}`, target], {
    timeout: 10000,
  });
  if (!result.ok) {
    console.error(result.stderr || result.error);
    process.exit(1);
  }
  const origin = await getTailscaleOrigin(httpsPort);
  console.log(`Tailscale Serve is proxying ${origin ?? `HTTPS :${httpsPort}`} to ${target}`);
  process.exit(0);
}

if (command === "teardown") {
  const result = await run("tailscale", ["serve", `--https=${httpsPort}`, "off"], {
    timeout: 10000,
  });
  if (!result.ok) {
    console.error(result.stderr || result.error);
    process.exit(1);
  }
  console.log(`Tailscale Serve disabled on HTTPS port ${httpsPort}`);
  process.exit(0);
}

if (command === "status") {
  const result = await run("tailscale", ["serve", "status"], { timeout: 10000 });
  console.log(result.stdout || result.stderr || "No Tailscale Serve status output.");
  process.exit(result.ok ? 0 : 1);
}

console.error("Usage: node scripts/tailscale.mjs <setup|teardown|status> [--port 3000] [--https-port 8443]");
process.exit(1);
