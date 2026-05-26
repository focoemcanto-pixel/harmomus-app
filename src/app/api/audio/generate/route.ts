import { NextResponse } from "next/server";

const DEFAULT_SHIFTS = [-2, -1, 1, 2] as const;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const kitId = String(formData.get("kitId") ?? "").trim();
  const voice = String(formData.get("voice") ?? "").trim();
  const sourceTone = String(formData.get("sourceTone") ?? "").trim();

  if (!(file instanceof File) || !kitId || !voice || !sourceTone) {
    return NextResponse.json({ error: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }

  const jobs = DEFAULT_SHIFTS.map((semitoneShift) => ({
    jobId: crypto.randomUUID(),
    kitId,
    voice,
    sourceTone,
    semitoneShift,
    status: "queued" as const,
    fileName: file.name,
    createdAt: new Date().toISOString(),
  }));

  return NextResponse.json({
    message: "Jobs de geração criados com sucesso.",
    jobs,
  });
}
