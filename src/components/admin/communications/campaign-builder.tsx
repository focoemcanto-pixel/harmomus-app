"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, ImagePlus, Mail, MessageCircle, Rocket, Send, ShieldCheck, Sparkles, Users } from "lucide-react";

type Channel = "whatsapp" | "email";
type Plan = "free" | "plus" | "premium" | "ministry";

const planLabels: Record<Plan, string> = {
  free: "Free",
  plus: "Plus",
  premium: "Premium",
  ministry: "Ministerial",
};

const audienceBase: Record<Plan, number> = {
  free: 320,
  plus: 42,
  premium: 186,
  ministry: 8,
};

const defaultMessage = `Olá {{nome}}!\n\nTem novidade no Harmomus 🎵\n\nAcabamos de liberar um novo conteúdo para ajudar você a estudar com mais organização e segurança vocal.\n\nAcesse agora: {{link}}`;

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function CampaignBuilder() {
  const [name, setName] = useState("Lançamento de novo kit vocal");
  const [channels, setChannels] = useState<Channel[]>(["whatsapp"]);
  const [plans, setPlans] = useState<Plan[]>(["premium", "plus"]);
  const [title, setTitle] = useState("Novo kit disponível no Harmomus");
  const [message, setMessage] = useState(defaultMessage);
  const [link, setLink] = useState("https://harmomus.com/todos-os-kits");
  const [testPhone, setTestPhone] = useState("5571993392294");
  const [testEmail, setTestEmail] = useState("focoemcanto@gmail.com");
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(25);
  const [dailyLimit, setDailyLimit] = useState(600);
  const [hourlyLimit, setHourlyLimit] = useState(120);
  const [pauseEvery, setPauseEvery] = useState(80);
  const [pauseMinutes, setPauseMinutes] = useState(10);
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const audienceSize = useMemo(
    () => plans.reduce((sum, plan) => sum + audienceBase[plan], 0),
    [plans],
  );

  const averageDelay = Math.max(1, Math.round((minDelay + maxDelay) / 2));
  const estimatedSeconds = audienceSize * averageDelay + Math.floor(audienceSize / Math.max(1, pauseEvery)) * pauseMinutes * 60;
  const effectiveDailyLimit = Math.max(1, dailyLimit);
  const dailyBatches = Math.ceil(audienceSize / effectiveDailyLimit);

  const previewMessage = message
    .replaceAll("{{nome}}", "Marcos")
    .replaceAll("{{link}}", link)
    .replaceAll("{{plano}}", plans.map((p) => planLabels[p]).join(", "));

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel],
    );
  }

  function togglePlan(plan: Plan) {
    setPlans((current) =>
      current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan],
    );
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function sendTest() {
    const missingTarget = channels.includes("whatsapp") && testPhone.replace(/\D/g, "").length < 12;
    const missingEmail = channels.includes("email") && !testEmail.includes("@");

    if (!channels.length) return setStatus("Selecione pelo menos um canal antes do teste.");
    if (!plans.length) return setStatus("Selecione pelo menos um plano para montar a audiência.");
    if (missingTarget) return setStatus("Informe um WhatsApp de teste com DDI + DDD + número.");
    if (missingEmail) return setStatus("Informe um e-mail de teste válido.");

    setStatus(`Teste preparado para ${channels.includes("whatsapp") ? testPhone : ""}${channels.length === 2 ? " e " : ""}${channels.includes("email") ? testEmail : ""}. A integração real será conectada ao canal configurado.`);
  }

  function saveDraft() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "harmomus:marketing-campaign-draft",
        JSON.stringify({ name, channels, plans, title, message, link, minDelay, maxDelay, dailyLimit, hourlyLimit, pauseEvery, pauseMinutes, scheduleMode, scheduledAt }),
      );
    }
    setStatus("Rascunho salvo localmente. Próxima etapa: persistir no banco e conectar a fila de disparos.");
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
              <h3 className="text-lg font-semibold text-white">Criador de campanha</h3>
              <p className="text-sm text-slate-400">Monte campanhas para WhatsApp, e-mail, anúncios e lançamento de kits.</p>
            </div>
          </div>

          <label className="block text-sm text-slate-300">
            Nome da campanha
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Canais</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => toggleChannel("whatsapp")} className={`rounded-2xl border p-4 text-left transition ${channels.includes("whatsapp") ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-slate-900/70"}`}>
                <MessageCircle className="mb-2 text-emerald-300" size={20} />
                <p className="font-semibold text-white">WhatsApp</p>
                <p className="text-xs text-slate-400">LabMessage, Evolution, Z-API ou webhook custom.</p>
              </button>
              <button type="button" onClick={() => toggleChannel("email")} className={`rounded-2xl border p-4 text-left transition ${channels.includes("email") ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/10 bg-slate-900/70"}`}>
                <Mail className="mb-2 text-cyan-300" size={20} />
                <p className="font-semibold text-white">E-mail</p>
                <p className="text-xs text-slate-400">SMTP, Resend, Sendgrid ou Amazon SES.</p>
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-white">Audiência por plano</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(planLabels) as Plan[]).map((plan) => {
                const active = plans.includes(plan);
                return (
                  <button key={plan} type="button" onClick={() => togglePlan(plan)} className={`rounded-full border px-4 py-2 text-sm ${active ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-300"}`}>
                    {active ? <Check size={13} className="mr-1 inline" /> : null}{planLabels[plan]} · {audienceBase[plan]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Título/assunto
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="block text-sm text-slate-300">
              Link principal
              <input value={link} onChange={(e) => setLink(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
          </div>

          <label className="block text-sm text-slate-300">
            Mensagem personalizada
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
          </label>
          <p className="text-xs text-slate-500">Variáveis disponíveis: {"{{nome}}"}, {"{{plano}}"}, {"{{link}}"}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-500/5 p-5 text-center text-sm text-slate-300 hover:bg-cyan-500/10">
              <ImagePlus className="mb-2 text-cyan-200" />
              Upload de imagem para campanha/anúncio
              <span className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP ou banner do kit</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              {mediaPreview ? <img src={mediaPreview} alt="Preview da campanha" className="h-44 w-full rounded-xl object-cover" /> : <div className="flex h-44 items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-500">Preview da mídia</div>}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-white"><Users size={18} className="text-cyan-300" /><h3 className="font-semibold">Simulador de alcance</h3></div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="rounded-2xl bg-slate-900/70 p-4"><p className="text-slate-400">Público selecionado</p><p className="text-2xl font-bold text-white">{audienceSize}</p></div>
              <div className="rounded-2xl bg-slate-900/70 p-4"><p className="text-slate-400">Tempo estimado</p><p className="text-2xl font-bold text-white">{formatTime(estimatedSeconds)}</p></div>
              <div className="rounded-2xl bg-slate-900/70 p-4"><p className="text-slate-400">Lotes diários</p><p className="text-2xl font-bold text-white">{dailyBatches}</p></div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center gap-2 text-white"><ShieldCheck size={18} className="text-emerald-300" /><h3 className="font-semibold">Anti-bloqueio</h3></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <label>Delay mín.<input type="number" value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
              <label>Delay máx.<input type="number" value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
              <label>Por hora<input type="number" value={hourlyLimit} onChange={(e) => setHourlyLimit(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
              <label>Por dia<input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
              <label>Pausa a cada<input type="number" value={pauseEvery} onChange={(e) => setPauseEvery(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
              <label>Pausa min.<input type="number" value={pauseMinutes} onChange={(e) => setPauseMinutes(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-white"><Sparkles size={18} className="text-violet-300" /><h3 className="font-semibold">Preview</h3></div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4">
            <p className="text-sm font-semibold text-white">{title}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm leading-6 text-slate-200">{previewMessage}</pre>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-white"><Send size={18} className="text-cyan-300" /><h3 className="font-semibold">Teste e publicação</h3></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">WhatsApp teste<input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label className="text-sm text-slate-300">E-mail teste<input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={sendTest} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">Enviar teste</button>
            <button onClick={saveDraft} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">Salvar rascunho</button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-white"><CalendarClock size={16} className="text-amber-300" />Agendamento</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setScheduleMode("now")} className={`rounded-full border px-3 py-1.5 text-xs ${scheduleMode === "now" ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "border-white/10 text-slate-300"}`}>Enviar agora</button>
              <button onClick={() => setScheduleMode("scheduled")} className={`rounded-full border px-3 py-1.5 text-xs ${scheduleMode === "scheduled" ? "border-amber-400/50 bg-amber-500/10 text-amber-100" : "border-white/10 text-slate-300"}`}>Agendar</button>
            </div>
            {scheduleMode === "scheduled" ? <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /> : null}
          </div>

          {status ? <p className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}
