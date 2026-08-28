-- Hai thay đổi theo nghiệp vụ thật.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1 · SUP quản lý toàn bộ PG · ghi thẳng vào hồ sơ thay vì để hệ thống đoán
-- ─────────────────────────────────────────────────────────────────────────
--
-- Trước đó 16 trên 18 hồ sơ PG bỏ trống parent_support_code, và phép tính
-- phải suy ra người phụ trách từ chỗ chỉ có đúng một người support_marketing.
-- Nó ra đúng người, nhưng mỗi dòng phải mang nhãn "suy ra" và người duyệt
-- phải đọc thêm một cảnh báo không cần thiết.
--
-- Toàn bộ PG do một SUP quản lý, nên điền thẳng vào hồ sơ. Khai báo rõ khác
-- suy đoán đúng ở chỗ: khai báo còn đúng khi có người SUP thứ hai, còn suy
-- đoán thì lúc đó im lặng ngừng hoạt động.
--
-- Chỉ điền vào chỗ ĐANG TRỐNG. Hồ sơ nào đã khai người phụ trách thì giữ
-- nguyên, kể cả khi khai người khác — dữ liệu người ta nhập tay luôn thắng
-- một câu lệnh chạy hàng loạt.

do $$
declare
  sup_ma text;
  so_sup int;
  da_dien int;
begin
  select count(*), min(payload->>'employee_code') into so_sup, sup_ma
    from app.records
   where entity_type = 'profiles' and deleted_at is null
     and payload->>'role' = 'support_marketing'
     and coalesce((payload->>'active')::boolean, true) = true;

  if so_sup <> 1 then
    raise notice 'Có % người support_marketing, không tự điền được. Bỏ qua.', so_sup;
    return;
  end if;

  update app.records
     set payload = payload || jsonb_build_object('parent_support_code', sup_ma),
         updated_at = now()
   where entity_type = 'profiles' and deleted_at is null
     and payload->>'role' = 'pg_staff'
     and nullif(btrim(coalesce(payload->>'parent_support_code', '')), '') is null;

  get diagnostics da_dien = row_count;
  raise notice 'Đã gán % hồ sơ PG cho SUP %', da_dien, sup_ma;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Dòng quá hạn vẫn nằm trong đợt, để SUP tự đối chiếu
-- ─────────────────────────────────────────────────────────────────────────
--
-- Trước đó chỉ những dòng trong hạn mới được ghi vào đợt. Dòng quá hạn biến
-- mất, và SUP không có cách nào biết tháng này mất bao nhiêu khoản vì lý do
-- gì. Một con số không giải thích được là con số không đối chiếu được.
--
-- Nay mọi ứng viên đều được ghi, nhưng chỉ dòng trong hạn mới TÍNH TIỀN.
-- Dòng quá hạn mang so_tien = 0 kèm lý do bị loại.
--
-- Chỉ số chống trả trùng thu hẹp lại còn những dòng thật sự tính tiền. Nhờ
-- vậy một lead bị loại vì quá hạn KHÔNG bị khoá vĩnh viễn: SUP sửa lại ngày
-- khách đến thì kỳ sau nó vào được. Nếu index vẫn phủ cả dòng bị loại thì
-- lead đó không bao giờ được trả nữa, và không ai hiểu vì sao.

alter table marketing.hoa_hong_dong
  add column if not exists tinh_tien   boolean not null default true,
  add column if not exists ly_do_loai  text;

do $$ begin
  alter table marketing.hoa_hong_dong
    add constraint hh_dong_khong_tinh_thi_bang_khong
      check (tinh_tien or so_tien = 0);
exception when duplicate_object then null;
end $$;

comment on column marketing.hoa_hong_dong.tinh_tien is
  'Dòng này có được trả tiền không. Dòng quá hạn vẫn được ghi để đối chiếu nhưng so_tien = 0.';
comment on column marketing.hoa_hong_dong.ly_do_loai is
  'Vì sao dòng này không được tính tiền. Trống nghĩa là được tính.';

drop index if exists marketing.hoa_hong_dong_lead_vai_tro_uidx;
create unique index hoa_hong_dong_lead_vai_tro_uidx
  on marketing.hoa_hong_dong(lead_id, vai_tro) where not huy and tinh_tien;

create index if not exists hoa_hong_dong_loai_idx
  on marketing.hoa_hong_dong(dot_id) where not tinh_tien;

-- Tổng tiền của đợt chỉ cộng dòng thật sự tính tiền. Dòng bị loại có so_tien
-- bằng 0 nên phép cộng vẫn đúng, nhưng lọc ra cho rõ ý.
create or replace view finance_src.hoa_hong_pg_chi_tiet as
  select l.dot_id,
         d.ky_code,
         l.vai_tro,
         l.nguoi_ma,
         l.nguoi_ten,
         l.loai,
         count(*)::int      so_luong,
         sum(l.so_tien)     so_tien
    from marketing.hoa_hong_dong l
    join marketing.hoa_hong_dot d on d.id = l.dot_id
   where d.trang_thai = 'da_chot' and l.tinh_tien and not l.huy
   group by l.dot_id, d.ky_code, l.vai_tro, l.nguoi_ma, l.nguoi_ten, l.loai;

comment on view finance_src.hoa_hong_pg_chi_tiet is
  'Chi tiết hoa hồng đã chốt gộp theo người và loại dịch vụ. Chỉ dòng thật sự chi tiền. Chỉ đọc.';
