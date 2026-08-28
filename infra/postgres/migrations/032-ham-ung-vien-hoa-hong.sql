-- Đưa phép chọn ứng viên hoa hồng vào database thành một hàm.
--
-- Trước đó câu truy vấn này nằm trong một chuỗi TypeScript. Nó chạy đúng,
-- nhưng CI không kiểm được nó: bộ kiểm thử chạy trên database, còn logic tính
-- tiền lại nằm trong mã ứng dụng. Muốn thử thì phải chép lại câu truy vấn
-- sang file thử, mà chép lại là tạo ra hai nguồn sự thật — và hai nguồn sự
-- thật về cách tính tiền thì sớm muộn cũng lệch nhau.
--
-- Đặt ở đây thì cả ứng dụng lẫn bộ kiểm thử gọi cùng một hàm. Sửa cách tính
-- là sửa một chỗ, và phép thử trong CI kiểm đúng cái đang chạy.
--
-- Hàm CHỈ ĐỌC. Nó không ghi gì, chỉ trả về danh sách ứng viên kèm lý do đủ
-- hay không đủ điều kiện, để màn xem trước và lúc tính thật dùng chung.

create or replace function marketing.hoa_hong_ung_vien(p_ky text)
returns table (
  lead_id uuid, customer_name text, created_by_pg_code text,
  data_class text, net_level text, appointment_at timestamptz, created_at timestamptz,
  pg_arrival_confirmed_at timestamptz, pg_arrival_date date,
  loai text, loai_ten text, don_gia_pg numeric, don_gia_sup numeric,
  moc_tinh text, so_ngay_toi_thieu integer, so_ngay_toi_da integer,
  ngay_den date, ngay_den_nguon text, moc_ngay date, co_thieu_lich_hen boolean,
  so_ngay_cho integer, trong_han boolean, den_truoc_ngay_hen boolean,
  pg_ten text, sup_ma text, sup_nguon text, sup_ten text
)
language sql
stable
as $ham$

    with ky as (
      select p_ky ky_code,
             (p_ky || '-01')::date tu,
             (date_trunc('month', (p_ky || '-01')::date) + interval '1 month - 1 day')::date den
    ),
    gia as (
      select g.* from marketing.hoa_hong_bieu_gia g, ky
       where g.hieu_luc_tu <= ky.den
         and (g.hieu_luc_den is null or g.hieu_luc_den >= ky.tu)
    ),
    -- Người support_marketing đang hoạt động. Chỉ dùng làm bậc suy ra khi hồ
    -- sơ PG bỏ trống parent_support_code, VÀ chỉ khi có đúng một người. Hai
    -- người trở lên mà vẫn đoán thì là đoán mò, nên lúc đó bỏ trống và để
    -- người duyệt tự xử lý.
    sup_kha_dung as (
      select p.payload->>'employee_code' ma,
             coalesce(e.payload->>'full_name', p.payload->>'full_name') ten,
             count(*) over () so_nguoi
        from app.records p
        left join app.records e on e.entity_type='employees' and e.deleted_at is null
          and lower(e.payload->>'code') = lower(p.payload->>'employee_code')
       where p.entity_type='profiles' and p.deleted_at is null
         and p.payload->>'role' = 'support_marketing'
         and coalesce((p.payload->>'active')::boolean, true) = true
    ),
    sup_duy_nhat as (select ma, ten from sup_kha_dung where so_nguoi = 1),
    ung_vien as (
      select l.id lead_id, l.customer_name, l.created_by_pg_code,
             l.data_class, l.net_level, l.appointment_at, l.created_at,
             l.pg_arrival_confirmed_at, l.pg_arrival_date,
             g.ma loai, g.ten loai_ten, g.don_gia_pg, g.don_gia_sup,
             g.moc_tinh, g.so_ngay_toi_thieu, g.so_ngay_toi_da,
             -- Ngày khách THỰC đến. Ưu tiên ô SUP nhập; lùi về thời điểm bấm
             -- xác nhận cho dữ liệu cũ, và ghi rõ đã lùi.
             coalesce(l.pg_arrival_date,
                      (l.pg_arrival_confirmed_at at time zone 'Asia/Ho_Chi_Minh')::date) ngay_den,
             case when l.pg_arrival_date is not null then 'arrival_date' else 'xac_nhan' end ngay_den_nguon,
             case when g.moc_tinh = 'lich_hen'
                  then (coalesce(l.appointment_at, l.created_at) at time zone 'Asia/Ho_Chi_Minh')::date
                  else (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date end moc_ngay,
             l.appointment_at is null co_thieu_lich_hen
        from marketing.leads l
        join gia g on g.net_level = l.net_level
        cross join ky
       where l.data_class = 'net'
         and l.pg_commission_status = 'eligible'
         and (not g.can_xac_nhan_den or l.pg_arrival_confirmed_at is not null)
         and coalesce(l.pg_arrival_date,
                      (l.pg_arrival_confirmed_at at time zone 'Asia/Ho_Chi_Minh')::date)
             between ky.tu and ky.den
         -- Chưa từng sinh hoa hồng ở bất kỳ đợt còn sống nào. Chỉ số duy nhất
         -- trong database cũng chặn, nhưng lọc sẵn ở đây thì người duyệt thấy
         -- đúng danh sách thay vì thấy một lỗi trùng khoá.
         and not exists (
           select 1 from marketing.hoa_hong_dong d
            where d.lead_id = l.id and not d.huy
         )
    ),
    tinh as (
      select u.*,
             (u.ngay_den - u.moc_ngay) so_ngay_cho,
             (u.ngay_den - u.moc_ngay) >= u.so_ngay_toi_thieu
               and (u.so_ngay_toi_da is null or (u.ngay_den - u.moc_ngay) <= u.so_ngay_toi_da) trong_han,
             (u.ngay_den - u.moc_ngay) < 0 den_truoc_ngay_hen
        from ung_vien u
    ),
    nguoi as (
      select t.*,
             coalesce(pge.payload->>'full_name', pgp.payload->>'full_name') pg_ten,
             coalesce(nullif(btrim(pgp.payload->>'parent_support_code'), ''), sd.ma) sup_ma,
             case when nullif(btrim(pgp.payload->>'parent_support_code'), '') is not null
                  then 'khai_bao' when sd.ma is not null then 'suy_ra_duy_nhat' end sup_nguon
        from tinh t
        left join lateral (
          select p.* from app.records p
           where p.entity_type='profiles' and p.deleted_at is null
             and lower(p.payload->>'employee_code') = lower(t.created_by_pg_code)
           order by p.updated_at desc limit 1
        ) pgp on true
        left join app.records pge on pge.entity_type='employees' and pge.deleted_at is null
          and lower(pge.payload->>'code') = lower(t.created_by_pg_code)
        left join sup_duy_nhat sd on true
    ),
    day_du as (
    select n.*,
           coalesce(se.payload->>'full_name', sp.payload->>'full_name') sup_ten
      from nguoi n
      left join lateral (
        select p.* from app.records p
         where p.entity_type='profiles' and p.deleted_at is null
           and lower(p.payload->>'employee_code') = lower(n.sup_ma)
         order by p.updated_at desc limit 1
      ) sp on true
      left join app.records se on se.entity_type='employees' and se.deleted_at is null
        and lower(se.payload->>'code') = lower(n.sup_ma)
    )
  select * from day_du
$ham$;

comment on function marketing.hoa_hong_ung_vien(text) is
  'Lead đủ và không đủ điều kiện hoa hồng của một kỳ, kèm lý do. Chỉ đọc.';
