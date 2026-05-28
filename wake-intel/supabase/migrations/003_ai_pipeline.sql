-- ============================================================
-- Migration 003 — Phase 3: Product A AI sales pipeline (fe33_ prefixed)
-- ============================================================

create or replace function fe33_trg_rollup_ai_outreach() returns trigger as $$
declare
  v_new_status text;
begin
  v_new_status := case
    when new.outcome = 'demo_scheduled'  then 'demo_scheduled'
    when new.outcome = 'demo_completed'  then 'demo_done'
    when new.outcome = 'closed_won'      then 'won'
    when new.outcome = 'closed_lost'     then 'lost'
    when new.outcome = 'not_interested'  then 'disqualified'
    when new.outcome in ('connected','left_voicemail','no_answer','follow_up_needed')
      then 'contacted'
    else null
  end;

  update fe33_facilities
  set ai_last_contact_at = new.interaction_date,
      ai_outreach_status = coalesce(v_new_status, ai_outreach_status),
      ai_outreach_status_changed_at = case
        when v_new_status is not null and v_new_status is distinct from ai_outreach_status
          then now()
        else ai_outreach_status_changed_at
      end
  where id = new.facility_id;

  return new;
end; $$ language plpgsql;

create trigger fe33_call_note_ai_rollup after insert on fe33_call_notes
  for each row execute function fe33_trg_rollup_ai_outreach();

create or replace function fe33_recompute_ai_priorities() returns void language sql as $$
  update fe33_facilities set ai_priority = case
    when ai_outreach_status in ('demo_done','proposal_sent','negotiating')
      and ai_last_contact_at > now() - interval '14 days' then 'hot'
    when ai_outreach_status = 'contacted'
      and ai_last_contact_at > now() - interval '30 days' then 'warm'
    when ai_outreach_status = 'not_contacted'
      and size_class in ('confirmed_100_plus','likely_100_plus') then 'cold'
    when ai_outreach_status in ('disqualified','lost') then 'dead'
    else ai_priority
  end;
$$;
