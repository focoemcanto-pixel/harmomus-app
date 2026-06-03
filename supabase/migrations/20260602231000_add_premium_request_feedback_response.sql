alter table public.premium_requests
  add column if not exists admin_response text,
  add column if not exists admin_response_tone text,
  add column if not exists admin_response_at timestamptz,
  add column if not exists testimonial_public boolean not null default false,
  add column if not exists testimonial_card_title text,
  add column if not exists testimonial_card_style text not null default 'premium_dark';

create index if not exists premium_requests_feedback_response_idx
  on public.premium_requests(request_type, admin_response_at desc);
