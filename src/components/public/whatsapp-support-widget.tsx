"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";

type KitSearchItem = {
  slug: string;
  name: string;
  artist: string | null;
};

type ChatAction = {
  label: string;
  href: string;
  external?: boolean;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  actions?: ChatAction[];
};

const SUPPORT_NUMBER = "5571996950254";

const QUICK_QUESTIONS = [
  "Encontrar um kit",
  "Assinatura ou upgrade",
  "Problema com pagamento",
  "Falar com o Marcos",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function whatsappUrl(message: string) {
  return `https://wa.me/${SUPPORT_NUMBER}?text=${encodeURIComponent(message)}`;
}

function scoreKit(query: string, kit: KitSearchItem) {
  const normalizedQuery = normalize(query);
  const haystack = normalize(`${kit.name} ${kit.artist ?? ""}`);
  if (!normalizedQuery || !haystack) return 0;
  if (haystack.includes(normalizedQuery)) return 100;
  const terms = normalizedQuery.split(" ").filter((term) => term.length > 2);
  if (!terms.length) return 0;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 12 : 0), 0);
}

function WhatsappIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.52 3.48A11.81 11.81 0 0 0 12.1 0C5.56 0 .24 5.32.24 11.86c0 2.09.55 4.13 1.6 5.93L.14 24l6.36-1.67a11.85 11.85 0 0 0 5.59 1.42h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.22-6.15-3.44-8.41ZM12.1 21.75h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.77.99 1.01-3.67-.24-.38a9.83 9.83 0 0 1-1.51-5.25C2.21 6.43 6.65 2 12.1 2a9.8 9.8 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.9 6.99c0 5.44-4.44 9.86-9.89 9.86Zm5.42-7.39c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

export function WhatsappSupportWidget({ kits, isGuest, viewerPlan }: { kits: KitSearchItem[]; isGuest: boolean; viewerPlan: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const nextId = useRef(2);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Oi! Eu sou o assistente do Harmomus. Posso encontrar kits, indicar páginas, ajudar com assinatura e te encaminhar para o atendimento quando precisar. 💜",
    },
  ]);

  const sortedKits = useMemo(() => kits.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [kits]);

  function addAssistant(text: string, actions?: ChatAction[]) {
    setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text, actions }]);
  }

  function humanHandoff(userText?: string) {
    const context = userText?.trim() || "Preciso de ajuda no Harmomus.";
    const message = `Olá, Marcos! Vim pelo suporte do Harmomus. Meu plano atual é ${viewerPlan}. Preciso de ajuda com: ${context}`;
    addAssistant("Claro. Esse caso é melhor com atendimento humano. Já deixei a mensagem preparada para você continuar no WhatsApp.", [
      { label: "Falar com Marcos no WhatsApp", href: whatsappUrl(message), external: true },
    ]);
  }

  function answer(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question) return;
    const normalized = normalize(question);

    setMessages((current) => [...current, { id: nextId.current++, role: "user", text: question }]);
    setInput("");

    if (/marcos|atendente|humano|pessoa|suporte|falar com|problema tecnico|erro|bug/.test(normalized)) {
      humanHandoff(question);
      return;
    }

    if (/pagamento|cobranca|cartao|pix|boleto|falhou|nao confirmou|regularizar/.test(normalized)) {
      addAssistant("Para cobrança ou pagamento, a melhor página é a Central de Assinatura. Se o problema continuar depois de conferir por lá, eu te encaminho ao atendimento.", [
        { label: "Abrir minha assinatura", href: isGuest ? "/login?redirect=%2Fassinatura" : "/assinatura" },
        { label: "Falar com atendimento", href: whatsappUrl(`Olá, Marcos! Vim pelo Harmomus e preciso de ajuda com pagamento/assinatura. Minha dúvida: ${question}`), external: true },
      ]);
      return;
    }

    if (/assinatura|assinar|upgrade|premium|plus|plano|teste gratis|teste premium/.test(normalized)) {
      const actions: ChatAction[] = viewerPlan === "premium"
        ? [{ label: "Gerenciar assinatura", href: "/assinatura" }]
        : [
            { label: "Ver Premium", href: "/assinar?plano=premium&utm_source=support_chat" },
            { label: "Gerenciar assinatura", href: isGuest ? "/login?redirect=%2Fassinatura" : "/assinatura" },
          ];
      addAssistant(viewerPlan === "premium" ? "Seu acesso já está no Premium. Você pode gerenciar cobrança e dados da assinatura por aqui." : "Posso te levar direto para o upgrade. O Premium libera a experiência completa do Harmomus.", actions);
      return;
    }

    if (/perfil|minha conta|conta|senha|dados pessoais/.test(normalized)) {
      addAssistant("Esses dados ficam na área de perfil da sua conta.", [
        { label: isGuest ? "Fazer login" : "Abrir meu perfil", href: isGuest ? "/login" : "/perfil" },
      ]);
      return;
    }

    if (/playlist|playlists/.test(normalized)) {
      addAssistant("Suas playlists ficam em uma área própria do Harmomus.", [{ label: "Abrir minhas playlists", href: "/minhas-playlists" }]);
      return;
    }

    if (/categoria|artista|catalogo|todos os kits|biblioteca/.test(normalized) && !/kit/.test(normalized)) {
      addAssistant("Você pode navegar pelo catálogo completo ou filtrar pelas categorias.", [
        { label: "Todos os kits", href: "/todos-os-kits" },
        { label: "Ver categorias", href: "/categorias" },
      ]);
      return;
    }

    const ranked = sortedKits
      .map((kit) => ({ kit, score: scoreKit(question, kit) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (/kit|musica|cancao|canção|onde encontro|procurando|tem a/.test(normalized) || ranked[0]?.score >= 24) {
      if (ranked.length) {
        addAssistant(ranked.length === 1 ? "Encontrei este kit para você:" : "Encontrei estes kits que parecem corresponder ao que você procura:", ranked.map(({ kit }) => ({
          label: `${kit.name}${kit.artist ? ` — ${kit.artist}` : ""}`,
          href: `/biblioteca/${kit.slug}`,
        })));
      } else {
        addAssistant("Não consegui identificar um kit específico pelo nome. Você pode pesquisar no catálogo completo; se ainda não encontrar, fale comigo para verificarmos.", [
          { label: "Pesquisar todos os kits", href: "/todos-os-kits" },
          { label: "Pedir ajuda no WhatsApp", href: whatsappUrl(`Olá, Marcos! Procurei um kit no Harmomus e não encontrei. Estou procurando: ${question}`), external: true },
        ]);
      }
      return;
    }

    addAssistant("Consigo te ajudar com kits, assinatura, pagamento, perfil e navegação pelo Harmomus. Para uma questão específica que dependa do atendimento, posso te encaminhar agora.", [
      { label: "Explorar kits", href: "/todos-os-kits" },
      { label: "Ver assinatura", href: isGuest ? "/assinar?plano=premium&utm_source=support_chat" : "/assinatura" },
      { label: "Falar com Marcos", href: whatsappUrl(`Olá, Marcos! Vim pelo suporte do Harmomus. Minha dúvida é: ${question}`), external: true },
    ]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    answer(input);
  }

  if (pathname !== "/") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open ? (
        <section className="w-[calc(100vw-2rem)] max-w-[390px] overflow-hidden rounded-[1.6rem] border border-white/15 bg-[#081018]/95 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <header className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-fuchsia-500/15 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_25px_rgba(34,197,94,0.35)]"><WhatsappIcon className="h-5 w-5" /></span>
              <div><p className="text-sm font-bold text-white">Assistente Harmomus</p><p className="text-[11px] text-emerald-200">Ajuda rápida • WhatsApp quando precisar</p></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar suporte" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-zinc-300 hover:bg-white/10">×</button>
          </header>

          <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-sm leading-5 ${message.role === "user" ? "rounded-br-md bg-cyan-300 text-slate-950" : "rounded-bl-md border border-white/10 bg-white/[0.06] text-zinc-100"}`}>
                  <p>{message.text}</p>
                  {message.actions?.length ? <div className="mt-3 grid gap-2">{message.actions.map((action) => action.external ? (
                    <a key={`${message.id}-${action.label}`} href={action.href} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-center text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20">{action.label}</a>
                  ) : (
                    <Link key={`${message.id}-${action.label}`} href={action.href} className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-center text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20">{action.label}</Link>
                  ))}</div> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((question) => <button key={question} type="button" onClick={() => answer(question)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10">{question}</button>)}</div>
            <form onSubmit={submit} className="flex items-center gap-2">
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Digite sua dúvida..." className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none ring-cyan-300/40 placeholder:text-zinc-500 focus:ring" />
              <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 font-bold text-slate-950 shadow-[0_8px_25px_rgba(34,211,238,0.22)]">→</button>
            </form>
          </div>
        </section>
      ) : null}

      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Abrir suporte Harmomus" className="group relative flex h-[60px] w-[60px] items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_14px_40px_rgba(34,197,94,0.45)] transition hover:scale-105 hover:bg-emerald-400">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
        <WhatsappIcon className="relative h-7 w-7" />
        <span className="pointer-events-none absolute right-[72px] hidden whitespace-nowrap rounded-xl border border-white/10 bg-[#0c1420]/95 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur group-hover:block">Precisa de ajuda?</span>
      </button>
    </div>
  );
}