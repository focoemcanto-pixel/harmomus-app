export type OfficialPlanSlug = "free" | "plus" | "premium";

export interface OfficialPlanFeature {
  label: string;
  included: boolean;
}

export interface OfficialPlanDefinition {
  slug: OfficialPlanSlug;
  name: string;
  description: string;
  price: string;
  cta: string;
  offer: string | null;
  popular: boolean;
  features: OfficialPlanFeature[];
}

export const OFFICIAL_PLANS: OfficialPlanDefinition[] = [
  {
    slug: "free",
    name: "Free",
    description: "Plano gratuito",
    price: "Grátis",
    cta: "Começar grátis",
    offer: null,
    popular: false,
    features: [
      { label: "5 acessos diários a kits", included: true },
      { label: "Apenas tom original", included: true },
      { label: "Player limitado", included: true },
      { label: "Criação de playlists", included: true },
      { label: "Comunidade aberta", included: true },
      { label: "Troca de tonalidade", included: false },
      { label: "Solicitação de novos kits", included: false },
      { label: "Prioridade na confecção", included: false },
      { label: "Receber kits antecipadamente", included: false },
      { label: "Grupo exclusivo", included: false },
      { label: "Solicitação de novos tons", included: false },
    ],
  },
  {
    slug: "plus",
    name: "Plus",
    description: "Plano intermediário",
    price: "R$19/mês",
    cta: "Assinar Plus",
    offer: null,
    popular: false,
    features: [
      { label: "Acesso ilimitado aos kits", included: true },
      { label: "Player completo", included: true },
      { label: "Apenas tom original", included: true },
      { label: "Catálogo completo", included: true },
      { label: "Criação de playlists", included: true },
      { label: "Comunidade aberta", included: true },
      { label: "Sugestões de conteúdos", included: true },
      { label: "Solicitação de novos kits", included: false },
      { label: "Prioridade na confecção", included: false },
      { label: "Receber kits antecipadamente", included: false },
      { label: "Grupo exclusivo", included: false },
      { label: "Solicitação de novos tons", included: false },
    ],
  },
  {
    slug: "premium",
    name: "Premium",
    description: "Plano premium",
    price: "R$39/mês",
    cta: "Experimentar grátis por 7 dias",
    offer: "7 dias grátis",
    popular: true,
    features: [
      { label: "Acesso ilimitado aos kits", included: true },
      { label: "Todos os tons disponíveis", included: true },
      { label: "Troca de tonalidade", included: true },
      { label: "Catálogo completo", included: true },
      { label: "Criação de playlists", included: true },
      { label: "Solicitação de novos kits", included: true },
      { label: "Prioridade na confecção", included: true },
      { label: "Receber kits antecipadamente", included: true },
      { label: "Comunidade Harmomus + grupo Premium para pedidos", included: true },
      { label: "Solicitação de novos tons", included: true },
      { label: "Conteúdos extras", included: true },
      { label: "Votações internas", included: true },
      { label: "Selo Premium Harmomus", included: true },
    ],
  },
];
