import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import webpush from "web-push";

const dataDir = path.join(process.cwd(), "data");
const subscriptionsPath = path.join(dataDir, "push-subscriptions.json");
const vapidPath = path.join(dataDir, "vapid-keys.json");
const incomingCallPath = path.join(dataDir, "incoming-call.json");

export type PushSubscriptionRecord = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  lastSeenAt: string;
};

type StoredVapidKeys = {
  publicKey: string;
  privateKey: string;
};

export type PendingIncomingCall = {
  callId: string;
  title: string;
  body: string;
  from: string;
  reason: string;
  createdAt: string;
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function getVapidKeys() {
  const envPublic = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const envPrivate = process.env.WEB_PUSH_PRIVATE_KEY?.trim();

  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  const stored = await readJsonFile<StoredVapidKeys | undefined>(
    vapidPath,
    undefined,
  );

  if (stored?.publicKey && stored.privateKey) return stored;

  const generated = webpush.generateVAPIDKeys();
  await writeJsonFile(vapidPath, generated);
  return generated;
}

export async function configureWebPush() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT ??
      "mailto:call-my-agent@localhost",
    keys.publicKey,
    keys.privateKey,
  );
  return keys;
}

export async function listPushSubscriptions() {
  return readJsonFile<PushSubscriptionRecord[]>(subscriptionsPath, []);
}

export async function savePushSubscription(
  subscription: Omit<PushSubscriptionRecord, "createdAt" | "lastSeenAt">,
) {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("Invalid push subscription.");
  }

  const now = new Date().toISOString();
  const existing = await listPushSubscriptions();
  const withoutCurrent = existing.filter(
    (item) => item.endpoint !== subscription.endpoint,
  );
  const createdAt =
    existing.find((item) => item.endpoint === subscription.endpoint)?.createdAt ??
    now;
  const next: PushSubscriptionRecord[] = [
    ...withoutCurrent,
    {
      ...subscription,
      createdAt,
      lastSeenAt: now,
    },
  ];

  await writeJsonFile(subscriptionsPath, next);
  return next.at(-1);
}

export async function removePushSubscriptions(endpoints: string[]) {
  if (endpoints.length === 0) return;
  const endpointSet = new Set(endpoints);
  const existing = await listPushSubscriptions();
  await writeJsonFile(
    subscriptionsPath,
    existing.filter((item) => !endpointSet.has(item.endpoint)),
  );
}

export async function getPendingIncomingCall() {
  return readJsonFile<PendingIncomingCall | null>(incomingCallPath, null);
}

export async function savePendingIncomingCall(
  call: Omit<PendingIncomingCall, "createdAt">,
) {
  const record = {
    ...call,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(incomingCallPath, record);
  return record;
}

export async function clearPendingIncomingCall(callId?: string) {
  const current = await getPendingIncomingCall();
  if (!current) return null;
  if (callId && current.callId !== callId) return current;
  await writeJsonFile(incomingCallPath, null);
  return null;
}
