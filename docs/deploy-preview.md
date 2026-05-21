# Deploy Preview — Harmomus

## 1) Supabase (projeto + schema)
1. Crie um projeto no Supabase.
2. Em **Project Settings → API**, copie:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. No SQL Editor, execute todo o conteúdo de `supabase/schema.sql`.
4. Verifique se as tabelas abaixo existem em `public`:
   - `profiles`, `plans`, `subscriptions`, `categories`, `kits`, `kit_audio_files`
   - `playlists`, `playlist_items`, `kit_access_logs`, `audio_access_logs`
   - `billing_events`, `migration_logs`
5. Garanta que o usuário autenticado tenha registro em `profiles` (via fluxo de login).

## 2) Cloudflare (Pages/Workers Preview)
1. Conecte o repositório no Cloudflare Pages.
2. Configure build:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output conforme preset Next.js do Cloudflare.
3. Adicione todas as envs (Preview e Production) listadas abaixo.
4. Faça deploy de preview pelo branch de trabalho.

## 3) Variáveis de ambiente obrigatórias
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

## 4) Criar usuário admin
1. Faça signup/login normalmente para criar o usuário no `auth.users`.
2. No Supabase SQL Editor, execute:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'seu-email@dominio.com';
```

## 5) Rodar schema localmente/remotamente
- Fonte única: `supabase/schema.sql`.
- Rode no SQL Editor do Supabase (ou pipeline de migrations), sempre em ambiente alvo de preview antes do teste.

## 6) Rotas para validar preview
- Público:
  - `/`
  - `/todos-os-kits`
  - `/biblioteca`
  - `/categoria/[slug]`
- Auth/Assinatura:
  - `/login`
  - `/assinar`
  - `/assinatura`
  - `/checkout/sucesso`
  - `/checkout/cancelado`
- Admin:
  - `/admin`
  - `/admin/planos`
  - `/admin/membros`
- APIs críticas:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/cancel`
  - `POST /api/billing/change-plan`
  - `POST /api/webhooks/stripe`
  - `GET /api/audio/[id]`
