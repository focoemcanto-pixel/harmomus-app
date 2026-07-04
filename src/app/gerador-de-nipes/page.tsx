import { PublicAppShell } from "@/components/public/public-app-shell";
import { VoicePartGenerator } from "@/components/public/voice-part-generator";

export const metadata = {
  title: "Gerador de Nipes | Harmomus",
  description: "Gere uma segunda voz padrão por nipe, respeitando tom, extensão vocal e acordes do trecho.",
};

export default function VoicePartGeneratorPage() {
  return (
    <PublicAppShell>
      <VoicePartGenerator />
    </PublicAppShell>
  );
}
