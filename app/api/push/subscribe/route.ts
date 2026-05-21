import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription } from "../../../lib/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubscribeBody = {
  subscription?: {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: {
      p256dh?: unknown;
      auth?: unknown;
    };
  };
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SubscribeBody;
  const subscription = body.subscription;

  if (
    typeof subscription?.endpoint !== "string" ||
    typeof subscription.keys?.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return NextResponse.json(
      { error: "A valid push subscription is required." },
      { status: 400 },
    );
  }

  const saved = await savePushSubscription({
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number"
        ? subscription.expirationTime
        : null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });

  return NextResponse.json({
    ok: true,
    endpoint: saved?.endpoint,
  });
}
