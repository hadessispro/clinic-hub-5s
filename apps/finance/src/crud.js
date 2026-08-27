'use strict';
/**
 * Thêm sửa xóa chứng từ và danh mục.
 *
 * Ba nguyên tắc, và nguyên tắc nào cũng có lý do cụ thể chứ không phải cho
 * đẹp quy trình:
 *
 *   1. Chứng từ và các dòng bút toán của nó ghi trong CÙNG một giao dịch.
 *      Nửa chứng từ nằm trong sổ là thứ khó tìm hơn cả một chứng từ sai.
 *
 *   2. Nợ phải bằng Có ở mức chứng từ, TRỪ KHI chứng từ khai balance_group.
 *      Bộ sổ thật có 10 trên 13.792 chứng từ cân theo cặp, ép cân từng cái sẽ
 *      chặn nhầm dữ liệu thật.
 *
 *   3. Sửa và xóa chỉ áp dụng cho chứng từ nhập tay. Chứng từ đến từ một lô
 *      nhập Excel thì phải hoàn tác cả lô, vì sửa lẻ một chứng từ trong lô sẽ
 *      làm bảng đối chiếu của lô đó nói dối.
 *
 * Kỳ đã khóa thì trigger ở database chặn, không cần kiểm ở đây. Nhưng vẫn
 * kiểm, để người dùng nhận được câu tiếng Việt dễ hiểu thay vì lỗi SQL.
 */
const db = require('./db');

function loi(msg) {
  const e = new Error(msg);
  e.statusCode = 400;
  return e;
}

/* ── Chứng từ ──────────────────────────────────────────────────────────── */

function chuanHoaDong(dsDong) {
  if (!Array.isArray(dsDong) || dsDong.length < 2) {
    throw loi('Một chứng từ cần ít nhất hai dòng: một bên Nợ, một bên Có.');
  }
  if (dsDong.length > 200) throw loi('Một chứng từ tối đa 200 dòng.');

  return dsDong.map((d, i) => {
    const tk = String(d.tai_khoan || '').trim();
    if (!tk) throw loi(`Dòng ${i + 1}: chưa chọn tài khoản.`);
    const no = Number(d.no || 0);
    const co = Number(d.co || 0);
    if (!Number.isFinite(no) || !Number.isFinite(co)) throw loi(`Dòng ${i + 1}: số tiền không hợp lệ.`);
    if (no !== 0 && co !== 0) throw loi(`Dòng ${i + 1}: một dòng chỉ ghi một vế, Nợ hoặc Có.`);
    if (no === 0 && co === 0) throw loi(`Dòng ${i + 1}: chưa nhập số tiền.`);
    return {
      line_no: i + 1,
      tai_khoan: tk,
      doi_ung: String(d.doi_ung || '').trim() || null,
      no: Math.round(no * 100) / 100,
      co: Math.round(co * 100) / 100,
      doi_tac: String(d.doi_tac || '').trim() || null,
      khoan_muc: String(d.khoan_muc || '').trim() || null,
      dien_giai: String(d.dien_giai || '').trim() || null,
      hop_ly: d.hop_ly !== false,
    };
  });
}

async function kiemTraKy(client, kyCode) {
  const k = await client.query('select status from finance.periods where code = $1', [kyCode]);
  if (!k.rows.length) return;                      // kỳ mới, sẽ được tạo
  if (k.rows[0].status === 'locked') {
    throw loi(`Kỳ ${kyCode} đã khóa. Muốn sửa thì ghi bút toán điều chỉnh ở kỳ đang mở.`);
  }
}

async function taoChungTu(body, nguoi) {
  const so = String(body.so_chung_tu || '').trim();
  const ngay = String(body.ngay_hach_toan || '').slice(0, 10);
  if (!so) throw loi('Chưa nhập số chứng từ.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) throw loi('Ngày hạch toán không hợp lệ.');

  const dong = chuanHoaDong(body.dong);
  const nhom = String(body.nhom_can_bang || '').trim() || null;
  const tongNo = dong.reduce((s, d) => s + d.no, 0);
  const tongCo = dong.reduce((s, d) => s + d.co, 0);
  if (!nhom && Math.abs(tongNo - tongCo) > 0.005) {
    throw loi(`Chứng từ không cân: Nợ ${tongNo.toLocaleString('vi-VN')} khác Có ${tongCo.toLocaleString('vi-VN')}. `
      + 'Nếu chứng từ này cân theo cặp với chứng từ khác thì điền mã nhóm cân bằng.');
  }
  const ky = ngay.slice(0, 7);

  return db.tx(async (c) => {
    await kiemTraKy(c, ky);
    await c.query(
      `insert into finance.periods(code, start_date, end_date)
       values ($1, ($1 || '-01')::date, (($1 || '-01')::date + interval '1 month - 1 day')::date)
       on conflict (code) do nothing`, [ky],
    );
    const v = await c.query(
      `insert into finance.vouchers
         (voucher_no, posting_date, voucher_date, voucher_type, invoice_no,
          description, period_code, balance_group, source_ref)
       values ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9::jsonb)
       returning id::text`,
      [so, ngay, String(body.ngay_chung_tu || ngay).slice(0, 10),
       String(body.loai || '').trim() || (so.match(/^[A-Za-z]+/) || [null])[0],
       String(body.so_hoa_don || '').trim() || null,
       String(body.dien_giai || '').trim() || null, ky, nhom,
       JSON.stringify({ nhap_tay_boi: nguoi })],
    ).catch((e) => {
      if (e.code === '23505') throw loi(`Đã có chứng từ ${so} ngày ${ngay}. Số chứng từ và ngày phải là duy nhất.`);
      throw e;
    });
    const vid = v.rows[0].id;
    for (const d of dong) await chenDong(c, vid, d);
    return { id: vid, so_chung_tu: so, so_dong: dong.length };
  });
}

async function chenDong(c, vid, d) {
  await c.query(
    `insert into finance.journal_lines
       (voucher_id, line_no, account_code, contra_account_code, debit, credit,
        partner_code, cost_item_code, description, is_deductible)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [vid, d.line_no, d.tai_khoan, d.doi_ung, d.no, d.co,
     d.doi_tac, d.khoan_muc, d.dien_giai, d.hop_ly],
  ).catch((e) => {
    if (e.code === '23503' && /account_code/.test(e.detail || '')) {
      throw loi(`Tài khoản ${d.tai_khoan} không có trong hệ thống tài khoản.`);
    }
    if (e.code === '23503' && /partner_code/.test(e.detail || '')) {
      throw loi(`Đối tượng ${d.doi_tac} không có trong danh mục.`);
    }
    if (e.code === '23503' && /cost_item_code/.test(e.detail || '')) {
      throw loi(`Khoản mục ${d.khoan_muc} không có trong danh mục.`);
    }
    throw e;
  });
}

async function suaChungTu(id, body, nguoi) {
  const cu = await db.one(
    'select id::text, batch_id, period_code, voucher_no from finance.vouchers where id = $1', [id],
  );
  if (!cu) throw loi('Không có chứng từ này.');
  if (cu.batch_id) {
    throw loi('Chứng từ này thuộc một lô nhập từ Excel. Sửa lẻ sẽ làm bảng đối chiếu của lô nói dối. '
      + 'Muốn sửa thì hoàn tác cả lô rồi nhập lại, hoặc ghi bút toán điều chỉnh.');
  }
  const dong = chuanHoaDong(body.dong);
  const nhom = String(body.nhom_can_bang || '').trim() || null;
  const tongNo = dong.reduce((s, d) => s + d.no, 0);
  const tongCo = dong.reduce((s, d) => s + d.co, 0);
  if (!nhom && Math.abs(tongNo - tongCo) > 0.005) throw loi('Chứng từ không cân.');

  const ngay = String(body.ngay_hach_toan || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) throw loi('Ngày hạch toán không hợp lệ.');
  const ky = ngay.slice(0, 7);

  return db.tx(async (c) => {
    await kiemTraKy(c, cu.period_code);
    await kiemTraKy(c, ky);
    await c.query(
      `insert into finance.periods(code, start_date, end_date)
       values ($1, ($1 || '-01')::date, (($1 || '-01')::date + interval '1 month - 1 day')::date)
       on conflict (code) do nothing`, [ky],
    );
    await c.query(
      `update finance.vouchers
          set voucher_no = $2, posting_date = $3::date, voucher_date = $4::date,
              voucher_type = $5, invoice_no = $6, description = $7,
              period_code = $8, balance_group = $9,
              source_ref = source_ref || jsonb_build_object('sua_lan_cuoi_boi', $10::text)
        where id = $1`,
      [id, String(body.so_chung_tu || '').trim(), ngay,
       String(body.ngay_chung_tu || ngay).slice(0, 10),
       String(body.loai || '').trim() || null,
       String(body.so_hoa_don || '').trim() || null,
       String(body.dien_giai || '').trim() || null, ky, nhom, nguoi],
    );
    // Thay toàn bộ dòng thay vì sửa từng dòng: người dùng có thể đã xóa dòng
    // giữa, và ghép hiệu số của hai danh sách là chỗ dễ sai nhất.
    await c.query('delete from finance.journal_lines where voucher_id = $1', [id]);
    for (const d of dong) await chenDong(c, id, d);
    return { id, so_dong: dong.length };
  });
}

async function xoaChungTu(id) {
  const v = await db.one(
    'select batch_id, period_code, voucher_no from finance.vouchers where id = $1', [id],
  );
  if (!v) throw loi('Không có chứng từ này.');
  if (v.batch_id) throw loi('Chứng từ thuộc lô nhập Excel. Hoàn tác cả lô ở màn Nhập liệu.');
  const k = await db.one('select status from finance.periods where code = $1', [v.period_code]);
  if (k && k.status === 'locked') throw loi(`Kỳ ${v.period_code} đã khóa, không xóa được.`);
  await db.query('delete from finance.vouchers where id = $1', [id]);
  return v.voucher_no;
}

/* ── Danh mục ──────────────────────────────────────────────────────────── */

const TINH_CHAT = ['debit', 'credit', 'both'];
const LOAI_DOI_TAC = ['customer', 'supplier', 'employee', 'other'];

async function luuTaiKhoan(body) {
  const ma = String(body.code || '').trim();
  const ten = String(body.name || '').trim();
  if (!/^\d{3,10}$/.test(ma)) throw loi('Mã tài khoản là 3 tới 10 chữ số.');
  if (ten.length < 2) throw loi('Chưa nhập tên tài khoản.');
  const tinhChat = TINH_CHAT.includes(body.nature) ? body.nature : 'both';
  return db.one(
    `insert into finance.accounts(code, name, name_en, nature, depth, is_active, note)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (code) do update set name = excluded.name, name_en = excluded.name_en,
           nature = excluded.nature, is_active = excluded.is_active,
           note = excluded.note, updated_at = now()
     returning code, name, nature, is_active`,
    [ma, ten, String(body.name_en || '').trim() || null, tinhChat,
     Math.max(ma.length - 2, 1), body.is_active !== false,
     String(body.note || '').trim() || null],
  );
}

async function xoaTaiKhoan(ma) {
  const d = await db.one(
    'select count(*)::int as n from finance.journal_lines where account_code = $1', [ma],
  );
  if (d.n > 0) {
    throw loi(`Tài khoản ${ma} đang có ${d.n.toLocaleString('vi-VN')} bút toán, không xóa được. `
      + 'Đánh dấu ngừng sử dụng thay vì xóa: số liệu quá khứ phải giữ nguyên.');
  }
  await db.query('delete from finance.accounts where code = $1', [ma]);
  return ma;
}

async function luuDoiTac(body) {
  const ma = String(body.code || '').trim();
  const ten = String(body.name || '').trim();
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(ma)) throw loi('Mã đối tượng 2 tới 32 ký tự, chữ và số.');
  if (ten.length < 2) throw loi('Chưa nhập tên đối tượng.');
  const kind = LOAI_DOI_TAC.includes(body.kind) ? body.kind : 'customer';
  return db.one(
    `insert into finance.partners(code, name, kind, tax_code, address, phone, is_active)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (code) do update set name = excluded.name, kind = excluded.kind,
           tax_code = excluded.tax_code, address = excluded.address,
           phone = excluded.phone, is_active = excluded.is_active, updated_at = now()
     returning code, name, kind, is_active`,
    [ma, ten, kind, String(body.tax_code || '').trim() || null,
     String(body.address || '').trim() || null, String(body.phone || '').trim() || null,
     body.is_active !== false],
  );
}

async function xoaDoiTac(ma) {
  const d = await db.one(
    'select count(*)::int as n from finance.journal_lines where partner_code = $1', [ma],
  );
  if (d.n > 0) throw loi(`Đối tượng ${ma} đang có ${d.n} bút toán. Đánh dấu ngừng dùng thay vì xóa.`);
  await db.query('delete from finance.partners where code = $1', [ma]);
  return ma;
}

async function luuKhoanMuc(body) {
  const ma = String(body.code || '').trim();
  const ten = String(body.name || '').trim();
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(ma)) throw loi('Mã khoản mục 1 tới 32 ký tự.');
  if (ten.length < 2) throw loi('Chưa nhập tên khoản mục.');
  return db.one(
    `insert into finance.cost_items(code, name, branch_code, is_active)
     values ($1, $2, $3, $4)
     on conflict (code) do update set name = excluded.name,
           branch_code = excluded.branch_code, is_active = excluded.is_active
     returning code, name, branch_code, is_active`,
    [ma, ten, String(body.branch_code || '').trim() || (ma.includes('.') ? ma.split('.')[1] : null),
     body.is_active !== false],
  );
}

async function xoaKhoanMuc(ma) {
  const d = await db.one(
    'select count(*)::int as n from finance.journal_lines where cost_item_code = $1', [ma],
  );
  if (d.n > 0) throw loi(`Khoản mục ${ma} đang có ${d.n} bút toán. Đánh dấu ngừng dùng thay vì xóa.`);
  await db.query('delete from finance.cost_items where code = $1', [ma]);
  return ma;
}

module.exports = {
  taoChungTu, suaChungTu, xoaChungTu,
  luuTaiKhoan, xoaTaiKhoan, luuDoiTac, xoaDoiTac, luuKhoanMuc, xoaKhoanMuc,
};
