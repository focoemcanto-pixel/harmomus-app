export type WebhookEnvironment = "production" | "test";

export interface WebhookEndpoint {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  url: string;
  environment: WebhookEnvironment;
  active: boolean;
  retry_enabled: boolean;
  retry_attempts: number;
  created_by: string | null;
  events: string[];
  last_triggered_at: string | null;
}

export interface WebhookLog {
  id: string;
  endpoint_id: string;
  created_at: string;
  event: string;
  delivery_id: string;
  status: number;
  success: boolean;
  request_headers: Record<string, string>;
  request_body: Record<string, unknown>;
  response_body: string | null;
  duration_ms: number;
  retry_attempt: number;
  error_message: string | null;
}

export const WEBHOOK_EVENTS = [
  "subscription.created","subscription.renewed","subscription.canceled","subscription.upgraded","subscription.downgraded",
  "purchase.completed","payment.failed","payment.refunded",
  "campaign.started","campaign.completed","promotion.applied","lead.created",
  "member.created","member.deleted","member.migrated","login.created","kit.downloaded",
  "contract.signed","escala.confirmed","repertoire.submitted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
