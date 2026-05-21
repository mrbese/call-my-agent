#!/usr/bin/env node
import path from "node:path";
import {
  APP_NAME,
  DEFAULT_AGENT_ID,
  appRootFromScript,
  commandExists,
  fileExists,
  getTailscaleOrigin,
  privacyCheck,
  readEnvFile,
  readOpenClawAuth,
  run,
} from "./lib/setup-utils.mjs";

const appRoot = appRootFromScript(import.meta.url);
const envPath = path.join(appRoot, ".env.local");
const env = await readEnvFile(envPath);
const agentId = env.get("OPENCLAW_AGENT_ID") || process.env.OPENCLAW_AGENT_ID || DEFAULT_AGENT_ID;
const checks = [];

async function check(name, pass, detail = "", level = "error") {
  checks.push({ name, pass, detail, level });
}

await check("OpenClaw CLI", await commandExists("openclaw"));
await check("Node.js", await commandExists("node"));
await check("npm", await commandExists("npm"));
await check(".env.local", await fileExists(envPath), envPath);
await check("node_modules", await fileExists(path.join(appRoot, "node_modules")));

const auth = await readOpenClawAuth(agentId);
const usableProfiles = auth.openaiProfiles.filter((profile) => profile.hasSecret);
await check(
  "OpenClaw OpenAI auth",
  usableProfiles.length > 0 || Boolean(env.get("OPENAI_API_KEY")?.trim()),
  usableProfiles.length > 0
    ? usableProfiles.map((profile) => profile.id).join(", ")
    : "No profile found. Local OPENAI_API_KEY fallback is present only if configured.",
);
await check(
  "Incoming-call token",
  Boolean(env.get("CALL_MY_AGENT_CALL_TOKEN")?.trim()),
  "Recommended before Tailscale exposure.",
);

const tailscaleInstalled = await commandExists("tailscale");
await check("Tailscale CLI", tailscaleInstalled, "Required for private phone access.");
const tailscaleOrigin = tailscaleInstalled ? await getTailscaleOrigin() : undefined;
await check(
  "Tailscale DNS name",
  Boolean(tailscaleOrigin),
  tailscaleOrigin ?? "Run tailscale up before exposing the app.",
);

const tools = await run("sh", ["-lc", "curl -fsS http://127.0.0.1:3000/api/tools"], {
  timeout: 3000,
});
await check(
  "Local app /api/tools",
  tools.ok,
  tools.ok
    ? "http://127.0.0.1:3000/api/tools"
    : "Start the app first with npm run dev or npm run start.",
  "warn",
);

console.log(`${APP_NAME} doctor`);
for (const item of checks) {
  const prefix = item.pass ? "OK " : item.level === "warn" ? "WARN" : "ERR";
  console.log(`${prefix} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
}

console.log("");
console.log(privacyCheck(tailscaleOrigin ? "your Tailscale network" : "local only"));

const failures = checks.filter((item) => !item.pass && item.level !== "warn");
process.exit(failures.length > 0 ? 1 : 0);
