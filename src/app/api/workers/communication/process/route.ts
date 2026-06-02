import { NextResponse } from "next/server";

import { processCommunicationQueue } from "@/lib/communication/marketing-queue";

function validateWorkerToken(request: Request) {
  const expectedToken = process.env.HARMOMUS_WORKER_TOKEN || process.env.CRON_SECRET;
  const receivedToken = request.headers.get("x-harmomus-worker-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!expectedToken) {
    return NextResponse.json({ success: false, error: "Worker token não configurado." }, { status: 503 });
  }

  if (!receivedToken || receivedToken !== expectedToken) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const authError = validateWorkerToken(request);
  if (authError) return authError;

  const result = await processCommunicationQueue(50);

  return NextResponse.json({
    success: true,
    ...result,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
