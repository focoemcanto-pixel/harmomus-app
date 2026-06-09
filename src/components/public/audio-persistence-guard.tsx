"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __harmomusAudioPatched?: boolean;
    __harmomusNativeAudio?: typeof Audio;
  }
}

function preparePersistentAudio(audio: HTMLAudioElement) {
  try {
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.preload = audio.preload || "auto";
    audio.style.position = "fixed";
    audio.style.left = "-9999px";
    audio.style.bottom = "0";
    audio.style.width = "1px";
    audio.style.height = "1px";
    audio.style.opacity = "0";
    audio.style.pointerEvents = "none";
    audio.style.display = "block";
  } catch {}

  if (!audio.dataset.harmomusPersistenceBound) {
    audio.dataset.harmomusPersistenceBound = "true";

    audio.addEventListener("play", () => {
      audio.dataset.harmomusShouldResume = "true";
    });

    audio.addEventListener("pause", () => {
      const shouldPersist = audio.dataset.harmomusShouldResume === "true";
      const isBackgrounded = typeof document !== "undefined" && document.visibilityState === "hidden";
      const hasSource = Boolean(audio.currentSrc || audio.src || audio.getAttribute("src"));

      if (!shouldPersist || !isBackgrounded || audio.ended || !hasSource) {
        if (!isBackgrounded) audio.dataset.harmomusShouldResume = "false";
        return;
      }

      window.setTimeout(() => {
        if (document.visibilityState !== "hidden") return;
        if (audio.dataset.harmomusShouldResume !== "true") return;
        if (audio.ended || !(audio.currentSrc || audio.src || audio.getAttribute("src"))) return;
        void audio.play().catch(() => undefined);
      }, 120);
    });

    audio.addEventListener("ended", () => {
      audio.dataset.harmomusShouldResume = "false";
    });
  }

  if (typeof document !== "undefined" && document.body && !audio.isConnected) {
    try {
      document.body.appendChild(audio);
    } catch {}
  }
}

function prepareExistingAudios() {
  document.querySelectorAll("audio").forEach((audio) => preparePersistentAudio(audio));
}

function resumePersistentAudios() {
  document.querySelectorAll("audio").forEach((audio) => {
    const shouldResume = audio.dataset.harmomusShouldResume === "true";
    const hasSource = Boolean(audio.currentSrc || audio.src || audio.getAttribute("src"));
    if (!shouldResume || !audio.paused || audio.ended || !hasSource) return;
    void audio.play().catch(() => undefined);
  });
}

export function AudioPersistenceGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (!window.__harmomusAudioPatched) {
      const NativeAudio = window.Audio;
      window.__harmomusNativeAudio = NativeAudio;

      const PatchedAudio = function HarmomusPersistentAudio(this: HTMLAudioElement, ...args: ConstructorParameters<typeof Audio>) {
        const audio = new NativeAudio(...args);
        preparePersistentAudio(audio);
        return audio;
      } as unknown as typeof Audio;

      try {
        PatchedAudio.prototype = NativeAudio.prototype;
        window.Audio = PatchedAudio;
        window.__harmomusAudioPatched = true;
      } catch {}
    }

    prepareExistingAudios();

    const observer = new MutationObserver(() => prepareExistingAudios());
    observer.observe(document.body, { childList: true, subtree: true });

    const onVisibilityChange = () => resumePersistentAudios();
    const onPageShow = () => resumePersistentAudios();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onPageShow);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onPageShow);
    };
  }, []);

  return null;
}
