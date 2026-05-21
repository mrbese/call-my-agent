"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  RefreshCw,
  Radio,
  Sparkles,
  SquarePen,
  Waves,
} from "lucide-react";
import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
  tool,
} from "@openai/agents/realtime";
import {
  OPENCLAW_AGENT_CONSULT_TOOL_NAME,
  OPENCLAW_REMINDER_TOOL_NAME,
} from "./lib/voice-config";

type CallState = "idle" | "connecting" | "connected" | "ending" | "error";
type NotificationState =
  | "checking"
  | "unsupported"
  | "default"
  | "denied"
  | "ready"
  | "subscribed";

type LogItem = {
  id: string;
  label: string;
  detail: string;
};

type IncomingCall = {
  callId: string;
  from: string;
  reason: string;
};

type PendingIncomingCallResponse = {
  call?: IncomingCall | null;
};

type RealtimeSessionData = {
  value: string;
  model: string;
  voice: string;
  sessionKey: string;
  agentId: string;
  instructions: string;
};

const REALTIME_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const REALTIME_VOICE =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_VOICE ?? "cedar";

async function runLocalTool(action: string, input?: Record<string, unknown>) {
  const response = await fetch("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Local tool failed");
  return data;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function notificationPermissionToState(
  permission: NotificationPermission,
): NotificationState {
  if (permission === "granted") return "ready";
  return permission;
}

async function clearIncomingCall(callId: string) {
  await fetch(`/api/inbound-call?callId=${encodeURIComponent(callId)}`, {
    method: "DELETE",
  });
}

export default function Home() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [callState, setCallState] = useState<CallState>("idle");
  const [notificationState, setNotificationState] =
    useState<NotificationState>("checking");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([
    {
      id: "ready",
      label: "Ready",
      detail: "Tap Call My Agent to start a live voice session.",
    },
  ]);

  const appendLog = useCallback((label: string, detail: string) => {
    setLogs((current) =>
      [{ id: crypto.randomUUID(), label, detail }, ...current].slice(0, 8),
    );
  }, []);

  const fetchPendingIncomingCall = useCallback(async () => {
    const response = await fetch(`/api/inbound-call?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const data = (await response.json()) as PendingIncomingCallResponse;
    if (data.call) {
      setIncomingCall(data.call);
      return data.call;
    }

    return null;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let hasIncomingCallFromUrl = false;

    if (params.get("incomingCall") === "1") {
      hasIncomingCallFromUrl = true;
      setIncomingCall({
        callId: params.get("callId") || crypto.randomUUID(),
        from: params.get("from") || "Your agent",
        reason: params.get("reason") || "",
      });
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (!hasIncomingCallFromUrl) {
      fetchPendingIncomingCall()
        .then((call) => {
          if (call) appendLog("Incoming call", `${call.from} is waiting.`);
        })
        .catch(() => undefined);
    }

    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setNotificationState("unsupported");
      return;
    }

    setNotificationState(notificationPermissionToState(Notification.permission));
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          setNotificationState("subscribed");
        } else if (Notification.permission === "granted") {
          setNotificationState("ready");
        }
      })
      .catch((err) => {
        setNotificationState("unsupported");
        appendLog(
          "Notifications unavailable",
          err instanceof Error ? err.message : String(err),
        );
      });
    const interval = window.setInterval(() => {
      if (!sessionRef.current) {
        void fetchPendingIncomingCall();
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [appendLog, fetchPendingIncomingCall]);

  function buildVoiceAgent(sessionData: RealtimeSessionData) {
    return new RealtimeAgent({
      name: "your OpenClaw agent",
      voice: sessionData.voice,
      instructions: sessionData.instructions,
      tools: [
        tool({
          name: OPENCLAW_AGENT_CONSULT_TOOL_NAME,
          description:
            "Ask the full OpenClaw agent for deeper reasoning, current information, memory, workspace context, or tool-backed work.",
          parameters: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The user's question or request to consult on.",
              },
              context: {
                type: "string",
                description:
                  "Relevant voice-session context or transcript details.",
              },
              responseStyle: {
                type: "string",
                description:
                  "How the answer should be shaped for spoken playback.",
              },
            },
            required: ["question"],
            additionalProperties: false,
          },
          execute: async (input: unknown) =>
            runLocalTool(OPENCLAW_AGENT_CONSULT_TOOL_NAME, {
              ...(input as Record<string, unknown>),
              sessionKey: sessionData.sessionKey,
              agentId: sessionData.agentId,
            }),
        }),
        tool({
          name: OPENCLAW_REMINDER_TOOL_NAME,
          description:
            "Schedule a one-shot reminder that wakes the main OpenClaw session at the requested time. Use only when the user explicitly asks to be reminded. The time must be a relative duration like 20m, 2h, 1d, or an ISO datetime with timezone offset.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Short reminder title.",
              },
              message: {
                type: "string",
                description: "What the user wants to be reminded about.",
              },
              when: {
                type: "string",
                description:
                  "Reminder time as 20m, 2h, 1d, or ISO datetime with timezone offset.",
              },
            },
            required: ["message", "when"],
            additionalProperties: false,
          },
          execute: async (input: unknown) =>
            runLocalTool(
              OPENCLAW_REMINDER_TOOL_NAME,
              input as Record<string, unknown>,
            ),
        }),
      ],
    });
  }

  async function fetchSessionData() {
    const response = await fetch("/api/session");
    const data = await response.json();

    if (!response.ok || !data.value) {
      throw new Error(data.error ?? "No realtime client secret returned.");
    }

    return data as RealtimeSessionData;
  }

  async function startCall(initialMessage?: string) {
    if (sessionRef.current || callState === "connecting") return;

    setError(null);
    setCallState("connecting");
    appendLog("Dialing", "Creating a voice session with OpenClaw structure.");

    try {
      const sessionData = await fetchSessionData();
      const voiceAgent = buildVoiceAgent(sessionData);

      const session = new RealtimeSession(voiceAgent, {
        model: sessionData.model,
        transport: new OpenAIRealtimeWebRTC({
          audioElement: audioRef.current ?? undefined,
        }),
        config: {
          inputAudioTranscription: {
            model: "gpt-4o-mini-transcribe",
          },
        },
      });

      session.on("error", (event) => {
        const detail = event instanceof Error ? event.message : String(event);
        setError(detail);
        appendLog("Realtime error", detail);
      });

      session.on("agent_tool_start", (event) => {
        appendLog("Tool started", JSON.stringify(event));
      });

      session.on("agent_tool_end", (event) => {
        appendLog("Tool finished", JSON.stringify(event));
      });

      await session.connect({ apiKey: sessionData.value });
      sessionRef.current = session;
      setCallState("connected");
      appendLog(
        "Connected",
        "Your agent is listening. Deeper requests route through OpenClaw consult.",
      );
      session.sendMessage(
        initialMessage ??
          "Greet the user briefly and ask what they want to work on.",
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      setCallState("error");
      appendLog("Connection failed", detail);
    }
  }

  function endCall() {
    if (!sessionRef.current) {
      setCallState("idle");
      return;
    }

    setCallState("ending");
    sessionRef.current.close();
    sessionRef.current = null;
    setMuted(false);
    setCallState("idle");
    appendLog("Ended", "Call closed.");
  }

  function toggleMute() {
    const nextMuted = !muted;
    sessionRef.current?.mute(nextMuted);
    setMuted(nextMuted);
    appendLog(nextMuted ? "Muted" : "Unmuted", "Microphone state changed.");
  }

  async function enableIncomingCalls() {
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setNotificationState("unsupported");
      return;
    }

    setError(null);
    const permission = await Notification.requestPermission();
    setNotificationState(notificationPermissionToState(permission));

    if (permission !== "granted") {
      appendLog("Notifications blocked", "Incoming calls need notification access.");
      return;
    }

    const [registration, keyResponse] = await Promise.all([
      navigator.serviceWorker.ready,
      fetch("/api/push/vapid-key"),
    ]);
    const keyData = (await keyResponse.json()) as { publicKey?: string };

    if (!keyResponse.ok || !keyData.publicKey) {
      throw new Error("Unable to load Web Push key.");
    }

    const existingSubscription =
      await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      }));

    const saveResponse = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    const saveData = await saveResponse.json();

    if (!saveResponse.ok) {
      throw new Error(saveData.error ?? "Unable to save push subscription.");
    }

    setNotificationState("subscribed");
    appendLog("Incoming calls enabled", "Your agent can send call notifications here.");
  }

  async function refreshIncomingCalls() {
    const call = await fetchPendingIncomingCall();
    appendLog(
      call ? "Incoming call" : "No pending call",
      call ? `${call.from} is waiting.` : "Nothing waiting on the server.",
    );
  }

  async function answerIncomingCall() {
    const call = incomingCall;
    setIncomingCall(null);
    if (call) void clearIncomingCall(call.callId);
    await startCall(
      call
        ? [
            `The user answered an inbound call from ${call.from}.`,
            call.reason ? `Reason for the call: ${call.reason}` : undefined,
            "Greet them briefly and get straight to the reason for the call.",
          ]
            .filter(Boolean)
            .join(" ")
        : undefined,
    );
  }

  function declineIncomingCall() {
    const call = incomingCall;
    setIncomingCall(null);
    if (call) void clearIncomingCall(call.callId);
    appendLog("Declined", "Incoming call cleared.");
  }

  const connected = callState === "connected";
  const busy = callState === "connecting" || callState === "ending";
  const notificationEnabled = notificationState === "subscribed";

  return (
    <main className="shell">
      <audio ref={audioRef} autoPlay />

      <section className="callSurface" aria-label="Call My Agent">
        <div className="topbar">
          <div className="identity">
            <div className="avatar" aria-hidden="true">
              <Waves size={30} />
            </div>
            <div>
              <p className="eyebrow">Local Voice Agent</p>
              <h1>Call My Agent</h1>
            </div>
          </div>
          <div className={`status ${connected ? "live" : ""}`}>
            {incomingCall ? <PhoneIncoming size={16} /> : <Radio size={16} />}
            {connected
              ? "Live"
              : incomingCall
                ? "Incoming"
                : busy
                  ? "Connecting"
                  : "Standby"}
          </div>
        </div>

        <div className="centerStage">
          {incomingCall ? (
            <div className="incomingBanner" role="status" aria-live="assertive">
              <div>
                <span>Incoming call</span>
                <strong>{incomingCall.from}</strong>
                {incomingCall.reason ? <p>{incomingCall.reason}</p> : null}
              </div>
              <div className="incomingActions">
                <button
                  className="answerCall"
                  onClick={() => void answerIncomingCall()}
                  disabled={busy}
                  type="button"
                >
                  <PhoneIncoming size={22} />
                  Answer
                </button>
                <button
                  className="iconButton"
                  onClick={declineIncomingCall}
                  type="button"
                >
                  <PhoneOff size={20} />
                  Decline
                </button>
              </div>
            </div>
          ) : null}

          <div className={`orb ${connected ? "orbLive" : ""}`}>
            <div className="ring ringOne" />
            <div className="ring ringTwo" />
            <div className="core">
              <Sparkles size={44} />
            </div>
          </div>

          <div className="callCopy">
            <h2>{connected ? "Your agent is on the line" : "Tap to start talking"}</h2>
            <p>
              Voice-first access to OpenClaw, notes, todos, and local context.
              External actions stay gated until confirmed.
            </p>
          </div>

          <div className="controls">
            {!connected ? (
              <button
                className="primaryCall"
                onClick={() => void startCall()}
                disabled={busy}
                type="button"
              >
                <Phone size={24} />
                {busy ? "Calling..." : "Call My Agent"}
              </button>
            ) : (
              <>
                <button className="iconButton" onClick={toggleMute} type="button">
                  {muted ? <MicOff size={22} /> : <Mic size={22} />}
                  <span>{muted ? "Unmute" : "Mute"}</span>
                </button>
                <button className="endCall" onClick={endCall} type="button">
                  <PhoneOff size={24} />
                  End
                </button>
              </>
            )}
          </div>

          {error ? <p className="errorText">{error}</p> : null}
        </div>
      </section>

      <aside className="sidePanel">
        <div className="panelHeader">
          <SquarePen size={18} />
          <h2>Session Notes</h2>
        </div>
        <div className="capabilityGrid">
          <div>
            <span>Model</span>
            <strong>{REALTIME_MODEL}</strong>
          </div>
          <div>
            <span>Voice</span>
            <strong>{REALTIME_VOICE}</strong>
          </div>
          <div>
            <span>Tools</span>
            <strong>Consult, reminders, calls</strong>
          </div>
        </div>
        <div className="notificationPanel">
          <div>
            <span>Incoming Calls</span>
            <strong>
              {notificationEnabled
                ? "Enabled"
                : notificationState === "denied"
                  ? "Blocked"
                  : notificationState === "unsupported"
                    ? "Unavailable"
                    : "Not enabled"}
            </strong>
          </div>
          <button
            className="notifyButton"
            onClick={() => void enableIncomingCalls()}
            disabled={
              notificationEnabled ||
              notificationState === "unsupported" ||
              notificationState === "denied"
            }
            type="button"
          >
            {notificationEnabled ? <BellRing size={18} /> : <Bell size={18} />}
            {notificationEnabled ? "Ready" : "Enable"}
          </button>
        </div>
        <button
          className="refreshButton"
          onClick={() => void refreshIncomingCalls()}
          type="button"
        >
          <RefreshCw size={17} />
          Check for Call
        </button>
        <div className="logList" aria-live="polite">
          {logs.map((item) => (
            <article key={item.id} className="logItem">
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
}
