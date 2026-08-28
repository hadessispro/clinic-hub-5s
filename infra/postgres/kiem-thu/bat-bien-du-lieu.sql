-- Bất biến kế toán trên DỮ LIỆU THẬT.
--
-- Khác với bat-bien.sql. File kia kiểm ràng buộc của LƯỢC ĐỒ: chèn thử một
-- dòng sai rồi xem database có chặn không. Nó chạy trên lược đồ trống và chỉ
-- chứng minh cái khóa còn hoạt động.
--
-- File này kiểm chính DỮ LIỆU đang nằm trong sổ. Nó bắt loại sai mà không có
-- ràng buộc nào chặn được, và cũng không làm sập cái gì cả — chỉ làm báo cáo
-- sai một cách lặng lẽ cho tới khi kế toán phát hiện lúc quyết toán. Đó là
-- loại tốn kém nhất, vì lúc phát hiện thì đã ba tháng trôi qua.
--
-- CHỈ ĐỌC. Không insert, không update, không delete, không tạo bảng thật.
-- Chạy được trên production bất cứ lúc nào mà không cần khóa gì.
--
-- Thoát khác 0 nếu có bất biến hỏng, nên dùng thẳng được trong CI.

\set ON_ERROR_STOP on
\pset pager off

create temp table ket_qua (
  stt      integer,
  ten      text,
  hong     bigint,
  chi_tiet text
);

do $ktr$
declare
  n  bigint;
  ct text;
begin

  ------------------------------------------------------------------ 1
  -- Toàn sổ phải cân. Đây là bất biến gốc của bút toán kép: mọi thứ khác đều
  -- có thể sai theo cách tinh vi, nhưng cái này sai thì sổ hỏng dứt khoát.
  select abs(coalesce(sum(debit), 0) - coalesce(sum(credit), 0)),
         format('Nợ %s · Có %s',
           to_char(coalesce(sum(debit), 0),  'FM999,999,999,999'),
           to_char(coalesce(sum(credit), 0), 'FM999,999,999,999'))
    into n, ct
    from finance.journal_lines;
  insert into ket_qua values (1, 'Toàn sổ cân Nợ = Có', n, ct);

  ------------------------------------------------------------------ 2
  -- Từng chứng từ phải cân. Toàn sổ cân mà chứng từ lẻ không cân là chuyện có
  -- thật: hai chứng từ lệch ngược chiều nhau thì tổng vẫn bằng 0. Lúc đó sổ
  -- cái đúng nhưng sổ chi tiết của hai tài khoản kia đều sai.
  select count(*), string_agg(vno, ', ') into n, ct from (
    select v.voucher_no || ' (' || v.posting_date || ')' as vno
      from finance.vouchers v
      join finance.journal_lines l on l.voucher_id = v.id
     group by v.id, v.voucher_no, v.posting_date
    having sum(l.debit) <> sum(l.credit)
     limit 20
  ) t;
  insert into ket_qua values (2, 'Từng chứng từ cân Nợ = Có', n, ct);

  ------------------------------------------------------------------ 3
  -- Tài khoản đối ứng không có khóa ngoại trong lược đồ, chỉ là text tự do.
  -- Nên gõ nhầm 6422 thành 64222 thì database nhận. Sổ cái vẫn đúng vì nó
  -- dùng account_code, nhưng Sổ chi tiết đối ứng thì mất hẳn dòng đó.
  select count(*), string_agg(distinct ma, ', ') into n, ct from (
    select l.contra_account_code as ma
      from finance.journal_lines l
     where l.contra_account_code is not null
       and btrim(l.contra_account_code) <> ''
       and not exists (select 1 from finance.accounts a
                        where a.code = l.contra_account_code)
     limit 50
  ) t;
  insert into ket_qua values (3, 'Tài khoản đối ứng đều có thật', n, ct);

  ------------------------------------------------------------------ 4
  -- Ngày chứng từ phải nằm trong kỳ mà nó được xếp vào. Không ràng buộc nào
  -- chặn: một chứng từ ngày 15/03 xếp vào kỳ 2026-01 thì mọi báo cáo theo kỳ
  -- đặt nó sai tháng, còn mọi báo cáo theo ngày lại đặt đúng. Hai báo cáo cùng
  -- một dữ liệu ra hai số khác nhau, và không ai biết cái nào đúng.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('%s ngày %s xếp vào kỳ %s',
             v.voucher_no, v.posting_date, v.period_code) as mo_ta
      from finance.vouchers v
      join finance.periods p on p.code = v.period_code
     where v.posting_date < p.start_date or v.posting_date > p.end_date
     limit 20
  ) t;
  insert into ket_qua values (4, 'Ngày chứng từ nằm trong kỳ của nó', n, ct);

  ------------------------------------------------------------------ 5
  -- Chứng từ không có dòng nào. Nhập dở rồi bỏ giữa chừng thì còn lại cái vỏ.
  -- Nó không làm lệch số nhưng làm sai mọi phép đếm chứng từ, và khi đối chiếu
  -- với bản Excel thì số lượng không khớp mà không rõ vì sao.
  select count(*), string_agg(voucher_no, ', ') into n, ct from (
    select v.voucher_no from finance.vouchers v
     where not exists (select 1 from finance.journal_lines l
                        where l.voucher_id = v.id)
     limit 20
  ) t;
  insert into ket_qua values (5, 'Không có chứng từ rỗng', n, ct);

  ------------------------------------------------------------------ 6
  -- Dòng không ghi vế nào. Ràng buộc chặn ghi CẢ HAI vế, nhưng không chặn ghi
  -- KHÔNG vế nào. Dòng 0/0 lọt qua và chiếm một số thứ tự trong sổ.
  select count(*) into n from finance.journal_lines
   where debit = 0 and credit = 0;
  insert into ket_qua values (6, 'Không có dòng trống cả hai vế', n, null);

  ------------------------------------------------------------------ 7
  -- Số thứ tự dòng phải duy nhất trong một chứng từ. Không có ràng buộc unique
  -- nào. Trùng số dòng thì thứ tự hiển thị trở nên tùy hứng, và đối chiếu ngược
  -- với dòng nào trong file Excel gốc thì chịu.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('%s dòng %s lặp %s lần',
             v.voucher_no, l.line_no, count(*)) as mo_ta
      from finance.journal_lines l
      join finance.vouchers v on v.id = l.voucher_id
     group by v.voucher_no, l.voucher_id, l.line_no
    having count(*) > 1
     limit 20
  ) t;
  insert into ket_qua values (7, 'Số dòng duy nhất trong mỗi chứng từ', n, ct);

  ------------------------------------------------------------------ 8
  -- Số dư đầu kỳ phải cân. Nếu lệch thì mọi Bảng cân đối phát sinh đều lệch
  -- đúng chừng đó, ở mọi kỳ, mãi mãi. Đây là loại sai nhân lên theo thời gian
  -- chứ không đứng yên.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('kỳ %s lệch %s', period_code,
             to_char(sum(debit) - sum(credit), 'FM999,999,999,999')) as mo_ta
      from finance.opening_balances
     group by period_code
    having sum(debit) <> sum(credit)
     limit 20
  ) t;
  insert into ket_qua values (8, 'Số dư đầu kỳ cân Nợ = Có', n, ct);

  ------------------------------------------------------------------ 9
  -- Kỳ đã khóa không được có chứng từ ghi thêm. Trigger chặn lúc ghi, nhưng
  -- nếu ai đó khóa kỳ SAU khi đã lỡ ghi thì dữ liệu cũ vẫn nằm đó. Phép thử
  -- này bắt tình trạng, còn trigger chỉ bắt hành động.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('%s trong kỳ %s (%s)', v.voucher_no, p.code, p.status) as mo_ta
      from finance.vouchers v
      join finance.periods p on p.code = v.period_code
     where p.status in ('closed', 'locked')
       and p.closed_at is not null
       and v.created_at > p.closed_at
     limit 20
  ) t;
  insert into ket_qua values (9, 'Không ghi thêm vào kỳ đã khóa', n, ct);

  ------------------------------------------------------------------ 10
  -- Kỳ không được chồng lấn nhau. Hai kỳ cùng chứa ngày 31/01 thì một chứng từ
  -- ngày đó thuộc về cả hai, và tổng cộng dồn cả năm đếm nó hai lần.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('%s và %s chồng nhau', a.code, b.code) as mo_ta
      from finance.periods a
      join finance.periods b
        on a.code < b.code
       and a.start_date <= b.end_date
       and b.start_date <= a.end_date
     limit 20
  ) t;
  insert into ket_qua values (10, 'Các kỳ kế toán không chồng lấn', n, ct);

  ------------------------------------------------------------------ 11
  -- Cây tài khoản không được có vòng lặp. Khóa ngoại lo được chuyện cha tồn
  -- tại, nhưng không lo được chuyện 642 khai cha là 6422 trong khi 6422 khai
  -- cha là 642. Gặp vòng đó thì báo cáo cộng dồn theo cấp tài khoản hoặc chạy
  -- mãi không dừng, hoặc bỏ sót nguyên một nhánh.
  select count(*), string_agg(code, ', ') into n, ct from (
    with recursive di as (
      select code, parent_code, 1 as buoc, code as goc
        from finance.accounts where parent_code is not null
      union all
      select d.code, a.parent_code, d.buoc + 1, d.goc
        from di d join finance.accounts a on a.code = d.parent_code
       where d.buoc < 12 and a.parent_code is not null
    )
    select distinct goc as code from di where parent_code = goc
     limit 20
  ) t;
  insert into ket_qua values (11, 'Cây tài khoản không có vòng lặp', n, ct);

  ------------------------------------------------------------------ 12
  -- Độ sâu khai báo phải khớp với độ sâu thật trong cây. Báo cáo dùng cột depth
  -- để thụt lề và để biết dòng nào là dòng tổng. Khai sai thì một tài khoản con
  -- bị cộng vào như thể nó là tài khoản cha, và số tổng gấp đôi số thật.
  select count(*), string_agg(mo_ta, ' · ') into n, ct from (
    select format('%s khai depth %s, cha %s khai %s',
             a.code, a.depth, p.code, p.depth) as mo_ta
      from finance.accounts a
      join finance.accounts p on p.code = a.parent_code
     where a.depth <> p.depth + 1
     limit 20
  ) t;
  insert into ket_qua values (12, 'Độ sâu tài khoản khớp với cây', n, ct);

end
$ktr$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo ' BẤT BIẾN KẾ TOÁN TRÊN DỮ LIỆU'
\echo '════════════════════════════════════════════════════════════════'

select
  lpad(stt::text, 2)                             as "#",
  case when hong = 0 then 'OK' else 'HỎNG' end   as "kết quả",
  ten                                            as "bất biến",
  case when hong = 0 then '' else hong::text end as "ca sai",
  coalesce(left(chi_tiet, 88), '')               as "chi tiết"
from ket_qua order by stt;

-- Một dòng máy đọc được, để workflow so với mức nợ đã ghi nhận mà không phải
-- bóc tách cái bảng ở trên. Bóc tách bảng là cách dễ nhầm nhất: chỉ cần đổi độ
-- rộng một cột là hỏng.
\pset tuples_only on
\pset format unaligned
select '<!-- MAY-DOC bat-bien ' ||
       string_agg(stt || '=' || hong, ' ' order by stt) || ' -->'
  from ket_qua;
\pset tuples_only off
\pset format aligned

-- Thoát khác 0 nếu có cái nào hỏng. ON_ERROR_STOP biến exception thành mã
-- thoát 3, đủ để CI và script shell nhận ra.
do $$
declare s bigint;
begin
  select count(*) into s from ket_qua where hong > 0;
  if s > 0 then
    raise exception 'HONG: % bất biến dữ liệu bị vi phạm', s;
  end if;
  raise notice 'Cả % bất biến dữ liệu đều đạt', (select count(*) from ket_qua);
end $$;

drop table ket_qua;
