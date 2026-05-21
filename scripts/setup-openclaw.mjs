#!/usr/bin/env node
import path from "node:path";
import {
  APP_NAME,
  DEFAULT_AGENT_ID,
  DEFAULT_HTTPS_PORT,
  DEFAULT_PORT,
  appRootFromScript,
  commandExists,
  fileExists,
  getTailscaleOrigin,
  privacyCheck,
  randomToken,
  readEnvFile,
  readOpenClawAuth,
  run,
  writeEnvFile,
} from "./lib/setup-utils.mjs";

const appRoot = appRootFromScript(import.meta.url);
const args = new Set(process.argv.slice(2));
const getArgValue = (name, fallback) => {
  const raw = process.argv.slice(2);
  const index = raw.indexOf(name);
  return index >= 0 && raw[index + 1] ? raw[index + 1] : fallback;
};

const agentId = getArgValue("--agent", process.env.OPENCLAW_AGENT_ID ?? DEFAULT_AGENT_ID);
const port = getArgValue("--port", process.env.PORT ?? DEFAULT_PORT);
const httpsPort = getArgValue("--https-port", DEFAULT_HTTPS_PORT);
const installDeps = args.has("--install");
const envPath = path.join(appRoot, ".env.local");
const env = await readEnvFile(envPath);

console.log(`${APP_NAME} OpenClaw setup`);
console.log(`App directory: ${appRoot}`);
console.log(`Agent: ${agentId}`);

if (!(await commandExists("openclaw"))) {
  console.error("OpenClaw CLI was not found on PATH.");
  process.exit(1);
}

const auth = await readOpenClawAuth(agentId);
const usableProfiles = auth.openaiProfiles.filter((profile) => profile.hasSecret);
if (usableProfiles.length === 0) {
  console.log("");
  console.log("No usable OpenClaw OpenAI auth profile was found.");
  console.log("Add one with:");
  console.log("  openclaw models auth paste-token --provider openai --profile-id openai:default");
  console.log(`  openclaw models auth order set --provider openai --agent ${agentId} openai:default`);
} else {
  console.log(
    `OpenAI auth profiles: ${usableProfiles.map((profile) => profile.id).join(", ")}`,
  );
  if (auth.order.length > 0) {
    console.log(`OpenAI auth order: ${auth.order.join(", ")}`);
  }
}

env.set("OPENAI_API_KEY", env.get("OPENAI_API_KEY") ?? "");
env.set("OPENAI_REALTIME_MODEL", env.get("OPENAI_REALTIME_MODEL") ?? "gpt-realtime");
env.set("OPENAI_REALTIME_VOICE", env.get("OPENAI_REALTIME_VOICE") ?? "cedar");
env.set(
  "NEXT_PUBLIC_OPENAI_REALTIME_MODEL",
  env.get("NEXT_PUBLIC_OPENAI_REALTIME_MODEL") ?? "gpt-realtime",
);
env.set(
  "NEXT_PUBLIC_OPENAI_REALTIME_VOICE",
  env.get("NEXT_PUBLIC_OPENAI_REALTIME_VOICE") ?? "cedar",
);
env.set("OPENCLAW_AGENT_ID", agentId);
env.set("OPENCLAW_CONSULT_THINKING", env.get("OPENCLAW_CONSULT_THINKING") ?? "low");
env.set(
  "OPENCLAW_CONSULT_TIMEOUT_MS",
  env.get("OPENCLAW_CONSULT_TIMEOUT_MS") ?? "90000",
);
env.set(
  "OPENCLAW_WORKSPACE_DIR",
  env.get("OPENCLAW_WORKSPACE_DIR") ?? path.resolve(appRoot, ".."),
);
env.set("WEB_PUSH_PUBLIC_KEY", env.get("WEB_PUSH_PUBLIC_KEY") ?? "");
env.set("WEB_PUSH_PRIVATE_KEY", env.get("WEB_PUSH_PRIVATE_KEY") ?? "");
env.set(
  "CALL_MY_AGENT_CALL_TOKEN",
  env.get("CALL_MY_AGENT_CALL_TOKEN") || randomToken(),
);

const tailscaleOrigin = await getTailscaleOrigin(httpsPort);
env.set(
  "WEB_PUSH_SUBJECT",
  env.get("WEB_PUSH_SUBJECT") || tailscaleOrigin || "mailto:call-my-agent@localhost",
);

await writeEnvFile(envPath, env);
console.log(`Wrote ${envPath}`);

if (installDeps) {
  console.log("Installing dependencies with npm install...");
  const install = await run("npm", ["install"], { cwd: appRoot, timeout: 120000 });
  if (!install.ok) {
    console.error(install.stderr || install.error);
    process.exit(1);
  }
} else if (!(await fileExists(path.join(appRoot, "node_modules")))) {
  console.log("");
  console.log("Dependencies are not installed yet.");
  console.log("After confirming package installation is OK, run:");
  console.log("  npm install");
  console.log("Or rerun setup with:");
  console.log("  npm run setup:openclaw -- --install");
}

console.log("");
console.log("Next commands:");
console.log(`  cd ${appRoot}`);
console.log(`  npm run dev -- --hostname 127.0.0.1 --port ${port}`);
console.log(`  npm run tailscale:setup -- --https-port ${httpsPort} --port ${port}`);
console.log("");
console.log(privacyCheck(tailscaleOrigin ? "your Tailscale network" : "local only until Tailscale Serve is enabled"));
