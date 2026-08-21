alter table marketing.call_logs
  drop constraint if exists call_logs_call_status_check;

alter table marketing.call_logs
  add constraint call_logs_call_status_check check (
    call_status in (
      'not_consulted',
      'not_appointment_booked',
      'interested',
      'appointment_booked',
      'busy',
      'no_answer',
      'rejected'
    )
  );
