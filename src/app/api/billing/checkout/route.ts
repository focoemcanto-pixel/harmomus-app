import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { startStripeCheckout } from "@/lib/data/billing";

export async function POST(req: Request) {
  const form = await req.formData();
  const planId = String(form.get("plan_id") ?? "");
  const user = await getCurrentUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login", req.url));
  const session = await startStripeCheckout(user.id, user.email, planId);
  return NextResponse.redirect(session.url!);
}
