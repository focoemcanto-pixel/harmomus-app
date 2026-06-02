create or replace function public.sync_profile_onboarding_after_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null then
    update public.profiles
    set
      onboarding_status = case
        when onboarding_status in ('pending_email_confirmation', 'email_confirmed', 'onboarding_completed') then 'active'
        else onboarding_status
      end,
      onboarding_step = case
        when onboarding_step in (
          'signup_started',
          'checkout_started',
          'checkout_completed',
          'waiting_payment',
          'waiting_email_confirmation',
          'email_confirmation_reminder',
          'waiting_first_login'
        ) then 'completed'
        else onboarding_step
      end,
      updated_at = now()
    where id = new.id
      and (
        onboarding_status in ('pending_email_confirmation', 'email_confirmed', 'onboarding_completed')
        or onboarding_step in (
          'signup_started',
          'checkout_started',
          'checkout_completed',
          'waiting_payment',
          'waiting_email_confirmation',
          'email_confirmation_reminder',
          'waiting_first_login'
        )
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_onboarding_after_email_confirmation on auth.users;

create trigger trg_sync_profile_onboarding_after_email_confirmation
after insert or update of email_confirmed_at on auth.users
for each row
execute function public.sync_profile_onboarding_after_email_confirmation();

update public.profiles as p
set
  onboarding_status = case
    when p.onboarding_status in ('pending_email_confirmation', 'email_confirmed', 'onboarding_completed') then 'active'
    else p.onboarding_status
  end,
  onboarding_step = case
    when p.onboarding_step in (
      'signup_started',
      'checkout_started',
      'checkout_completed',
      'waiting_payment',
      'waiting_email_confirmation',
      'email_confirmation_reminder',
      'waiting_first_login'
    ) then 'completed'
    else p.onboarding_step
  end,
  updated_at = now()
from auth.users as u
where u.id = p.id
  and u.email_confirmed_at is not null
  and (
    p.onboarding_status in ('pending_email_confirmation', 'email_confirmed', 'onboarding_completed')
    or p.onboarding_step in (
      'signup_started',
      'checkout_started',
      'checkout_completed',
      'waiting_payment',
      'waiting_email_confirmation',
      'email_confirmation_reminder',
      'waiting_first_login'
    )
  );
