import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const kitId = searchParams.get("kitId");

  const supabase = createSupabaseAdminClient();

  if (!jobId && !kitId) {
    return NextResponse.json({ error: "jobId ou kitId é obrigatório." }, { status: 400 });
  }

  if (jobId) {
    const { data, error } = await supabase.from("audio_generation_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ job: data });
  }

  const { data, error } = await supabase
    .from("audio_generation_jobs")
    .select("id,status,target_tone,semitone_shift,error_message,created_at,updated_at")
    .eq("kit_id", kitId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data ?? [] });
}
