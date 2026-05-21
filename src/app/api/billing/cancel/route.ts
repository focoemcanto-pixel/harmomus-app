import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cancelSubscription } from "@/lib/stripe/client";
export async function POST(req: Request){const user=await getCurrentUser(); if(!user) return NextResponse.redirect(new URL('/login',req.url)); const supabase=(await createClient()) as any; const {data:sub}=await supabase.from('subscriptions').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).single(); if(sub?.stripe_subscription_id) await cancelSubscription(sub.stripe_subscription_id); await supabase.from('subscriptions').update({status:'canceled',auto_renew:false,canceled_at:new Date().toISOString()}).eq('id',sub.id); return NextResponse.redirect(new URL('/assinatura',req.url));}
