"use client";

import { usePathname } from "next/navigation";

import { OnboardingChecklist } from "@/components/public/onboarding-checklist";

type OnboardingChecklistSlotProps = {
  isGuest: boolean;
};

const HIDDEN_PATHS = ["/instalar", "/login", "/cadastro", "/checkout/sucesso"];

export function OnboardingChecklistSlot({ isGuest }: OnboardingChecklistSlotProps) {
  const pathname = usePathname();

  if (isGuest) return null;
  if (HIDDEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return <OnboardingChecklist isGuest={isGuest} />;
}
