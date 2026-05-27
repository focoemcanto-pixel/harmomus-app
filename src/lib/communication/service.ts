import { createClient } from "@/lib/supabase/server";
import type { AudienceContact, Channel, CommunicationCampaign, CommunicationQueueItem } from "@/types/communication";

type DeliveryLite = { status: string; channel: string; created_at: string };
type EventLite = { event_type: string; created_at: string };

export async function getCommunicationDashboard() {
  const supabase = await createClient();
  const [{ count: contacts }, { count: activeCampaigns }, deliveriesResult, eventsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("communication_campaigns" as never).select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("communication_deliveries" as never).select("status,channel,created_at"),
    supabase.from("marketing_events" as never).select("event_type,created_at")
  ]);
  const deliveries = (deliveriesResult.data ?? []) as unknown as DeliveryLite[];
  const events = (eventsResult.data ?? []) as unknown as EventLite[];
  const sent = deliveries.filter((d) => d.status === "sent").length;
  const opened = events.filter((e) => e.event_type === "email_opened").length;
  const clicked = events.filter((e) => e.event_type === "link_clicked").length;
  const converted = events.filter((e) => e.event_type === "conversion").length;
  return { contacts: contacts ?? 0, activeCampaigns: activeCampaigns ?? 0, sent, openRate: sent ? (opened / sent) * 100 : 0, ctr: sent ? (clicked / sent) * 100 : 0, conversion: sent ? (converted / sent) * 100 : 0, deliveries };
}

export async function getAudience(params: { search?: string; page?: number; limit?: number }) { /* unchanged */
  const supabase = await createClient();
  const page = params.page ?? 1;
  const limit = params.limit ?? 15;
  let query = supabase.from("profiles").select("id,full_name,email,phone,plano,status,whatsapp_opt_in,email_opt_in,last_seen_at,origin,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  if (params.search) query = query.or(`full_name.ilike.%${params.search}%,email.ilike.%${params.search}%,phone.ilike.%${params.search}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as AudienceContact[], count: count ?? 0, page, limit };
}

export async function getCampaigns() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("communication_campaigns" as never).select("id,name,channel,status,segment_id,scheduled_at,created_at,metadata").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CommunicationCampaign[];
}

export async function enqueueCampaignDeliveries(campaignId: string, channel: Channel) {
  const supabase = await createClient();
  const { data: deliveries, error } = await supabase.from("communication_deliveries" as never).select("id,campaign_id,recipient").eq("campaign_id", campaignId);
  if (error) throw error;
  if (!deliveries?.length) return 0;
  const queueRows = (deliveries as Array<{ id: string; recipient: string }>).map((d) => ({ campaign_id: campaignId, delivery_id: d.id, channel, payload: { recipient: d.recipient }, status: "pending", attempts: 0 }));
  const { error: queueError } = await supabase.from("communication_queue" as never).insert(queueRows as never);
  if (queueError) throw queueError;
  return queueRows.length;
}

export async function getPendingQueue(limit = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("communication_queue" as never).select("id,campaign_id,delivery_id,channel,payload,status,attempts").eq("status", "pending").order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CommunicationQueueItem[];
}
