alter table public.kits
  add column if not exists manual_tessitura_ranges jsonb;

comment on column public.kits.manual_tessitura_ranges is
  'Tessitura oficial manual do tom original do kit, em MIDI internacional, por nipe. Ex: {"tenor":{"min_midi":45,"max_midi":67},"contralto":...}. Entrada admin usa notação brasileira.';
