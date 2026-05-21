import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { changeSubscriptionPlan } from "@/lib/data/billing";
export async function POST(req: Request){const form=await req.formData(); const planId=String(form.get('plan_id')??''); const user=await getCurrentUser(); if(!user) return NextResponse.redirect(new URL('/login',req.url)); await changeSubscriptionPlan(user.id,planId); return NextResponse.redirect(new URL('/assinatura',req.url));}
