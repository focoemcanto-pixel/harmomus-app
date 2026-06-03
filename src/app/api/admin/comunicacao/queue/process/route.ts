import { NextResponse } from "next/server";

import { processCommunicationQueue } from "@/lib/communication/marketing-queue";
import { requireAdmin } from "../../_lib/marketing-api";

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit ?? 2) || 2, 5));

  try {
    const result = await processCommunicationQueue(limit);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao processar fila de comunicação.",
      },
      { status: 500 },
    );
  }
}
