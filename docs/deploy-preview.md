# Deploy Preview — Harmomus (Cloudflare + OpenNext)

## 1) Dependências e setup
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Gere o build OpenNext local de preview:
   ```bash
   npm run preview
   ```

> `npm run preview` executa `opennextjs-cloudflare build && wrangler dev`.

## 2) Arquivos de deploy Cloudflare
Este projeto usa:
- `wrangler.jsonc` com `main` em `.open-next/worker.js`.
- `compatibility_flags: ["nodejs_compat"]` para compatibilidade com:
  - Next.js App Router
  - API Routes
  - Stripe webhook signature (HMAC em runtime Node compat)
  - Streaming de áudio em `/api/audio/[id]`

## 3) Variáveis de ambiente obrigatórias
Defina no Cloudflare (Preview e Production):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ASAAS_API_KEY`
- `ASAAS_ENV` (`sandbox` em preview, `production` em produção)
- `ASAAS_WEBHOOK_TOKEN`

## 4) Comandos corretos
### Preview local (Cloudflare Worker local)
```bash
npm run preview
```

### Deploy
```bash
npm run deploy
```

## 5) Compatibilidade validada no código
- App Router: estrutura `src/app/**`.
- API routes: `src/app/api/**/route.ts`.
- Supabase SSR no servidor: `src/lib/supabase/server.ts`.
- Stripe webhook: `src/app/api/webhooks/stripe/route.ts` com runtime Node.
- Streaming de áudio: `src/app/api/audio/[id]/route.ts` (Range + stream para Web Stream).

## 6) Verificações após deploy
Validar ao menos:
- `POST /api/webhooks/stripe`
- `GET /api/audio/[id]` (incluindo requisições com header `Range`)
- Fluxos de checkout/portal/cancelamento
- Login e páginas protegidas por plano (Supabase)
