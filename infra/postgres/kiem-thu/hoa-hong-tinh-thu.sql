-- Phép tính hoa hồng phân loại đúng từng trường hợp chưa.
--
-- Tám chốt chặn ở hoa-hong-thu-nguoc.sql trả lời câu "database có chặn sai
-- không". File này trả lời câu khác và khó hơn: "khi không có gì sai, nó có
-- tính RA ĐÚNG SỐ không".
--
-- Mỗi trường hợp là một lead dựng riêng với một tình huống cụ thể, và phép
-- thử đòi hàm marketing.hoa_hong_ung_vien phân loại đúng như mong đợi. Sai
-- một nhánh ở đây là trả sai tiền cho một người thật.
--
-- Chạy sau khi áp toàn bộ migration. Tự dọn ở cuối.

\set ON_ERROR_STOP on
\pset pager off

create temp table kq (stt int, ten text, dat boolean, chi_tiet text);

do $thu$
declare
  ky text := '2099-06';
  d0 date := '2099-06-10';   -- mốc lịch hẹn dùng chung
  r record;
  n int;


begin
  -- Hồ sơ PG thử: một người có khai báo SUP, một người không.
  insert into app.records (entity_type, record_key, payload) values
    ('profiles', 'p-thu-1', jsonb_build_object('id','p-thu-1','employee_code','PGT-01',
      'full_name','PG Thử Có Sup','role','pg_staff','active',true,
      'parent_support_code','SUPT-01')),
    ('profiles', 'p-thu-2', jsonb_build_object('id','p-thu-2','employee_code','PGT-02',
      'full_name','PG Thử Không Sup','role','pg_staff','active',true)),
    ('profiles', 'p-thu-3', jsonb_build_object('id','p-thu-3','employee_code','SUPT-01',
      'full_name','Sup Thử','role','support_marketing','active',true));

  -- ── Dựng các tình huống ───────────────────────────────────────────────
  -- Mã khách mang luôn kết quả mong đợi để đọc bảng là hiểu ngay.
  insert into marketing.leads
    (customer_name, phone, data_class, net_level, created_by_pg_code,
     appointment_at, pg_arrival_date, pg_arrival_confirmed_at, pg_commission_status)
  values
    -- DVCB đến đúng hạn: 5 ngày sau lịch hẹn, trần 10 → tính
    ('T1 DVCB trong han', '0901000001', 'net', 'basic',    'PGT-01',
     d0, d0 + 5,  (d0 + 5)::timestamptz, 'eligible'),
    -- DVCB đến ngày thứ 10: đúng bằng trần → vẫn tính
    ('T2 DVCB dung tran', '0901000002', 'net', 'basic',    'PGT-01',
     d0, d0 + 10, (d0 + 5)::timestamptz, 'eligible'),
    -- DVCB đến ngày thứ 11: quá trần → KHÔNG tính
    ('T3 DVCB qua han',   '0901000003', 'net', 'basic',    'PGT-01',
     d0, d0 + 11, (d0 + 5)::timestamptz, 'eligible'),
    -- DVCS đến ngày thứ 14: đúng bằng trần → tính
    ('T4 DVCS dung tran', '0901000004', 'net', 'advanced', 'PGT-01',
     d0, d0 + 14, (d0 + 5)::timestamptz, 'eligible'),
    -- DVCS đến ngày thứ 15: quá trần → KHÔNG tính
    ('T5 DVCS qua han',   '0901000005', 'net', 'advanced', 'PGT-01',
     d0, d0 + 15, (d0 + 5)::timestamptz, 'eligible'),
    -- PG không khai báo SUP → vẫn tính, nhưng SUP phải là suy ra
    ('T6 PG khong khai sup', '0901000006', 'net', 'basic', 'PGT-02',
     d0, d0 + 3,  (d0 + 5)::timestamptz, 'eligible'),
    -- Đến TRƯỚC ngày hẹn → số ngày âm, phải bị đánh dấu
    ('T7 den truoc ngay hen', '0901000007', 'net', 'basic', 'PGT-01',
     d0, d0 - 2,  (d0 + 5)::timestamptz, 'eligible'),
    -- Chưa xác nhận đủ điều kiện → không được vào danh sách
    ('T8 chua du dieu kien', '0901000008', 'net', 'basic', 'PGT-01',
     d0, d0 + 2,  (d0 + 5)::timestamptz, 'pending_confirmation'),
    -- Data thô → không sinh hoa hồng dù đã đến
    ('T9 data tho', '0901000009', 'raw', null, 'PGT-01',
     d0, d0 + 2,  (d0 + 5)::timestamptz, 'eligible');

  -- ── Kiểm từng trường hợp ──────────────────────────────────────────────
  create temp table uv on commit drop as
    select * from marketing.hoa_hong_ung_vien(ky);

  select count(*) into n from uv where customer_name like 'T1%' and trong_han
     and loai = 'DVCB' and don_gia_pg = 7000 and don_gia_sup = 3000 and so_ngay_cho = 5;
  insert into kq values (1, 'DVCB đến sau 5 ngày · tính, đúng đơn giá 7.000/3.000', n = 1, null);

  select count(*) into n from uv where customer_name like 'T2%' and trong_han and so_ngay_cho = 10;
  insert into kq values (2, 'DVCB đúng ngày thứ 10 · vẫn tính, biên là bao gồm', n = 1, null);

  select count(*) into n from uv where customer_name like 'T3%' and not trong_han and so_ngay_cho = 11;
  insert into kq values (3, 'DVCB ngày thứ 11 · bị loại', n = 1, null);

  select count(*) into n from uv where customer_name like 'T4%' and trong_han
     and loai = 'DVCS' and don_gia_pg = 210000 and don_gia_sup = 90000 and so_ngay_cho = 14;
  insert into kq values (4, 'DVCS đúng ngày thứ 14 · tính, đúng đơn giá 210.000/90.000', n = 1, null);

  select count(*) into n from uv where customer_name like 'T5%' and not trong_han;
  insert into kq values (5, 'DVCS ngày thứ 15 · bị loại', n = 1, null);

  select count(*) into n from uv where customer_name like 'T6%'
     and trong_han and sup_ma = 'SUPT-01' and sup_nguon = 'suy_ra_duy_nhat';
  insert into kq values (6, 'PG không khai SUP · suy ra được và ghi rõ là suy ra', n = 1, null);

  select count(*) into n from uv where customer_name like 'T1%'
     and sup_ma = 'SUPT-01' and sup_nguon = 'khai_bao';
  insert into kq values (7, 'PG có khai SUP · lấy theo khai báo, không phải suy ra', n = 1, null);

  select count(*) into n from uv where customer_name like 'T7%' and den_truoc_ngay_hen and so_ngay_cho < 0;
  insert into kq values (8, 'Khách đến trước ngày hẹn · bị đánh dấu để người duyệt xem lại', n = 1, null);

  select count(*) into n from uv where customer_name like 'T8%';
  insert into kq values (9, 'Chưa xác nhận đủ điều kiện · không vào danh sách', n = 0, null);

  select count(*) into n from uv where customer_name like 'T9%';
  insert into kq values (10, 'Data thô · không sinh hoa hồng', n = 0, null);

  -- Ngày khách đến do SUP nhập phải được ưu tiên hơn thời điểm bấm xác nhận.
  select count(*) into n from uv where customer_name like 'T1%' and ngay_den_nguon = 'arrival_date';
  insert into kq values (11, 'Có ngày khách đến · dùng nó, không dùng lúc bấm xác nhận', n = 1, null);

  -- Bỏ ngày khách đến đi thì phải lùi về thời điểm bấm, và ghi rõ đã lùi.
  --
  -- Thời điểm bấm phải nằm trong kỳ, nếu không thì lead rớt khỏi kỳ và phép
  -- thử đo nhầm thứ khác. Lần chạy đầu tôi để now() và nó rớt đúng như vậy —
  -- mã đúng, phép thử sai.
  update marketing.leads set pg_arrival_date = null where customer_name like 'T1%';
  select count(*) into n from marketing.hoa_hong_ung_vien(ky)
   where customer_name like 'T1%' and ngay_den_nguon = 'xac_nhan';
  insert into kq values (12, 'Không có ngày khách đến · lùi về lúc bấm và ghi rõ', n = 1, null);

  -- ── dọn ───────────────────────────────────────────────────────────────
  delete from marketing.leads where customer_name like 'T_ %' or customer_name ~ '^T[0-9]+ ';
  delete from app.records where entity_type = 'profiles'
     and record_key in ('p-thu-1','p-thu-2','p-thu-3');
exception when others then
  insert into kq values (99, 'Phép thử tự nó hỏng: ' || sqlerrm, false, null);
end
$thu$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo ' PHÉP TÍNH HOA HỒNG PHÂN LOẠI ĐÚNG CHƯA'
\echo '════════════════════════════════════════════════════════════════'

select lpad(stt::text, 2) as "#",
       case when dat then 'ĐẠT' else 'HỎNG' end as "kết quả",
       ten as "trường hợp"
  from kq order by stt;

do $$
declare n int;
begin
  select count(*) into n from kq where not dat;
  if n > 0 then raise exception 'HONG: % trường hợp tính hoa hồng ra sai', n; end if;
  raise notice 'Cả % trường hợp đều phân loại đúng', (select count(*) from kq);
end $$;

drop table kq;
