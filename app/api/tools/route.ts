import { appendFile, mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import {
  OPENCLAW_AGENT_CONSULT_TOOL_NAME,
  OPENCLAW_REMINDER_TOOL_NAME,
} from "../../lib/voice-config";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const dataDir = path.join(process.cwd(), "data");
const capturePath = path.join(dataDir, "captures.jsonl");
const defaultAgentId = process.env.OPENCLAW_AGENT_ID ?? "main";
const openClawConfigPath =
  process.env.OPENCLAW_CONFIG_PATH ??
  path.join(process.env.HOME ?? "", ".openclaw", "openclaw.json");
const consultTimeoutMs = Number.isFinite(
  Number.parseInt(process.env.OPENCLAW_CONSULT_TIMEOUT_MS ?? "90000", 10),
)
  ? Number.parseInt(process.env.OPENCLAW_CONSULT_TIMEOUT_MS ?? "90000", 10)
  : 90000;

type ToolBody = {
  action?: string;
  input?: Record<string, unknown>;
};

type OpenClawConfig = {
  gateway?: {
    auth?: {
      token?: unknown;
    };
  };
};

let cachedGatewayToken: string | undefined;

async function getGatewayToken() {
  if (process.env.OPENCLAW_GATEWAY_TOKEN?.trim()) {
    return process.env.OPENCLAW_GATEWAY_TOKEN.trim();
  }

  if (cachedGatewayToken !== undefined) return cachedGatewayToken;

  try {
    const config = JSON.parse(
      await readFile(openClawConfigPath, "utf8"),
    ) as OpenClawConfig;
    const token = config.gateway?.auth?.token;
    cachedGatewayToken = typeof token === "string" ? token.trim() : "";
    return cachedGatewayToken;
  } catch {
    cachedGatewayToken = "";
    return cachedGatewayToken;
  }
}

function redactSecret(text: string, secret?: string) {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

async function runOpenClaw(args: string[]) {
  const gatewayToken = await getGatewayToken();
  const effectiveArgs =
    gatewayToken && !args.includes("--token")
      ? [...args, "--token", gatewayToken]
      : args;

  try {
    const { stdout, stderr } = await execFileAsync("openclaw", effectiveArgs, {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });

    return {
      stdout: stdout.trim(),
      stderr: redactSecret(stderr.trim(), gatewayToken),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(redactSecret(error.message, gatewayToken));
    }
    throw error;
  }
}

function slugifyReminderName(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `reminder-${slug || "call-my-agent"}-${Date.now().toString(36)}`;
}

async function scheduleOpenClawReminder(input: Record<string, unknown>) {
  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : undefined;
  const message =
    typeof input.message === "string" && input.message.trim()
      ? input.message.trim()
      : title;
  const when =
    typeof input.when === "string" && input.when.trim()
      ? input.when.trim()
      : undefined;

  if (!message) {
    throw new Error("Reminder message is required.");
  }

  if (!when) {
    throw new Error("Reminder time is required.");
  }

  const reminderText = title ? `${title}: ${message}` : message;
  const args = [
    "cron",
    "add",
    "--name",
    slugifyReminderName(title ?? message),
    "--description",
    `Call My Agent reminder: ${reminderText}`,
    "--at",
    when,
    "--system-event",
    `Reminder from Call My Agent: ${reminderText}`,
    "--delete-after-run",
    "--wake",
    "now",
    "--json",
  ];

  const { stdout, stderr } = await runOpenClaw(args);
  let parsed: unknown = undefined;

  try {
    parsed = stdout ? JSON.parse(stdout) : undefined;
  } catch {
    parsed = stdout;
  }

  return {
    ok: true,
    message: `Reminder scheduled for ${when}: ${reminderText}`,
    reminder: parsed,
    stderr,
  };
}

async function consultOpenClawAgent(input: Record<string, unknown>) {
  const question =
    typeof input.question === "string" && input.question.trim()
      ? input.question.trim()
      : "Help with the current voice conversation.";
  const context =
    typeof input.context === "string" && input.context.trim()
      ? input.context.trim()
      : undefined;
  const responseStyle =
    typeof input.responseStyle === "string" && input.responseStyle.trim()
      ? input.responseStyle.trim()
      : "Answer for a live voice call in 1-3 concise spoken sentences.";
  const sessionKey =
    typeof input.sessionKey === "string" && input.sessionKey.trim()
      ? input.sessionKey.trim()
      : "call-my-agent";
  const agentId =
    typeof input.agentId === "string" && input.agentId.trim()
      ? input.agentId.trim()
      : defaultAgentId;

  const message = [
    `Voice consult question: ${question}`,
    context ? `Context from realtime voice session:\n${context}` : undefined,
    `Response style: ${responseStyle}`,
    "Return only the speakable answer unless a safety or confirmation boundary matters.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const args = [
    "agent",
    "--agent",
    agentId,
    "--session-id",
    sessionKey,
    "--message",
    message,
    "--json",
  ];

  if (process.env.OPENCLAW_CONSULT_THINKING) {
    args.push("--thinking", process.env.OPENCLAW_CONSULT_THINKING);
  }

  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    timeout: consultTimeoutMs,
    maxBuffer: 1024 * 1024 * 4,
  });
  const trimmed = stdout.trim();
  let parsed: unknown;

  try {
    parsed = trimmed ? JSON.parse(trimmed) : {};
  } catch {
    return {
      text: trimmed || "OpenClaw returned no speakable text.",
      stderr: stderr.trim(),
    };
  }

  return {
    text: extractSpeakableText(parsed),
    raw: parsed,
    stderr: stderr.trim(),
  };
}

function extractSpeakableText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "OpenClaw returned no speakable text.";
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.text,
    record.message,
    (record.result as Record<string, unknown> | undefined)?.text,
    (record.result as Record<string, unknown> | undefined)?.message,
  ];

  const payloads = record.payloads;
  if (Array.isArray(payloads)) {
    for (const payload of payloads) {
      if (payload && typeof payload === "object") {
        candidates.push((payload as Record<string, unknown>).text);
      }
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "OpenClaw finished, but did not return speakable text.";
}

async function captureItem(input: Record<string, unknown>) {
  await mkdir(dataDir, { recursive: true });

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: typeof input.kind === "string" ? input.kind : "note",
    title: typeof input.title === "string" ? input.title : "Untitled",
    details: typeof input.details === "string" ? input.details : "",
    priority: typeof input.priority === "string" ? input.priority : "normal",
  };

  await appendFile(capturePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

async function listRecentCaptures() {
  try {
    const file = await readFile(capturePath, "utf8");
    return file
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-10)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ToolBody;
  const input = body.input ?? {};

  try {
    switch (body.action) {
      case OPENCLAW_AGENT_CONSULT_TOOL_NAME:
        return NextResponse.json(await consultOpenClawAgent(input));

      case OPENCLAW_REMINDER_TOOL_NAME:
        return NextResponse.json(await scheduleOpenClawReminder(input));

      case "get_openclaw_status":
        return NextResponse.json(await runOpenClaw(["status"]));

      case "list_capabilities":
        return NextResponse.json({
          capabilities: [
            "Live OpenAI Realtime voice chat",
            "OpenClaw agent consult through openclaw_agent_consult",
            "One-shot reminders through OpenClaw cron/system events",
            "Inbound call notifications through Web Push",
            "Compact OpenClaw identity/workspace context in realtime instructions",
            "Optional local capture fallback",
          ],
          confirmationRequiredFor: [
            "sending emails",
            "sending messages",
            "posting publicly",
            "deleting or overwriting user data",
          ],
        });

      case "capture_task":
        return NextResponse.json(await captureItem(input));

      case "list_recent_captures":
        return NextResponse.json({ captures: await listRecentCaptures() });

      default:
        return NextResponse.json(
          { error: `Unknown or disabled tool action: ${body.action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Tool execution failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
