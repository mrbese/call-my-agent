import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { createCallMyAgentVoiceConfig } from "../../lib/voice-config";
import { buildCallMyAgentRealtimeInstructions } from "../../lib/voice-context";

export const dynamic = "force-dynamic";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "cedar";
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID ?? "main";

type RealtimeKeySlot = {
  label: string;
  value: string;
};

type AuthProfileStore = {
  profiles?: Record<
    string,
    {
      type?: unknown;
      provider?: unknown;
      key?: unknown;
      token?: unknown;
    }
  >;
};

type AuthStateStore = {
  order?: Record<string, unknown>;
};

function agentDir(agentId: string) {
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "agent");
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function getOpenClawProfileKeys(agentId: string): Promise<RealtimeKeySlot[]> {
  const dir = agentDir(agentId);
  const [profileStore, authState] = await Promise.all([
    readJsonFile<AuthProfileStore>(path.join(dir, "auth-profiles.json")),
    readJsonFile<AuthStateStore>(path.join(dir, "auth-state.json")),
  ]);
  const profiles = profileStore?.profiles ?? {};
  const openaiProfiles = Object.entries(profiles)
    .filter(([, profile]) => profile.provider === "openai")
    .filter(([, profile]) => profile.type === "api_key" || profile.type === "token")
    .filter(([, profile]) => {
      const secret = profile.type === "api_key" ? profile.key : profile.token;
      return typeof secret === "string" && secret.trim();
    });
  const configuredOrder = authState?.order?.openai;
  const order = Array.isArray(configuredOrder)
    ? configuredOrder.filter((id): id is string => typeof id === "string")
    : [];
  const orderedIds =
    order.length > 0
      ? [
          ...order,
          ...openaiProfiles
            .map(([profileId]) => profileId)
            .filter((profileId) => !order.includes(profileId)),
        ]
      : openaiProfiles.map(([profileId]) => profileId);

  return orderedIds.flatMap((profileId) => {
    const profile = profiles[profileId];
    if (
      profile?.provider !== "openai" ||
      (profile.type !== "api_key" && profile.type !== "token")
    ) {
      return [];
    }

    const secret = profile.type === "api_key" ? profile.key : profile.token;
    if (typeof secret !== "string" || !secret.trim()) {
      return [];
    }

    return [{ label: `profile:${profileId}`, value: secret }];
  });
}

async function getRealtimeApiKeys(agentId: string): Promise<RealtimeKeySlot[]> {
  const profileKeys = await getOpenClawProfileKeys(agentId);
  const envKeys = [
    { label: "env:OPENAI_API_KEY", value: process.env.OPENAI_API_KEY ?? "" },
    {
      label: "env:OPENAI_API_KEY_SECONDARY",
      value: process.env.OPENAI_API_KEY_SECONDARY ?? "",
    },
    {
      label: "env:OPENAI_API_KEY_FALLBACK",
      value:
        process.env.OPENAI_API_KEY_FALLBACK ??
        process.env.OPENAI_FALLBACK_API_KEY ??
        "",
    },
  ].filter((key) => Boolean(key.value.trim()));

  const seen = new Set<string>();
  return [...profileKeys, ...envKeys].filter((key) => {
    if (seen.has(key.value)) return false;
    seen.add(key.value);
    return true;
  });
}

async function createRealtimeClientSecret(params: {
  apiKey: string;
  session: Record<string, unknown>;
}) {
  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session: params.session }),
    },
  );

  const data = await response.json();
  return { response, data };
}

export async function GET() {
  const apiKeys = await getRealtimeApiKeys(OPENCLAW_AGENT_ID);

  if (apiKeys.length === 0) {
    return NextResponse.json(
      {
        error:
          "No OpenAI API key found. Add an OpenClaw openai:* auth profile, or set OPENAI_API_KEY.",
      },
      { status: 500 },
    );
  }

  const voiceConfig = createCallMyAgentVoiceConfig({
    agentId: OPENCLAW_AGENT_ID,
    model: REALTIME_MODEL,
    voice: REALTIME_VOICE,
  });
  const instructions = await buildCallMyAgentRealtimeInstructions(voiceConfig);
  const sessionKey = `call-my-agent-${crypto.randomUUID()}`;

  const session = {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions,
    audio: {
      output: {
        voice: REALTIME_VOICE,
      },
    },
  };

  try {
    const failures: Array<{
      key: string;
      status: number;
      details: unknown;
    }> = [];

    for (const key of apiKeys) {
      const { response, data } = await createRealtimeClientSecret({
        apiKey: key.value,
        session,
      });

      if (!response.ok) {
        failures.push({
          key: key.label,
          status: response.status,
          details: data,
        });
        continue;
      }

      return NextResponse.json({
        model: REALTIME_MODEL,
        voice: REALTIME_VOICE,
        sessionKey,
        agentId: voiceConfig.agentId,
        config: voiceConfig,
        instructions,
        apiKeySlot: key.label,
        value: data.value ?? data.client_secret?.value,
      });
    }

    const lastFailure = failures.at(-1);
    return NextResponse.json(
      {
        error: "OpenAI realtime token request failed for all configured keys.",
        failures,
      },
      { status: lastFailure?.status ?? 500 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to create an OpenAI Realtime client secret.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
