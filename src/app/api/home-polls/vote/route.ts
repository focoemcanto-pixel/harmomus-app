import { createHash, randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { getActiveHomePoll } from "@/lib/data/home-polls";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "harmomus_poll_visitor";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") ?? forwarded ?? request.headers.get("x-real-ip") ?? null;
}

function isDuplicateVoteError(error: unknown) {
  const maybeError = error as { code?: string; message?: string } | null;
  const message = String(maybeError?.message ?? "").toLowerCase();
  return maybeError?.code === "23505" || message.includes("duplicate key") || message.includes("unique");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const pollId = String(body?.pollId ?? "").trim();
    const optionId = String(body?.optionId ?? "").trim();

    if (!pollId || !optionId) {
      return NextResponse.json({ error: "Enquete e opção são obrigatórias." }, { status: 400 });
    }

    const authClient = await createClient();
    const { data: auth } = await authClient.auth.getUser();
    const userId = auth.user?.id ?? null;
    const cookieVisitorId = request.cookies.get(VISITOR_COOKIE)?.value?.trim();
    const visitorId = cookieVisitorId || randomUUID();

    const supabase = createSupabaseAdminClient() as any;

    const { data: poll, error: pollError } = await supabase
      .from("home_polls")
      .select("id,active,allow_guests,starts_at,ends_at")
      .eq("id", pollId)
      .maybeSingle();

    if (pollError) throw new Error(pollError.message);
    if (!poll?.id || !poll.active) {
      return NextResponse.json({ error: "Enquete indisponível." }, { status: 404 });
    }

    const now = Date.now();
    if (poll.starts_at && new Date(poll.starts_at).getTime() > now) {
      return NextResponse.json({ error: "Esta enquete ainda não começou." }, { status: 403 });
    }
    if (poll.ends_at && new Date(poll.ends_at).getTime() < now) {
      return NextResponse.json({ error: "Esta enquete já foi encerrada." }, { status: 403 });
    }

    if (!userId && poll.allow_guests === false) {
      return NextResponse.json({ error: "Faça login para votar nesta enquete." }, { status: 403 });
    }

    const { data: option, error: optionError } = await supabase
      .from("home_poll_options")
      .select("id")
      .eq("id", optionId)
      .eq("poll_id", pollId)
      .maybeSingle();

    if (optionError) throw new Error(optionError.message);
    if (!option?.id) {
      return NextResponse.json({ error: "Opção inválida." }, { status: 400 });
    }

    const ip = getClientIp(request);
    const { error: voteError } = await supabase.from("home_poll_votes").insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: userId,
      visitor_id: userId ? null : visitorId,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      ip_hash: ip ? hashValue(ip) : null,
    });

    const responsePayload = async (error?: string) => {
      const activePoll = await getActiveHomePoll(visitorId);
      const response = NextResponse.json({ ok: !error, error, poll: activePoll });
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
      return response;
    };

    if (voteError) {
      if (isDuplicateVoteError(voteError)) {
        return responsePayload("Você já votou nesta enquete.");
      }
      throw new Error(voteError.message);
    }

    return responsePayload();
  } catch (error) {
    console.error("[home-polls] falha ao registrar voto", error);
    return NextResponse.json({ error: "Não foi possível registrar seu voto." }, { status: 500 });
  }
}
