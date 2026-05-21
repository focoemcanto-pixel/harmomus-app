import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createPortal } from "@/lib/data/billing";
export async function POST(req: Request){const user=await getCurrentUser(); if(!user) return NextResponse.redirect(new URL('/login',req.url)); const portal=await createPortal(user.id); return NextResponse.redirect(portal.url);} 
