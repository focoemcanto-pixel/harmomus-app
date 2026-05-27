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

import { WEBHOOK_EVENT_CATEGORIES, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhook-events";
export { WEBHOOK_EVENT_CATEGORIES, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS, type WebhookEvent };

export const WEBHOOK_CATEGORY_ICONS = {
  ASSINATURAS: "CreditCard",
  CHECKOUT: "ShoppingCart",
  PAGAMENTOS: "Wallet",
  USUÁRIOS: "Users",
  PLATAFORMA: "Sparkles",
} as const;

export const WEBHOOK_PLANS = ["free", "plus", "premium", "ministry"] as const;
export type WebhookPlan = (typeof WEBHOOK_PLANS)[number];

export function getWebhookEventLabel(eventKey: string): string {
  return WEBHOOK_EVENT_LABELS[eventKey] ?? eventKey;
}
