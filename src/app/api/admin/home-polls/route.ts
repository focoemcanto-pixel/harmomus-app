import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createHomePoll } from "@/lib/data/home-polls";

export const dynamic = "force-dynamic";

function parseOptions(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const normalized = line.replace(/^\d+[.)-]?\s*/, "").trim();
      const parts = normalized.split(" - ");
      return {
        label: parts[0]?.trim() || normalized,
        artist: parts.slice(1).join(" - ").trim() || null,
        description: null,
        order_index: index + 1,
      };
    });
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentUserAccessContext();
    if (!context.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    await createHomePoll({
      eyebrow: String(body.eyebrow ?? "").trim() || "Enquete Premium",
      question: String(body.question ?? "").trim(),
      title: String(body.title ?? "").trim() || null,
      subtitle: String(body.subtitle ?? "").trim() || null,
      active: Boolean(body.active),
      allow_guests: true,
      order_index: Number(body.order_index ?? 0),
      options: parseOptions(String(body.options ?? "")),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/home-polls] Falha ao criar enquete", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar a enquete." },
      { status: 500 },
    );
  }
}
