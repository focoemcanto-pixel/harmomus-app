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
  secret?: string;
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

export const WEBHOOK_EVENT_CATEGORIES = {
  ASSINATURAS: [
    "subscription.created",
    "subscription.renewed",
    "subscription.canceled",
    "subscription.upgraded",
    "subscription.downgraded",
    "subscription.payment_failed",
  ],
  CHECKOUT: ["checkout.started", "checkout.abandoned", "checkout.completed"],
  PAGAMENTOS: ["payment.approved", "payment.refunded", "payment.chargeback"],
  USUÁRIOS: ["user.created", "user.login", "user.password_reset", "user.migrated"],
  PLATAFORMA: ["repertoire.sent", "kit.downloaded", "playlist.created", "favorite.added"],
} as const;

export const WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENT_CATEGORIES).flat() as readonly string[];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_PLANS = ["free", "plus", "premium", "ministry"] as const;
export type WebhookPlan = (typeof WEBHOOK_PLANS)[number];
