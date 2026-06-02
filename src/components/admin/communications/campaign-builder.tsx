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
  rate_limits?: Record<string, unknown> | null;
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
  return value
    .map((item) => String(item))
    .filter((item): item is Plan => allowed.has(item));
}

function safeChannelList(value: unknown): Channel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item))
    .filter((item): item is Channel => item === "whatsapp" || item === "email");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
        const response = await fetch("/api/admin/comunicacao/kits", {
          cache: "no-store",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(json?.error ?? "Falha ao carregar kits.");
        if (!cancelled) setKits(Array.isArray(json?.data) ? json.data : []);
      } catch (error) {
        if (!cancelled)
          setStatus(
            error instanceof Error ? error.message : "Falha ao carregar kits.",
          );
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
    const campaignId = new URLSearchParams(window.location.search).get(
      "campaignId",
    );
    if (!campaignId) return;

    async function loadCampaign() {
      setStatus("Carregando campanha criada a partir do kit...");
      try {
        const response = await fetch("/api/admin/comunicacao/campaigns", {
          cache: "no-store",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(json?.error ?? "Falha ao carregar campanha.");
        const campaign = (Array.isArray(json?.data) ? json.data : []).find(
          (item: LoadedCampaign) => item.id === campaignId,
        ) as LoadedCampaign | undefined;
        if (!campaign) throw new Error("Campanha criada não encontrada.");
        if (cancelled) return;

        const content = asRecord(campaign.content);
        const audienceFilters = asRecord(
          campaign.audience_filters ?? content.audience_filters,
        );
        const rateLimits = asRecord(
          campaign.rate_limits ?? content.rate_limits ?? content.rateLimits,
        );
        const nextChannels = safeChannelList(
          campaign.channels ?? content.channels,
        );
        const nextPlans = safePlanList(
          audienceFilters.plans ?? content.plans ?? content.planos,
        );
        const nextMediaUrl = String(
          campaign.media_url ?? content.media_url ?? content.mediaUrl ?? "",
        );
        const nextKitId = String(
          campaign.kit_id ?? content.kit_id ?? content.kitId ?? "",
        );
        const nextLink = String(
          campaign.link_url ?? content.link_url ?? content.linkUrl ?? "",
        );
        const nextTitle = String(
          campaign.title ??
            content.title ??
            content.subject ??
            campaign.name ??
            "",
        );
        const nextMessage = String(
          campaign.message ??
            campaign.text_content ??
            content.message ??
            content.text_content ??
            content.textContent ??
            "",
        );

        setSavedCampaignId(campaign.id);
        setName((current) => String(campaign.name ?? current));
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
        if (
          content.schedule_mode === "scheduled" ||
          campaign.schedule_mode === "scheduled"
        )
          setScheduleMode("scheduled");
        if (campaign.scheduled_at)
          setScheduledAt(String(campaign.scheduled_at).slice(0, 16));
        const nextMinDelay = asNumber(
          rateLimits.minDelay ?? rateLimits.min_delay,
        );
        const nextMaxDelay = asNumber(
          rateLimits.maxDelay ?? rateLimits.max_delay,
        );
        const nextDailyLimit = asNumber(
          rateLimits.dailyLimit ?? rateLimits.daily_limit,
        );
        const nextHourlyLimit = asNumber(
          rateLimits.hourlyLimit ?? rateLimits.hourly_limit,
        );
        const nextPauseEvery = asNumber(
          rateLimits.pauseEvery ?? rateLimits.pause_every,
        );
        const nextPauseMinutes = asNumber(
          rateLimits.pauseMinutes ?? rateLimits.pause_minutes,
        );

        if (nextMinDelay !== null) setMinDelay(nextMinDelay);
        if (nextMaxDelay !== null) setMaxDelay(nextMaxDelay);
        if (nextDailyLimit !== null) setDailyLimit(nextDailyLimit);
        if (nextHourlyLimit !== null) setHourlyLimit(nextHourlyLimit);
        if (nextPauseEvery !== null) setPauseEvery(nextPauseEvery);
        if (nextPauseMinutes !== null) setPauseMinutes(nextPauseMinutes);
        setStatus(
          "Campanha carregada. Revise, envie um teste e coloque em fila quando estiver pronto.",
        );
      } catch (error) {
        if (!cancelled)
          setStatus(
            error instanceof Error
              ? error.message
              : "Falha ao carregar campanha.",
          );
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

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(json?.error ?? "Falha ao fazer upload da imagem.");

      const uploadedUrl = typeof json?.url === "string" ? json.url : "";
      if (!uploadedUrl) throw new Error("Upload concluído sem URL pública.");
      setMediaUrl(uploadedUrl);
      setMediaPreview(uploadedUrl);
      setStatus("Imagem enviada para o R2 e vinculada à campanha.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Falha ao fazer upload da imagem.",
      );
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function sendTest() {
    const missingTarget =
      channels.includes("whatsapp") && testPhone.replace(/\D/g, "").length < 12;
    const missingEmail = channels.includes("email") && !testEmail.includes("@");

    if (!channels.length)
      return setStatus("Selecione pelo menos um canal antes do teste.");
    if (!plans.length)
      return setStatus(
        "Selecione pelo menos um plano para montar a audiência.",
      );
    if (missingTarget)
      return setStatus("Informe um WhatsApp de teste com DDI + DDD + número.");
    if (missingEmail) return setStatus("Informe um e-mail de teste válido.");

    setStatus("Enviando teste pelo endpoint interno seguro...");
    try {
      const calls = [];
      if (channels.includes("whatsapp")) {
        calls.push(
          fetch("/api/admin/comunicacao/test-whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: testPhone,
              message: previewMessage,
              ...(mediaUrl ? { mediaUrl } : {}),
            }),
          }),
        );
      }
      if (channels.includes("email")) {
        calls.push(
          fetch("/api/admin/comunicacao/test-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: testEmail,
              subject: title,
              text: previewMessage,
            }),
          }),
        );
      }
      const results = await Promise.all(calls);
      const failures = [];
      for (const result of results) {
        if (!result.ok) {
          const json = await result.json().catch(() => null);
          failures.push(json?.error ?? `HTTP ${result.status}`);
        }
      }
      setStatus(
        failures.length
          ? `Teste registrado com falha: ${failures.join(" · ")}`
          : "Teste enviado pelo endpoint interno e registrado em logs.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Falha ao executar teste.",
      );
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
          audience_filters: {
            plans,
            segment: plans.join(","),
            note: "Audiência real calculada no servidor ao enfileirar.",
          },
          title,
          message,
          link_url: link,
          media_url: mediaUrl || null,
          kit_id: selectedKitId || null,
          schedule_mode: scheduleMode,
          scheduled_at: scheduledAt,
          rate_limits: {
            minDelay,
            maxDelay,
            dailyLimit,
            hourlyLimit,
            pauseEvery,
            pauseMinutes,
          },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(json?.error ?? "Falha ao salvar rascunho.");
      setSavedCampaignId(json?.data?.id ?? null);
      setStatus(
        `Rascunho salvo no Supabase: ${json?.data?.name ?? name}. Revise e coloque em fila quando estiver pronto.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Falha ao salvar rascunho.",
      );
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function queueCampaign() {
    if (!savedCampaignId)
      return setStatus("Salve a campanha antes de colocar mensagens em fila.");
    if (!channels.length) return setStatus("Selecione pelo menos um canal.");
    setIsQueueing(true);
    setStatus(null);
    try {
      const results = await Promise.all(
        channels.map(async (channel) => {
          const response = await fetch(
            `/api/admin/comunicacao/campaigns/${savedCampaignId}/queue`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channel,
                message: previewMessage,
                ...(mediaUrl ? { mediaUrl } : {}),
              }),
            },
          );
          const json = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(json?.error ?? `Falha ao enfileirar ${channel}.`);
          return `${channel}: ${json?.data?.queued ?? 0}`;
        }),
      );
      setStatus(
        `Campanha colocada em fila com status queued. ${results.join(" · ")}. O envio depende do webhook/canal configurado.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Falha ao enfileirar campanha.",
      );
    } finally {
      setIsQueueing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
              <Rocket size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Criador de campanha
              </h3>
              <p className="text-sm text-slate-400">
                Monte campanhas para WhatsApp, e-mail, anúncios e lançamento de
                kits.
              </p>
            </div>
          </div>

          <label className="block text-sm text-slate-300">
            Nome da campanha
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Canais</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => toggleChannel("whatsapp")}
                className={`rounded-2xl border p-4 text-left transition ${channels.includes("whatsapp") ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-slate-900/70"}`}
              >
                <MessageCircle className="mb-2 text-emerald-300" size={20} />
                <p className="font-semibold text-white">WhatsApp</p>
                <p className="text-xs text-slate-400">
                  LabMessage, Evolution, Z-API ou webhook custom.
                </p>
              </button>
              <button
                type="button"
                onClick={() => toggleChannel("email")}
                className={`rounded-2xl border p-4 text-left transition ${channels.includes("email") ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/10 bg-slate-900/70"}`}
              >
                <Mail className="mb-2 text-cyan-300" size={20} />
                <p className="font-semibold text-white">E-mail</p>
                <p className="text-xs text-slate-400">
                  SMTP, Resend, Sendgrid ou Amazon SES.
                </p>
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">
              Audiência por plano
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(planLabels) as Plan[]).map((plan) => {
                const active = plans.includes(plan);
                return (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => togglePlan(plan)}
                    className={`rounded-full border px-4 py-2 text-sm ${active ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-300"}`}
                  >
                    {active ? (
                      <Check size={13} className="mr-1 inline" />
                    ) : null}
                    {planLabels[plan]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Título/assunto
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Kit da campanha
              <select
                value={selectedKitId}
                onChange={(e) => handleKitSelect(e.target.value)}
                disabled={isLoadingKits}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60 disabled:opacity-60"
              >
                <option value="">
                  {isLoadingKits ? "Carregando kits..." : "Selecione um kit"}
                </option>
                {kits.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.name}
                    {kit.artist ? ` — ${kit.artist}` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-slate-500">
                Kits mais recentes primeiro. A seleção preenche link, imagem e
                kit_id.
              </span>
            </label>
          </div>

          <label className="block text-sm text-slate-300">
            Link principal
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
            <span className="mt-2 block text-xs text-slate-500">
              Você pode alterar manualmente após escolher um kit.
            </span>
          </label>

          <label className="block text-sm text-slate-300">
            Mensagem personalizada
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60"
            />
          </label>
          <p className="text-xs text-slate-500">
            Variáveis disponíveis: {"{{nome}}"}, {"{{plano}}"}, {"{{link}}"}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-500/5 p-5 text-center text-sm text-slate-300 hover:bg-cyan-500/10">
              <ImagePlus className="mb-2 text-cyan-200" />
              {isUploadingMedia
                ? "Enviando imagem..."
                : "Upload de imagem para campanha/anúncio"}
              <span className="mt-1 text-xs text-slate-500">
                JPG, PNG, WEBP ou banner do kit · context=banner
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={isUploadingMedia}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              {mediaPreview ? (
                <img
                  src={mediaPreview}
                  alt="Preview da campanha"
                  className="h-44 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-44 items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-500">
                  Preview da mídia
                </div>
              )}
              {mediaUrl ? (
                <input
                  value={mediaUrl}
                  onChange={(e) => {
                    setMediaUrl(e.target.value);
                    setMediaPreview(e.target.value || null);
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
                  aria-label="URL pública da mídia"
                />
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-white">
              <Users size={18} className="text-cyan-300" />
              <h3 className="font-semibold">Simulador de alcance</h3>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="rounded-2xl bg-slate-900/70 p-4">
                <p className="text-slate-400">Público selecionado</p>
                <p className="text-2xl font-bold text-white">
                  calculado na fila
                </p>
              </div>
              <div className="rounded-2xl bg-slate-900/70 p-4">
                <p className="text-slate-400">Tempo estimado</p>
                <p className="text-2xl font-bold text-white">após enfileirar</p>
              </div>
              <div className="rounded-2xl bg-slate-900/70 p-4">
                <p className="text-slate-400">Lotes diários</p>
                <p className="text-2xl font-bold text-white">limite seguro</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck size={18} className="text-emerald-300" />
              <h3 className="font-semibold">Anti-bloqueio</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <label>
                Delay mín.
                <input
                  type="number"
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label>
                Delay máx.
                <input
                  type="number"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label>
                Por hora
                <input
                  type="number"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label>
                Por dia
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label>
                Pausa a cada
                <input
                  type="number"
                  value={pauseEvery}
                  onChange={(e) => setPauseEvery(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
              <label>
                Pausa min.
                <input
                  type="number"
                  value={pauseMinutes}
                  onChange={(e) => setPauseMinutes(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
                />
              </label>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-white">
            <Sparkles size={18} className="text-violet-300" />
            <h3 className="font-semibold">Preview</h3>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4">
            <p className="text-sm font-semibold text-white">{title}</p>
            {mediaPreview ? (
              <img
                src={mediaPreview}
                alt="Preview da campanha"
                className="mb-3 max-h-56 w-full rounded-xl object-cover"
              />
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-6 text-slate-200">
              {previewMessage}
            </pre>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-white">
            <Send size={18} className="text-cyan-300" />
            <h3 className="font-semibold">Teste e publicação</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              WhatsApp teste
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-slate-300">
              E-mail teste
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={sendTest}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              Enviar teste seguro
            </button>
            <button
              onClick={saveDraft}
              disabled={isSavingDraft}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingDraft ? (
                <Loader2 size={15} className="animate-spin" />
              ) : null}
              {isSavingDraft ? "Salvando..." : "Salvar rascunho"}
            </button>
            <button
              onClick={queueCampaign}
              disabled={!savedCampaignId || isQueueing}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isQueueing ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ShieldCheck size={15} />
              )}
              {isQueueing ? "Enfileirando..." : "Colocar em fila"}
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-white">
              <CalendarClock size={16} className="text-amber-300" />
              Agendamento
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setScheduleMode("now")}
                className={`rounded-full border px-3 py-1.5 text-xs ${scheduleMode === "now" ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "border-white/10 text-slate-300"}`}
              >
                Enviar agora
              </button>
              <button
                onClick={() => setScheduleMode("scheduled")}
                className={`rounded-full border px-3 py-1.5 text-xs ${scheduleMode === "scheduled" ? "border-amber-400/50 bg-amber-500/10 text-amber-100" : "border-white/10 text-slate-300"}`}
              >
                Agendar
              </button>
            </div>
            {scheduleMode === "scheduled" ? (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
            ) : null}
          </div>

          {status ? (
            <p className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
