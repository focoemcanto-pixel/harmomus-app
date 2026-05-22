import { POST as stripeWebhookPost } from "@/app/api/webhooks/stripe/route";

export const runtime = "nodejs";

export const POST = stripeWebhookPost;
