import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harmomus Studio",
  description: "Central administrativa do Harmomus com arquitetura SaaS escalável.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
