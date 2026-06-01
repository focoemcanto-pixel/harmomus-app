"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, PlugZap, Save, Send, ShieldCheck } from "lucide-react";

type WhatsProvider = "labmessage" | "evolution" | "zapi" | "meta" | "custom";
type EmailProvider = "smtp" | "resend" | "sendgrid" | "ses";

const whatsProviders: { value: WhatsProvider; label: string; hint: string }[] = [
  { value: "labmessage", label: "LabMessage", hint: "Webhook/API usado nos seus fluxos atuais" },
  { value: "evolution", label: "Evolution API", hint: "Instância própria de WhatsApp" },
  { value: "zapi", label: "Z-API", hint: "Envio via token e instância" },
  { value: "meta", label: "Meta Cloud API", hint: "WhatsApp Business oficial" },
  { value: "custom", label: "Webhook custom", hint: "Endpoint próprio ou n8n/Make" },
];

const emailProviders: { value: EmailProvider; label: string }[] = [
  { value: "smtp", label: "SMTP" },
  { value: "resend", label: "Resend" },
  { value: "sendgrid", label: "SendGrid" },
  { value: "ses", label: "Amazon SES" },
];

function isWhatsProvider(value: unknown): value is WhatsProvider {
  return typeof value === "string" && ["labmessage", "evolution", "zapi", "meta", "custom"].includes(value);
}

function isEmailProvider(value: unknown): value is EmailProvider {
  return typeof value === "string" && ["smtp", "resend", "sendgrid", "ses"].includes(value);
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CommunicationSettings() {
  const [whatsProvider, setWhatsProvider] = useState<WhatsProvider>("labmessage");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("smtp");
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [apiTokenConfigured, setApiTokenConfigured] = useState(false);
  const [instance, setInstance] = useState("");
  const [senderName, setSenderName] = useState("Harmomus");
  const [senderEmail, setSenderEmail] = useState("contato@harmomus.com");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [perMinute, setPerMinute] = useState(12);
  const [perHour, setPerHour] = useState(120);
  const [perDay, setPerDay] = useState(600);
  const [delayMin, setDelayMin] = useState(8);
  const [delayMax, setDelayMax] = useState(25);
  const [pauseEvery, setPauseEvery] = useState(80);
  const [pauseMinutes, setPauseMinutes] = useState(10);
  const [testPhone, setTestPhone] = useState("5571993392294");
  const [testEmail, setTestEmail] = useState("focoemcanto@gmail.com");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/admin/comunicacao/settings", { cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar configurações.");
        if (cancelled) return;

        const whatsapp = json?.data?.whatsapp;
        const email = json?.data?.email;
        const whatsappConfig = whatsapp?.config ?? {};
        const emailConfig = email?.config ?? {};
        const limits = whatsapp?.limits ?? email?.limits ?? {};

        if (isWhatsProvider(whatsapp?.provider)) setWhatsProvider(whatsapp.provider);
        if (isEmailProvider(email?.provider)) setEmailProvider(email.provider);

        setApiUrl(String(whatsappConfig.apiUrl ?? ""));
        setApiToken("");
        setApiTokenConfigured(whatsappConfig.tokenConfigured === true);
        setInstance(String(whatsappConfig.instance ?? ""));
        setTestPhone(String(whatsappConfig.testPhone ?? "5571993392294"));

        setSenderName(String(emailConfig.senderName ?? "Harmomus"));
        setSenderEmail(String(emailConfig.senderEmail ?? "contato@harmomus.com"));
        setSmtpHost(String(emailConfig.smtpHost ?? ""));
        setSmtpPort(String(emailConfig.smtpPort ?? "587"));
        setSmtpUser(String(emailConfig.smtpUser ?? ""));
        setSmtpPass("");
        setSmtpPassConfigured(emailConfig.passwordConfigured === true);
        setTestEmail(String(emailConfig.testEmail ?? "focoemcanto@gmail.com"));

        setPerMinute(readNumber(limits.perMinute, 12));
        setPerHour(readNumber(limits.perHour, 120));
        setPerDay(readNumber(limits.perDay, 600));
        setDelayMin(readNumber(limits.delayMin, 8));
        setDelayMax(readNumber(limits.delayMax, 25));
        setPauseEvery(readNumber(limits.pauseEvery, 80));
        setPauseMinutes(readNumber(limits.pauseMinutes, 10));
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Falha ao carregar configurações.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp: { provider: whatsProvider, apiUrl, ...(apiToken.trim() ? { apiToken } : {}), instance, testPhone },
          email: { provider: emailProvider, senderName, senderEmail, smtpHost, smtpPort, smtpUser, ...(smtpPass.trim() ? { smtpPass } : {}), testEmail },
          limits: { perMinute, perHour, perDay, delayMin, delayMax, pauseEvery, pauseMinutes },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao salvar configurações.");
      if (apiToken.trim()) {
        setApiToken("");
        setApiTokenConfigured(true);
      }
      if (smtpPass.trim()) {
        setSmtpPass("");
        setSmtpPassConfigured(true);
      }
      setStatus("Configurações atualizadas com sucesso.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  }

  async function testWhatsApp() {
    const digits = testPhone.replace(/\D/g, "");
    if (digits.length < 12) return setStatus("Informe um WhatsApp de teste com DDI + DDD + número.");

    setTestingWhatsApp(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, message: "Teste real do WhatsApp pela Central de Comunicação Harmomus." }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao testar WhatsApp.");
      setStatus(`WhatsApp enviado com sucesso para ${digits}. Status do provedor: ${json?.data?.status ?? "ok"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao testar WhatsApp.");
    } finally {
      setTestingWhatsApp(false);
    }
  }

  async function testEmailConnection() {
    if (!testEmail.includes("@")) return setStatus("Informe um e-mail de teste válido.");

    setTestingEmail(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmail,
          subject: "Teste real de e-mail Harmomus",
          message: "Teste real de e-mail pela Central de Comunicação Harmomus.",
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao testar e-mail.");
      setStatus(`E-mail enviado com sucesso para ${testEmail}. Status do provedor: ${json?.data?.status ?? "ok"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao testar e-mail.");
    } finally {
      setTestingEmail(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"><MessageCircle size={20} /></span>
            <div><h3 className="text-lg font-semibold text-white">Canal WhatsApp</h3><p className="text-sm text-slate-400">Configure o provedor que será usado para campanhas e testes.</p></div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {whatsProviders.map((provider) => (
              <button key={provider.value} type="button" onClick={() => setWhatsProvider(provider.value)} className={`rounded-2xl border p-4 text-left transition ${whatsProvider === provider.value ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-slate-900/70 hover:bg-white/[0.04]"}`}>
                <p className="font-semibold text-white">{provider.label}</p><p className="mt-1 text-xs text-slate-400">{provider.hint}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm text-slate-300">URL/API ou Webhook<input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
            <label className="text-sm text-slate-300"><span className="flex items-center gap-2">Token/Chave secreta{apiTokenConfigured ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-100">✓ Token configurado</span> : null}</span><input value={apiToken} onChange={(e) => setApiToken(e.target.value)} type="password" placeholder={apiTokenConfigured ? "Token já configurado" : "••••••••"} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
            <label className="text-sm text-slate-300">Instância / número remetente<input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="main / 5571..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
            <label className="text-sm text-slate-300">WhatsApp de teste<input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" /></label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200"><Mail size={20} /></span>
            <div><h3 className="text-lg font-semibold text-white">Canal E-mail</h3><p className="text-sm text-slate-400">Configure remetente, SMTP ou provedor transacional.</p></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {emailProviders.map((provider) => (
              <button key={provider.value} type="button" onClick={() => setEmailProvider(provider.value)} className={`rounded-full border px-4 py-2 text-sm ${emailProvider === provider.value ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-300"}`}>{provider.label}</button>
            ))}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm text-slate-300">Nome do remetente<input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300">E-mail remetente<input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300">SMTP host / API host<input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300">Porta<input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300">Usuário/API key<input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300"><span className="flex items-center gap-2">Senha/Secret{smtpPassConfigured ? <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-semibold text-cyan-100">✓ Senha configurada</span> : null}</span><input value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} type="password" placeholder={smtpPassConfigured ? "Senha já configurada" : "••••••••"} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
            <label className="text-sm text-slate-300 lg:col-span-2">E-mail de teste<input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-200"><ShieldCheck size={20} /></span>
            <div><h3 className="text-lg font-semibold text-white">Limites anti-bloqueio</h3><p className="text-sm text-slate-400">Cadência segura para disparos em massa.</p></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <label>Por minuto<input type="number" value={perMinute} onChange={(e) => setPerMinute(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label>Por hora<input type="number" value={perHour} onChange={(e) => setPerHour(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label>Por dia<input type="number" value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label>Delay mín.<input type="number" value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label>Delay máx.<input type="number" value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label>Pausa a cada<input type="number" value={pauseEvery} onChange={(e) => setPauseEvery(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
            <label className="col-span-2">Pausa em minutos<input type="number" value={pauseMinutes} onChange={(e) => setPauseMinutes(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" /></label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200"><PlugZap size={20} /></span>
            <div><h3 className="text-lg font-semibold text-white">Testes rápidos</h3><p className="text-sm text-slate-400">Valide antes de publicar campanhas.</p></div>
          </div>
          <div className="mt-5 grid gap-2">
            <button onClick={testWhatsApp} disabled={isLoading || testingWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">{testingWhatsApp ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {testingWhatsApp ? "Testando..." : "Testar WhatsApp"}</button>
            <button onClick={testEmailConnection} disabled={isLoading || testingEmail} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">{testingEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {testingEmail ? "Testando..." : "Testar e-mail"}</button>
            <button onClick={saveSettings} disabled={isLoading || isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {isSaving ? "Salvando..." : "Salvar configurações"}</button>
          </div>
          {status ? <p className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{status}</p> : null}
        </section>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <div className="mb-2 flex items-center gap-2 font-semibold text-white"><CheckCircle2 size={17} /> Configuração persistente</div>
          <p className="leading-6 text-emerald-100/90">As configurações agora são carregadas e salvas em marketing_channels. Os testes rápidos usam as rotas reais e registram resultado em communication_logs.</p>
        </section>
      </aside>
    </div>
  );
}
