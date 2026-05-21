import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const APP_NAME = "Call My Agent";
export const DEFAULT_AGENT_ID = "main";
export const DEFAULT_PORT = "3000";
export const DEFAULT_HTTPS_PORT = "8443";

export function appRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(new URL(importMetaUrl).pathname), "..");
}

export async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout ?? 8000,
      maxBuffer: 1024 * 1024,
      cwd: options.cwd,
      env: options.env,
    });
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function commandExists(command) {
  const probe = await run("sh", ["-lc", `command -v ${shellQuote(command)}`]);
  return probe.ok && Boolean(probe.stdout);
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function agentDir(agentId) {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "agent");
}

export async function readOpenClawAuth(agentId = DEFAULT_AGENT_ID) {
  const dir = agentDir(agentId);
  const profileStore = await readJson(path.join(dir, "auth-profiles.json"), {});
  const authState = await readJson(path.join(dir, "auth-state.json"), {});
  const profiles = profileStore.profiles ?? {};
  const openaiProfiles = Object.entries(profiles)
    .filter(([, profile]) => profile?.provider === "openai")
    .filter(([, profile]) => profile.type === "api_key" || profile.type === "token")
    .map(([id, profile]) => {
      const secret = profile.type === "api_key" ? profile.key : profile.token;
      return {
        id,
        type: profile.type,
        hasSecret: typeof secret === "string" && Boolean(secret.trim()),
      };
    });
  const configuredOrder = authState.order?.openai;
  const order = Array.isArray(configuredOrder)
    ? configuredOrder.filter((id) => typeof id === "string")
    : [];

  return { dir, openaiProfiles, order };
}

export async function getTailscaleOrigin(httpsPort = DEFAULT_HTTPS_PORT) {
  if (!(await commandExists("tailscale"))) return undefined;

  const status = await run("tailscale", ["status", "--json"], { timeout: 5000 });
  if (!status.ok || !status.stdout) return undefined;

  try {
    const data = JSON.parse(status.stdout);
    const dnsName = typeof data.Self?.DNSName === "string" ? data.Self.DNSName : "";
    const host = dnsName.replace(/\.$/, "");
    if (!host) return undefined;
    return `https://${host}:${httpsPort}`;
  } catch {
    return undefined;
  }
}

export async function readEnvFile(filePath) {
  if (!(await fileExists(filePath))) return new Map();
  const env = new Map();
  const body = await readFile(filePath, "utf8");

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    env.set(line.slice(0, index), line.slice(index + 1));
  }

  return env;
}

export async function writeEnvFile(filePath, values) {
  const lines = [...values.entries()].map(([key, value]) => `${key}=${value}`);
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function privacyCheck(remoteAccess = "your Tailscale network") {
  return [
    "Privacy check:",
    "App hosting:        your machine",
    "Voice transport:    OpenAI Realtime API",
    "Agent runtime:      local OpenClaw",
    `Remote access:      ${remoteAccess}`,
    "Phone provider:     none",
    "Hosted backend:     none",
    "Call My Agent API:  none",
    "App account:        none",
    "API keys collected: no",
  ].join("\n");
}
