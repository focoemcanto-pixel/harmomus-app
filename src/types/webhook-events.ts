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
  USUÁRIOS: ["user.created", "user.login", "user.password_reset", "user.migrated", "user.email_confirmed"],
  PLANOS: ["plan.free_activated", "plan.premium_activated"],
  PLATAFORMA: ["repertoire.submitted", "repertoire.updated", "kit.downloaded", "playlist.created", "playlist.updated", "favorite.added"],
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
  "user.email_confirmed": "E-mail confirmado",
  "plan.free_activated": "Plano free ativado",
  "plan.premium_activated": "Plano premium ativado",
  "repertoire.submitted": "Repertório enviado",
  "repertoire.updated": "Repertório atualizado",
  "kit.downloaded": "Download de kit",
  "playlist.created": "Playlist criada",
  "playlist.updated": "Playlist atualizada",
  "favorite.added": "Favorito adicionado",
};

export const WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENT_CATEGORIES).flat() as readonly string[];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
