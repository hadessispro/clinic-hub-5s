-- Phân loại một lần cho Lead cũ nhập từ hệ MySQL (external_source = 'pg_nhakhoa5s_mysql').
--
-- Quy tắc nguồn: CS luôn là Net chuyên sâu. CB chỉ là Net cơ bản khi nguồn có
-- nội dung lịch hẹn, còn lại vẫn là Data thô. Chuỗi lịch hẹn có thể viết tự do
-- (ví dụ "Hen 12/7") nên được giữ nguyên trong chân dung khách hàng kể cả khi
-- không chuyển được thành appointment_at.
--
-- LỊCH SỬ: nội dung của migration này ĐÃ được áp dụng thủ công lên production
-- trước khi có bản ghi trong app.schema_migrations. Ngày 27/08/2026 kiểm tra
-- lại: ràng buộc leads_check đã tồn tại đúng định nghĩa, và chạy thử phần
-- UPDATE cho kết quả 0/2872 dòng thay đổi.
--
-- File được viết lại cho AN TOÀN KHI CHẠY LẠI, vì kho Lead vẫn đang lớn lên
-- hằng ngày do Telesale và PG nhập mới:
--
--   * Không drop rồi add lại ràng buộc đang hợp lệ. Thao tác đó lấy khóa
--     ACCESS EXCLUSIVE trên bảng đang phục vụ, và nếu có bất kỳ dòng nào vi
--     phạm thì cả migration hỏng.
--   * Phần UPDATE chỉ chạm Lead có external_source = 'pg_nhakhoa5s_mysql'.
--     Kiểm chứng ngày 27/08/2026: 384 Lead tạo sau 20/08 thì 0 Lead nằm trong
--     phạm vi này. Dữ liệu Telesale/PG nhập mới không thể bị ghi đè.
--   * Bỏ qua êm nếu schema source_pg chưa được nạp.

begin;

-- Chỉ tạo ràng buộc khi chưa có. Cần thiết cho lần dựng database mới.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'marketing.leads'::regclass and conname = 'leads_check'
  ) then
    alter table marketing.leads
      add constraint leads_check check (
        data_class = 'raw'
        or (
          phone is not null
          and length(regexp_replace(phone, '\D', '', 'g')) >= 8
          and net_level in ('basic', 'advanced')
        )
      );
  end if;
end $$;

-- Phân loại lại Lead cũ. Bỏ qua nếu chưa nạp dữ liệu nguồn.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'source_pg' and table_name = 'customers'
  ) then
    raise notice 'Bo qua phan loai Lead cu: chua co source_pg.customers.';
    return;
  end if;

  update marketing.leads lead
  set appointment_at = case
        when trim(coalesce(source.payload->>'appointment_date','')) ~ '^[0-3]?[0-9]/[0-1]?[0-9]/20[0-9]{2}[[:space:]][0-2]?[0-9]:[0-5][0-9]$'
        then to_timestamp(trim(source.payload->>'appointment_date'), 'DD/MM/YYYY HH24:MI') at time zone 'Asia/Ho_Chi_Minh'
        else null end,
      data_class = case
        when lower(trim(source.payload->>'data_type')) = 'cs' then 'net'
        when lower(trim(source.payload->>'data_type')) = 'cb'
         and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'net'
        else 'raw' end,
      net_level = case
        when lower(trim(source.payload->>'data_type')) = 'cs' then 'advanced'
        when lower(trim(source.payload->>'data_type')) = 'cb'
         and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'basic'
        else null end,
      updated_at = now()
  from source_pg.customers source
  where lead.external_source = 'pg_nhakhoa5s_mysql'
    and lead.external_id = source.source_id::text
    and lower(trim(coalesce(source.payload->>'data_type', ''))) in ('cb', 'cs')
    -- Chỉ ghi khi giá trị thực sự khác, để lần chạy lại không đụng updated_at
    -- của những Lead đã đúng.
    and (
      lead.data_class is distinct from (case
        when lower(trim(source.payload->>'data_type')) = 'cs' then 'net'
        when lower(trim(source.payload->>'data_type')) = 'cb'
         and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'net'
        else 'raw' end)
      or lead.net_level is distinct from (case
        when lower(trim(source.payload->>'data_type')) = 'cs' then 'advanced'
        when lower(trim(source.payload->>'data_type')) = 'cb'
         and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'basic'
        else null end)
    );
end $$;

commit;
