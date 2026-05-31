"use client";

import { useState } from "react";
import { CheckCircle2, Mail, MessageCircle, PlugZap, Save, Send, ShieldCheck } from "lucide-react";

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

export function CommunicationSettings() {
  const [whatsProvider, setWhatsProvider] = useState<WhatsProvider>("labmessage");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("smtp");
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [instance, setInstance] = useState("");
  const [senderName, setSenderName] = useState("Harmomus");
  const [senderEmail, setSenderEmail] = useState("contato@harmomus.com");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
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

  function saveSettings() {
    const payload = {
      whatsapp: { provider: whatsProvider, apiUrl, apiToken: apiToken ? "***" : "", instance },
      email: { provider: emailProvider, senderName, senderEmail, smtpHost, smtpPort, smtpUser, smtpPass: smtpPass ? "***" : "" },
      limits: { perMinute, perHour, perDay, delayMin, delayMax, pauseEvery, pauseMinutes },
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem("harmomus:communication-settings-draft", JSON.stringify(payload));
    }
    setStatus("Configurações salvas como rascunho local. Próxima etapa: persistir em marketing_channels no Supabase.");
  }

  function testWhatsApp() {
    const digits = testPhone.replace(/\D/g, "");
    if (digits.length < 12) {
      setStatus("Informe um WhatsApp de teste com DDI + DDD + número.");
      return;
    }
    if (!apiUrl.trim()) {
      setStatus("Informe a URL/API do provedor WhatsApp antes do teste real.");
      return;
    }
    setStatus(`Teste WhatsApp preparado para ${digits}. A rota real enviará via ${whatsProviders.find((p) => p.value === whatsProvider)?.label}.`);
  }

  function testEmailConnection() {
    if (!testEmail.includes("@")) {
      setStatus("Informe um e-mail de teste válido.");
      return;
    }
    setStatus(`Teste de e-mail preparado para ${testEmail}. A rota real enviará via ${emailProviders.find((p) => p.value === emailProvider)?.label}.`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
              <MessageCircle size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">Canal WhatsApp</h3>
              <p className="text-sm text-slate-400">Configure o provedor que será usado para campanhas e testes.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {whatsProviders.map((provider) => (
              <button
                key={provider.value}
                type="button"
                onClick={() => setWhatsProvider(provider.value)}
                className={`rounded-2xl border p-4 text-left transition ${whatsProvider === provider.value ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-slate-900/70 hover:bg-white/[0.04]"}`}
              >
                <p className="font-semibold text-white">{provider.label}</p>
                <p className="mt-1 text-xs text-slate-400">{provider.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm text-slate-300">URL/API ou Webhook
              <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" />
            </label>
            <label className="text-sm text-slate-300">Token/Chave secreta
              <input value={apiToken} onChange={(e) => setApiToken(e.target.value)} type="password" placeholder="••••••••" className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" />
            </label>
            <label className="text-sm text-slate-300">Instância / número remetente
              <input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="main / 5571..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" />
            </label>
            <label className="text-sm text-slate-300">WhatsApp de teste
              <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-300/60" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
              <Mail size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">Canal E-mail</h3>
              <p className="text-sm text-slate-400">Configure remetente, SMTP ou provedor transacional.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {emailProviders.map((provider) => (
              <button
                key={provider.value}
                type="button"
                onClick={() => setEmailProvider(provider.value)}
                className={`rounded-full border px-4 py-2 text-sm ${emailProvider === provider.value ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-300"}`}
              >
                {provider.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm text-slate-300">Nome do remetente
              <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300">E-mail remetente
              <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300">SMTP host / API host
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300">Porta
              <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300">Usuário/API key
              <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300">Senha/Secret
              <input value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} type="password" className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
            <label className="text-sm text-slate-300 lg:col-span-2">E-mail de teste
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300/60" />
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-200">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">Limites anti-bloqueio</h3>
              <p className="text-sm text-slate-400">Cadência segura para disparos em massa.</p>
            </div>
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
              <PlugZap size={20} />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-white">Testes rápidos</h3>
              <p className="text-sm text-slate-400">Valide antes de publicar campanhas.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            <button onClick={testWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
              <Send size={15} /> Testar WhatsApp
            </button>
            <button onClick={testEmailConnection} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500">
              <Mail size={15} /> Testar e-mail
            </button>
            <button onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
              <Save size={15} /> Salvar configurações
            </button>
          </div>

          {status ? (
            <p className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{status}</p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <div className="mb-2 flex items-center gap-2 font-semibold text-white"><CheckCircle2 size={17} /> Pronto para a próxima etapa</div>
          <p className="leading-6 text-emerald-100/90">Esta tela prepara os dados que serão gravados em marketing_channels. Depois disso, o botão de teste poderá chamar a API real e registrar logs em marketing_logs.</p>
        </section>
      </aside>
    </div>
  );
}
