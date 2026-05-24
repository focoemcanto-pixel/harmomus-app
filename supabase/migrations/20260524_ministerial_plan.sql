-- Ministerial plan baseline
insert into public.plans (name, slug, description, price_cents, currency, trial_days, hierarchy_level, status, stripe_price_id, features)
values
  ('Ministério 10','ministry_10','Até 10 integrantes com acesso Premium coletivo',39700,'BRL',0,3,'active',coalesce(nullif(current_setting('app.settings.stripe_ministry_10_price_id', true),''), null),'[]'::jsonb),
  ('Ministério 20','ministry_20','Até 20 integrantes com acesso Premium coletivo',69700,'BRL',0,3,'active',coalesce(nullif(current_setting('app.settings.stripe_ministry_20_price_id', true),''), null),'[]'::jsonb),
  ('Ministério 40','ministry_40','Até 40 integrantes com acesso Premium coletivo',129700,'BRL',0,3,'active',coalesce(nullif(current_setting('app.settings.stripe_ministry_40_price_id', true),''), null),'[]'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  hierarchy_level = excluded.hierarchy_level,
  status = excluded.status,
  updated_at = now();
