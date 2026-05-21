export const OPENCLAW_AGENT_CONSULT_TOOL_NAME = "openclaw_agent_consult";
export const OPENCLAW_REMINDER_TOOL_NAME = "schedule_openclaw_reminder";

export type CallMyAgentSessionScope = "per-call" | "per-phone";
export type CallMyAgentToolPolicy = "safe-read-only" | "owner" | "none";
export type CallMyAgentConsultPolicy = "auto" | "substantive" | "always";

export type CallMyAgentVoiceConfig = {
  enabled: boolean;
  provider: "browser";
  agentId: string;
  sessionScope: CallMyAgentSessionScope;
  outbound: {
    defaultMode: "conversation";
  };
  realtime: {
    enabled: boolean;
    provider: "openai";
    instructions: string;
    toolPolicy: CallMyAgentToolPolicy;
    consultPolicy: CallMyAgentConsultPolicy;
    consultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
    consultFastMode?: boolean;
    agentContext: {
      enabled: boolean;
      maxChars: number;
      includeIdentity: boolean;
      includeSystemPrompt: boolean;
      includeWorkspaceFiles: boolean;
      files: string[];
    };
    providers: {
      openai: {
        model: string;
        voice: string;
      };
    };
  };
};

export const DEFAULT_CALL_MY_AGENT_REALTIME_INSTRUCTIONS = [
  "You are OpenClaw's browser realtime voice interface for your OpenClaw agent.",
  "Keep spoken replies brief, natural, and useful.",
  `When a request needs deeper reasoning, current information, memory, workspace context, or tools, call ${OPENCLAW_AGENT_CONSULT_TOOL_NAME} before answering.`,
  `When the user explicitly asks to be reminded, use ${OPENCLAW_REMINDER_TOOL_NAME}. Ask one clarifying question first if the reminder text or time is ambiguous.`,
].join(" ");

export function buildConsultPolicyInstructions(policy: CallMyAgentConsultPolicy) {
  switch (policy) {
    case "always":
      return `Call ${OPENCLAW_AGENT_CONSULT_TOOL_NAME} before every substantive answer.`;
    case "substantive":
      return [
        "Answer simple conversational glue directly.",
        `Call ${OPENCLAW_AGENT_CONSULT_TOOL_NAME} before answering requests that need facts, memory, current information, tools, workspace state, or the user's OpenClaw-specific context.`,
      ].join(" ");
    case "auto":
    default:
      return undefined;
  }
}

export function createCallMyAgentVoiceConfig(params?: {
  agentId?: string;
  model?: string;
  voice?: string;
}): CallMyAgentVoiceConfig {
  return {
    enabled: true,
    provider: "browser",
    agentId: params?.agentId ?? "main",
    sessionScope: "per-call",
    outbound: {
      defaultMode: "conversation",
    },
    realtime: {
      enabled: true,
      provider: "openai",
      instructions: DEFAULT_CALL_MY_AGENT_REALTIME_INSTRUCTIONS,
      toolPolicy: "safe-read-only",
      consultPolicy: "substantive",
      consultThinkingLevel: "low",
      consultFastMode: true,
      agentContext: {
        enabled: true,
        maxChars: 6000,
        includeIdentity: true,
        includeSystemPrompt: true,
        includeWorkspaceFiles: true,
        files: ["SOUL.md", "IDENTITY.md", "USER.md"],
      },
      providers: {
        openai: {
          model: params?.model ?? "gpt-realtime",
          voice: params?.voice ?? "cedar",
        },
      },
    },
  };
}
