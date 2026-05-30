"use server";

import { cookies } from "next/headers";

export type FlashToastType = "success" | "error" | "warning" | "info";

export async function setFlashToast(type: FlashToastType, message: string) {
  const cookieStore = await cookies();
  const payload = encodeURIComponent(JSON.stringify({ type, message, createdAt: Date.now() }));

  cookieStore.set("harmomus_flash", payload, {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
  });
}
