-- ═══════════════════════════════════════════════════════════════════════════
-- MẪU SỔ GỐC MỚI · NHẬT KÝ CHUNG CÓ KHOẢN MỤC CHI PHÍ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Kế toán đã đổi bản kết xuất nhật ký chung sang bản có thêm năm cột:
--
--   Ngày hóa đơn      ngày trên tờ hóa đơn, khác ngày hạch toán
--   Mã KMCP           mã khoản mục chi phí
--   Tên KMCP          tên khoản mục, giữ lại để đối chiếu với danh mục
--   Hợp đồng mua      số hợp đồng đầu vào
--   Hợp đồng bán      số hợp đồng đầu ra
--
-- Từ đây bản này là SỔ GỐC. Trình nhập lấy nó làm mẫu chuẩn.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUY TẮC TỔNG HỢP CHI PHÍ THEO KHOẢN MỤC
-- ───────────────────────────────────────────────────────────────────────────
-- Đối chiếu hai file ngày 27/08/2026 cho ra một quy tắc, và quy tắc này không
-- hiển nhiên nên phải ghi lại:
--
--   Khoản mục MK trong nhật ký mang tổng phát sinh Nợ 277.037.990 trên mọi
--   tài khoản, nhưng Tong_hop_chi_phi_theo_khoan_muc_chi_phi.xlsx ghi
--   243.344.990. Chênh 33.693.000 nằm ở TK 3311.
--
--   243.344.990 đúng bằng phần phát sinh Nợ trên TK 6416.
--
-- Nghĩa là: tổng hợp chi phí theo khoản mục chỉ cộng phát sinh Nợ của TÀI
-- KHOẢN CHI PHÍ. Mã khoản mục gắn trên tài khoản công nợ hay tài khoản tiền
-- là để truy vết dòng tiền, không phải để cộng vào chi phí. Cộng cả hai là
-- tính một khoản chi hai lần.
--
-- Hệ quả nhìn thấy được: bốn khoản mục TN.LVT, TN.PVC, DN.LVT, VP.LVT có mặt
-- trong nhật ký nhưng vắng trong file tổng hợp, vì chúng chỉ được gắn ở TK
-- 3311 chứ không có dòng 6xx nào. Đó là dữ liệu gắn thiếu, và bảng đối chiếu
-- ở phần báo cáo sẽ chỉ ra từng dòng.
--
-- An toàn khi chạy lại nhiều lần.

begin;

alter table finance.journal_lines add column if not exists invoice_date  date;
alter table finance.journal_lines add column if not exists contract_buy  text;
alter table finance.journal_lines add column if not exists contract_sell text;

comment on column finance.journal_lines.invoice_date is
  'Ngày trên tờ hóa đơn. Khác ngày hạch toán khi hóa đơn về muộn.';
comment on column finance.journal_lines.contract_buy is 'Số hợp đồng đầu vào.';
comment on column finance.journal_lines.contract_sell is 'Số hợp đồng đầu ra.';

create index if not exists jl_khoan_muc_idx on finance.journal_lines(cost_item_code)
  where cost_item_code is not null;

-- Khoản mục xuất hiện trong nhật ký mà chưa có trong danh mục thì vẫn phải
-- nhận, nếu không một mã lạ sẽ chặn cả lô 77 nghìn bút toán. Nhưng phải đánh
-- dấu để kế toán biết cái nào do máy tự tạo mà bổ sung tên cho đúng.
alter table finance.cost_items add column if not exists auto_created boolean not null default false;
comment on column finance.cost_items.auto_created is
  'true nghĩa là mã này gặp trong nhật ký nhưng chưa có trong danh mục, máy '
  'tự tạo để không chặn lô nhập. Kế toán nên rà lại tên và chi nhánh.';


-- ───────────────────────────────────────────────────────────────────────────
-- TỔNG HỢP CHI PHÍ THEO KHOẢN MỤC
-- ───────────────────────────────────────────────────────────────────────────

create or replace view finance.v_chi_phi_theo_khoan_muc as
select v.period_code,
       l.cost_item_code,
       coalesce(c.name, l.cost_item_code) as cost_item_name,
       c.branch_code,
       -- Chỉ tài khoản chi phí. Xem phần giải thích ở đầu file.
       sum(l.debit) filter (where l.account_code similar to '(6|8)%')  as chi_phi,
       sum(l.debit) filter (where l.account_code not similar to '(6|8)%') as no_khac,
       sum(l.credit)                                                   as phat_sinh_co,
       count(*)                                                        as so_dong,
       count(*) filter (where l.account_code similar to '(6|8)%')      as so_dong_chi_phi
from finance.journal_lines l
join finance.vouchers v on v.id = l.voucher_id
left join finance.cost_items c on c.code = l.cost_item_code
where l.cost_item_code is not null
group by v.period_code, l.cost_item_code, c.name, c.branch_code;

comment on view finance.v_chi_phi_theo_khoan_muc is
  'chi_phi là con số khớp với Tong_hop_chi_phi_theo_khoan_muc_chi_phi.xlsx. '
  'no_khac là phần gắn mã khoản mục trên tài khoản không phải chi phí, giữ '
  'riêng để soát chứ không cộng vào.';

-- Khoản mục gắn thiếu: có mặt trong nhật ký nhưng không dòng nào rơi vào tài
-- khoản chi phí, nên nó không bao giờ xuất hiện trên báo cáo chi phí.
create or replace view finance.v_khoan_muc_gan_thieu as
select l.cost_item_code,
       coalesce(c.name, l.cost_item_code) as cost_item_name,
       count(*)                     as so_dong,
       sum(l.debit)                 as tong_no,
       string_agg(distinct l.account_code, ', ' order by l.account_code) as cac_tai_khoan
from finance.journal_lines l
left join finance.cost_items c on c.code = l.cost_item_code
where l.cost_item_code is not null
group by l.cost_item_code, c.name
having count(*) filter (where l.account_code similar to '(6|8)%') = 0;

comment on view finance.v_khoan_muc_gan_thieu is
  'Mã khoản mục chỉ được gắn ở tài khoản công nợ hoặc tài khoản tiền, không '
  'gắn ở tài khoản chi phí. Chi phí đó sẽ không lên báo cáo theo khoản mục.';

grant select on finance.v_chi_phi_theo_khoan_muc,
                finance.v_khoan_muc_gan_thieu to finance_app;

commit;
