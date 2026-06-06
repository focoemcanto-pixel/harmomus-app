import { NextResponse } from "next/server";

function notAudio() {
  return new NextResponse("Esta rota não é um arquivo de áudio.", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  return notAudio();
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Use POST /api/audio/analyze para enfileirar análise de tessitura.",
    },
    { status: 405 },
  );
}
