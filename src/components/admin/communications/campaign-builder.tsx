"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  ImagePlus,
  Loader2,
  Mail,
  MessageCircle,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type Channel = "whatsapp" | "email";
type Plan = "free" | "plus" | "premium" | "ministry";

type CommunicationKit = {
  id: string;
  name: string;
  slug: string | null;
  artist: string | null;
  cover_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  url: string;
};

type LoadedCampaign = {
  id: string;
  name?: string | null;
  title?: string | null;
  message?: string | null;
  text_content?: string | null;
  link_url?: string | null;
  media_url?: string | null;
  kit_id?: string | null;
  channels?: Channel[];
  schedule_mode?: "now" | "scheduled";
  scheduled_at?: string | null;
  content?: Record<string, unknown> | null;
  audience_filters?: Record<string, unknown> | null;
};

const planLabels: Record<Plan, string> = {
  free: "Free",
  plus: "Plus",
  premium: "Premium",
  ministry: "Ministerial",
};

const defaultMessage = `Olá {{nome}}!\n\nTem novidade no Harmomus 🎵\n\nAcabamos de liberar um novo conteúdo para ajudar você a estudar com mais organização e segurança vocal.\n\nAcesse agora: {{link}}`;

function safePlanList(value: unknown): Plan[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(Object.keys(planLabels));
  return value.map((item) => String(item)).filter((item): item is Plan => allowed.has(item));
}

function safeChannelList(value: unknown): Channel[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item): item is Channel => item === "whatsapp" || item === "email");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function CampaignBuilder() {
  const [name, setName] = useState("Lançamento de novo kit vocal");
  const [channels, setChannels] = useState<Channel[]>(["whatsapp"]);
  const [plans, setPlans] = useState<Plan[]>(["premium", "plus"]);
  const [title, setTitle] = useState("Novo kit disponível no Harmomus");
  const [message, setMessage] = useState(defaultMessage);
  const [link, setLink] = useState("https://harmomus.com/todos-os-kits");
  const [kits, setKits] = useState<CommunicationKit[]>([]);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [isLoadingKits, setIsLoadingKits] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [dailyLimit, setDailyLimit] = useState(600);
  const [hourlyLimit, setHourlyLimit] = useState(120);
  const [pauseEvery, setPauseEvery] = useState(80);
  const [pauseMinutes, setPauseMinutes] = useState(10);
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [isQueueing, setIsQueueing] = useState(false);

  const previewMessage = message
    .replaceAll("{{nome}}", "Marcos")
    .replaceAll("{{link}}", link)
    .replaceAll("{{plano}}", plans.map((p) => planLabels[p]).join(", "));

  useEffect(() => {
    let cancelled = false;

    async function loadKits() {
      setIsLoadingKits(true);
      try {
        const response = await fetch("/api/admin/comunicacao/kits", { cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar kits.");
        if (!cancelled) setKits(Array.isArray(json?.data) ? json.data : []);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Falha ao carregar kits.");
      } finally {
        if (!cancelled) setIsLoadingKits(false);
      }
    }

    loadKits();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const campaignId = new URLSearchParams(window.location.search).get("campaignId");
    if (!campaignId) return;

    async function loadCampaign() {
      setStatus("Carregando campanha criada a partir do kit...");
      try {
        const response = await fetch("/api/admin/comunicacao/campaigns", { cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar campanha.");
        const campaign = (Array.isArray(json?.data) ? json.data : []).find((item: LoadedCampaign) => item.id === campaignId) as LoadedCampaign | undefined;
        if (!campaign) throw new Error("Campanha criada não encontrada.");
        if (cancelled) return;

        const content = asRecord(campaign.content);
        const audienceFilters = asRecord(campaign.audience_filters ?? content.audience_filters);
        const rateLimits = asRecord(content.rate_limits);
        const nextChannels = safeChannelList(campaign.channels ?? content.channels);
        const nextPlans = safePlanList(audienceFilters.plans);
        const nextMediaUrl = String(campaign.media_url ?? content.media_url ?? content.mediaUrl ?? "");
        const nextKitId = String(campaign.kit_id ?? content.kit_id ?? content.kitId ?? "");
        const nextLink = String(campaign.link_url ?? content.link_url ?? "");
        const nextTitle = String(campaign.title ?? content.title ?? campaign.name ?? "");
        const nextMessage = String(campaign.message ?? campaign.text_content ?? "");

        setSavedCampaignId(campaign.id);
        setName(String(campaign.name ?? name));
        if (nextTitle) setTitle(nextTitle);
        if (nextMessage) setMessage(nextMessage);
        if (nextLink) setLink(nextLink);
        if (nextMediaUrl) {
          setMediaUrl(nextMediaUrl);
          setMediaPreview(nextMediaUrl);
        }
        if (nextKitId) setSelectedKitId(nextKitId);
        if (nextChannels.length) setChannels(nextChannels);
        if (nextPlans.length) setPlans(nextPlans);
        if (content.schedule_mode === "scheduled" || campaign.schedule_mode === "scheduled") setScheduleMode("scheduled");
        if (campaign.scheduled_at) setScheduledAt(String(campaign.scheduled_at).slice(0, 16));
        if (typeof rateLimits.minDelay === "number") setMinDelay(rateLimits.minDelay);
        if (typeof rateLimits.maxDelay === "number") setMaxDelay(rateLimits.maxDelay);
        if (typeof rateLimits.dailyLimit === "number") setDailyLimit(rateLimits.dailyLimit);
        if (typeof rateLimits.hourlyLimit === "number") setHourlyLimit(rateLimits.hourlyLimit);
        if (typeof rateLimits.pauseEvery === "number") setPauseEvery(rateLimits.pauseEvery);
        if (typeof rateLimits.pauseMinutes === "number") setPauseMinutes(rateLimits.pauseMinutes);
        setStatus("Campanha carregada. Revise, envie um teste e coloque em fila quando estiver pronto.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Falha ao carregar campanha.");
      }
    }

    loadCampaign();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  function togglePlan(plan: Plan) {
    setPlans((current) =>
      current.includes(plan)
        ? current.filter((item) => item !== plan)
        : [...current, plan],
    );
  }

  function handleKitSelect(kitId: string) {
    setSelectedKitId(kitId);
    const kit = kits.find((item) => item.id === kitId);
    if (!kit) return;
    setLink(kit.url);
    if (kit.cover_url) {
      setMediaUrl(kit.cover_url);
      setMediaPreview(kit.cover_url);
    }
  }

  function buildUploadSlug(file: File) {
    const base = (name || title || file.name || "campanha")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return `${base || "campanha"}-${Date.now()}`;
  }

  async function handleFile(file?: File | null) {
    if (!file) return;
    setIsUploadingMedia(true);
    setStatus("Enviando imagem da campanha para o R2...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("context", "banner");
      formData.append("slug", buildUploadSlug(file));

      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao fazer upload da imagem.");

      const uploadedUrl = typeof json?.url === "string" ? json.url : "";
      if (!uploadedUrl) throw new Error("Upload concluído sem URL pública.");
      setMediaUrl(uploadedUrl);
      setMediaPreview(uploadedUrl);
      setStatus("Imagem enviada para o R2 e vinculada à campanha.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao fazer upload da imagem.");
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function sendTest() {
    const missingTarget = channels.includes("whatsapp") && testPhone.replace(/\D/g, "").length < 12;
    const missingEmail = channels.includes("email") && !testEmail.includes("@");

    if (!channels.length) return setStatus("Selecione pelo menos um canal antes do teste.");
    if (!plans.length) return setStatus("Selecione pelo menos um plano para montar a audiência.");
    if (missingTarget) return setStatus("Informe um WhatsApp de teste com DDI + DDD + número.");
    if (missingEmail) return setStatus("Informe um e-mail de teste válido.");

    setStatus("Enviando teste pelo endpoint interno seguro...");
    try {
      const calls = [];
      if (channels.includes("whatsapp")) {
        calls.push(fetch("/api/admin/comunicacao/test-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: testPhone, message: previewMessage, ...(mediaUrl ? { mediaUrl } : {}) }),
        }));
      }
      if (channels.includes("email")) {
        calls.push(fetch("/api/admin/comunicacao/test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: testEmail, subject: title, text: previewMessage }),
        }));
      }
      const results = await Promise.all(calls);
      const failures = [];
      for (const result of results) {
        if (!result.ok) {
          const json = await result.json().catch(() => null);
          failures.push(json?.error ?? `HTTP ${result.status}`);
        }
      }
      setStatus(failures.length ? `Teste registrado com falha: ${failures.join(" · ")}` : "Teste enviado pelo endpoint interno e registrado em logs.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao executar teste.");
    }
  }

  async function saveDraft() {
    if (!name.trim()) return setStatus("Informe o nome da campanha.");
    if (!channels.length) return setStatus("Selecione pelo menos um canal.");
    if (!message.trim()) return setStatus("Informe a mensagem da campanha.");

    setIsSavingDraft(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          channels,
          audience_filters: { plans, segment: plans.join(","), note: "Audiência real calculada no servidor ao enfileirar." },
          title,
          message,
          link_url: link,
          media_url: mediaUrl || null,
          kit_id: selectedKitId || null,
          schedule_mode: scheduleMode,
          scheduled_at: scheduledAt,
          rate_limits: { minDelay, maxDelay, dailyLimit, hourlyLimit, pauseEvery, pauseMinutes },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao salvar rascunho.");
      setSavedCampaignId(json?.data?.id ?? null);
      setStatus(`Rascunho salvo no Supabase: ${json?.data?.name ?? name}. Revise e coloque em fila quando estiver pronto.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar rascunho.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function queueCampaign() {
    if (!savedCampaignId) return setStatus("Salve a campanha antes de colocar mensagens em fila.");
    if (!channels.length) return setStatus("Selecione pelo menos um canal.");
    setIsQueueing(true);
    setStatus(null);
    try {
      const results = await Promise.all(channels.map(async (channel) => {
        const response = await fetch(`/api/admin/comunicacao/campaigns/${savedCampaignId}/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, message: previewMessage, ...(mediaUrl ? { mediaUrl } : {}) }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error ?? `Falha ao enfileirar ${channel}.`);
        return `${channel}: ${json?.data?.queued ?? 0}`;
      }));
      setStatus(`Campanha colocada em fila com status queued. ${results.join(" · ")}. O envio depende do webhook/canal configurado.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao enfileirar campanha.");
    } finally {
      setIsQueueing(false);
    }
  }

  return null;
}
