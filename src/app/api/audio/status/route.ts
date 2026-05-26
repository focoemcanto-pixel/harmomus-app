import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId é obrigatório." }, { status: 400 });
  }

  return NextResponse.json({
    jobId,
    status: "queued",
    progress: 0,
    updatedAt: new Date().toISOString(),
  });
}
