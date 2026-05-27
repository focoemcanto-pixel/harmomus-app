"use client";

import { useState } from "react";

export function useCampaignWizard() {
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [content, setContent] = useState("");
  return {
    step,
    channel,
    content,
    setChannel,
    setContent,
    next: () => setStep((s) => Math.min(s + 1, 8)),
    back: () => setStep((s) => Math.max(s - 1, 1)),
    goto: setStep,
  };
}
