import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/automation-engine-v2.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[foco os profile fallback patch] Trecho não encontrado: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
  "capturar erros de lookup de perfil",
  `  const [{ data: profiles }, { data: subscriptions }, { data: states }] = await Promise.all([\n    admin.from("profiles").select("id,full_name,email,phone,whatsapp_opt_in,email_opt_in").in("id", userIds),\n    admin.from("subscriptions").select("user_id,status,plans(slug)").in("user_id", userIds).order("updated_at", { ascending: false }),\n    admin.from("user_marketing_state").select("*").in("user_id", userIds),\n  ]);`,
  `  const [profilesResult, subscriptionsResult, statesResult] = await Promise.all([\n    admin.from("profiles").select("id,full_name,email,phone,whatsapp_opt_in,email_opt_in").in("id", userIds),\n    admin.from("subscriptions").select("user_id,status,plans(slug)").in("user_id", userIds).order("updated_at", { ascending: false }),\n    admin.from("user_marketing_state").select("*").in("user_id", userIds),\n  ]);\n  const profiles = profilesResult.data;\n  const subscriptions = subscriptionsResult.data;\n  const states = statesResult.data;\n  if (profilesResult.error) console.warn("[automation-engine-v2] falha ao buscar profiles; usando fallback dos eventos quando possível", profilesResult.error.message);\n  if (subscriptionsResult.error) console.warn("[automation-engine-v2] falha ao buscar subscriptions", subscriptionsResult.error.message);\n  if (statesResult.error) console.warn("[automation-engine-v2] falha ao buscar user_marketing_state", statesResult.error.message);`,
);

replaceExact(
  "fallback de perfil pelo metadata do evento",
  `  for (const userId of userIds) {\n    const profile = profileById.get(userId);\n    if (!profile) continue;\n    const userEvents = eventsByUser.get(userId) ?? [];`,
  `  for (const userId of userIds) {\n    const userEvents = eventsByUser.get(userId) ?? [];\n    let profile = profileById.get(userId);\n    if (!profile) {\n      const eventWithRecipient = [...userEvents]\n        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))\n        .find((event) => {\n          const metadata = event.metadata ?? {};\n          return Boolean(metadata.full_name || metadata.name || metadata.email || metadata.phone || metadata.whatsapp);\n        });\n      const metadata = eventWithRecipient?.metadata ?? {};\n      const fallbackPhone = String(metadata.phone ?? metadata.whatsapp ?? "").trim();\n      const fallbackEmail = String(metadata.email ?? "").trim();\n      const fallbackName = String(metadata.full_name ?? metadata.name ?? "").trim();\n      if (fallbackPhone || fallbackEmail) {\n        profile = {\n          id: userId,\n          full_name: fallbackName || "Aluno",\n          email: fallbackEmail || null,\n          phone: fallbackPhone || null,\n          whatsapp_opt_in: true,\n          email_opt_in: true,\n        };\n      }\n    }\n    if (!profile) {\n      result.skipped += 1;\n      result.details.push({ user_id: userId, automation_id: "profile_lookup", status: "skipped", score: 0, reason: "profile_not_found" });\n      continue;\n    }`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[foco os profile fallback patch] Perfis ausentes não bloqueiam mais silenciosamente a fila manual.");
