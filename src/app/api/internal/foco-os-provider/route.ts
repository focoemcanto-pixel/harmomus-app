import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getFocoOsCommunicationToken } from "@/lib/communication/foco-os-token";

export const dynamic = "force-dynamic";

const FOCO_OS_ENDPOINT = "https://escola.focoemcanto.com/api/webhooks/harmomus/communication";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });

  const jobId = text(payload.job_id);
  if (!jobId) return NextResponse.json({ success: false, error: "missing_job_id" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: job, error } = await admin
    .from("communication_queue")
    .select("id,status,channel,recipient_phone,recipient_email,recipient_name,payload")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json({ success: false, error: "job_not_found" }, { status: 404 });
  }
  if (job.channel !== "whatsapp") {
    return NextResponse.json({ success: false, error: "invalid_channel" }, { status: 409 });
  }
  if (job.status !== "processing") {
    return NextResponse.json({ success: false, error: "job_not_processing" }, { status: 409 });
  }

  const expectedPhone = digits(job.recipient_phone);
  const incomingPhone = digits(payload.phone || payload.number || payload.whatsapp || payload.recipient);
  if (!expectedPhone || !incomingPhone || expectedPhone !== incomingPhone) {
    return NextResponse.json({ success: false, error: "recipient_mismatch" }, { status: 409 });
  }

  const token = await getFocoOsCommunicationToken();
  if (!token) {
    console.error("[foco-os-provider] FOCO_OS_COMMUNICATION_TOKEN não configurado no runtime");
    return NextResponse.json({ success: false, error: "provider_not_configured" }, { status: 503 });
  }

  const outgoing = {
    ...payload,
    source: "harmomus.communication_queue",
    job_id: job.id,
    recipient_name: text(payload.recipient_name) || text(job.recipient_name),
    recipient_email: text(payload.recipient_email) || text(job.recipient_email),
    phone: incomingPhone,
    number: incomingPhone,
    whatsapp: incomingPhone,
    recipient: incomingPhone,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(FOCO_OS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(outgoing),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const raw = await response.text();
    let body: unknown = raw;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw.slice(0, 5000); }

    if (!response.ok) {
      return NextResponse.json({ success: false, error: "foco_os_rejected", status: response.status, response: body }, { status: response.status });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "invalid_foco_os_response" }, { status: 502 });
    }

    const record = body as Record<string, unknown>;
    const providerMessageId = text(record.providerMessageId) || text(record.id);
    if (record.success !== true || !providerMessageId) {
      return NextResponse.json({ success: false, error: "foco_os_not_confirmed", response: body }, { status: 502 });
    }

    return NextResponse.json({ success: true, id: providerMessageId, providerMessageId, queued_manual: true });
  } catch (forwardError) {
    console.error("[foco-os-provider] falha ao encaminhar job", forwardError);
    return NextResponse.json({ success: false, error: forwardError instanceof Error ? forwardError.message : "forward_failed" }, { status: 502 });
  }
}
