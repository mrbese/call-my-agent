import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import {
  clearPendingIncomingCall,
  configureWebPush,
  getPendingIncomingCall,
  listPushSubscriptions,
  removePushSubscriptions,
  savePendingIncomingCall,
} from "../../lib/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InboundCallBody = {
  title?: unknown;
  body?: unknown;
  from?: unknown;
  reason?: unknown;
  callId?: unknown;
};

function authorize(request: NextRequest) {
  const expected = (process.env.CALL_MY_AGENT_CALL_TOKEN ?? "").trim();
  if (!expected) return true;

  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET() {
  const call = await getPendingIncomingCall();
  return NextResponse.json({ call });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("callId") ?? undefined;
  const call = await clearPendingIncomingCall(callId);
  return NextResponse.json({ ok: true, call });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as InboundCallBody;
  const subscriptions = await listPushSubscriptions();

  if (subscriptions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No phone is subscribed yet. Open Call My Agent on the phone and enable incoming-call notifications first.",
      },
      { status: 409 },
    );
  }

  await configureWebPush();

  const call = await savePendingIncomingCall({
    callId:
      typeof body.callId === "string" && body.callId.trim()
        ? body.callId.trim()
        : crypto.randomUUID(),
    title:
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Your agent is calling",
    body:
      typeof body.body === "string" && body.body.trim()
        ? body.body.trim()
        : "Tap to answer.",
    from:
      typeof body.from === "string" && body.from.trim()
        ? body.from.trim()
        : "Your agent",
    reason:
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "",
  });

  const payload = JSON.stringify({
    type: "incoming-call",
    ...call,
  });

  const expiredEndpoints: string[] = [];
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, payload),
    ),
  );

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status !== "rejected") continue;

    const statusCode = (result.reason as { statusCode?: unknown })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      expiredEndpoints.push(subscriptions[index].endpoint);
    }
  }

  await removePushSubscriptions(expiredEndpoints);

  return NextResponse.json({
    ok: true,
    attempted: subscriptions.length,
    delivered: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
    removedExpired: expiredEndpoints.length,
    call,
  });
}
