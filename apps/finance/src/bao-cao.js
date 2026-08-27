'use strict';
/**
 * Các báo cáo kế toán, TẤT CẢ dựng lại từ Sổ nhật ký chung.
 *
 * Đây là quyết định thiết kế quan trọng nhất của phân hệ này, nên nói rõ lý
 * do. Bộ Excel của kế toán có 17 file, trong đó 9 file là báo cáo được phần
 * mềm kết xuất từ cùng một sổ. Nhập cả 9 file đó vào hệ thống là tạo ra 9
 * nguồn sự thật, và chúng SẼ mâu thuẫn nhau.
 *
 * Chuyện đó đã xảy ra thật, không phải giả định: TK 1388 có Bảng cân đối ghi
 * phát sinh Nợ bằng 0 trong khi Nhật ký chung ghi 152.120.000, và chính Bảng
 * cân đối đó lại đếm đúng vế đối ứng 3341 của cùng những chứng từ ấy. Một
 * trong hai file nói sai, và không có cách nào biết được cái nào nếu cả hai
 * đều được nhập vào như dữ liệu gốc.
 *
 * Nên: nhật ký chung là nguồn duy nhất cho phát sinh. Chín báo cáo kia được
 * tính lại ở đây. Bảng cân đối tài khoản giữ đúng một vai trò là bản đối
 * chứng và là nguồn của số dư đầu kỳ, thứ nhật ký không chứa.
 *
 * Ba thứ trong bộ Excel KHÔNG dựng lại được từ nhật ký, và phải nói thẳng
 * thay vì bịa ra một con số trông hợp lý:
 *
 *   Bảng khấu hao TSCĐ      cần nguyên giá và thời gian sử dụng từng tài sản
 *   Bảng phân bổ CCDC       cần số kỳ phân bổ từng công cụ
 *   Tổng hợp tồn kho        cần mã hàng và số lượng, nhật ký chỉ có giá trị
 */
const { rows, one } = require('./db');

/* ── Sổ kế toán chi tiết quỹ tiền mặt ──────────────────────────────────────
   Nguồn Excel: So_ke_toan_chi_tiet_quy_tien_mat.xlsx
   Cột gốc: Ngày, Số phiếu thu, Số phiếu chi, Diễn giải, TK đối ứng, Số tồn */

async function soQuyTienMat({ period, from, to }) {
  const dauKy = await one(
    `select coalesce(sum(o.debit - o.credit), 0)::text as so_du
     from finance.opening_balances o where o.account_code like '111%'`,
  );
  const dong = await rows(
    `select v.posting_date, v.voucher_no, v.voucher_type, v.invoice_no,
            l.description, l.account_code, l.contra_account_code,
            l.partner_code, p.name as partner_name,
            l.debit::text as thu, l.credit::text as chi,
            sum(l.debit - l.credit) over (order by v.posting_date, v.voucher_no, l.id)::text as ton
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     left join finance.partners p on p.code = l.partner_code
     where l.account_code like '111%'
       and ($1::text is null or v.period_code = $1)
       and ($2::date is null or v.posting_date >= $2)
       and ($3::date is null or v.posting_date <= $3)
     order by v.posting_date, v.voucher_no, l.id
     limit 5000`,
    [period || null, from || null, to || null],
  );
  const tong = await one(
    `select coalesce(sum(l.debit), 0)::text  as tong_thu,
            coalesce(sum(l.credit), 0)::text as tong_chi,
            count(*)::int as so_dong
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.account_code like '111%'
       and ($1::text is null or v.period_code = $1)
       and ($2::date is null or v.posting_date >= $2)
       and ($3::date is null or v.posting_date <= $3)`,
    [period || null, from || null, to || null],
  );
  return { dau_ky: dauKy.so_du, dong, ...tong };
}

/* ── Sổ tiền gửi ngân hàng ─────────────────────────────────────────────────
   Nguồn Excel: So_tien_gui_ngan_hang.xlsx · một sổ cho mỗi tài khoản ngân hàng */

async function taiKhoanNganHang() {
  return rows(
    `select a.code, a.name,
            coalesce(sum(l.debit), 0)::text  as tong_thu,
            coalesce(sum(l.credit), 0)::text as tong_chi,
            count(l.id)::int as so_dong
     from finance.accounts a
     left join finance.journal_lines l on l.account_code = a.code
     where a.code like '112%' and length(a.code) >= 5
     group by a.code, a.name
     order by a.code`,
  );
}

async function soNganHang({ account, period, from, to }) {
  const ma = account || '112';
  const dauKy = await one(
    `select coalesce(sum(debit - credit), 0)::text as so_du
     from finance.opening_balances where account_code like $1 || '%'`, [ma],
  );
  const dong = await rows(
    `select v.posting_date, v.voucher_no, v.voucher_type, l.description,
            l.contra_account_code, l.partner_code, p.name as partner_name,
            l.debit::text as thu, l.credit::text as chi,
            sum(l.debit - l.credit) over (order by v.posting_date, v.voucher_no, l.id)::text as ton
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     left join finance.partners p on p.code = l.partner_code
     where l.account_code like $1 || '%'
       and ($2::text is null or v.period_code = $2)
       and ($3::date is null or v.posting_date >= $3)
       and ($4::date is null or v.posting_date <= $4)
     order by v.posting_date, v.voucher_no, l.id
     limit 5000`,
    [ma, period || null, from || null, to || null],
  );
  const tong = await one(
    `select coalesce(sum(l.debit), 0)::text  as tong_thu,
            coalesce(sum(l.credit), 0)::text as tong_chi,
            count(*)::int as so_dong
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.account_code like $1 || '%'
       and ($2::text is null or v.period_code = $2)`,
    [ma, period || null],
  );
  return { tai_khoan: ma, dau_ky: dauKy.so_du, dong, ...tong };
}

/* ── Tổng hợp công nợ ──────────────────────────────────────────────────────
   Nguồn Excel: Tong_hop_cong_no_phai_thu_khach_hang.xlsx và bản phải trả
   Cột gốc: Số dư đầu kỳ Nợ/Có, Phát sinh Nợ/Có, Số dư cuối kỳ Nợ/Có */

const TK_CONG_NO = { phai_thu: '131', phai_tra: '331' };

async function tongHopCongNo({ loai, period }) {
  const tk = TK_CONG_NO[loai] || '131';
  return rows(
    `with ps as (
       select l.partner_code,
              sum(l.debit)  as ps_no,
              sum(l.credit) as ps_co
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       where l.account_code like $1 || '%' and l.partner_code is not null
         and ($2::text is null or v.period_code = $2)
       group by 1
     ),
     truoc as (
       select l.partner_code, sum(l.debit - l.credit) as du
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       where l.account_code like $1 || '%' and l.partner_code is not null
         and $2::text is not null and v.period_code < $2
       group by 1
     )
     select p.code, p.name, $1 as tk_cong_no,
            coalesce(t.du, 0)::text                         as dau_ky,
            coalesce(ps.ps_no, 0)::text                     as ps_no,
            coalesce(ps.ps_co, 0)::text                     as ps_co,
            (coalesce(t.du, 0) + coalesce(ps.ps_no, 0) - coalesce(ps.ps_co, 0))::text as cuoi_ky
     from ps
     join finance.partners p on p.code = ps.partner_code
     left join truoc t on t.partner_code = ps.partner_code
     where coalesce(ps.ps_no, 0) <> 0 or coalesce(ps.ps_co, 0) <> 0
        or coalesce(t.du, 0) <> 0
     order by abs(coalesce(t.du, 0) + coalesce(ps.ps_no, 0) - coalesce(ps.ps_co, 0)) desc
     limit 500`,
    [tk, period || null],
  );
}

/* ── Chi tiết công nợ một đối tượng ────────────────────────────────────────
   Nguồn Excel: Chi_tiet_cong_no_phai_thu_khach_hang.xlsx và bản phải trả */

async function chiTietCongNo({ loai, partner, period }) {
  const tk = TK_CONG_NO[loai] || '131';
  if (!partner) return { doi_tac: null, dong: [] };
  const dt = await one('select code, name, kind, tax_code, address from finance.partners where code = $1', [partner]);
  const dong = await rows(
    `select v.posting_date, v.voucher_date, v.voucher_no, v.invoice_no,
            l.description, l.account_code as tk_cong_no, l.contra_account_code,
            l.debit::text as ps_no, l.credit::text as ps_co,
            sum(l.debit - l.credit) over (order by v.posting_date, v.voucher_no, l.id)::text as so_du
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.partner_code = $1 and l.account_code like $2 || '%'
       and ($3::text is null or v.period_code = $3)
     order by v.posting_date, v.voucher_no, l.id
     limit 3000`,
    [partner, tk, period || null],
  );
  const tong = await one(
    `select coalesce(sum(l.debit), 0)::text as tong_no,
            coalesce(sum(l.credit), 0)::text as tong_co
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.partner_code = $1 and l.account_code like $2 || '%'
       and ($3::text is null or v.period_code = $3)`,
    [partner, tk, period || null],
  );
  return { doi_tac: dt, dong, ...tong };
}

/* ── Dòng tiền ─────────────────────────────────────────────────────────────
   Nguồn Excel: Dong_tien.xlsx
   Tiền tồn đầu kỳ, các dòng thu, các dòng chi, tiền tồn cuối kỳ.
   Phân loại thu chi theo tài khoản đối ứng: đó là cách duy nhất biết một
   đồng tiền vào ra vì lý do gì, và nó nằm sẵn trong nhật ký. */

/**
 * Cùng một tài khoản đối ứng nhưng chiều tiền khác nhau thì ý nghĩa khác
 * nhau: đối ứng 131 khi tiền VÀO là thu nợ khách hàng, còn khi tiền RA là
 * hoàn tiền cho khách. Dùng chung một bộ nhãn cho cả hai chiều là gán sai tên
 * cho một nửa số dòng, và bảng dòng tiền sẽ đọc ra những câu vô nghĩa như
 * "chi · thu bán hàng".
 */
function nhomDoiUng(chieu) {
  const t = chieu === 'thu';
  const n = (khiThu, khiChi) => `'${t ? khiThu : khiChi}'`;
  return `
  case
    when l.contra_account_code like '131%'
      then ${n('Thu nợ khách hàng', 'Hoàn tiền cho khách hàng')}
    when l.contra_account_code like '511%' or l.contra_account_code like '515%'
      or l.contra_account_code like '711%'
      then ${n('Bán hàng thu tiền ngay', 'Giảm trừ và hoàn doanh thu')}
    when l.contra_account_code like '331%'
      then ${n('Nhà cung cấp hoàn tiền', 'Trả tiền nhà cung cấp')}
    when l.contra_account_code like '334%'
      then ${n('Nhân viên hoàn tạm ứng', 'Trả lương và các khoản theo lương')}
    when l.contra_account_code like '333%'
      then ${n('Hoàn thuế', 'Nộp thuế và các khoản nhà nước')}
    when l.contra_account_code like '141%'
      then ${n('Thu hồi tạm ứng', 'Chi tạm ứng')}
    when l.contra_account_code like '641%'
      then ${n('Giảm chi phí bán hàng', 'Chi bán hàng')}
    when l.contra_account_code like '642%'
      then ${n('Giảm chi phí quản lý', 'Chi quản lý doanh nghiệp')}
    when l.contra_account_code like '211%' or l.contra_account_code like '213%'
      or l.contra_account_code like '241%'
      then ${n('Thanh lý tài sản', 'Mua sắm và đầu tư tài sản')}
    when l.contra_account_code like '341%'
      then ${n('Nhận tiền vay', 'Trả nợ vay')}
    when l.contra_account_code like '411%'
      then ${n('Nhận vốn góp', 'Hoàn vốn góp')}
    when l.contra_account_code similar to '(111|112)%'
      then 'Chuyển nội bộ giữa quỹ và ngân hàng'
    else ${n('Thu khác', 'Chi khác')}
  end`;
}

async function dongTien({ period }) {
  const [dauKy, thu, chi, theoThang] = await Promise.all([
    one(
      `select coalesce(sum(debit - credit), 0)::text as so_du
       from finance.opening_balances where account_code similar to '(111|112)%'`,
    ),
    rows(
      `select ${nhomDoiUng('thu')} as muc, sum(l.debit)::text as so_tien, count(*)::int as so_dong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       where l.account_code similar to '(111|112)%' and l.debit <> 0
         and ($1::text is null or v.period_code = $1)
       group by 1 having sum(l.debit) <> 0 order by 2 desc`,
      [period || null],
    ),
    rows(
      `select ${nhomDoiUng('chi')} as muc, sum(l.credit)::text as so_tien, count(*)::int as so_dong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       where l.account_code similar to '(111|112)%' and l.credit <> 0
         and ($1::text is null or v.period_code = $1)
       group by 1 having sum(l.credit) <> 0 order by 2 desc`,
      [period || null],
    ),
    rows(
      `select v.period_code as ky,
              sum(case when l.account_code like '111%' then l.debit  else 0 end)::text as tm_thu,
              sum(case when l.account_code like '111%' then l.credit else 0 end)::text as tm_chi,
              sum(case when l.account_code like '112%' then l.debit  else 0 end)::text as nh_thu,
              sum(case when l.account_code like '112%' then l.credit else 0 end)::text as nh_chi,
              sum(case when l.account_code similar to '(111|112)%'
                       then l.debit - l.credit else 0 end)::text as rong
       from finance.journal_lines l
       join finance.vouchers v on v.id = l.voucher_id
       group by 1 order by 1`,
    ),
  ]);
  const tongThu = thu.reduce((s, r) => s + Number(r.so_tien), 0);
  const tongChi = chi.reduce((s, r) => s + Number(r.so_tien), 0);
  return {
    dau_ky: dauKy.so_du, thu, chi,
    tong_thu: String(tongThu), tong_chi: String(tongChi),
    cuoi_ky: String(Number(dauKy.so_du) + tongThu - tongChi),
    theo_thang: theoThang,
  };
}

/* ── Tổng hợp chi phí theo khoản mục ───────────────────────────────────────
   Nguồn Excel: Tong_hop_chi_phi_theo_khoan_muc_chi_phi.xlsx
   Cột gốc: Mã khoản mục CP, Tên khoản mục chi phí, Kỳ trước, Kỳ này, Lũy kế

   Quy tắc cộng đã kiểm chứng bằng cách đối chiếu hai file thật, xem phần giải
   thích ở đầu migration 028: chỉ cộng phát sinh Nợ của TÀI KHOẢN CHI PHÍ.
   Mã khoản mục gắn trên tài khoản công nợ hay tài khoản tiền là để truy vết
   dòng tiền, cộng vào là tính một khoản chi hai lần. */

async function chiPhiTheoKhoanMuc({ period }) {
  const [tongHop, ganThieu, theoThang] = await Promise.all([
    rows(
      `select cost_item_code as ma, max(cost_item_name) as ten, max(branch_code) as chi_nhanh,
              coalesce(sum(chi_phi), 0)::text  as ky_nay,
              coalesce(sum(no_khac), 0)::text  as no_ngoai_chi_phi,
              sum(so_dong)::int                as so_dong,
              sum(so_dong_chi_phi)::int        as so_dong_chi_phi
       from finance.v_chi_phi_theo_khoan_muc
       where ($1::text is null or period_code = $1)
       group by cost_item_code
       order by coalesce(sum(chi_phi), 0) desc, cost_item_code`,
      [period || null],
    ),
    rows(
      `select cost_item_code as ma, cost_item_name as ten, so_dong::int,
              tong_no::text, cac_tai_khoan
       from finance.v_khoan_muc_gan_thieu order by tong_no desc`,
    ),
    rows(
      `select period_code as ky, coalesce(sum(chi_phi), 0)::text as chi_phi
       from finance.v_chi_phi_theo_khoan_muc group by 1 order by 1`,
    ),
  ]);
  // Lũy kế từ đầu năm, đúng cột thứ ba của file gốc.
  const luyKe = await rows(
    `select cost_item_code as ma, coalesce(sum(chi_phi), 0)::text as luy_ke
     from finance.v_chi_phi_theo_khoan_muc group by 1`,
  );
  const theoMa = new Map(luyKe.map((r) => [r.ma, r.luy_ke]));
  return {
    dong: tongHop.map((r) => ({ ...r, luy_ke: theoMa.get(r.ma) || '0' })),
    gan_thieu: ganThieu,
    theo_thang: theoThang,
  };
}

/* ── B01-DN · Báo cáo tình hình tài chính ──────────────────────────────────
   Nguồn Excel: B01_dn_bao_cao_tinh_hinh_tai_chinh.xlsx

   Điểm dễ làm sai nhất của báo cáo này là các tài khoản lưỡng tính. Thông tư
   200 cấm bù trừ: tài khoản 331 dư Có là "Phải trả người bán" và nằm bên
   nguồn vốn, nhưng 331 dư Nợ là "Trả trước cho người bán" và phải nằm bên
   tài sản. Xếp cứng theo số hiệu tài khoản thì bảng ra "Nợ phải trả âm", một
   con số vô nghĩa mà không ai đọc báo cáo tài chính chấp nhận được.

   Bộ sổ này có cả hai trường hợp đó thật: TK 331 dư Nợ 801.786.298 và TK 334
   dư Nợ 1.250.941.530. Chính bảng cân đối do phần mềm kế toán xuất ra cũng
   ghi "3341 · Cuối kỳ Có = -1.250.941.530", tức là nó cũng chưa phân loại lại.

   Nhờ phân theo dấu, tổng tài sản bằng tổng nguồn vốn theo cấu tạo: mỗi tài
   khoản rơi vào đúng một vế, và Nợ bằng Có trên toàn sổ. */

// Mỗi nhóm: tiền tố tài khoản, chỉ tiêu khi dư Nợ, chỉ tiêu khi dư Có.
const NHOM_B01 = [
  { tien_to: ['111', '112', '113'], khi_no: '110', khi_co: '315' },
  { tien_to: ['121', '128'], khi_no: '120', khi_co: '315' },
  { tien_to: ['131'], khi_no: '131', khi_co: '312' },
  { tien_to: ['133'], khi_no: '133', khi_co: '313' },
  { tien_to: ['136', '138', '141', '244'], khi_no: '133', khi_co: '315' },
  { tien_to: ['331'], khi_no: '132', khi_co: '311' },
  { tien_to: ['333'], khi_no: '133', khi_co: '313' },
  { tien_to: ['334'], khi_no: '133', khi_co: '314' },
  { tien_to: ['335', '336', '338', '341', '343', '352'], khi_no: '133', khi_co: '315' },
  { tien_to: ['151', '152', '153', '154', '155', '156', '157'], khi_no: '140', khi_co: '315' },
  { tien_to: ['242'], khi_no: '150', khi_co: '315' },
  { tien_to: ['211', '212', '213', '214', '217'], khi_no: '220', khi_co: '315' },
  { tien_to: ['241'], khi_no: '260', khi_co: '315' },
  { tien_to: ['411', '412', '413', '418', '419', '421', '441'], khi_no: '411', khi_co: '411' },
];

const DONG_B01 = [
  { ma: '100', ten: 'A. TÀI SẢN NGẮN HẠN', nhom: true, gom: ['110', '120', '130', '140', '150'] },
  { ma: '110', ten: 'I. Tiền và các khoản tương đương tiền' },
  { ma: '120', ten: 'II. Đầu tư tài chính ngắn hạn' },
  { ma: '130', ten: 'III. Các khoản phải thu ngắn hạn', nhom: true, gom: ['131', '132', '133'] },
  { ma: '131', ten: '1. Phải thu ngắn hạn của khách hàng', con: true },
  { ma: '132', ten: '2. Trả trước cho người bán', con: true },
  { ma: '133', ten: '3. Phải thu khác và thuế được khấu trừ', con: true },
  { ma: '140', ten: 'IV. Hàng tồn kho' },
  { ma: '150', ten: 'V. Tài sản ngắn hạn khác' },
  { ma: '200', ten: 'B. TÀI SẢN DÀI HẠN', nhom: true, gom: ['220', '260'] },
  { ma: '220', ten: 'I. Tài sản cố định' },
  { ma: '260', ten: 'II. Tài sản dài hạn khác' },
  { ma: '270', ten: 'TỔNG CỘNG TÀI SẢN', nhom: true, gom: ['100', '200'], dam: true },
  { ma: '300', ten: 'C. NỢ PHẢI TRẢ', nhom: true, gom: ['310'] },
  { ma: '310', ten: 'I. Nợ ngắn hạn', nhom: true, gom: ['311', '312', '313', '314', '315'] },
  { ma: '311', ten: '1. Phải trả người bán', con: true },
  { ma: '312', ten: '2. Người mua trả tiền trước', con: true },
  { ma: '313', ten: '3. Thuế và các khoản phải nộp Nhà nước', con: true },
  { ma: '314', ten: '4. Phải trả người lao động', con: true },
  { ma: '315', ten: '5. Phải trả, phải nộp khác và vay', con: true },
  { ma: '400', ten: 'D. VỐN CHỦ SỞ HỮU', nhom: true, gom: ['411', '421'] },
  { ma: '411', ten: 'I. Vốn góp và lợi nhuận lũy kế các năm trước', con: true },
  { ma: '421', ten: 'II. Lợi nhuận chưa phân phối phát sinh trong kỳ', con: true },
  { ma: '440', ten: 'TỔNG CỘNG NGUỒN VỐN', nhom: true, gom: ['300', '400'], dam: true },
];

/** Tài khoản cấp thấp nhất. Cộng cả cha lẫn con là nhân đôi mọi con số. */
function laLa(ma, tatCa) {
  return !tatCa.some((k) => k !== ma && k.startsWith(ma));
}

async function baoCaoTinhHinhTaiChinh() {
  const sd = await rows(
    `select account_code,
            (dau_ky_no - dau_ky_co)::float8 as dau,
            cuoi_ky::float8 as cuoi
     from finance.v_so_du_theo_tai_khoan`,
  );
  const maTatCa = sd.map((r) => r.account_code);
  const la = sd.filter((r) => laLa(r.account_code, maTatCa));

  const cong = new Map();
  const them = (dong, dau, cuoi) => {
    const c = cong.get(dong) || { dau: 0, cuoi: 0 };
    c.dau += dau;
    c.cuoi += cuoi;
    cong.set(dong, c);
  };

  // Tài khoản kết quả 5 tới 9 không có chỗ trên bảng cân đối. Phần chưa kết
  // chuyển của chúng chính là lãi lỗ trong kỳ, và nó thuộc vốn chủ sở hữu.
  let laiLoDau = 0;
  let laiLoCuoi = 0;

  for (const r of la) {
    const ma = r.account_code;
    if (/^[56789]/.test(ma)) {
      laiLoDau -= r.dau;
      laiLoCuoi -= r.cuoi;
      continue;
    }
    const nhom = NHOM_B01.find((n) => n.tien_to.some((t) => ma.startsWith(t)));
    // Tài khoản lạ không xếp được thì vẫn phải nằm đâu đó, nếu không bảng mất
    // cân và người đọc không biết mất ở đâu.
    const khiNo = nhom ? nhom.khi_no : '133';
    const khiCo = nhom ? nhom.khi_co : '315';

    if (khiNo === khiCo) {
      // Vốn chủ sở hữu: 411 dư Có là vốn góp, 421 dư Nợ là lỗ lũy kế, và
      // chúng phải TRỪ nhau. Lấy trị tuyệt đối cả hai rồi cộng lại là biến
      // một khoản lỗ 5,77 tỷ thành thêm 5,77 tỷ vốn, sai gấp đôi con số lỗ.
      them(khiNo, -r.dau, -r.cuoi);
      continue;
    }
    // Phân theo DẤU ở từng thời điểm: một tài khoản có thể dư Nợ đầu kỳ và
    // dư Có cuối kỳ, và khi đó nó đổi vế trên bảng.
    if (r.dau > 0) them(khiNo, r.dau, 0);
    else if (r.dau < 0) them(khiCo, -r.dau, 0);
    if (r.cuoi > 0) them(khiNo, 0, r.cuoi);
    else if (r.cuoi < 0) them(khiCo, 0, -r.cuoi);
  }
  them('421', laiLoDau, laiLoCuoi);

  for (const m of DONG_B01) if (m.nhom) them(m.ma, 0, 0);
  // Chỉ tiêu lồng nhau ba tầng: 270 gom 100, mà 100 lại gom 130, mà 130 gom
  // 131 tới 133. Cộng một lượt theo thứ tự khai báo thì cha cộng trước con và
  // ra 0. Lặp cho tới khi không còn gì đổi, ba tầng thì tối đa ba vòng.
  for (let vong = 0; vong < 5; vong += 1) {
    let doi = false;
    for (const m of DONG_B01) {
      if (!m.nhom) continue;
      const dau = m.gom.reduce((s, g) => s + (cong.get(g)?.dau || 0), 0);
      const cuoi = m.gom.reduce((s, g) => s + (cong.get(g)?.cuoi || 0), 0);
      const cu = cong.get(m.ma);
      if (Math.abs(cu.dau - dau) > 0.005 || Math.abs(cu.cuoi - cuoi) > 0.005) doi = true;
      cong.set(m.ma, { dau, cuoi });
    }
    if (!doi) break;
  }

  return DONG_B01.map((m) => ({
    ma: m.ma,
    ten: m.ten,
    nhom: Boolean(m.nhom),
    dam: Boolean(m.dam),
    con: Boolean(m.con),
    tai_khoan: NHOM_B01
      .filter((n) => n.khi_no === m.ma || n.khi_co === m.ma)
      .flatMap((n) => n.tien_to).join(', ') || null,
    dau_nam: String(Math.round(cong.get(m.ma)?.dau || 0)),
    cuoi_ky: String(Math.round(cong.get(m.ma)?.cuoi || 0)),
  }));
}

/* ── Sổ chi tiết một tài khoản, có số dư đầu kỳ thật ───────────────────── */

async function soChiTietTaiKhoan({ account, period, from, to }) {
  const tk = await one(
    `select a.code, a.name, a.nature,
            coalesce(o.debit, 0)::text  as dau_ky_no,
            coalesce(o.credit, 0)::text as dau_ky_co
     from finance.accounts a
     left join finance.opening_balances o on o.account_code = a.code
     where a.code = $1`, [account],
  );
  if (!tk) return null;
  const dauKy = Number(tk.dau_ky_no) - Number(tk.dau_ky_co);
  const dong = await rows(
    `select v.posting_date, v.voucher_date, v.voucher_no, v.voucher_type,
            v.invoice_no, l.description, l.contra_account_code,
            l.partner_code, p.name as partner_name, l.is_deductible,
            l.debit::text as ps_no, l.credit::text as ps_co,
            ($5::numeric + sum(l.debit - l.credit)
               over (order by v.posting_date, v.voucher_no, l.id))::text as so_du
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     left join finance.partners p on p.code = l.partner_code
     where l.account_code = $1
       and ($2::text is null or v.period_code = $2)
       and ($3::date is null or v.posting_date >= $3)
       and ($4::date is null or v.posting_date <= $4)
     order by v.posting_date, v.voucher_no, l.id
     limit 5000`,
    [account, period || null, from || null, to || null, dauKy],
  );
  const tong = await one(
    `select coalesce(sum(l.debit), 0)::text as tong_no,
            coalesce(sum(l.credit), 0)::text as tong_co, count(*)::int as so_dong
     from finance.journal_lines l
     join finance.vouchers v on v.id = l.voucher_id
     where l.account_code = $1 and ($2::text is null or v.period_code = $2)`,
    [account, period || null],
  );
  return { ...tk, dau_ky: String(dauKy), dong, ...tong };
}

/* ── Trạng thái số dư đầu kỳ ───────────────────────────────────────────── */

async function trangThaiDauKy() {
  return one(
    `select count(*)::int as so_tai_khoan,
            coalesce(sum(debit), 0)::text  as tong_no,
            coalesce(sum(credit), 0)::text as tong_co,
            max(created_at) as nap_luc,
            max(source_file) as tu_file
     from finance.opening_balances`,
  );
}

module.exports = {
  chiPhiTheoKhoanMuc, soQuyTienMat, taiKhoanNganHang, soNganHang,
  tongHopCongNo, chiTietCongNo, dongTien,
  baoCaoTinhHinhTaiChinh, soChiTietTaiKhoan, trangThaiDauKy,
};
