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

export const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  "subscription.created": "Assinatura iniciada",
  "subscription.renewed": "Assinatura renovada",
  "subscription.canceled": "Assinatura cancelada",
  "subscription.upgraded": "Upgrade de assinatura",
  "subscription.downgraded": "Downgrade de assinatura",
  "subscription.payment_failed": "Falha de pagamento da assinatura",
  "checkout.started": "Checkout iniciado",
  "checkout.abandoned": "Checkout abandonado",
  "checkout.completed": "Checkout concluído",
  "payment.approved": "Pagamento aprovado",
  "payment.refunded": "Pagamento estornado",
  "payment.chargeback": "Pagamento contestado",
  "user.created": "Usuário criado",
  "user.login": "Login realizado",
  "user.password_reset": "Senha redefinida",
  "user.migrated": "Usuário migrado",
  "repertoire.sent": "Repertório enviado",
  "kit.downloaded": "Download de kit",
  "playlist.created": "Playlist criada",
  "favorite.added": "Favorito adicionado",
};

export const WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENT_CATEGORIES).flat() as readonly string[];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
