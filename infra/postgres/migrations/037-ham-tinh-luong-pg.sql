-- Hàm chọn ca đủ điều kiện tính lương PG.
--
-- Đặt trong database vì cùng một lý do với hoa hồng: bộ kiểm thử chạy trên
-- database, nên logic tính tiền nằm trong mã ứng dụng thì CI không kiểm được
-- nó, và chép câu truy vấn sang file thử là tạo hai nguồn sự thật về tiền.
--
-- CHỈ ĐỌC. Trả về mọi ca trong kỳ kèm lý do đủ hay không đủ điều kiện, để
-- màn xem trước và lúc tính thật dùng chung đúng một định nghĩa.

create or replace function marketing.pg_luong_ung_vien(p_ky text)
returns table (
  assignment_id uuid, pg_ma text, pg_ten text, ngay date,
  diem_ten text, loai_diem text, loai_ten text,
  ca_bat_dau time, ca_ket_thuc time,
  vao_luc timestamptz, ra_luc timestamptz,
  gio_phan_cong numeric, gio_thuc_te numeric, gio_giao_nhau numeric,
  cach_tinh text, gio_tinh_luong numeric, don_gia numeric, so_tien numeric,
  gio_toi_da numeric, du_dieu_kien boolean, ly_do_loai text, canh_bao text
)
language sql
stable
as $ham$
  with ky as (
    select (p_ky || '-01')::date tu,
           (date_trunc('month', (p_ky || '-01')::date) + interval '1 month - 1 day')::date den
  ),
  ca as (
    select a.id, a.pg_code, a.work_date, a.start_time, a.end_time,
           s.name diem_ten, s.loai loai_diem,
           g.ten loai_ten, g.don_gia_gio, g.cach_tinh, g.gio_toi_da, g.so_gio_chuan,
           vao.recorded_at vao, ra.recorded_at ra,
           -- Mốc đầu và cuối ca quy về timestamptz để so được với lúc chấm.
           (a.work_date + a.start_time) at time zone 'Asia/Ho_Chi_Minh' ca_tu,
           (a.work_date + a.end_time)   at time zone 'Asia/Ho_Chi_Minh' ca_den
      from marketing.pg_shift_assignments a
      cross join ky
      join marketing.pg_work_sites s on s.id = a.site_id
      left join marketing.pg_bieu_gia g on g.ma = s.loai
      left join marketing.pg_attendance vao
        on vao.assignment_id = a.id and vao.record_type = 'checkin'
      left join marketing.pg_attendance ra
        on ra.assignment_id  = a.id and ra.record_type = 'checkout'
     where a.work_date between ky.tu and ky.den
       -- Chưa từng được trả ở bất kỳ đợt còn sống nào.
       and not exists (
         select 1 from marketing.pg_luong_dong d
          where d.assignment_id = a.id and not d.huy and d.tinh_tien)
  ),
  do_gio as (
    select c.*,
           round(extract(epoch from (c.end_time - c.start_time))/3600.0::numeric, 2) g_phan_cong,
           round(extract(epoch from (c.ra - c.vao))/3600.0::numeric, 2) g_thuc_te,
           round(greatest(0, extract(epoch from
             (least(c.ra, c.ca_den) - greatest(c.vao, c.ca_tu))
           )/3600.0)::numeric, 2) g_giao_nhau
      from ca c
  ),
  chon as (
    select d.*,
           case d.cach_tinh
             when 'giao_nhau' then d.g_giao_nhau
             when 'theo_ca'   then d.g_phan_cong
             else d.g_thuc_te
           end g_tinh
      from do_gio d
  )
  select
    c.id, c.pg_code,
    coalesce(e.payload->>'full_name', p.payload->>'full_name') pg_ten,
    c.work_date, c.diem_ten, c.loai_diem, c.loai_ten,
    c.start_time, c.end_time, c.vao, c.ra,
    c.g_phan_cong, c.g_thuc_te, c.g_giao_nhau,
    c.cach_tinh,
    case when kt.du then coalesce(c.g_tinh, 0) else 0 end,
    coalesce(c.don_gia_gio, 0),
    case when kt.du then round(coalesce(c.g_tinh, 0) * c.don_gia_gio, 0) else 0 end,
    c.gio_toi_da,
    kt.du,
    kt.ly_do,
    -- Cảnh báo không chặn việc tính, nhưng người duyệt phải nhìn thấy.
    nullif(concat_ws(' · ',
      case when c.g_thuc_te > c.g_phan_cong + 1
           then format('Ở lại lâu hơn ca %s giờ', round(c.g_thuc_te - c.g_phan_cong, 1)) end,
      case when c.g_thuc_te < c.g_phan_cong - 0.5
           then format('Thiếu %s giờ so với ca', round(c.g_phan_cong - c.g_thuc_te, 1)) end,
      case when c.gio_toi_da is not null and c.g_thuc_te > c.gio_toi_da
           then format('Vượt trần %s giờ của loại điểm này', c.gio_toi_da) end
    ), '')
  from chon c
  left join lateral (
    select
      (c.loai_diem is not null and c.vao is not null and c.ra is not null
       and c.g_tinh > 0) du,
      case
        when c.loai_diem is null then 'Điểm làm việc chưa gán loại nên không có đơn giá'
        when c.vao is null and c.ra is null then 'Không chấm công vào lẫn ra'
        when c.vao is null then 'Thiếu chấm công vào ca'
        when c.ra  is null then 'Thiếu chấm công ra ca'
        when c.g_tinh is null or c.g_tinh <= 0 then 'Giờ làm bằng 0, chấm ra ngay sau khi chấm vào'
      end ly_do
  ) kt on true
  left join lateral (
    select r.* from app.records r
     where r.entity_type='profiles' and r.deleted_at is null
       and lower(r.payload->>'employee_code') = lower(c.pg_code)
     order by r.updated_at desc limit 1
  ) p on true
  left join app.records e on e.entity_type='employees' and e.deleted_at is null
    and lower(e.payload->>'code') = lower(c.pg_code)
  order by kt.du desc, c.work_date, c.pg_code
$ham$;

comment on function marketing.pg_luong_ung_vien(text) is
  'Ca PG đủ và không đủ điều kiện tính lương của một kỳ, kèm lý do. Chỉ đọc.';

-- ══ Cầu nối sang két kế toán ═════════════════════════════════════════════
--
-- Cùng khuôn với hoa hồng: kế toán QUAN SÁT, không duyệt. Hiện mọi giai đoạn
-- để kế toán biết tháng này sắp có khoản chi bao nhiêu, chứ không chỉ thấy
-- khoản đã xong.

drop view if exists finance_src.luong_pg;
create view finance_src.luong_pg as
  select d.id dot_id, d.ky_code, d.ky_tu, d.ky_den, d.trang_thai,
         case d.trang_thai
           when 'cho_sup' then 'Chờ SUP chốt'
           when 'da_chot' then 'Đã chốt'
           when 'tu_choi' then 'Đã từ chối'
           else d.trang_thai end trang_thai_ten,
         d.trang_thai = 'da_chot' da_chot,
         d.tinh_luc, d.chot_luc, d.chot_boi,
         d.tk_no, d.tk_co, d.khoan_muc,
         d.so_ca, d.so_nguoi, d.tong_gio, d.tong_tien,
         d.finance_voucher_no
    from marketing.pg_luong_dot d;

comment on view finance_src.luong_pg is
  'Các đợt lương PG ở mọi giai đoạn, để kế toán quan sát. Chỉ đọc, không duyệt.';

drop view if exists finance_src.luong_pg_chi_tiet;
create view finance_src.luong_pg_chi_tiet as
  select l.dot_id, d.ky_code, d.trang_thai,
         l.pg_ma, l.pg_ten, l.loai_diem,
         count(*)::int      so_ca,
         sum(l.gio_tinh_luong) tong_gio,
         sum(l.so_tien)     so_tien
    from marketing.pg_luong_dong l
    join marketing.pg_luong_dot d on d.id = l.dot_id
   where l.tinh_tien and not l.huy
   group by l.dot_id, d.ky_code, d.trang_thai, l.pg_ma, l.pg_ten, l.loai_diem;

comment on view finance_src.luong_pg_chi_tiet is
  'Lương PG gộp theo người và loại điểm. Chỉ ca thật sự trả tiền. Chỉ đọc.';

do $$ begin
  execute 'grant select on finance_src.luong_pg, finance_src.luong_pg_chi_tiet to finance_app';
exception when undefined_object then
  raise notice 'Chưa có vai trò finance_app, bỏ qua phần cấp quyền';
end $$;
