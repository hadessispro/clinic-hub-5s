'use strict';
/**
 * Nhập bộ sổ kế toán từ file Excel, qua giao diện.
 *
 * Nguyên tắc không thay đổi so với bản chạy bằng dòng lệnh: KHÔNG BAO GIỜ ghi
 * thẳng vào sổ cái. File đi qua bốn bước, và mỗi bước có thể dừng lại:
 *
 *   1. đọc      · nhận diện loại file theo tiêu đề, ép kiểu
 *   2. kiểm     · năm tầng kiểm tra, tầng nào hỏng thì nói rõ dòng nào
 *   3. xem thử  · người nhập nhìn đối chiếu trước khi quyết định
 *   4. ghi sổ   · một giao dịch duy nhất, lỗi là hoàn tác trọn vẹn
 *
 * Bước 3 không phải thủ tục hành chính. Bộ sổ thật đã dạy hai bài học ở đúng
 * chỗ này: dòng "Tổng" ở cuối bảng bị đọc thành một nhà cung cấp tên rỗng, và
 * hai bút toán ghi số âm bị tưởng là lỗi nhập liệu. Cả hai chỉ lộ ra khi có
 * người nhìn vào bảng đối chiếu.
 */
const { createHash } = require('node:crypto');
const ExcelJS = require('exceljs');
const db = require('./db');
const { rows: rows_ } = db;

/* ── Nhận diện loại file ───────────────────────────────────────────────── */

const LOAI = {
  nhat_ky: {
    ten: 'Sổ nhật ký chung',
    dau: ['Ngày hạch toán', 'Tài khoản', 'Phát sinh Nợ', 'Phát sinh Có'],
  },
  tai_khoan: {
    ten: 'Hệ thống tài khoản',
    dau: ['Số tài khoản', 'Tên tài khoản', 'Tính chất'],
  },
  khoan_muc: {
    ten: 'Danh mục khoản mục chi phí',
    dau: ['Mã khoản mục chi phí', 'Tên khoản mục chi phí'],
  },
  nha_cung_cap: {
    ten: 'Danh sách nhà cung cấp',
    dau: ['Mã nhà cung cấp', 'Tên nhà cung cấp'],
  },
  can_doi: {
    ten: 'Bảng cân đối tài khoản',
    dau: ['Số tài khoản', 'Tên tài khoản', 'Đầu kỳ'],
  },
};

const CHUAN = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Dòng tổng cuối bảng: không có số thứ tự, hoặc mã là chữ "Tổng". */
const TU_TONG = new Set(['tổng', 'tổng cộng', 'cộng', 'total', 'sum']);

function laDongTong(stt, ma, ten) {
  if (TU_TONG.has(CHUAN(ma).toLowerCase())) return true;
  if (!CHUAN(stt) && !CHUAN(ten)) return true;
  return false;
}

/** Tìm dòng tiêu đề trong 12 dòng đầu, và loại file khớp với nó. */
function nhanDien(sheet) {
  for (let i = 1; i <= Math.min(12, sheet.rowCount); i += 1) {
    const o = sheet.getRow(i).values.map(CHUAN);
    for (const [ma, def] of Object.entries(LOAI)) {
      if (def.dau.every((d) => o.includes(d))) {
        // Giữ chỉ số ĐẦU TIÊN, không phải cuối cùng. Ô tiêu đề gộp như
        // "Phát sinh" trải trên hai cột Nợ và Có, và ExcelJS điền cùng một
        // chữ vào cả hai. Giữ chỉ số cuối là trỏ vào cột Có rồi gọi nó là
        // cột Nợ: con số đọc ra vẫn trông hợp lý nên không ai nhận ra.
        const cot = {};
        o.forEach((ten, idx) => { if (ten && cot[ten] === undefined) cot[ten] = idx; });
        return { loai: ma, dongTieuDe: i, cot };
      }
    }
  }
  return null;
}

function so(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v.result !== undefined) return Number(v.result) || 0;
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(s) || 0;
}

function ngay(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.result instanceof Date) return v.result;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function chu(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.text !== undefined) return CHUAN(v.text);
    if (v.result !== undefined) return CHUAN(v.result);
    if (Array.isArray(v.richText)) return CHUAN(v.richText.map((r) => r.text).join(''));
  }
  return CHUAN(v);
}

function kyCua(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── Đọc ───────────────────────────────────────────────────────────────── */

async function docFile(buffer, tenFile) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ketQua = { ten_file: tenFile, sha256: createHash('sha256').update(buffer).digest('hex'),
                   kich_thuoc: buffer.length, sheet: [], loai: null, dong: [], bo_qua: [] };

  for (const sheet of wb.worksheets) {
    const nd = nhanDien(sheet);
    if (!nd) { ketQua.sheet.push({ ten: sheet.name, nhan_dien: null, so_dong: 0 }); continue; }
    if (ketQua.loai && ketQua.loai !== nd.loai) {
      throw new Error(`File có hai loại bảng khác nhau: ${LOAI[ketQua.loai].ten} và ${LOAI[nd.loai].ten}. Tách thành hai file.`);
    }
    ketQua.loai = nd.loai;
    const truoc = ketQua.dong.length;
    docSheet(sheet, nd, ketQua);
    ketQua.sheet.push({ ten: sheet.name, nhan_dien: nd.loai, so_dong: ketQua.dong.length - truoc });
  }

  if (!ketQua.loai) {
    throw new Error('Không nhận ra loại bảng. Cần một trong: '
      + Object.values(LOAI).map((l) => l.ten).join(', ') + '.');
  }
  return ketQua;
}

function docSheet(sheet, nd, kq) {
  const c = (r, ten) => r.getCell(nd.cot[ten] ?? 0).value;
  for (let i = nd.dongTieuDe + 1; i <= sheet.rowCount; i += 1) {
    const r = sheet.getRow(i);
    if (!r.hasValues) continue;

    if (kq.loai === 'nhat_ky') {
      const d = ngay(c(r, 'Ngày hạch toán'));
      if (!d) continue;                                   // dòng tổng, dòng chú thích
      kq.dong.push({
        sheet: sheet.name, dong: i,
        ngay_hach_toan: d, ngay_chung_tu: ngay(c(r, 'Ngày chứng từ')) || d,
        so_chung_tu: chu(c(r, 'Số chứng từ')),
        so_hoa_don: chu(c(r, 'Số hóa đơn')) || null,
        dien_giai: chu(c(r, 'Diễn giải')) || null,
        tai_khoan: chu(c(r, 'Tài khoản')),
        doi_ung: chu(c(r, 'TK đối ứng')) || null,
        no: so(c(r, 'Phát sinh Nợ')), co: so(c(r, 'Phát sinh Có')),
        ma_doi_tuong: chu(c(r, 'Mã đối tượng')) || null,
        ten_doi_tuong: chu(c(r, 'Tên đối tượng')) || null,
        hop_ly: !/không hợp lý/i.test(chu(c(r, 'CP hợp lý/không hợp lý'))),
      });
    } else if (kq.loai === 'tai_khoan') {
      const ma = chu(c(r, 'Số tài khoản'));
      const ten = chu(c(r, 'Tên tài khoản'));
      if (!ma || !/^\d/.test(ma)) continue;
      if (laDongTong(chu(r.getCell(1).value), ma, ten)) { kq.bo_qua.push(`dòng ${i}: dòng tổng`); continue; }
      kq.dong.push({ dong: i, ma, ten, tinh_chat: chu(c(r, 'Tính chất')),
                     ten_en: chu(c(r, 'Tên tiếng Anh')) || null,
                     dang_dung: chu(c(r, 'Trạng thái')) === 'Đang sử dụng' });
    } else if (kq.loai === 'khoan_muc') {
      const ma = chu(c(r, 'Mã khoản mục chi phí'));
      const ten = chu(c(r, 'Tên khoản mục chi phí'));
      if (!ma) continue;
      if (laDongTong(chu(r.getCell(1).value), ma, ten)) { kq.bo_qua.push(`dòng ${i}: dòng tổng`); continue; }
      kq.dong.push({ dong: i, ma, ten,
                     dang_dung: chu(c(r, 'Trạng thái')) === 'Đang sử dụng' });
    } else if (kq.loai === 'nha_cung_cap') {
      const ma = chu(c(r, 'Mã nhà cung cấp'));
      const ten = chu(c(r, 'Tên nhà cung cấp'));
      if (!ma) continue;
      if (laDongTong(chu(r.getCell(1).value), ma, ten)) { kq.bo_qua.push(`dòng ${i}: dòng tổng`); continue; }
      kq.dong.push({ dong: i, ma, ten,
                     dia_chi: chu(c(r, 'Địa chỉ')) || null,
                     ma_so_thue: chu(c(r, 'Mã số thuế/CCCD chủ hộ')) || null,
                     dien_thoai: chu(c(r, 'Điện thoại')) || null });
    } else if (kq.loai === 'can_doi') {
      const ma = chu(c(r, 'Số tài khoản'));
      if (!ma || !/^\d/.test(ma)) continue;
      const v = r.values.map(so);
      // Tiêu đề của bảng này gộp ô: một dòng ghi Đầu kỳ, Phát sinh, Cuối kỳ,
      // dòng dưới ghi Nợ và Có cho từng cụm. Bám thẳng vào vị trí chữ
      // "Phát sinh" thay vì đếm lùi từ "Đầu kỳ": đếm lùi sai một cột là đọc
      // nhầm cột Có thành cột Nợ, và con số vẫn trông hợp lý nên không ai
      // nhận ra.
      const b = nd.cot['Phát sinh'];
      if (b === undefined) continue;
      kq.dong.push({ dong: i, ma, ten: chu(c(r, 'Tên tài khoản')),
                     ps_no: v[b] || 0, ps_co: v[b + 1] || 0 });
    }
  }
}

/* ── Kiểm tra ──────────────────────────────────────────────────────────── */

const TINH_CHAT = { 'Dư Nợ': 'debit', 'Dư Có': 'credit', 'Lưỡng tính': 'both' };

async function kiemTra(doc) {
  const tang = [];
  const loi = [];
  const canh = [];
  const dat = (ten, mo) => tang.push({ ten, mo, dat: true });
  const hong = (ten, mo) => { tang.push({ ten, mo, dat: false }); loi.push(`${ten}: ${mo}`); };

  // Tầng 1 · cấu trúc
  dat('Cấu trúc', `Nhận diện: ${LOAI[doc.loai].ten}. ${doc.sheet.filter((s) => s.nhan_dien).length} sheet, `
    + `${doc.dong.length.toLocaleString('vi-VN')} dòng dữ liệu.`);
  if (doc.bo_qua.length) canh.push(`Bỏ qua ${doc.bo_qua.length} dòng tổng ở cuối bảng.`);

  if (doc.loai === 'can_doi') {
    // Bảng cân đối KHÔNG ghi vào sổ. Nó là bản đối chứng: sổ trong hệ thống
    // phải khớp với bảng mà phần mềm kế toán xuất ra. Lệch thì một trong hai
    // sai, và biết được cái nào sai là việc của người, không phải của máy.
    const soHT = await rows_(
      `select account_code, sum(ps_debit) as no, sum(ps_credit) as co
       from finance.v_trial_balance group by 1`,
    );
    const bang = new Map(soHT.map((r) => [r.account_code, r]));
    const khop = [];
    const lech = [];
    const thieu = [];
    for (const d of doc.dong) {
      const h = bang.get(d.ma);
      if (!h) { if (d.ps_no || d.ps_co) thieu.push(d.ma); continue; }
      const dNo = Math.round((Number(h.no) - d.ps_no) * 100) / 100;
      const dCo = Math.round((Number(h.co) - d.ps_co) * 100) / 100;
      if (Math.abs(dNo) < 0.005 && Math.abs(dCo) < 0.005) khop.push(d.ma);
      else lech.push({ ma: d.ma, ten: d.ten, so_no: Number(h.no), file_no: d.ps_no,
                       so_co: Number(h.co), file_co: d.ps_co, lech_no: dNo, lech_co: dCo });
    }
    if (lech.length) {
      hong('Đối chiếu chéo',
        `${khop.length} tài khoản khớp, ${lech.length} lệch: `
        + lech.slice(0, 6).map((x) => `${x.ma} (Nợ lệch ${Math.round(x.lech_no).toLocaleString('vi-VN')})`).join(', ')
        + '. Sổ trong hệ thống và bảng cân đối đang nói hai chuyện khác nhau.');
    } else {
      dat('Đối chiếu chéo', `Toàn bộ ${khop.length} tài khoản khớp tuyệt đối với sổ trong hệ thống.`);
    }
    if (thieu.length) {
      canh.push(`${thieu.length} tài khoản có phát sinh trong bảng nhưng không có bút toán nào `
        + `trong sổ: ${thieu.slice(0, 8).join(', ')}.`);
    }
    canh.push('Bảng cân đối tài khoản chỉ dùng để đối chiếu, không ghi vào sổ. '
      + 'Sổ cái được dựng từ Sổ nhật ký chung.');
    return { tang, loi, canh, chi_doi_chieu: true,
             tom_tat: { loai: doc.loai, so_dong: doc.dong.length,
                        so_khop: khop.length, so_lech: lech.length, lech,
                        xem_thu: doc.dong.slice(0, 60) } };
  }

  if (doc.loai !== 'nhat_ky') {
    // Danh mục: chỉ cần mọi dòng có tên và mã không trùng.
    const thieuTen = doc.dong.filter((d) => !d.ten);
    if (thieuTen.length) hong('Nội dung', `${thieuTen.length} dòng không có tên, ví dụ dòng ${thieuTen[0].dong}.`);
    else dat('Nội dung', 'Mọi dòng đều có mã và tên.');

    const dem = new Map();
    doc.dong.forEach((d) => dem.set(d.ma, (dem.get(d.ma) || 0) + 1));
    const trung = [...dem].filter(([, n]) => n > 1);
    if (trung.length) hong('Trùng mã', `${trung.length} mã xuất hiện nhiều lần: ${trung.slice(0, 5).map(([m]) => m).join(', ')}.`);
    else dat('Trùng mã', 'Không có mã nào lặp lại.');

    if (doc.loai === 'tai_khoan') {
      const la = doc.dong.filter((d) => !TINH_CHAT[d.tinh_chat]);
      if (la.length) hong('Tính chất', `${la.length} tài khoản có tính chất không nhận diện được, ví dụ ${la[0].ma} "${la[0].tinh_chat}".`);
      else dat('Tính chất', 'Mọi tài khoản đều là Dư Nợ, Dư Có hoặc Lưỡng tính.');
    }
    return { tang, loi, canh, tom_tat: tomTatDanhMuc(doc) };
  }

  // Tầng 2 · ép kiểu
  const saiHaiVe = doc.dong.filter((d) => d.no !== 0 && d.co !== 0);
  if (saiHaiVe.length) hong('Ép kiểu', `${saiHaiVe.length} dòng có cả Nợ và Có, ví dụ ${saiHaiVe[0].sheet} dòng ${saiHaiVe[0].dong}.`);
  else dat('Ép kiểu', 'Mọi dòng chỉ ghi một vế.');

  const am = doc.dong.filter((d) => d.no < 0 || d.co < 0);
  if (am.length) {
    canh.push(`${am.length} bút toán đỏ ghi số âm, giữ nguyên dấu: `
      + am.slice(0, 3).map((d) => `${d.so_chung_tu} (${d.no || d.co})`).join(', ') + '.');
  }

  // Tầng 3 · nghiệp vụ
  const maTK = new Set((await db.rows('select code from finance.accounts')).map((r) => r.code));
  const laTK = [...new Set(doc.dong.map((d) => d.tai_khoan).filter((m) => m && !maTK.has(m)))];
  if (laTK.length) hong('Danh mục tài khoản', `${laTK.length} tài khoản chưa có trong hệ thống: ${laTK.slice(0, 8).join(', ')}. Nhập Hệ thống tài khoản trước.`);
  else dat('Danh mục tài khoản', 'Mọi tài khoản trong nhật ký đều có trong danh mục.');

  const thieuCT = doc.dong.filter((d) => !d.so_chung_tu);
  if (thieuCT.length) hong('Số chứng từ', `${thieuCT.length} dòng không có số chứng từ.`);
  else dat('Số chứng từ', 'Mọi dòng đều có số chứng từ.');

  // Tầng 4 · bất biến kế toán
  const tongNo = doc.dong.reduce((s, d) => s + d.no, 0);
  const tongCo = doc.dong.reduce((s, d) => s + d.co, 0);
  const lech = Math.round((tongNo - tongCo) * 100) / 100;
  if (Math.abs(lech) > 0.005) {
    hong('Nợ bằng Có', `Lệch ${lech.toLocaleString('vi-VN')} đồng. Nợ ${Math.round(tongNo).toLocaleString('vi-VN')}, Có ${Math.round(tongCo).toLocaleString('vi-VN')}.`);
  } else {
    dat('Nợ bằng Có', `Cân tuyệt đối: ${Math.round(tongNo).toLocaleString('vi-VN')} đồng cả hai bên.`);
  }

  // Chứng từ: gom theo số chứng từ và ngày
  const ct = new Map();
  for (const d of doc.dong) {
    const k = `${d.so_chung_tu}|${d.ngay_hach_toan.toISOString().slice(0, 10)}`;
    if (!ct.has(k)) ct.set(k, { no: 0, co: 0, so: d.so_chung_tu, ngay: d.ngay_hach_toan, dong: 0 });
    const g = ct.get(k);
    g.no += d.no; g.co += d.co; g.dong += 1;
  }
  const khongCan = [...ct.values()].filter((g) => Math.abs(g.no - g.co) > 0.005);
  if (khongCan.length) {
    canh.push(`${khongCan.length} chứng từ không tự cân. Trong bộ sổ thật đây thường là chứng từ cân theo cặp, `
      + `ví dụ ${khongCan.slice(0, 3).map((g) => g.so).join(', ')}. Cân bằng vẫn được kiểm ở mức kỳ.`);
  }
  dat('Chứng từ', `${ct.size.toLocaleString('vi-VN')} chứng từ, ${(ct.size - khongCan.length).toLocaleString('vi-VN')} tự cân.`);

  // Tầng 5 · trùng lặp với sổ đã có
  const soCT = [...ct.values()].slice(0, 5000).map((g) => `${g.so}|${g.ngay.toISOString().slice(0, 10)}`);
  const daCo = await db.rows(
    `select voucher_no || '|' || posting_date::text as k from finance.vouchers
      where voucher_no || '|' || posting_date::text = any($1::text[])`, [soCT],
  );
  if (daCo.length) {
    canh.push(`${daCo.length} chứng từ đã có trong sổ và sẽ được bỏ qua, không ghi đè: `
      + daCo.slice(0, 3).map((r) => r.k.split('|')[0]).join(', ') + '.');
  }
  dat('Trùng lặp', daCo.length ? `${daCo.length} chứng từ trùng sẽ bỏ qua.` : 'Không trùng chứng từ nào đã có.');

  return {
    tang, loi, canh,
    tom_tat: {
      loai: doc.loai, so_dong: doc.dong.length, so_chung_tu: ct.size,
      tong_no: Math.round(tongNo), tong_co: Math.round(tongCo), lech,
      so_but_toan_do: am.length, chung_tu_khong_can: khongCan.length,
      chung_tu_trung: daCo.length,
      ky: [...new Set(doc.dong.map((d) => kyCua(d.ngay_hach_toan)))].sort(),
    },
    xem_thu: doc.dong.slice(0, 60),
  };
}

function tomTatDanhMuc(doc) {
  return { loai: doc.loai, so_dong: doc.dong.length,
           xem_thu: doc.dong.slice(0, 60) };
}

/* ── Lưu tạm ───────────────────────────────────────────────────────────── */

async function luuTam(doc, ketQua, nguoi) {
  return db.tx(async (c) => {
    const b = await c.query(
      `insert into finance.import_batches
         (source_file, source_sha256, sheet_names, row_count, status, recon, errors, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id::text`,
      [doc.ten_file, doc.sha256, doc.sheet.map((s) => s.ten), doc.dong.length,
       ketQua.loi.length ? 'rejected' : 'validated',
       JSON.stringify({ ...ketQua.tom_tat, canh_bao: ketQua.canh, tang: ketQua.tang }),
       JSON.stringify(ketQua.loi), nguoi],
    );
    const id = b.rows[0].id;
    // Giữ nguyên dòng thô để truy ngược về file gốc khi có tranh cãi số liệu.
    for (let i = 0; i < doc.dong.length; i += 500) {
      const lo = doc.dong.slice(i, i + 500);
      const vals = [];
      const args = [];
      lo.forEach((d, j) => {
        args.push(id, d.sheet || doc.sheet[0]?.ten || '?', d.dong, JSON.stringify(d));
        vals.push(`($${j * 4 + 1}::uuid, $${j * 4 + 2}, $${j * 4 + 3}::int, $${j * 4 + 4}::jsonb)`);
      });
      await c.query(
        `insert into finance.import_rows(batch_id, sheet_name, row_no, raw) values ${vals.join(',')}`,
        args,
      );
    }
    return id;
  });
}

/* ── Ghi sổ ────────────────────────────────────────────────────────────── */

async function ghiSo(batchId, nguoi) {
  const lo = await db.one(
    `select id::text, source_file, status, recon from finance.import_batches where id = $1`,
    [batchId],
  );
  if (!lo) throw new Error('Không có lô nhập này.');
  if (lo.status === 'posted') throw new Error('Lô này đã ghi vào sổ rồi.');
  if (lo.status === 'rejected') throw new Error('Lô này không qua kiểm tra, không ghi được.');

  const raw = await db.rows(
    `select raw from finance.import_rows where batch_id = $1 order by id`, [batchId],
  );
  const dong = raw.map((r) => r.raw);
  if (!dong.length) throw new Error('Lô rỗng.');

  const loai = lo.recon?.loai;
  return db.tx(async (c) => {
    let ghi = 0;
    if (loai === 'nhat_ky') ghi = await ghiNhatKy(c, batchId, dong);
    else if (loai === 'tai_khoan') ghi = await ghiTaiKhoan(c, dong);
    else if (loai === 'khoan_muc') ghi = await ghiKhoanMuc(c, dong);
    else if (loai === 'nha_cung_cap') ghi = await ghiDoiTac(c, dong);
    else throw new Error(`Loại ${loai} chưa hỗ trợ ghi sổ.`);

    await c.query(
      `update finance.import_batches
          set status = 'posted', posted_at = now(), posted_by = $2,
              recon = recon || jsonb_build_object('so_ban_ghi_da_ghi', $3::int)
        where id = $1`,
      [batchId, nguoi, ghi],
    );
    return ghi;
  });
}

const TIEN_TO = { NCC: 'supplier', NV: 'employee' };

function loaiDoiTac(ma) {
  const t = (ma.match(/^[A-Za-z]+/) || [''])[0].toUpperCase().slice(0, 3);
  return TIEN_TO[t] || 'customer';
}

async function ghiNhatKy(c, batchId, dong) {
  // Kỳ kế toán phải có trước, chứng từ tham chiếu tới nó.
  const kys = [...new Set(dong.map((d) => String(d.ngay_hach_toan).slice(0, 7)))];
  for (const k of kys) {
    await c.query(
      `insert into finance.periods(code, start_date, end_date)
       values ($1, ($1 || '-01')::date, (($1 || '-01')::date + interval '1 month - 1 day')::date)
       on conflict (code) do nothing`, [k],
    );
  }
  // Đối tượng công nợ xuất hiện trong nhật ký mà chưa có trong danh mục thì
  // tạo luôn, nếu không khóa ngoại sẽ chặn cả lô vì một cái tên.
  const dt = new Map();
  dong.forEach((d) => { if (d.ma_doi_tuong && !dt.has(d.ma_doi_tuong)) dt.set(d.ma_doi_tuong, d.ten_doi_tuong || d.ma_doi_tuong); });
  for (const [ma, ten] of dt) {
    await c.query(
      `insert into finance.partners(code, name, kind) values ($1, $2, $3)
       on conflict (code) do nothing`, [ma, ten, loaiDoiTac(ma)],
    );
  }

  const ct = new Map();
  for (const d of dong) {
    const ngayISO = String(d.ngay_hach_toan).slice(0, 10);
    const k = `${d.so_chung_tu}|${ngayISO}`;
    if (!ct.has(k)) ct.set(k, { so: d.so_chung_tu, ngay: ngayISO, dau: d, dong: [] });
    ct.get(k).dong.push(d);
  }

  let ghi = 0;
  for (const g of ct.values()) {
    const v = await c.query(
      `insert into finance.vouchers
         (voucher_no, posting_date, voucher_date, voucher_type, invoice_no,
          description, period_code, batch_id, source_ref)
       values ($1, $2::date, $3::date, $4, $5, $6, $7, $8::uuid, $9::jsonb)
       on conflict (voucher_no, posting_date) do nothing
       returning id::text`,
      [g.so, g.ngay, String(g.dau.ngay_chung_tu).slice(0, 10),
       (g.so.match(/^[A-Za-z]+/) || [null])[0], g.dau.so_hoa_don,
       g.dau.dien_giai, g.ngay.slice(0, 7), batchId,
       JSON.stringify({ file: 'tai_len_qua_giao_dien' })],
    );
    if (!v.rows.length) continue;                  // đã có, bỏ qua, không ghi đè
    const vid = v.rows[0].id;
    let stt = 0;
    for (const d of g.dong) {
      stt += 1;
      await c.query(
        `insert into finance.journal_lines
           (voucher_id, line_no, account_code, contra_account_code, debit, credit,
            partner_code, description, is_deductible, source_sheet, source_row)
         values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [vid, stt, d.tai_khoan, d.doi_ung, d.no, d.co, d.ma_doi_tuong,
         d.dien_giai, d.hop_ly !== false, d.sheet, d.dong],
      );
      ghi += 1;
    }
  }
  return ghi;
}

async function ghiTaiKhoan(c, dong) {
  const bac = { 'Dư Nợ': 'debit', 'Dư Có': 'credit', 'Lưỡng tính': 'both' };
  let ghi = 0;
  for (const d of dong) {
    await c.query(
      `insert into finance.accounts(code, name, name_en, nature, depth, is_active)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (code) do update set name = excluded.name,
             name_en = excluded.name_en, nature = excluded.nature,
             is_active = excluded.is_active, updated_at = now()`,
      [d.ma, d.ten, d.ten_en || null, bac[d.tinh_chat] || 'both',
       Math.max(d.ma.length - 2, 1), d.dang_dung !== false],
    );
    ghi += 1;
  }
  return ghi;
}

async function ghiKhoanMuc(c, dong) {
  let ghi = 0;
  for (const d of dong) {
    await c.query(
      `insert into finance.cost_items(code, name, branch_code, is_active)
       values ($1, $2, $3, $4)
       on conflict (code) do update set name = excluded.name,
             branch_code = excluded.branch_code, is_active = excluded.is_active`,
      [d.ma, d.ten, d.ma.includes('.') ? d.ma.split('.')[1] : null, d.dang_dung !== false],
    );
    ghi += 1;
  }
  return ghi;
}

async function ghiDoiTac(c, dong) {
  let ghi = 0;
  for (const d of dong) {
    await c.query(
      `insert into finance.partners(code, name, kind, tax_code, address, phone)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (code) do update set name = excluded.name,
             tax_code = coalesce(excluded.tax_code, finance.partners.tax_code),
             address  = coalesce(excluded.address,  finance.partners.address),
             phone    = coalesce(excluded.phone,    finance.partners.phone),
             updated_at = now()`,
      [d.ma, d.ten, loaiDoiTac(d.ma), d.ma_so_thue, d.dia_chi, d.dien_thoai],
    );
    ghi += 1;
  }
  return ghi;
}

/* ── Hủy lô ────────────────────────────────────────────────────────────── */

async function huy(batchId) {
  const r = await db.one(
    `update finance.import_batches set status = 'rejected'
      where id = $1 and status <> 'posted' returning id::text`, [batchId],
  );
  if (!r) throw new Error('Lô không tồn tại hoặc đã ghi vào sổ, không hủy được.');
  await db.query('delete from finance.import_rows where batch_id = $1', [batchId]);
  return true;
}

/**
 * Hoàn tác một lô đã ghi. Xóa đúng những chứng từ mang batch_id của lô đó, nên
 * không đụng vào chứng từ của lô khác dù trùng số. journal_lines đi theo nhờ
 * on delete cascade.
 */
async function hoanTac(batchId, nguoi) {
  return db.tx(async (c) => {
    const lo = await c.query('select status from finance.import_batches where id = $1', [batchId]);
    if (!lo.rows.length) throw new Error('Không có lô này.');
    if (lo.rows[0].status !== 'posted') throw new Error('Lô chưa ghi vào sổ, không có gì để hoàn tác.');
    const x = await c.query('delete from finance.vouchers where batch_id = $1 returning 1', [batchId]);
    await c.query(
      `update finance.import_batches
          set status = 'reverted', reverted_at = now(),
              recon = recon || jsonb_build_object('hoan_tac_boi', $2::text)
        where id = $1`, [batchId, nguoi],
    );
    return x.rowCount;
  });
}

module.exports = { docFile, kiemTra, luuTam, ghiSo, huy, hoanTac, LOAI };
