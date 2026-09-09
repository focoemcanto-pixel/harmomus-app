export const PRODUCT_FEEDBACK_SURVEY_KEY = "product_pulse_v1";

export const FEEDBACK_NEEDS = [
  { value: "catalog", label: "Mais músicas no catálogo" },
  { value: "tones", label: "Mais tonalidades" },
  { value: "study_tools", label: "Mais recursos para estudar as vozes" },
  { value: "organization", label: "Melhor organização e busca" },
  { value: "learning", label: "Conteúdos para aprender divisão vocal" },
  { value: "other", label: "Outro" },
] as const;

export type FeedbackNeed = (typeof FEEDBACK_NEEDS)[number]["value"];
