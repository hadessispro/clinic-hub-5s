-- Lương PG: tính tự động từ ca phân công và chấm công thật.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUY TẮC
-- ─────────────────────────────────────────────────────────────────────────
--
-- Đơn giá theo LOẠI ĐIỂM LÀM VIỆC, không phải một mức chung:
--
--   Siêu thị (Emart, Galaxy)              50.000đ/giờ   ca chuẩn 5 giờ = 250.000đ
--   Chợ, tuyến đường, công viên, trường    75.000đ/giờ   ca chuẩn 2 giờ = 150.000đ
--
-- Lương = tổng giờ làm THỰC TẾ × đơn giá. Giờ thực tế lấy từ khoảng cách
-- giữa lúc chấm vào và lúc chấm ra.
--
-- ─────────────────────────────────────────────────────────────────────────
-- MỘT ĐIỀU ĐO ĐƯỢC, CẦN NÓI RÕ
-- ─────────────────────────────────────────────────────────────────────────
--
-- Đo trên 27 ca đã hoàn tất ngày 28/08/2026, ba cách tính ra ba số:
--
--   theo ca phân công    137,53 giờ   6.876.667đ
--   theo giờ thực tế     127,81 giờ   6.390.324đ   ← đang dùng
--   theo giờ giao nhau   123,13 giờ   6.156.550đ
--
-- PG thường chấm vào sớm vài phút và chấm ra muộn vài phút, nên từng ca lẻ
-- thường nhiều hơn 5 giờ một chút. Nhưng tính trên cả kỳ thì giờ thực tế lại
-- THẤP hơn giờ phân công, vì vài ca bỏ dở kéo tổng xuống. Nói cách khác:
-- công thức này không hào phóng một cách hệ thống.
--
-- Cả ba cách đều để trong bảng biểu giá qua cột cach_tinh, đổi được mà không
-- phải sửa mã.

-- ══ 1 · Loại điểm làm việc và đơn giá ════════════════════════════════════

create table if not exists marketing.pg_bieu_gia (
  ma            text primary key,
  ten           text not null,
  don_gia_gio   numeric(14, 2) not null check (don_gia_gio > 0),
  so_gio_chuan  numeric(5, 2) not null check (so_gio_chuan > 0),
  -- Cách quy đổi giờ ra tiền:
  --   thuc_te    lấy đúng khoảng vào–ra
  --   giao_nhau  chỉ tính phần nằm trong ca phân công, không trả cho phút
  --              đến sớm hay ở lại muộn
  --   theo_ca    trả trọn ca miễn có chấm đủ vào và ra
  cach_tinh     text not null default 'thuc_te'
                  check (cach_tinh in ('thuc_te','giao_nhau','theo_ca')),
  -- Ca dài bất thường thì không tính tự động mà để người duyệt xem. Không
  -- chặn, chỉ đánh dấu.
  gio_toi_da    numeric(5, 2),
  ghi_chu       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table marketing.pg_bieu_gia is
  'Đơn giá lương PG theo loại điểm làm việc. Sửa ở đây, không sửa trong mã.';

insert into marketing.pg_bieu_gia (ma, ten, don_gia_gio, so_gio_chuan, gio_toi_da, ghi_chu) values
  ('sieu_thi',    'Siêu thị',       50000, 5, 10, 'Emart, Galaxy · ca chuẩn 5 giờ = 250.000đ'),
  ('cho',         'Chợ',            75000, 2,  6, 'Ca chuẩn 2 giờ = 150.000đ'),
  ('tuyen_duong', 'Tuyến đường',    75000, 2,  6, 'Ca chuẩn 2 giờ = 150.000đ'),
  ('cong_vien',   'Công viên',      75000, 2,  6, 'Ca chuẩn 2 giờ = 150.000đ'),
  ('truong_hoc',  'Trường học',     75000, 2,  6, 'Ca chuẩn 2 giờ = 150.000đ')
on conflict (ma) do nothing;

-- ══ 2 · Gắn loại vào từng điểm làm việc ══════════════════════════════════

alter table marketing.pg_work_sites
  add column if not exists loai text references marketing.pg_bieu_gia(ma);

comment on column marketing.pg_work_sites.loai is
  'Loại điểm làm việc, quyết định đơn giá lương PG. Trống thì không tính được lương.';

-- Đoán loại cho các điểm đang có, dựa vào tên. Chỉ điền vào chỗ đang trống,
-- và chỉ khi tên nói rõ — đoán mò một đơn giá là đoán mò tiền của người khác.
update marketing.pg_work_sites
   set loai = case
     when name ilike '%emart%' or name ilike '%galaxy%'
       or name ilike '%siêu thị%' or name ilike '%sieu thi%' then 'sieu_thi'
     when name ilike '%công viên%' or name ilike '%cong vien%' then 'cong_vien'
     when name ilike '%chợ%'  or name ilike '%cho %'          then 'cho'
     when name ilike '%trường%' or name ilike '%truong %'     then 'truong_hoc'
   end
 where loai is null
   and (name ilike '%emart%' or name ilike '%galaxy%' or name ilike '%siêu thị%'
        or name ilike '%sieu thi%' or name ilike '%công viên%' or name ilike '%cong vien%'
        or name ilike '%chợ%' or name ilike '%cho %' or name ilike '%trường%'
        or name ilike '%truong %');

-- ══ 3 · Ca chuẩn, để phân công cho nhanh và cho đúng ═════════════════════
--
-- Không dùng để tính lương — lương tính từ chấm công thật. Đây chỉ là danh
-- mục cho màn phân công, để người giao ca chọn thay vì gõ tay và gõ lệch.

create table if not exists marketing.pg_ca_chuan (
  ma          text primary key,
  loai_diem   text not null references marketing.pg_bieu_gia(ma),
  ten         text not null,
  gio_bat_dau time not null,
  gio_ket_thuc time not null,
  thu_tu      integer not null default 0,
  active      boolean not null default true,
  check (gio_ket_thuc > gio_bat_dau)
);

insert into marketing.pg_ca_chuan (ma, loai_diem, ten, gio_bat_dau, gio_ket_thuc, thu_tu) values
  ('emart-1',   'sieu_thi', 'Emart · Ca 1',   '07:30', '12:30', 1),
  ('emart-2',   'sieu_thi', 'Emart · Ca 2',   '12:30', '17:30', 2),
  ('emart-3',   'sieu_thi', 'Emart · Ca 3',   '17:00', '22:00', 3),
  ('galaxy-1',  'sieu_thi', 'Galaxy · Ca 1',  '12:00', '17:00', 4),
  ('galaxy-2',  'sieu_thi', 'Galaxy · Ca 2',  '17:00', '22:00', 5)
on conflict (ma) do nothing;

-- ══ 4 · Đợt lương theo kỳ ════════════════════════════════════════════════
--
-- Lương SUP KHÔNG nằm ở đây. Đây chỉ là lương PG tính theo giờ; phần của SUP
-- đi theo cách khác và không kê vào bảng này.

create table if not exists marketing.pg_luong_dot (
  id            uuid primary key default gen_random_uuid(),
  ky_code       text not null,
  ky_tu         date not null,
  ky_den        date not null,
  trang_thai    text not null default 'cho_sup'
                  check (trang_thai in ('cho_sup','da_chot','tu_choi')),
  tinh_luc      timestamptz not null default now(),
  tinh_boi      text not null,
  chot_luc      timestamptz,
  chot_boi      text,
  tu_choi_luc   timestamptz,
  tu_choi_boi   text,
  tu_choi_ly_do text,
  tk_no         text not null default '6418',
  tk_co         text not null default '3348',
  khoan_muc     text not null default 'MK',
  finance_voucher_no text,
  so_ca         integer not null default 0,
  so_nguoi      integer not null default 0,
  tong_gio      numeric(10, 2) not null default 0,
  tong_tien     numeric(16, 2) not null default 0,
  ghi_chu       text,
  created_at    timestamptz not null default now(),
  check (ky_den >= ky_tu)
);

create unique index if not exists pg_luong_dot_ky_song_uidx
  on marketing.pg_luong_dot(ky_code) where trang_thai <> 'tu_choi';

create table if not exists marketing.pg_luong_dong (
  id            bigserial primary key,
  dot_id        uuid not null references marketing.pg_luong_dot(id) on delete cascade,
  assignment_id uuid not null references marketing.pg_shift_assignments(id) on delete restrict,

  pg_ma         text not null,
  pg_ten        text,
  ngay          date not null,
  diem_ten      text,
  loai_diem     text,

  -- Ảnh chụp tại thời điểm tính, không bao giờ đổi
  ca_bat_dau    time,
  ca_ket_thuc   time,
  vao_luc       timestamptz,
  ra_luc        timestamptz,
  gio_phan_cong numeric(6, 2),
  gio_thuc_te   numeric(6, 2),
  gio_tinh_luong numeric(6, 2) not null default 0,
  cach_tinh     text,
  don_gia       numeric(14, 2) not null default 0,
  so_tien       numeric(14, 2) not null default 0,

  tinh_tien     boolean not null default true,
  ly_do_loai    text,
  canh_bao      text,
  huy           boolean not null default false,
  created_at    timestamptz not null default now(),

  check (tinh_tien or so_tien = 0),
  check (so_tien >= 0 and gio_tinh_luong >= 0)
);

-- Một ca chỉ được trả lương MỘT LẦN, tính trên mọi đợt còn sống. Cùng lý do
-- với hoa hồng: kiểu trùng dễ xảy ra nhất là tính lại kỳ cũ.
create unique index if not exists pg_luong_dong_ca_uidx
  on marketing.pg_luong_dong(assignment_id) where not huy and tinh_tien;

create index if not exists pg_luong_dong_dot_idx on marketing.pg_luong_dong(dot_id);
create index if not exists pg_luong_dong_pg_idx  on marketing.pg_luong_dong(pg_ma, ngay);

create table if not exists marketing.pg_luong_nhat_ky (
  id          bigserial primary key,
  dot_id      uuid not null references marketing.pg_luong_dot(id) on delete cascade,
  tu_trang_thai text,
  den_trang_thai text not null,
  boi         text not null,
  vai_tro_boi text,
  ghi_chu     text,
  so_ca       integer,
  tong_tien   numeric(16, 2),
  created_at  timestamptz not null default now()
);

-- ══ 5 · Chốt chặn ════════════════════════════════════════════════════════

create or replace function marketing.pg_luong_kiem_chuyen()
returns trigger language plpgsql as $$
begin
  if old.trang_thai = new.trang_thai then
    if old.trang_thai = 'da_chot'
       and (new.ky_code, new.tong_tien, new.so_ca) is distinct from (old.ky_code, old.tong_tien, old.so_ca) then
      raise exception 'Đợt lương đã chốt, không sửa được nữa';
    end if;
    return new;
  end if;
  if (old.trang_thai, new.trang_thai) not in
     (('cho_sup','da_chot'), ('cho_sup','tu_choi'), ('da_chot','tu_choi')) then
    raise exception 'Không được chuyển lương PG từ % sang %', old.trang_thai, new.trang_thai;
  end if;
  return new;
end $$;

drop trigger if exists pg_luong_dot_guard on marketing.pg_luong_dot;
create trigger pg_luong_dot_guard before update on marketing.pg_luong_dot
  for each row execute function marketing.pg_luong_kiem_chuyen();

create or replace function marketing.pg_luong_dong_dong_bang()
returns trigger language plpgsql as $$
declare tt text;
begin
  select trang_thai into tt from marketing.pg_luong_dot where id = coalesce(new.dot_id, old.dot_id);
  if tt = 'da_chot' then
    raise exception 'Đợt lương đã chốt, không thêm sửa xóa dòng được nữa';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists pg_luong_dong_guard on marketing.pg_luong_dong;
create trigger pg_luong_dong_guard
  before insert or update or delete on marketing.pg_luong_dong
  for each row execute function marketing.pg_luong_dong_dong_bang();

create or replace function marketing.pg_luong_huy_khi_tu_choi()
returns trigger language plpgsql as $$
begin
  if new.trang_thai = 'tu_choi' and old.trang_thai <> 'tu_choi' then
    update marketing.pg_luong_dong set huy = true where dot_id = new.id and not huy;
  end if;
  return new;
end $$;

drop trigger if exists pg_luong_dot_tu_choi on marketing.pg_luong_dot;
create trigger pg_luong_dot_tu_choi after update on marketing.pg_luong_dot
  for each row execute function marketing.pg_luong_huy_khi_tu_choi();

create or replace function marketing.pg_luong_nhat_ky_bat_bien()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Nhật ký lương PG không được sửa'; end if;
  if exists (select 1 from marketing.pg_luong_dot where id = old.dot_id) then
    raise exception 'Không xoá được nhật ký khi đợt lương vẫn còn';
  end if;
  return old;
end $$;

drop trigger if exists pg_luong_nhat_ky_guard on marketing.pg_luong_nhat_ky;
create trigger pg_luong_nhat_ky_guard
  before update or delete on marketing.pg_luong_nhat_ky
  for each row execute function marketing.pg_luong_nhat_ky_bat_bien();
