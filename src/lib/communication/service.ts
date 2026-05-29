import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AudienceContact, Channel, CommunicationCampaign, CommunicationQueueItem } from "@/types/communication";

type LogLite = { status: string; channel: string; created_at: string };
type EventLite = { event_type: string; created_at: string };

function safeRate(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

export async function getCommunicationDashboard() {
  const supabase = createSupabaseAdminClient() as any;

  const [{ count: contacts }, { count: activeCampaigns }, logsResult, eventsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("communication_campaigns")
      .select("id", { count: "exact", head: true })
      .in("status", ["scheduled", "processing"]),
    supabase.from("communication_logs").select("status,channel,created_at").limit(5000),
    supabase.from("marketing_events").select("event_type,created_at").limit(5000),
  ]);

  const logs = (logsResult.data ?? []) as LogLite[];
  const events = (eventsResult.data ?? []) as EventLite[];

  const sent = logs.filter((d) => ["enviado", "entregue", "clicou", "abriu", "respondeu"].includes(d.status)).length;
  const opened = logs.filter((d) => d.status === "abriu").length + events.filter((e) => ["email_open", "email_opened"].includes(e.event_type)).length;
  const clicked = logs.filter((d) => d.status === "clicou").length + events.filter((e) => ["whatsapp_click", "link_clicked"].includes(e.event_type)).length;
  const converted = events.filter((e) => ["subscription_created", "conversion"].includes(e.event_type)).length;

  return {
    contacts: contacts ?? 0,
    activeCampaigns: activeCampaigns ?? 0,
    sent,
    openRate: safeRate(opened, sent),
    ctr: safeRate(clicked, sent),
    conversion: safeRate(converted, sent),
    deliveries: logs,
  };
}

export async function getAudience(params: { search?: string; page?: number; limit?: number }) {
  const supabase = createSupabaseAdminClient() as any;
  const page = params.page ?? 1;
  const limit = params.limit ?? 15;

  let query = supabase
    .from("profiles")
    .select("id,full_name,email,phone,whatsapp_opt_in,email_opt_in,last_seen_at,origin,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (params.search) query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%,phone.ilike.%${params.search}%`);

  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as AudienceContact[], count: count ?? 0, page, limit };
}

export async function getCampaigns() {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("communication_campaigns")
    .select("id,name,channel,status,segment_slug,audience_type,scheduled_at,created_at,preview_payload")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((campaign: any) => ({
    ...campaign,
    segment_id: campaign.segment_slug ?? campaign.audience_type ?? null,
    metadata: campaign.preview_payload ?? {},
  })) as unknown as CommunicationCampaign[];
}

export async function enqueueCampaignDeliveries(campaignId: string, channel: Channel) {
  const supabase = createSupabaseAdminClient() as any;

  const { data: campaign, error: campaignError } = await supabase
    .from("communication_campaigns")
    .select("id,name,audience_type,segment_slug,message")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) throw campaignError;
  if (!campaign?.id) return 0;

  const { data: contacts, error: contactsError } = await supabase
    .from("profiles")
    .select("id,email,phone,whatsapp_opt_in,email_opt_in")
    .limit(500);

  if (contactsError) throw contactsError;

  const eligibleContacts = (contacts ?? []).filter((contact: any) => {
    if (channel === "email") return Boolean(contact.email && contact.email_opt_in !== false);
    if (channel === "whatsapp") return Boolean(contact.phone && contact.whatsapp_opt_in !== false);
    return false;
  });

  if (!eligibleContacts.length) return 0;

  const rows = eligibleContacts.map((contact: any) => ({
    campaign_id: campaignId,
    user_id: contact.id,
    channel,
    status: "enviado",
    details: {
      recipient: channel === "email" ? contact.email : contact.phone,
      queued_from: "admin_comunicacao",
      campaign_name: campaign.name,
    },
  }));

  const { error: logError } = await supabase.from("communication_logs").insert(rows);
  if (logError) throw logError;

  await supabase.from("communication_campaigns").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", campaignId);

  return rows.length;
}

export async function getPendingQueue(limit = 30) {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("communication_logs")
    .select("id,campaign_id,channel,details,status,created_at")
    .eq("status", "enviado")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((item: any) => ({
    id: item.id,
    campaign_id: item.campaign_id,
    delivery_id: item.id,
    channel: item.channel,
    payload: item.details ?? {},
    status: item.status,
    attempts: 0,
  })) as unknown as CommunicationQueueItem[];
}
