import { NextResponse } from "next/server";
import { getVapidKeys } from "../../../lib/push-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const keys = await getVapidKeys();
  return NextResponse.json({ publicKey: keys.publicKey });
}
