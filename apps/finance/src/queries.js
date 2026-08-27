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
  so_chung_tu: 'v.voucher_no',
  tai_khoan: 'l.account_code',
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
      and ($7::boolean is null or l.is_deductible = $7)`;

async function journal(f = {}) {
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 500);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const sortCol = JOURNAL_SORTS[f.sort] || JOURNAL_SORTS.ngay;
  const dir = String(f.dir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const args = [
    f.period || null, f.account || null, f.partner || null,
    f.from || null, f.to || null, f.q || null,
    f.deductible === undefined ? null : f.deductible,
  ];

  const [data, total] = await Promise.all([
    rows(
      `select l.id::text, v.voucher_no, v.posting_date, v.voucher_type,
              v.period_code, l.line_no, l.account_code, a.name as account_name,
              l.contra_account_code, l.debit::text, l.credit::text,
              l.partner_code, p.name as partner_name, l.cost_item_code,
              l.description, l.is_deductible, v.id::text as voucher_id
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       left join finance.accounts a on a.code = l.account_code
       left join finance.partners p on p.code = l.partner_code
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
      `select pg_code, count(*)::int as so_lan_cham,
              count(*) filter (where captured_offline)::int as cham_ngoai_tuyen,
              min(work_date) as tu_ngay, max(work_date) as den_ngay
       from finance_src.pg_attendance
       where status = 'valid'
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

async function partners(q, kind) {
  return rows(
    `select code, name, kind, branch_hint, tax_code, is_active
     from finance.partners
     where ($1::text is null or code ilike '%' || $1 || '%' or name ilike '%' || $1 || '%')
       and ($2::text is null or kind = $2)
     order by code limit 300`,
    [q || null, kind || null],
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
    `select code, name, branch_code, is_active from finance.cost_items order by code`,
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
  nondeductible, issues, opsSummary, accounts, partners, periods,
  costItems, batches,
};
