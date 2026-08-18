alter table marketing.leads
  add column if not exists low_quality_reason text;

alter table marketing.leads
  drop constraint if exists leads_status_check;

alter table marketing.leads
  add constraint leads_status_check check (
    status in (
      'new',
      'contacted',
      'appointment_booked',
      'visited',
      'converted',
      'appointment_cancelled',
      'low_quality',
      'cancelled'
    )
  );

alter table marketing.leads
  drop constraint if exists leads_low_quality_reason_check;

alter table marketing.leads
  add constraint leads_low_quality_reason_check check (
    status <> 'low_quality'
    or low_quality_reason in (
      'subscriber_unavailable',
      'wrong_phone',
      'wrong_person',
      'duplicate',
      'spam',
      'other'
    )
  );

create index if not exists marketing_leads_low_quality_idx
  on marketing.leads(status, low_quality_reason, updated_at desc)
  where status = 'low_quality';
