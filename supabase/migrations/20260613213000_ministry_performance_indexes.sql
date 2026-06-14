create index if not exists ministry_members_user_status_created_idx
on public.ministry_members(user_id, status, created_at desc);

create index if not exists ministry_members_ministry_status_created_idx
on public.ministry_members(ministry_id, status, created_at asc);

create index if not exists ministry_members_ministry_role_status_idx
on public.ministry_members(ministry_id, role, status);

create index if not exists ministries_status_plan_idx
on public.ministries(status, plan_type);

create index if not exists ministry_repertoires_ministry_archived_created_idx
on public.ministry_repertoires(ministry_id, archived, created_at desc);

create index if not exists ministry_repertoires_ministry_event_date_idx
on public.ministry_repertoires(ministry_id, event_date desc);

create index if not exists ministry_repertoire_items_repertoire_position_idx
on public.ministry_repertoire_items(repertoire_id, position asc);

create index if not exists ministry_repertoire_assignments_repertoire_item_created_idx
on public.ministry_repertoire_assignments(repertoire_id, repertoire_item_id, created_at asc);

create index if not exists ministry_repertoire_assignments_member_idx
on public.ministry_repertoire_assignments(member_id);

create index if not exists ministry_team_templates_ministry_archived_created_idx
on public.ministry_team_templates(ministry_id, archived, created_at desc);

create index if not exists ministry_team_template_members_template_created_idx
on public.ministry_team_template_members(template_id, created_at asc);

notify pgrst, 'reload schema';
