export type Channel = "whatsapp" | "email";
export type QueueStatus = "pending" | "processing" | "sent" | "failed";

export interface AudienceContact {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  plano: string | null;
  status: string | null;
  whatsapp_opt_in: boolean;
  email_opt_in: boolean;
  last_seen_at: string | null;
  origin: string | null;
  created_at: string;
}

export interface CommunicationCampaign {
  id: string;
  name: string;
  channel: Channel;
  status: string;
  segment_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface CommunicationQueueItem {
  id: string;
  campaign_id: string;
  delivery_id: string;
  channel: Channel;
  payload: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
}
