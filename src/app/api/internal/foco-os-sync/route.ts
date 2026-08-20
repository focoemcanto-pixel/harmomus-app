import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureFocoOsManualProvider } from "@/lib/communication/foco-os-provider";
import { getFocoOsCommunicationToken, getFocoOsCommunicationTokenDiagnostics } from "@/lib/communication/foco-os-token";
import { deliverFocoOsCards } from "@/lib/communication/foco-os-direct-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function buildMatchingDiagnostics() {
  const admin = createSupabaseAdminClient() as any;

  const [{ data: recentEvents }, { data: activeAutomations }] = await Promise.all([
    admin
      .from("marketing_events")
      .select("id,user_id,event_key,event_type,event_label,source,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("marketing_automations")
      .select("name,trigger_event,intent,status")
      .eq("status", "active")
      .order("priority", { ascending: true })
      .limit(100),
  ]);

  const counts = new Map<string, number>();
  for (const row of recentEvents ?? []) {
    const key = normalize(row.event_key ?? row.event_type ?? row.event_label);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const eventKeysRecentes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([eventKey, count]) => ({ eventKey, count }));

  const eventosRecentes = (recentEvents ?? []).slice(0, 20).map((row: any) => ({
    id: String(row.id ?? ""),
    userId: row.user_id ? String(row.user_id) : null,
    eventKey: normalize(row.event_key ?? row.event_type ?? row.event_label),
    eventLabel: String(row.event_label ?? ""),
    source: String(row.source ?? ""),
    plan: row.metadata && typeof row.metadata === "object" ? String(row.metadata.plan ?? "") : "",
    createdAt: String(row.created_at ?? ""),
  }));

  const gatilhosAtivos = (activeAutomations ?? []).map((row: any) => ({
    name: String(row.name ?? ""),
    triggerEvent: normalize(row.trigger_event),
    intent: String(row.intent ?? ""),
  }));

  const triggerSet = new Set(gatilhosAtivos.map((item: any) => item.triggerEvent).filter(Boolean));
  const eventSet = new Set(eventKeysRecentes.map((item) => item.eventKey));

  return {
    eventosRecentes,
    eventKeysRecentes,
    gatilhosAtivos,
    eventosSemGatilho: eventKeysRecentes.filter((item) => !triggerSet.has(item.eventKey)),
    gatilhosSemEvento: gatilhosAtivos.filter((item: any) => !eventSet.has(item.triggerEvent)),
  };
}

export async function POST(request: Request) {
  const expected = await getFocoOsCommunicationToken();
  if (!expected) {
    const diagnostics = await getFocoOsCommunicationTokenDiagnostics();
    console.warn("[foco-os-sync] provider_not_configured", diagnostics);
    return NextResponse.json({ success: false, error: "provider_not_configured", diagnostics }, { status: 503 });
  }
  if (bearerToken(request) !== expected) {
    console.warn("[foco-os-sync] unauthorized request received; token is configured");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const provider = await ensureFocoOsManualProvider();
    if (!provider.ready) {
      console.warn("[foco-os-sync] provider_not_ready", provider);
      return NextResponse.json({ success: false, error: provider.reason || "provider_not_ready", provider }, { status: 503 });
    }

    // A Central do Foco OS é a fila operacional final. Entregamos os cards
    // diretamente ao Hub e eliminamos a segunda fila intermediária do Harmomus.
    const automations = await deliverFocoOsCards(20);
    const matching = await buildMatchingDiagnostics();
    const queue = {
      processed: automations.delivered,
      sent: automations.delivered,
      failed: automations.failed,
      skipped: automations.skipped,
      canceled: 0,
      eligibleNow: automations.delivered,
      scheduledLater: 0,
    };

    console.info("[foco-os-sync] success", {
      scannedAutomations: automations.scannedAutomations,
      scannedEvents: automations.scannedEvents,
      queued: automations.queued,
      skipped: automations.skipped,
      failed: automations.failed,
      delivered: automations.delivered,
      recentEvents: matching.eventosRecentes,
      recentEventKeys: matching.eventKeysRecentes,
      activeTriggers: matching.gatilhosAtivos,
      queue,
    });

    return NextResponse.json({ success: true, provider, automations, matching, queue });
  } catch (error) {
    console.error("[foco-os-sync] falha ao sincronizar Central Harmomus", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "sync_failed",
    }, { status: 500 });
  }
}
