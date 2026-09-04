-- Migration 039 được chạy bởi POSTGRES_USER=clinic_app, còn API kết nối bằng
-- DATABASE_URL với role clinic_backend. Vì vậy quyền SET ROLE đã vô tình cấp
-- cho người chạy migration thay vì người thực thi truy vấn trong backend.
-- Cấp membership tường minh cho runtime role; không cấp quyền đăng nhập hay
-- quyền ghi cho clinic_query_reader.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinic_query_reader') then
    raise exception 'Thiếu role clinic_query_reader từ migration 039';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    raise exception 'Không tìm thấy PostgreSQL runtime role clinic_backend';
  end if;
  grant clinic_query_reader to clinic_backend;
end $$;
