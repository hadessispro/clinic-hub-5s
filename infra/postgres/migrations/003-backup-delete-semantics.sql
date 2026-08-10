create or replace function app.queue_record_backup() returns trigger
language plpgsql as $$
begin
  if current_setting('app.suppress_backup_outbox', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    insert into app.backup_outbox(entity_type, record_key, operation, payload)
    values (old.entity_type, old.record_key, 'delete', old.payload);
    return old;
  end if;
  if new.deleted_at is not null then
    insert into app.backup_outbox(entity_type, record_key, operation, payload)
    values (new.entity_type, new.record_key, 'delete', new.payload);
    return new;
  end if;
  insert into app.backup_outbox(entity_type, record_key, operation, payload)
  values (new.entity_type, new.record_key, 'upsert', new.payload);
  return new;
end;
$$;
