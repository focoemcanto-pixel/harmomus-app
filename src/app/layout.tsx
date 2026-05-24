import type { Metadata } from "next";

import { GlobalAudioPlayerProvider } from "@/components/public/global-audio-player-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Harmomus Studio",
  description: "Central administrativa do Harmomus com arquitetura SaaS escalável.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <GlobalAudioPlayerProvider>{children}</GlobalAudioPlayerProvider>
      </body>
    </html>
  );
}
