export type SegmentSlug = "free"|"premium"|"ministry"|"inativos"|"novos_usuarios"|"sem_login_30_dias"|"checkout_abandonado"|"usuarios_ativos";

export const dynamicSegments: { slug: SegmentSlug; label: string; rule: string }[] = [
  { slug: "free", label: "Free", rule: "assinantes de plano gratuito" },
  { slug: "premium", label: "Premium", rule: "assinantes premium ativos" },
  { slug: "ministry", label: "Ministry", rule: "assinantes ministeriais" },
  { slug: "inativos", label: "Inativos", rule: "sem atividade em 45 dias" },
  { slug: "novos_usuarios", label: "Novos usuários", rule: "criados nos últimos 7 dias" },
  { slug: "sem_login_30_dias", label: "Sem login 30 dias", rule: "last_login_at > 30 dias" },
  { slug: "checkout_abandonado", label: "Checkout abandonado", rule: "evento checkout_abandoned sem conversão" },
  { slug: "usuarios_ativos", label: "Usuários ativos", rule: "eventos nas últimas 24h" },
];
