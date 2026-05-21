import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildConsultPolicyInstructions,
  type CallMyAgentVoiceConfig,
} from "./voice-config";

const workspaceDir =
  process.env.OPENCLAW_WORKSPACE_DIR ?? path.resolve(process.cwd(), "..");

function limitText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[truncated]`;
}

async function readWorkspaceFile(file: string, maxChars: number) {
  const normalized = file.replace(/^\/+/, "");
  if (normalized.includes("..")) return undefined;

  try {
    const body = await readFile(path.join(workspaceDir, normalized), "utf8");
    const trimmed = body.trim();
    if (!trimmed) return undefined;
    return `### ${normalized}\n${limitText(trimmed, maxChars)}`;
  } catch {
    return undefined;
  }
}

async function readWorkspaceContext(config: CallMyAgentVoiceConfig) {
  const context = config.realtime.agentContext;
  if (!context.enabled || !context.includeWorkspaceFiles) return [];

  const sections: string[] = [];
  let remaining = context.maxChars;

  for (const file of context.files) {
    if (remaining <= 0) break;
    const section = await readWorkspaceFile(file, Math.max(0, remaining - 32));
    if (!section) continue;
    sections.push(section);
    remaining -= section.length;
  }

  return sections;
}

export async function buildCallMyAgentRealtimeInstructions(
  config: CallMyAgentVoiceConfig,
) {
  const sections = [config.realtime.instructions];
  const consultGuidance = buildConsultPolicyInstructions(
    config.realtime.consultPolicy,
  );

  if (consultGuidance) sections.push(consultGuidance);

  const context = config.realtime.agentContext;
  if (!context.enabled) return sections.join("\n\n");

  const capsule = [
    "OpenClaw agent voice context:",
    `- Agent id: ${config.agentId}`,
    "- Use this context to match the OpenClaw agent's personality and standing preferences on fast voice turns.",
    "- Treat this as compact context only. Call openclaw_agent_consult when the caller needs the full agent brain, tools, memory, or workspace state.",
  ];

  if (context.includeIdentity) {
    capsule.push(
      [
        "Configured identity:",
        "- Name: your OpenClaw agent",
        "- Vibe: Direct, warm, pragmatic, brain-first, proactive, no fluff.",
        "- Role: the user's personal knowledge agent, assistant, right hand, ADHD coach, executive-function partner, and operational copilot.",
      ].join("\n"),
    );
  }

  const workspaceSections = await readWorkspaceContext(config);
  if (workspaceSections.length > 0) {
    capsule.push(`Workspace voice context:\n${workspaceSections.join("\n\n")}`);
  }

  sections.push(limitText(capsule.join("\n\n"), context.maxChars));
  return sections.filter(Boolean).join("\n\n");
}
