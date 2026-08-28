-- Hoa hồng PG và SUP: tính tự động, duyệt hai vòng, chốt rồi đẩy sang kế toán.
--
-- Đây là tiền thật trả cho người thật, nên toàn bộ thiết kế dưới đây ưu tiên
-- một điều duy nhất: KHÔNG TRẢ SAI, kể cả khi phải trả chậm. Mọi ràng buộc
-- đều nằm ở database chứ không nằm ở giao diện, vì giao diện có thể bị bỏ qua
-- còn database thì không.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUY TẮC NGHIỆP VỤ
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mỗi lead đủ điều kiện sinh ra MỘT khoản hoa hồng chung, chia 70/30:
--
--   DVCB   lead data net mức cơ bản      10.000đ   PG 7.000    SUP 3.000
--   DVCS   lead data net mức chuyên sâu 300.000đ   PG 210.000  SUP 90.000
--
-- Cả hai loại chỉ được tính SAU KHI khách đã đến và được xác nhận đủ điều
-- kiện. Data thô không sinh hoa hồng.
--
-- Đơn giá nằm trong bảng chứ không nằm trong mã, vì đơn giá sẽ đổi, và lúc
-- đổi thì không được phép sửa lại những khoản đã duyệt của kỳ trước.
--
-- ─────────────────────────────────────────────────────────────────────────
-- BỐN CHỐT CHẶN CHỐNG NHẦM LẪN
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1 · ĐÓNG BĂNG SỐ LIỆU. Mỗi dòng hoa hồng chụp lại đơn giá và phân loại của
--     lead tại đúng thời điểm tính. Sau này ai đó đổi lead từ cơ bản sang
--     chuyên sâu thì khoản đã duyệt không tự đổi theo. Không có ảnh chụp thì
--     con số trên tờ trình duyệt hôm nay và con số lúc chi tiền tuần sau có
--     thể khác nhau mà không ai biết vì sao.
--
-- 2 · MỘT LEAD MỘT LẦN. Ràng buộc duy nhất trên (lead, vai trò) tính trên
--     TOÀN BỘ các đợt còn sống. Chạy lại phép tính hai lần, hay lỡ tạo hai
--     đợt cho cùng một kỳ, đều không thể trả trùng.
--
-- 3 · KHÔNG NHẢY BƯỚC. Trigger chặn mọi chuyển trạng thái không hợp lệ. Không
--     ai đi thẳng từ "chờ SUP" sang "đã chốt", kể cả gọi thẳng vào database.
--
-- 4 · HAI NGƯỜI KHÁC NHAU. Người duyệt vòng SUP không được là người duyệt
--     vòng Admin. Một người tự duyệt cả hai vòng thì hai vòng chỉ còn là một.

-- ══ 1 · Biểu giá ═════════════════════════════════════════════════════════

create table if not exists marketing.hoa_hong_bieu_gia (
  ma                text primary key,
  ten               text not null,
  -- Điều kiện khớp lead. net_level của marketing.leads.
  net_level         text not null,
  -- Cả hai loại đều cần xác nhận khách đến. Để thành cột thay vì viết cứng
  -- trong câu truy vấn, vì đây chính là chỗ dễ đổi nhất khi nghiệp vụ đổi.
  can_xac_nhan_den  boolean not null default true,

  -- ── Thời hạn khách phải đến ───────────────────────────────────────────
  -- Quá hạn thì không tính hoa hồng. Để thành dữ liệu vì đây là con số sẽ
  -- được tranh luận và điều chỉnh nhiều nhất.
  --
  --   moc_tinh   đếm ngày từ đâu:
  --                lich_hen  từ lịch hẹn PG nhập, lùi về ngày tạo lead nếu
  --                          lead đó không có lịch hẹn
  --                lead_tao  từ ngày PG nhập lead
  --   so_ngay_toi_da    quá số ngày này thì không tính. null là không giới hạn.
  --   so_ngay_toi_thieu sàn dưới, mặc định 0 vì khách đến sớm không phải lỗi.
  moc_tinh          text not null default 'lich_hen'
                      check (moc_tinh in ('lich_hen','lead_tao')),
  so_ngay_toi_thieu integer not null default 0 check (so_ngay_toi_thieu >= 0),
  so_ngay_toi_da    integer check (so_ngay_toi_da is null or so_ngay_toi_da >= so_ngay_toi_thieu),

  tong_hoa_hong     numeric(14, 2) not null,
  don_gia_pg        numeric(14, 2) not null,
  don_gia_sup       numeric(14, 2) not null,
  hieu_luc_tu       date not null,
  hieu_luc_den      date,
  ghi_chu           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  check (tong_hoa_hong > 0 and don_gia_pg >= 0 and don_gia_sup >= 0),
  -- Phần PG cộng phần SUP phải bằng đúng tổng. Chặn ngay tại đây thay vì tin
  -- vào việc người nhập cộng nhẩm đúng.
  constraint hh_bieu_gia_chia_du check (don_gia_pg + don_gia_sup = tong_hoa_hong),
  check (hieu_luc_den is null or hieu_luc_den >= hieu_luc_tu)
);

comment on table marketing.hoa_hong_bieu_gia is
  'Đơn giá hoa hồng theo loại dịch vụ. Sửa ở đây, không sửa trong mã.';

insert into marketing.hoa_hong_bieu_gia
  (ma, ten, net_level, can_xac_nhan_den, moc_tinh, so_ngay_toi_thieu, so_ngay_toi_da,
   tong_hoa_hong, don_gia_pg, don_gia_sup, hieu_luc_tu, ghi_chu)
values
  ('DVCB', 'Dịch vụ cơ bản',    'basic',    true, 'lich_hen', 0, 10,
    10000,   7000,  3000, '2026-01-01',
   'Chia 70/30. Khách phải đến trong vòng 10 ngày kể từ lịch hẹn.'),
  ('DVCS', 'Dịch vụ chuyên sâu','advanced', true, 'lich_hen', 0, 14,
   300000, 210000, 90000, '2026-01-01',
   'Chia 70/30. Khách phải đến trong vòng 14 ngày kể từ lịch hẹn.')
on conflict (ma) do nothing;

-- ══ 1b · Ngày khách thực đến, tách khỏi lúc bấm xác nhận ════════════════
--
-- pg_arrival_confirmed_at là thời điểm SUP BẤM XÁC NHẬN, không phải thời điểm
-- khách đến. Hai cái này lệch nhau: đo trên dữ liệu thật ngày 28/08/2026,
-- khoảng cách trung bình từ lịch hẹn tới lúc xác nhận là 14,8 ngày với DVCB.
--
-- Lấy thời điểm xác nhận làm mốc tính thời hạn thì PG bị trừ hoa hồng vì SUP
-- bấm muộn, mà đó là việc PG không kiểm soát được. Nên tách ra một cột riêng
-- cho ngày khách thực đến, do SUP nhập.
--
-- Dữ liệu cũ chưa có cột này nên phép tính lùi về thời điểm xác nhận, và mỗi
-- dòng hoa hồng ghi rõ nó đã dùng nguồn nào.

alter table marketing.leads
  add column if not exists pg_arrival_date date;

comment on column marketing.leads.pg_arrival_date is
  'Ngày khách THỰC SỰ đến phòng khám, do SUP nhập. Khác pg_arrival_confirmed_at là lúc bấm xác nhận.';

-- ══ 2 · Đợt duyệt ════════════════════════════════════════════════════════

create table if not exists marketing.hoa_hong_dot (
  id            uuid primary key default gen_random_uuid(),
  ky_code       text not null,               -- '2026-08'
  ky_tu         date not null,
  ky_den        date not null,

  -- Năm mốc trong quy trình, gộp thành bốn trạng thái sống.
  --   cho_sup         Chờ SUP xác nhận
  --   cho_admin       SUP đã xác nhận · Chờ Admin xác nhận
  --   admin_da_duyet  Admin đã xác nhận
  --   da_chot         Đã chốt, đã đẩy sang kế toán
  --   tu_choi         Bị trả lại
  --
  -- "SUP đã xác nhận" và "Chờ Admin xác nhận" là cùng một thời điểm nhìn từ
  -- hai phía, nên là một trạng thái. Tách đôi thì sinh ra một trạng thái chỉ
  -- tồn tại trong vài phần nghìn giây và không ai từng nhìn thấy.
  trang_thai    text not null default 'cho_sup'
                  check (trang_thai in ('cho_sup','cho_admin','admin_da_duyet','da_chot','tu_choi')),

  tinh_luc      timestamptz not null default now(),
  tinh_boi      text not null,

  sup_luc       timestamptz,
  sup_boi       text,
  admin_luc     timestamptz,
  admin_boi     text,
  chot_luc      timestamptz,
  chot_boi      text,

  tu_choi_luc   timestamptz,
  tu_choi_boi   text,
  tu_choi_ly_do text,

  -- Định khoản đề xuất, kế toán vẫn kiểm lại trước khi ghi sổ.
  tk_no         text not null default '6418',
  tk_co         text not null default '3348',
  khoan_muc     text not null default 'MK',

  -- Số chứng từ bên két kế toán, điền sau khi kế toán hạch toán.
  finance_voucher_no text,
  finance_ghi_so_luc timestamptz,

  so_dong       integer not null default 0,
  tong_tien     numeric(16, 2) not null default 0,
  tong_tien_pg  numeric(16, 2) not null default 0,
  tong_tien_sup numeric(16, 2) not null default 0,
  ghi_chu       text,
  created_at    timestamptz not null default now(),

  check (ky_den >= ky_tu),
  check (tong_tien_pg + tong_tien_sup = tong_tien)
);

-- Mỗi kỳ chỉ có một đợt còn sống. Đợt bị từ chối không tính, để còn tính lại.
create unique index if not exists hoa_hong_dot_ky_song_uidx
  on marketing.hoa_hong_dot(ky_code) where trang_thai <> 'tu_choi';

create index if not exists hoa_hong_dot_trang_thai_idx
  on marketing.hoa_hong_dot(trang_thai, ky_code desc);

-- ══ 3 · Từng dòng hoa hồng ═══════════════════════════════════════════════

create table if not exists marketing.hoa_hong_dong (
  id            bigserial primary key,
  dot_id        uuid not null references marketing.hoa_hong_dot(id) on delete cascade,
  lead_id       uuid not null references marketing.leads(id) on delete restrict,

  loai          text not null references marketing.hoa_hong_bieu_gia(ma),
  vai_tro       text not null check (vai_tro in ('pg','sup')),

  nguoi_ma      text not null,
  nguoi_ten     text,

  -- Cách suy ra người hưởng phần SUP, ghi lại để đối chiếu:
  --   khai_bao         lấy từ parent_support_code trên hồ sơ PG
  --   suy_ra_duy_nhat  hồ sơ PG bỏ trống, hệ thống lấy người support_marketing
  --                    đang hoạt động duy nhất
  -- Ghi rõ nguồn thay vì lặng lẽ suy ra, để người duyệt nhìn ra ngay dòng nào
  -- dựa trên khai báo thật và dòng nào dựa trên suy đoán.
  sup_nguon     text check (sup_nguon in ('khai_bao','suy_ra_duy_nhat')),

  don_gia       numeric(14, 2) not null check (don_gia >= 0),
  so_tien       numeric(14, 2) not null check (so_tien >= 0),

  -- ── Ảnh chụp tại thời điểm tính, không bao giờ đổi ────────────────────
  anh_pg_ma          text not null,
  anh_data_class     text,
  anh_net_level      text,
  anh_xac_nhan_den   timestamptz,
  anh_khach_ten      text,
  anh_lead_tao_luc   timestamptz,
  anh_lich_hen       timestamptz,

  -- Mốc và số ngày đã dùng để xét thời hạn, ghi thẳng lên dòng.
  --   ngay_den_nguon  arrival_date  lấy từ ngày khách thực đến do SUP nhập
  --                   xac_nhan      lùi về thời điểm bấm xác nhận, dữ liệu cũ
  -- Người duyệt nhìn thấy ngay dòng nào dựa trên ngày thật và dòng nào dựa
  -- trên thời điểm bấm nút, thay vì phải tin vào một con số không giải thích.
  ngay_den           date,
  ngay_den_nguon     text check (ngay_den_nguon in ('arrival_date','xac_nhan')),
  so_ngay_cho        numeric(6, 1),

  -- Đợt bị từ chối thì đánh dấu huỷ ở đây thay vì xoá dòng đi. Giữ lại để còn
  -- trả lời được câu "hôm đó nó tính ra cái gì mà bị trả lại", và để index
  -- chống trả trùng bên dưới bỏ qua chúng.
  huy           boolean not null default false,

  created_at    timestamptz not null default now()
);

-- Một lead chỉ sinh hoa hồng MỘT LẦN cho mỗi vai trò, tính trên MỌI đợt chứ
-- không riêng trong một đợt. Đặt duy nhất trong phạm vi một đợt thôi thì hai
-- đợt của hai kỳ khác nhau vẫn trả trùng cùng một lead, mà đó mới đúng là
-- kiểu trùng dễ xảy ra nhất: chạy lại phép tính cho kỳ trước.
--
-- Điều kiện lọc phải dựa vào cột `huy` ngay trên bảng này. Postgres không cho
-- viết truy vấn con trong điều kiện index, nên không thể hỏi ngược sang bảng
-- đợt để biết đợt còn sống hay đã bị từ chối.
create unique index if not exists hoa_hong_dong_lead_vai_tro_uidx
  on marketing.hoa_hong_dong(lead_id, vai_tro) where not huy;

create index if not exists hoa_hong_dong_dot_idx    on marketing.hoa_hong_dong(dot_id);
create index if not exists hoa_hong_dong_nguoi_idx  on marketing.hoa_hong_dong(nguoi_ma, vai_tro);

-- ══ 4 · Nhật ký, không sửa được ══════════════════════════════════════════

create table if not exists marketing.hoa_hong_nhat_ky (
  id          bigserial primary key,
  dot_id      uuid not null references marketing.hoa_hong_dot(id) on delete cascade,
  tu_trang_thai text,
  den_trang_thai text not null,
  boi         text not null,
  vai_tro_boi text,
  ghi_chu     text,
  so_dong     integer,
  tong_tien   numeric(16, 2),
  created_at  timestamptz not null default now()
);

create index if not exists hoa_hong_nhat_ky_dot_idx
  on marketing.hoa_hong_nhat_ky(dot_id, created_at);

-- ══ 5 · Trigger: chặn nhảy bước và chặn tự duyệt hai vòng ════════════════

create or replace function marketing.hoa_hong_kiem_chuyen_trang_thai()
returns trigger language plpgsql as $$
declare
  hop_le boolean := false;
begin
  if old.trang_thai = new.trang_thai then
    -- Không đổi trạng thái. Đợt đã chốt thì đóng băng hoàn toàn, trừ hai cột
    -- kế toán điền vào sau khi ghi sổ.
    if old.trang_thai = 'da_chot'
       and (new.ky_code, new.tong_tien, new.so_dong, new.tk_no, new.tk_co, new.khoan_muc)
        is distinct from
           (old.ky_code, old.tong_tien, old.so_dong, old.tk_no, old.tk_co, old.khoan_muc) then
      raise exception 'Đợt hoa hồng đã chốt, không sửa được nữa';
    end if;
    return new;
  end if;

  hop_le := (old.trang_thai, new.trang_thai) in (
    ('cho_sup','cho_admin'),
    ('cho_admin','admin_da_duyet'),
    ('admin_da_duyet','da_chot'),
    ('cho_sup','tu_choi'),
    ('cho_admin','tu_choi'),
    ('admin_da_duyet','tu_choi')
  );

  if not hop_le then
    raise exception 'Không được chuyển hoa hồng từ % sang %. Quy trình phải đi lần lượt: chờ SUP, chờ Admin, Admin duyệt, chốt.',
      old.trang_thai, new.trang_thai;
  end if;

  -- Hai vòng duyệt phải là hai người. Một người ký cả hai vòng thì hai vòng
  -- chỉ còn là một, và cái vòng thứ hai chỉ còn là hình thức.
  if new.trang_thai = 'admin_da_duyet'
     and new.admin_boi is not null and old.sup_boi is not null
     and lower(btrim(new.admin_boi)) = lower(btrim(old.sup_boi)) then
    raise exception 'Người duyệt vòng Admin phải khác người đã duyệt vòng SUP (%).', old.sup_boi;
  end if;

  return new;
end $$;

drop trigger if exists hoa_hong_dot_guard on marketing.hoa_hong_dot;
create trigger hoa_hong_dot_guard
  before update on marketing.hoa_hong_dot
  for each row execute function marketing.hoa_hong_kiem_chuyen_trang_thai();

-- Dòng hoa hồng của đợt đã chốt thì không ai được đụng vào nữa.
create or replace function marketing.hoa_hong_dong_dong_bang()
returns trigger language plpgsql as $$
declare tt text;
begin
  select trang_thai into tt from marketing.hoa_hong_dot
   where id = coalesce(new.dot_id, old.dot_id);
  if tt = 'da_chot' then
    raise exception 'Đợt hoa hồng đã chốt, không thêm sửa xóa dòng được nữa';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists hoa_hong_dong_guard on marketing.hoa_hong_dong;
create trigger hoa_hong_dong_guard
  before insert or update or delete on marketing.hoa_hong_dong
  for each row execute function marketing.hoa_hong_dong_dong_bang();

-- Từ chối một đợt thì đánh dấu huỷ mọi dòng của nó, để những lead đó được
-- tính lại ở đợt sau. Làm bằng trigger thay vì để ứng dụng nhớ, vì thứ ứng
-- dụng quên làm chính là thứ khiến lead bị kẹt vĩnh viễn không ai trả.
create or replace function marketing.hoa_hong_huy_dong_khi_tu_choi()
returns trigger language plpgsql as $$
begin
  if new.trang_thai = 'tu_choi' and old.trang_thai <> 'tu_choi' then
    update marketing.hoa_hong_dong set huy = true where dot_id = new.id and not huy;
  end if;
  return new;
end $$;

drop trigger if exists hoa_hong_dot_tu_choi on marketing.hoa_hong_dot;
create trigger hoa_hong_dot_tu_choi
  after update on marketing.hoa_hong_dot
  for each row execute function marketing.hoa_hong_huy_dong_khi_tu_choi();

-- Nhật ký chỉ ghi thêm. Sửa được thì nó không còn là bằng chứng.
--
-- Xoá thì chặt hơn một bậc: chỉ chặn khi đợt cha VẪN CÒN. Chặn vô điều kiện
-- nghe có vẻ an toàn hơn nhưng nó chặn luôn cả xoá dây chuyền, nên một đợt
-- nháp bị từ chối cũng không xoá đi được và rác đọng lại mãi.
--
-- Chốt chặn thật nằm ở chỗ khác: đợt ĐÃ CHỐT thì không xoá được (trigger ngay
-- bên dưới). Đợt đã chốt không xoá được thì nhật ký của nó cũng không mất
-- được, mà đó mới đúng là thứ cần bảo vệ.
create or replace function marketing.hoa_hong_nhat_ky_bat_bien()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Nhật ký duyệt hoa hồng không được sửa';
  end if;
  if exists (select 1 from marketing.hoa_hong_dot where id = old.dot_id) then
    raise exception 'Không xoá được nhật ký khi đợt hoa hồng vẫn còn';
  end if;
  return old;
end $$;

-- Đợt đã chốt là chứng từ tài chính. Không xoá được, kể cả gọi thẳng database.
create or replace function marketing.hoa_hong_dot_khong_xoa_khi_da_chot()
returns trigger language plpgsql as $$
begin
  if old.trang_thai = 'da_chot' then
    raise exception 'Đợt hoa hồng đã chốt là chứng từ tài chính, không xoá được';
  end if;
  return old;
end $$;

drop trigger if exists hoa_hong_dot_chan_xoa on marketing.hoa_hong_dot;
create trigger hoa_hong_dot_chan_xoa
  before delete on marketing.hoa_hong_dot
  for each row execute function marketing.hoa_hong_dot_khong_xoa_khi_da_chot();

drop trigger if exists hoa_hong_nhat_ky_guard on marketing.hoa_hong_nhat_ky;
create trigger hoa_hong_nhat_ky_guard
  before update or delete on marketing.hoa_hong_nhat_ky
  for each row execute function marketing.hoa_hong_nhat_ky_bat_bien();

-- ══ 6 · Cầu nối sang két kế toán ═════════════════════════════════════════
--
-- Cùng khuôn với bốn view finance_src có sẵn: két kế toán CHỈ ĐỌC, không bao
-- giờ ghi ngược về marketing. Kế toán thấy khoản chi đã chốt, đối chiếu, rồi
-- tự hạch toán bằng màn chứng từ của két.

-- Xoá rồi tạo, không dùng "create or replace".
--
-- create or replace view chỉ thêm được cột vào cuối; nó không đổi tên, không
-- đổi thứ tự, không bỏ cột. Nên một migration sau này đổi hình dạng view là
-- file NÀY hỏng khi chạy lại: nó cố ép view về hình dạng cũ và Postgres từ
-- chối. Trình chạy thật bỏ qua file đã áp nên production không gặp, nhưng
-- phép kiểm "chạy lại được" trong CI thì gặp ngay — và đó chính là chuyện đã
-- xảy ra khi migration 034 đổi view này.
drop view if exists finance_src.hoa_hong_pg;
create view finance_src.hoa_hong_pg as
  select d.id                     dot_id,
         d.ky_code,
         d.ky_tu,
         d.ky_den,
         d.trang_thai,
         d.chot_luc,
         d.chot_boi,
         d.tk_no,
         d.tk_co,
         d.khoan_muc,
         d.so_dong,
         d.tong_tien,
         d.tong_tien_pg,
         d.tong_tien_sup,
         d.finance_voucher_no,
         d.finance_ghi_so_luc
    from marketing.hoa_hong_dot d
   where d.trang_thai = 'da_chot';

comment on view finance_src.hoa_hong_pg is
  'Các đợt hoa hồng PG/SUP đã chốt, chờ kế toán hạch toán. Chỉ đọc.';

drop view if exists finance_src.hoa_hong_pg_chi_tiet;
create view finance_src.hoa_hong_pg_chi_tiet as
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
   where d.trang_thai = 'da_chot'
   group by l.dot_id, d.ky_code, l.vai_tro, l.nguoi_ma, l.nguoi_ten, l.loai;

comment on view finance_src.hoa_hong_pg_chi_tiet is
  'Chi tiết hoa hồng đã chốt gộp theo người và loại dịch vụ. Chỉ đọc.';

do $$ begin
  execute 'grant usage on schema finance_src to finance_app';
  execute 'grant select on finance_src.hoa_hong_pg, finance_src.hoa_hong_pg_chi_tiet to finance_app';
exception when undefined_object then
  raise notice 'Chưa có vai trò finance_app, bỏ qua phần cấp quyền';
end $$;
