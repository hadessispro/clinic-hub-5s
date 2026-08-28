'use strict';
/**
 * Truy vấn nghiệp vụ kế toán.
 *
 * Mọi câu lệnh ở đây đều tham số hóa. Không nối chuỗi giá trị người dùng vào
 * SQL, kể cả cột sắp xếp: cột sắp xếp lấy từ danh sách trắng.
 *
 * Số tiền trả về dạng chuỗi, không qua Number của JavaScript. numeric(18,2)
 * vượt dải an toàn của số dấu phẩy động: tổng phát sinh của bộ sổ hiện tại là
 * 99.834.075.425 đồng, cộng dồn bằng float sẽ lệch dần từng đồng và người kế
 * toán mất cả buổi chiều đi tìm chỗ lệch đó.
 */
const { rows, one } = require('./db');

/* ── Tổng quan ─────────────────────────────────────────────────────────── */

async function overview(periodCode) {
  const [balance, unbalanced, counts, byPeriod] = await Promise.all([
    one(
      `select coalesce(sum(total_debit), 0)::text  as tong_no,
              coalesce(sum(total_credit), 0)::text as tong_co,
              coalesce(sum(diff), 0)::text         as lech
       from finance.v_period_balance
       where ($1::text is null or period_code = $1)`,
      [periodCode || null],
    ),
    one(
      `select count(*)::int as so_chung_tu_lech
       from finance.v_unbalanced
       where ($1::text is null or period_code = $1)`,
      [periodCode || null],
    ),
    one(
      `select (select count(*) from finance.vouchers
                where ($1::text is null or period_code = $1))::int as so_chung_tu,
              (select count(*) from finance.journal_lines l
                join finance.vouchers v on v.id = l.voucher_id
                where ($1::text is null or v.period_code = $1))::int as so_but_toan,
              (select count(*) from finance.accounts where is_active)::int as so_tai_khoan,
              (select count(*) from finance.partners where is_active)::int as so_doi_tac`,
      [periodCode || null],
    ),
    rows(
      `select period_code, total_debit::text, total_credit::text, diff::text,
              voucher_count, line_count
       from finance.v_period_balance order by period_code`,
    ),
  ]);
  return { ...balance, ...unbalanced, ...counts, cac_ky: byPeriod };
}

/* ── Sổ nhật ký chung ──────────────────────────────────────────────────── */

const JOURNAL_SORTS = {
  ngay: 'v.posting_date',
  ngay_chung_tu: 'v.voucher_date',
  ngay_hoa_don: 'l.invoice_date',
  so_chung_tu: 'v.voucher_no',
  so_hoa_don: 'v.invoice_no',
  tai_khoan: 'l.account_code',
  doi_ung: 'l.contra_account_code',
  doi_tac: 'l.partner_code',
  khoan_muc: 'l.cost_item_code',
  no: 'l.debit',
  co: 'l.credit',
};

const JOURNAL_WHERE = `
    where ($1::text is null or v.period_code = $1)
      and ($2::text is null or l.account_code like $2 || '%')
      and ($3::text is null or l.partner_code = $3)
      and ($4::date is null or v.posting_date >= $4)
      and ($5::date is null or v.posting_date <= $5)
      and ($6::text is null or v.voucher_no ilike '%' || $6 || '%'
                            or l.description ilike '%' || $6 || '%')
      and ($7::boolean is null or l.is_deductible = $7)
      and ($8::text is null or l.cost_item_code = $8)`;

async function journal(f = {}) {
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 500);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const sortCol = JOURNAL_SORTS[f.sort] || JOURNAL_SORTS.ngay;
  const dir = String(f.dir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const args = [
    f.period || null, f.account || null, f.partner || null,
    f.from || null, f.to || null, f.q || null,
    f.deductible === undefined ? null : f.deductible,
    f.costItem || null,
  ];

  const [data, total] = await Promise.all([
    rows(
      // Trả về đúng và đủ 17 cột của Sổ nhật ký chung bản Excel, cùng thứ tự.
      // Kế toán đọc sổ này hằng ngày và đã thuộc vị trí từng cột; đổi thứ tự
      // hay bỏ bớt cột là bắt họ dò lại từ đầu mỗi lần mở.
      `select l.id::text, v.id::text as voucher_id, l.line_no,
              v.posting_date, v.voucher_date, v.voucher_no,
              l.invoice_date, v.invoice_no, l.description,
              l.account_code, a.name as account_name,
              l.contra_account_code, ac.name as contra_account_name,
              l.debit::text, l.credit::text,
              l.partner_code, p.name as partner_name,
              l.cost_item_code, ci.name as cost_item_name,
              l.contract_buy, l.contract_sell,
              l.is_deductible, v.voucher_type, v.period_code
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       left join finance.accounts a on a.code = l.account_code
       left join finance.accounts ac on ac.code = l.contra_account_code
       left join finance.partners p on p.code = l.partner_code
       left join finance.cost_items ci on ci.code = l.cost_item_code
       ${JOURNAL_WHERE}
       order by ${sortCol} ${dir}, l.id ${dir}
       limit ${limit} offset ${offset}`,
      args,
    ),
    one(
      `select count(*)::int as tong,
              coalesce(sum(l.debit), 0)::text  as tong_no,
              coalesce(sum(l.credit), 0)::text as tong_co
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       ${JOURNAL_WHERE}`,
      args,
    ),
  ]);
  return { dong: data, ...total, limit, offset };
}

async function voucher(id) {
  const head = await one(
    `select v.id::text, v.voucher_no, v.posting_date, v.voucher_date,
            v.voucher_type, v.invoice_no, v.description, v.period_code,
            v.balance_group, v.source_ref,
            b.total_debit::text, b.total_credit::text, b.diff::text
     from finance.vouchers v
     left join finance.v_voucher_balance b on b.id = v.id
     where v.id = $1`,
    [id],
  );
  if (!head) return null;
  head.dong = await rows(
    `select l.line_no, l.account_code, a.name as account_name,
            l.contra_account_code, l.debit::text, l.credit::text,
            l.partner_code, p.name as partner_name, l.cost_item_code,
            l.description, l.is_deductible, l.source_sheet, l.source_row
     from finance.journal_lines l
     left join finance.accounts a on a.code = l.account_code
     left join finance.partners p on p.code = l.partner_code
     where l.voucher_id = $1 order by l.line_no`,
    [id],
  );
  return head;
}

/* ── Bảng cân đối tài khoản ────────────────────────────────────────────── */

async function trialBalance(periodCode) {
  return rows(
    `select t.account_code, t.account_name, a.nature, a.depth,
            t.ps_debit::text, t.ps_credit::text,
            (t.ps_debit - t.ps_credit)::text as chenh_lech
     from finance.v_trial_balance t
     join finance.accounts a on a.code = t.account_code
     where ($1::text is null or t.period_code = $1)
     order by t.account_code`,
    [periodCode || null],
  );
}

/* ── Sổ chi tiết một tài khoản, kèm số dư lũy kế ───────────────────────── */

async function ledger(accountCode, periodCode) {
  return rows(
    `select v.posting_date, v.voucher_no, l.description,
            l.contra_account_code, l.debit::text, l.credit::text,
            sum(l.debit - l.credit) over (order by v.posting_date, l.id)::text as luy_ke
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.account_code = $1 and ($2::text is null or v.period_code = $2)
     order by v.posting_date, l.id
     limit 2000`,
    [accountCode, periodCode || null],
  );
}

/* ── Công nợ theo đối tượng ────────────────────────────────────────────── */

async function partnerBalances(kind, periodCode) {
  return rows(
    `select p.code, p.name, p.kind,
            coalesce(sum(l.debit), 0)::text  as phat_sinh_no,
            coalesce(sum(l.credit), 0)::text as phat_sinh_co,
            coalesce(sum(l.debit - l.credit), 0)::text as con_lai,
            count(*)::int as so_dong
     from finance.partners p
     join finance.journal_lines l on l.partner_code = p.code
     join finance.vouchers v on v.id = l.voucher_id
     where ($1::text is null or p.kind = $1)
       and ($2::text is null or v.period_code = $2)
     group by p.code, p.name, p.kind
     having coalesce(sum(l.debit - l.credit), 0) <> 0
     order by abs(sum(l.debit - l.credit)) desc
     limit 300`,
    [kind || null, periodCode || null],
  );
}

/* ── Chi phí không hợp lý, nguồn cho bảng kê quyết toán thuế ───────────── */

async function nondeductible(periodCode) {
  return rows(
    `select period_code, posting_date, voucher_no, account_code,
            description, debit::text, credit::text, partner_code
     from finance.v_nondeductible
     where ($1::text is null or period_code = $1)
     order by posting_date desc limit 500`,
    [periodCode || null],
  );
}

/* ── Soát lỗi ──────────────────────────────────────────────────────────── */

async function issues(periodCode) {
  const [unbalanced, periodDiff, orphanAccounts] = await Promise.all([
    rows(
      `select voucher_no, posting_date, period_code, total_debit::text,
              total_credit::text, diff::text, line_count
       from finance.v_unbalanced
       where ($1::text is null or period_code = $1)
       order by abs(diff) desc limit 200`,
      [periodCode || null],
    ),
    rows(
      `select period_code, diff::text from finance.v_period_balance
       where abs(diff) > 0.005 order by period_code`,
    ),
    rows(
      `select l.account_code, count(*)::int as so_dong
       from finance.journal_lines l
       left join finance.accounts a on a.code = l.account_code
       where a.code is null group by 1 order by 2 desc limit 50`,
    ),
  ]);
  return { chung_tu_lech: unbalanced, ky_lech: periodDiff, tai_khoan_la: orphanAccounts };
}

/* ── Dữ liệu vận hành, đọc một chiều qua finance_src ───────────────────── */

/**
 * Đây là phần kéo số liệu trực quan từ các phân hệ khác về mà không mở đường
 * ngược lại: tài chính đọc được vận hành, vận hành không đọc được tài chính.
 *
 * canSeeIndividualPay: vai trò viewer cố ý không xem được đơn giá từng người.
 * Xem tổng quỹ lương theo bộ phận thì được, xem lương của một cái tên cụ thể
 * thì không.
 */
/* Hoa hồng PG/SUP mà phân hệ vận hành đang tính.
 *
 * Kế toán QUAN SÁT luồng này, không duyệt. Quy trình duyệt nằm trọn bên
 * marketing: tính tự động, SUP xác nhận, Admin xác nhận, chốt.
 *
 * Nhưng cuối kỳ kế toán là người phải giải thích con số, nên họ cần thấy nó
 * hình thành chứ không phải biết sau khi mọi thứ đã xong. Đó là lý do view
 * này hiện MỌI giai đoạn chứ không riêng đợt đã chốt.
 *
 * Đọc một chiều qua finance_src. Két không ghi được gì sang marketing.
 */
async function hoaHong() {
  const [dot, chiTiet] = await Promise.all([
    rows(`select * from finance_src.hoa_hong_pg order by ky_code desc, tinh_luc desc limit 36`),
    rows(`select * from finance_src.hoa_hong_pg_chi_tiet
           order by ky_code desc, vai_tro, so_tien desc`),
  ]);
  const theoDot = new Map();
  for (const d of chiTiet) {
    if (!theoDot.has(d.dot_id)) theoDot.set(d.dot_id, []);
    theoDot.get(d.dot_id).push(d);
  }
  return {
    dot: dot.map((d) => ({ ...d, chi_tiet: theoDot.get(d.dot_id) || [] })),
    // Chỉ khoản ĐÃ CHỐT mới là khoản phải ghi sổ. Các giai đoạn trước là để
    // biết trước, không phải để hạch toán.
    tong_da_chot: dot.filter((d) => d.da_chot).reduce((t, d) => t + Number(d.tong_tien || 0), 0),
    tong_dang_duyet: dot.filter((d) => !d.da_chot && d.trang_thai !== 'tu_choi')
      .reduce((t, d) => t + Number(d.tong_tien || 0), 0),
    so_cho_ghi_so: dot.filter((d) => d.da_chot && !d.finance_voucher_no).length,
  };
}

/* Lương PG mà phân hệ vận hành tính. Kế toán QUAN SÁT, không duyệt.
 *
 * Lương SUP không nằm ở đây — phần đó đi theo cách khác và không kê vào bảng
 * lương PG.
 */
async function luongPg() {
  const [dot, chiTiet] = await Promise.all([
    rows(`select * from finance_src.luong_pg order by ky_code desc, tinh_luc desc limit 36`),
    rows(`select * from finance_src.luong_pg_chi_tiet order by ky_code desc, so_tien desc`),
  ]);
  const theoDot = new Map();
  for (const d of chiTiet) {
    if (!theoDot.has(d.dot_id)) theoDot.set(d.dot_id, []);
    theoDot.get(d.dot_id).push(d);
  }
  return {
    dot: dot.map((d) => ({ ...d, chi_tiet: theoDot.get(d.dot_id) || [] })),
    tong_da_chot: dot.filter((d) => d.da_chot).reduce((t, d) => t + Number(d.tong_tien || 0), 0),
    tong_dang_cho: dot.filter((d) => !d.da_chot && d.trang_thai !== 'tu_choi')
      .reduce((t, d) => t + Number(d.tong_tien || 0), 0),
    so_cho_ghi_so: dot.filter((d) => d.da_chot && !d.finance_voucher_no).length,
  };
}

async function opsSummary({ canSeeIndividualPay }) {
  const [leadsByChannel, leadsByMonth, pgWork, payroll] = await Promise.all([
    rows(
      `select coalesce(data_class, 'khong_ro')   as nguon,
              coalesce(service_type, 'khong_ro') as dich_vu,
              count(*)::int as so_lead,
              count(*) filter (where pg_arrival_confirmed_at is not null)::int as den_phong_kham
       from finance_src.leads
       group by 1, 2 order by 3 desc limit 40`,
    ),
    rows(
      `select coalesce(branch_id, 'khong_ro') as chi_nhanh,
              date_trunc('month', created_at)::date as thang,
              count(*)::int as so_lead
       from finance_src.leads
       where created_at >= now() - interval '12 months'
       group by 1, 2 order by 2 desc, 3 desc`,
    ),
    rows(
      // KHÔNG lọc theo status. Bộ lọc cũ là where status = 'valid', và nó âm
      // thầm loại bỏ mọi lượt bị gắn "đi muộn" khỏi số ngày công. Một người
      // đi muộn vẫn là một ngày công; loại họ ra là tính thiếu công của người
      // thật. Nhãn trễ muộn nay đã bỏ hẳn, nhưng dữ liệu cũ còn mang nhãn đó
      // nên bộ lọc phải đi cùng lúc.
      `select pg_code, count(*)::int as so_lan_cham,
              count(*) filter (where record_type = 'checkin')::int as so_lan_vao_ca,
              count(*) filter (where captured_offline)::int as cham_ngoai_tuyen,
              min(work_date) as tu_ngay, max(work_date) as den_ngay
       from finance_src.pg_attendance
       group by 1 order by 2 desc limit 100`,
    ),
    canSeeIndividualPay
      ? rows(
          `select employee_code, full_name, department,
                  hourly_rate::text, salary_offer::text, status
           from finance_src.employees
           where hourly_rate is not null or salary_offer is not null
           order by department nulls last, full_name limit 300`,
        )
      : rows(
          `select coalesce(department, 'khong_ro') as bo_phan,
                  count(*)::int as so_nguoi,
                  round(avg(hourly_rate))::text as don_gia_gio_trung_binh
           from finance_src.employees
           where hourly_rate is not null
           group by 1 order by 2 desc`,
        ),
  ]);
  return {
    lead_theo_nguon: leadsByChannel,
    lead_theo_thang: leadsByMonth,
    cong_pg: pgWork,
    luong: payroll,
    luong_chi_tiet: Boolean(canSeeIndividualPay),
  };
}

/* ── Dữ liệu cho biểu đồ ───────────────────────────────────────────────── */

/**
 * Gom mọi số liệu vẽ biểu đồ vào một lần gọi.
 *
 * Cố ý một lần chứ không sáu lần: màn tổng quan mở ra là vẽ hết, sáu lần gọi
 * thì người dùng nhìn thấy sáu ô trống lần lượt được điền, và mỗi lần gọi lại
 * là một dòng nữa trong nhật ký truy cập không nói thêm được gì.
 *
 * Nhóm tài khoản theo hệ thống tài khoản Thông tư 200:
 *   511 doanh thu · 521 giảm trừ doanh thu · 632 giá vốn
 *   641 chi phí bán hàng · 642 chi phí quản lý · 635 chi phí tài chính
 *   111 tiền mặt · 112 tiền gửi ngân hàng
 */
async function charts(periodCode) {
  const [theoThang, coCauChiPhi, topTaiKhoan, dongTien, chiPhiKhongHopLy] = await Promise.all([
    rows(
      `select v.period_code as ky,
              sum(l.debit)::text  as tong_no,
              sum(l.credit)::text as tong_co,
              -- Lay phat sinh MOT VE chu khong lay hieu so. Cuoi ky ke toan ket
              -- chuyen 511 va 6xx sang 911, nen hieu so No tru Co cua chung
              -- triet tieu ve gan 0 va bieu do se noi doi rang thang do khong
              -- co doanh thu lan chi phi.
              sum(case when l.account_code like '511%' then l.credit else 0 end)::text as doanh_thu,
              sum(case when l.account_code like '521%' then l.debit  else 0 end)::text as giam_tru,
              sum(case when l.account_code like '632%' then l.debit  else 0 end)::text as gia_von,
              -- KHONG gom 621, 622, 627 vao day. Chung la cau thanh cua gia
              -- von: nguyen vat lieu va nhan cong truc tiep chay qua 154 roi
              -- ket chuyen sang 632. Cong ca hai la tinh trung mot khoan chi
              -- hai lan, va bao cao se bao lo trong khi thuc te dang lai.
              sum(case when l.account_code similar to '(635|641|642|811)%'
                       then l.debit else 0 end)::text as chi_phi,
              count(distinct v.id)::int as so_chung_tu
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       group by 1 order by 1`,
    ),
    rows(
      `select left(l.account_code, 3) as nhom,
              coalesce(max(a.name), left(l.account_code, 3)) as ten,
              -- Cung ly do: chi phi phat sinh nam o ve No, phan ve Co la but
              -- toan ket chuyen cuoi ky, khong phai chi phi giam di.
              sum(l.debit)::text as so_tien
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       left join finance.accounts a on a.code = left(l.account_code, 3)
       -- Cung ly do khong gom 621, 622, 627: chung nam ben trong 632 roi.
       where left(l.account_code, 3) in ('632','635','641','642','811','821')
         and ($1::text is null or v.period_code = $1)
       group by 1
       having sum(l.debit) > 0
       order by 3 desc`,
      [periodCode || null],
    ),
    rows(
      `select l.account_code as ma, a.name as ten,
              sum(l.debit)::text  as ps_no,
              sum(l.credit)::text as ps_co,
              sum(l.debit + l.credit)::text as tong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       left join finance.accounts a on a.code = l.account_code
       where ($1::text is null or v.period_code = $1)
       group by 1, 2 order by sum(l.debit + l.credit) desc limit 12`,
      [periodCode || null],
    ),
    rows(
      `select v.period_code as ky,
              sum(case when l.account_code like '111%' then l.debit - l.credit else 0 end)::text as tien_mat,
              sum(case when l.account_code like '112%' then l.debit - l.credit else 0 end)::text as ngan_hang,
              sum(case when l.account_code similar to '(111|112)%'
                       then l.debit - l.credit else 0 end)::text as rong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       group by 1 order by 1`,
    ),
    rows(
      // Chi phi khong hop ly cung duoc ghi ca hai ve nhu moi but toan khac,
      // nen hieu so No tru Co bang 0. Con so ke toan can khi lap Bang ke
      // quyet toan thue la tong ve No.
      `select v.period_code as ky, sum(l.debit)::text as so_tien,
              count(*)::int as so_dong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       where l.is_deductible = false
       group by 1 order by 1`,
    ),
  ]);
  return { theo_thang: theoThang, co_cau_chi_phi: coCauChiPhi, top_tai_khoan: topTaiKhoan,
           dong_tien: dongTien, chi_phi_khong_hop_ly: chiPhiKhongHopLy };
}

/* ── Danh mục ──────────────────────────────────────────────────────────── */

async function accounts(q) {
  return rows(
    `select code, name, nature, depth, is_active, parent_code
     from finance.accounts
     where ($1::text is null or code like $1 || '%' or name ilike '%' || $1 || '%')
     order by code limit 400`,
    [q || null],
  );
}

/**
 * nhom = 'khach_hang' lấy đúng khách hàng, 'doi_tac' lấy nhà cung cấp, nhân
 * viên và các đối tượng khác. Hai nhóm này khác nhau về mọi mặt nên tách:
 * khách hàng hàng nghìn, mã sinh tự động, ghi ở TK 131; đối tác hàng trăm,
 * mã do kế toán đặt, ghi ở TK 331.
 *
 * Kèm số dư và số dòng bút toán, vì câu hỏi đầu tiên với một đối tượng bao
 * giờ cũng là "còn nợ bao nhiêu", không phải "mã số thuế là gì".
 */
async function partners(q, kind, nhom) {
  const loc = nhom === 'khach_hang' ? ['customer']
    : nhom === 'doi_tac' ? ['supplier', 'employee', 'other']
      : null;
  return rows(
    `select p.code, p.name, p.kind, p.branch_hint, p.tax_code, p.address,
            p.phone, p.is_active,
            coalesce(t.so_dong, 0)::int as so_dong,
            coalesce(t.du, 0)::text     as con_lai
     from finance.partners p
     left join (
       select partner_code, count(*) as so_dong, sum(debit - credit) as du
       from finance.journal_lines where partner_code is not null group by 1
     ) t on t.partner_code = p.code
     where ($1::text is null or p.code ilike '%' || $1 || '%' or p.name ilike '%' || $1 || '%')
       and ($2::text is null or p.kind = $2)
       and ($3::text[] is null or p.kind = any($3))
     order by coalesce(t.so_dong, 0) desc, p.code
     limit 400`,
    [q || null, kind || null, loc],
  );
}

async function periods() {
  return rows(
    `select p.code, p.start_date, p.end_date, p.status, p.closed_at, p.closed_by,
            coalesce(b.voucher_count, 0)::int as so_chung_tu,
            coalesce(b.total_debit, 0)::text  as tong_no,
            coalesce(b.total_credit, 0)::text as tong_co
     from finance.periods p
     left join finance.v_period_balance b on b.period_code = p.code
     order by p.code desc`,
  );
}

async function costItems() {
  return rows(
    `select c.code, c.name, c.branch_code, c.is_active, c.auto_created,
            coalesce(t.so_dong, 0)::int as so_dong,
            coalesce(t.chi_phi, 0)::text as chi_phi
     from finance.cost_items c
     left join (
       select cost_item_code,
              count(*) as so_dong,
              sum(debit) filter (where account_code similar to '(6|8)%') as chi_phi
       from finance.journal_lines where cost_item_code is not null group by 1
     ) t on t.cost_item_code = c.code
     order by coalesce(t.so_dong, 0) desc, c.code`,
  );
}

/* ── Lô nhập liệu ──────────────────────────────────────────────────────── */

async function batches() {
  return rows(
    `select id::text, source_file, left(source_sha256, 12) as van_tay,
            sheet_names, row_count, status, recon, created_by, created_at,
            posted_by, posted_at, reverted_at
     from finance.import_batches order by created_at desc limit 100`,
  );
}

module.exports = {
  overview, journal, voucher, trialBalance, ledger, partnerBalances,
  nondeductible, issues, opsSummary, hoaHong, luongPg, accounts, partners, periods,
  costItems, batches, charts,
};
