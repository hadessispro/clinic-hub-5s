'use strict';
/*
 * Finance Vault · giao diện.
 *
 * Không dùng khung nào cả. Két tiền càng ít phụ thuộc bên ngoài càng ít mặt
 * tấn công: mỗi gói npm chạy trong trình duyệt là một người lạ được phép đọc
 * mọi con số trên màn hình này.
 *
 * Bốn quy ước:
 *   1. Số tiền là chuỗi từ đầu tới cuối, chỉ đổi sang số khi định dạng hiển
 *      thị. numeric(18,2) vượt dải an toàn của Number.
 *   2. Mọi văn bản từ máy chủ đều đi qua createTextNode, không bao giờ
 *      innerHTML. Tên đối tác là dữ liệu người nhập.
 *   3. Token nằm trong biến JavaScript, không nằm trong localStorage. Đóng tab
 *      là mất phiên, đúng như két tiền nên hành xử.
 *   4. Không có thuộc tính style nội tuyến. Content-Security-Policy đặt
 *      style-src 'self' nên trình duyệt từ chối chúng.
 */

const GOC = location.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '') || '/vault';

/* ── Sáng hay tối ──────────────────────────────────────────────────────────
   Mặc định là bản sáng theo màu thương hiệu, KHÔNG chạy theo cài đặt của hệ
   điều hành. Lý do: đây là màn hình người ta chụp lại đưa vào báo cáo và in
   ra giấy, nên nó phải trông giống nhau ở mọi máy. Ai muốn tối thì tự bật. */

function docChuDe() {
  try { return localStorage.getItem('vault-chu-de') || 'light'; } catch { return 'light'; }
}
function datChuDe(v) {
  document.documentElement.setAttribute('data-theme', v);
  try { localStorage.setItem('vault-chu-de', v); } catch { /* trinh duyet chan thi thoi */ }
}
datChuDe(docChuDe());
const API = `${GOC}/api`;

/* ── Trạng thái ────────────────────────────────────────────────────────── */

const S = {
  token: null,
  hetHanLuc: 0,
  toi: null,
  man: 'tong-quan',
  ky: '',
  cacKy: [],
  bieuDo: 'no-co',
};

/* ── Tiện ích ──────────────────────────────────────────────────────────── */

const el = (tag, props = {}, ...con) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of con.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
};

const dinhDangSo = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** Tiền là chuỗi. Chỉ đổi sang số ở đúng chỗ này, để hiển thị. */
function tien(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n === 0) return '0';
  return dinhDangSo.format(Math.round(n));
}

function ngay(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ngayISO(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function ngayGio(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── Gọi máy chủ ───────────────────────────────────────────────────────── */

async function lamMoiNeuCan() {
  if (S.token && Date.now() < S.hetHanLuc - 60_000) return;
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
  if (!r.ok) { S.token = null; throw new Error('HET_PHIEN'); }
  const d = await r.json();
  S.token = d.token;
  S.hetHanLuc = Date.now() + d.het_han_sau * 1000;
}

async function goi(duong, tuyChon = {}) {
  if (S.token) {
    try { await lamMoiNeuCan(); }
    catch (e) { if (e.message === 'HET_PHIEN') { veCong('Phiên đã hết. Đăng nhập lại.'); throw e; } }
  }
  const laForm = tuyChon.body instanceof FormData;
  const r = await fetch(`${API}${duong}`, {
    ...tuyChon,
    credentials: 'same-origin',
    headers: {
      ...(tuyChon.body && !laForm ? { 'Content-Type': 'application/json' } : {}),
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
      ...(tuyChon.headers || {}),
    },
    body: tuyChon.body ? (laForm ? tuyChon.body : JSON.stringify(tuyChon.body)) : undefined,
  });
  const kieu = r.headers.get('content-type') || '';
  const d = kieu.includes('json') ? await r.json() : { loi: await r.text() };
  if (r.status === 401 && S.token) { veCong('Phiên đã hết. Đăng nhập lại.'); throw new Error('HET_PHIEN'); }
  if (r.status === 428) { S.toi.must_change_password = true; ve(); throw new Error('PHAI_DOI_MAT_KHAU'); }
  if (!r.ok) throw new Error(d.loi || `Lỗi ${r.status}`);
  return d;
}

/* ── Ngăn kéo dùng chung ───────────────────────────────────────────────── */

function moNgan({ tieuDe, phuDe, than, chan, hep }) {
  const lop = el('div', {
    class: 'man-che',
    onclick: (e) => { if (e.target === lop) dong(); },
  });
  const dong = () => { lop.remove(); document.removeEventListener('keydown', phim); };
  const phim = (e) => { if (e.key === 'Escape') dong(); };
  document.addEventListener('keydown', phim);

  lop.appendChild(el('div', { class: hep ? 'ngan hep' : 'ngan' },
    el('div', { class: 'ngan-dau' },
      el('div', {},
        el('div', { class: 'ngan-ten' }, tieuDe),
        phuDe ? el('div', { class: 'mo ngan-phu' }, phuDe) : null,
      ),
      el('button', { class: 'nut nho', onclick: dong }, 'Đóng'),
    ),
    el('div', { class: 'the-than' }, than),
    chan ? el('div', { class: 'ngan-chan' }, chan(dong)) : null,
  ));
  document.body.appendChild(lop);
  return dong;
}

function nhac(loi, ok) {
  const d = el('div', { class: ok ? 'bao duong' : 'bao am' }, loi);
  return d;
}

/* ── Màn đăng nhập ─────────────────────────────────────────────────────── */

function veCong(thongBao) {
  S.token = null; S.toi = null;
  const loi = el('div', { class: 'bao am an' });
  if (thongBao) { loi.textContent = thongBao; loi.classList.remove('an'); }

  const oTen = el('input', { name: 'username', autocomplete: 'username', required: true, autofocus: true });
  const oMk = el('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const nut = el('button', { class: 'nut chinh', type: 'submit' }, 'Mở két');

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      nut.disabled = true; nut.textContent = 'Đang kiểm tra…';
      loi.classList.add('an');
      try {
        const d = await goi('/auth/login', {
          method: 'POST',
          body: { username: oTen.value.trim(), password: oMk.value },
        });
        S.token = d.token;
        S.hetHanLuc = Date.now() + d.het_han_sau * 1000;
        S.toi = d.nguoi_dung;
        oMk.value = '';
        await khoiDong();
      } catch (err) {
        loi.textContent = err.message;
        loi.classList.remove('an');
        oMk.value = ''; oMk.focus();
      } finally {
        nut.disabled = false; nut.textContent = 'Mở két';
      }
    },
  },
    el('label', { class: 'o' }, el('span', {}, 'Tài khoản'), oTen),
    el('label', { class: 'o' }, el('span', {}, 'Mật khẩu'), oMk),
    nut,
  );

  document.getElementById('goc').replaceChildren(
    el('div', { class: 'cong' },
      el('div', { class: 'cong-hop' },
        el('div', { class: 'cong-hieu' },
          el('div', { class: 'dau' }, '₫'),
          el('h1', {}, 'Két Kế Toán'),
          el('p', {}, 'Sổ sách tài chính nội bộ · tách biệt hoàn toàn với hệ vận hành'),
        ),
        loi,
        el('div', { class: 'the' }, el('div', { class: 'the-than' }, form)),
        el('p', { class: 'cong-chan' },
          'Tài khoản ở đây không dùng chung với tài khoản phòng khám. ',
          'Mọi lần mở sổ đều được ghi lại kèm thời gian và địa chỉ máy.'),
      ),
    ),
  );
}

/* ── Màn bắt buộc đổi mật khẩu ─────────────────────────────────────────── */

function veDoiMatKhauBatBuoc() {
  const loi = el('div', { class: 'bao am an' });
  const cu = el('input', { type: 'password', autocomplete: 'current-password', required: true, autofocus: true });
  const moi = el('input', { type: 'password', autocomplete: 'new-password', required: true });
  const lai = el('input', { type: 'password', autocomplete: 'new-password', required: true });
  const nut = el('button', { class: 'nut chinh', type: 'submit' }, 'Đổi mật khẩu');

  document.getElementById('goc').replaceChildren(
    el('div', { class: 'cong' },
      el('div', { class: 'cong-hop' },
        el('div', { class: 'cong-hieu' },
          el('div', { class: 'dau' }, '₫'),
          el('h1', {}, 'Đặt mật khẩu của riêng bạn'),
          el('p', {}, 'Mật khẩu hiện tại do người khác đặt hộ nên chưa dùng lâu dài được.'),
        ),
        loi,
        el('div', { class: 'the' }, el('div', { class: 'the-than' },
          el('form', {
            class: 'doi-mk',
            onsubmit: async (e) => {
              e.preventDefault();
              if (moi.value !== lai.value) {
                loi.textContent = 'Hai lần nhập mật khẩu mới không giống nhau.';
                loi.classList.remove('an'); return;
              }
              nut.disabled = true;
              try {
                await goi('/me/password', {
                  method: 'POST',
                  body: { mat_khau_cu: cu.value, mat_khau_moi: moi.value },
                });
                veCong('Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.');
              } catch (err) {
                loi.textContent = err.message; loi.classList.remove('an');
              } finally { nut.disabled = false; }
            },
          },
            el('label', { class: 'o' }, el('span', {}, 'Mật khẩu hiện tại'), cu),
            el('label', { class: 'o' }, el('span', {}, 'Mật khẩu mới'), moi),
            el('label', { class: 'o' }, el('span', {}, 'Nhập lại mật khẩu mới'), lai),
            el('p', { class: 'mo ghi-chu' },
              'Từ 12 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt. ',
              'Không chứa những từ dễ đoán như tên phòng khám hay chữ ketoan.'),
            nut,
          ),
        )),
      ),
    ),
  );
}

/* ── Khung chính ───────────────────────────────────────────────────────── */

const MAN = [
  { nhom: 'Phân tích' },
  { ma: 'tong-quan', ten: 'Tổng quan', icon: 'M3 13h4v6H3zM10 5h4v14h-4zM17 9h4v10h-4z' },
  { ma: 'van-hanh', ten: 'Số liệu vận hành', icon: 'M4 19V9M10 19V4M16 19v-7M22 19H2' },
  { nhom: 'Sổ gốc' },
  { ma: 'nhat-ky', ten: 'Nhật ký chung', icon: 'M4 4h13l3 3v13H4zM8 9h8M8 13h8M8 17h5' },
  { ma: 'bc-so-chi-tiet', ten: 'Sổ chi tiết tài khoản', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3' },
  { ma: 'can-doi', ten: 'Cân đối tài khoản', icon: 'M12 3v18M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z' },
  { nhom: 'Báo cáo' },
  { ma: 'bc-so-quy', ten: 'Sổ quỹ tiền mặt', icon: 'M3 7h18v11H3zM3 11h18M16 14.5h2' },
  { ma: 'bc-so-ngan-hang', ten: 'Sổ tiền gửi ngân hàng', icon: 'M3 10l9-6 9 6M5 10v9M19 10v9M3 19h18' },
  { ma: 'bc-tong-hop-cong-no', ten: 'Tổng hợp công nợ', icon: 'M4 5h16v14H4zM8 9h8M8 13h5' },
  { ma: 'cong-no', ten: 'Công nợ theo đối tượng', icon: 'M3 7h18v12H3zM3 11h18M7 15h4' },
  { ma: 'bc-chi-phi-khoan-muc', ten: 'Chi phí theo khoản mục', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h6' },
  { ma: 'bc-dong-tien', ten: 'Dòng tiền', icon: 'M4 16l5-5 4 3 7-8M14 6h7v7' },
  { ma: 'bc-b01', ten: 'B01 · Tình hình tài chính', icon: 'M6 3h9l4 4v14H6zM10 12h6M10 16h6M10 8h3' },
  { ma: 'bc-khong-dung-duoc', ten: 'Ba báo cáo cần thêm dữ liệu', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16v.5' },
  { nhom: 'Nhập liệu' },
  { ma: 'nhap-excel', ten: 'Nhập từ Excel', icon: 'M12 3v12M8 11l4 4 4-4M4 19h16', quyen: ['accountant', 'vault_admin'] },
  { ma: 'lo-nhap', ten: 'Các lô đã nhập', icon: 'M3 5h18v4H3zM3 11h18v4H3zM3 17h18v3H3' },
  { nhom: 'Danh mục' },
  { ma: 'dm-tai-khoan', ten: 'Hệ thống tài khoản', icon: 'M4 6h16M4 12h16M4 18h10' },
  { ma: 'dm-khach-hang', ten: 'Đối tượng khách hàng', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0' },
  { ma: 'dm-doi-tac', ten: 'Đối tượng đối tác', icon: 'M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 19a6 6 0 0112 0M12 19a6 6 0 0110 0' },
  { ma: 'dm-khoan-muc', ten: 'Khoản mục chi phí', icon: 'M5 4h14v16l-7-4-7 4z' },
  { nhom: 'Kiểm soát' },
  { ma: 'soat-loi', ten: 'Soát lỗi', icon: 'M12 3l9 16H3zM12 9v5M12 16.5v.5' },
  { ma: 'chi-phi', ten: 'Chi phí không hợp lý', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 8l8 8M16 8l-8 8' },
  { ma: 'ky', ten: 'Kỳ kế toán', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { nhom: 'Quản trị' },
  { ma: 'truy-cap', ten: 'Nhật ký truy cập', icon: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2', quyen: ['vault_admin'] },
  { ma: 'nguoi-dung', ten: 'Người dùng', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0', quyen: ['vault_admin'] },
  { ma: 'ho-so', ten: 'Hồ sơ của tôi', icon: 'M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z' },
];

const TEN_VAI = {
  accountant: 'Kế toán · ghi sổ',
  viewer: 'Chỉ xem báo cáo',
  vault_admin: 'Quản trị két',
};

function bieuTuong(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  return svg;
}

function ghiSoDuoc() {
  return ['accountant', 'vault_admin'].includes(S.toi.role);
}

function ve() {
  if (!S.toi) return veCong();
  if (S.toi.must_change_password) return veDoiMatKhauBatBuoc();

  const dieuHuong = el('nav', { class: 'dieu-huong' });
  for (const m of MAN) {
    if (m.nhom) { dieuHuong.appendChild(el('div', { class: 'dh-nhom' }, m.nhom)); continue; }
    if (m.quyen && !m.quyen.includes(S.toi.role)) continue;
    dieuHuong.appendChild(el('button', {
      class: 'dh-muc',
      'aria-current': S.man === m.ma ? 'page' : null,
      onclick: () => { S.man = m.ma; ve(); },
    }, bieuTuong(m.icon), m.ten));
  }

  const than = el('main', { class: 'than' }, el('div', { class: 'trong' }, 'Đang tải…'));

  document.getElementById('goc').replaceChildren(
    el('div', { class: 'khung' },
      el('aside', { class: 'canh' },
        el('div', { class: 'hieu' },
          el('div', { class: 'hieu-dau' }, '₫'),
          el('div', {},
            el('div', { class: 'hieu-ten' }, 'Két Kế Toán'),
            el('div', { class: 'hieu-phu' }, 'Nội bộ'),
          ),
        ),
        dieuHuong,
        el('div', { class: 'chan-canh' },
          el('div', { class: 'ten' }, S.toi.full_name || S.toi.username),
          el('div', { class: 'vai' }, TEN_VAI[S.toi.role] || S.toi.role),
          el('button', {
            class: 'nut nho nut-day',
            onclick: (e) => {
              const moi = docChuDe() === 'dark' ? 'light' : 'dark';
              datChuDe(moi);
              e.currentTarget.textContent = moi === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối';
            },
          }, docChuDe() === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối'),
          el('button', {
            class: 'nut nho nut-day',
            onclick: async () => {
              try { await goi('/auth/logout', { method: 'POST' }); } catch { /* vẫn thoát */ }
              veCong('Đã khóa két.');
            },
          }, 'Khóa két và thoát'),
        ),
      ),
      than,
    ),
  );

  (VE[S.man] || VE['tong-quan'])(than).catch((err) => {
    if (err.message === 'HET_PHIEN' || err.message === 'PHAI_DOI_MAT_KHAU') return;
    than.replaceChildren(el('div', { class: 'bao am' }, err.message));
  });
}

/* ── Mảnh dùng chung ───────────────────────────────────────────────────── */

function chonKy(onDoi) {
  const sel = el('select', { onchange: () => { S.ky = sel.value; onDoi(); } },
    el('option', { value: '' }, 'Tất cả các kỳ'),
    ...S.cacKy.map((k) => el('option', { value: k.code, selected: S.ky === k.code || null },
      `${k.code}${k.status !== 'open' ? ' · đã khóa' : ''}`)),
  );
  return el('label', { class: 'o' }, el('span', {}, 'Kỳ kế toán'), sel);
}

function dauTrang(tieuDe, mo, ...phai) {
  return el('div', { class: 'dau-trang' },
    el('div', {}, el('h1', {}, tieuDe), mo && el('p', {}, mo)),
    phai.filter(Boolean).length ? el('div', { class: 'bo-loc' }, ...phai) : null,
  );
}

function bang(cot, dong, chan, thap) {
  if (!dong.length) return el('div', { class: 'the' }, el('div', { class: 'trong' }, 'Không có dòng nào khớp.'));
  return el('div', { class: 'the' }, el('div', { class: thap ? 'cuon thap' : 'cuon' },
    el('table', {},
      el('thead', {}, el('tr', {}, ...cot.map((c) =>
        el('th', { class: c.tien ? 'tien' : null }, c.ten)))),
      el('tbody', {}, ...dong),
      chan ? el('tfoot', {}, chan) : null,
    ),
  ));
}

function theChiSo(nhan, giaTri, phu, mau, tiHon) {
  return el('div', { class: `the chi-so ${mau || ''}` },
    el('div', { class: 'nhan-chi-so' }, nhan),
    el('div', { class: 'gia-tri' }, giaTri),
    phu ? el('div', { class: 'phu' }, phu) : null,
    tiHon || null,
  );
}

function theBieuDo(tieuDe, phai, noiDung) {
  return el('div', { class: 'the' },
    el('div', { class: 'the-dau' }, el('span', {}, tieuDe), phai || null),
    el('div', { class: 'the-than' }, noiDung),
  );
}

/* ── Màn: Tổng quan ────────────────────────────────────────────────────── */

const VE = {};

const KIEU_BD = [
  { ma: 'no-co',      ten: 'Nợ và Có' },
  { ma: 'doanh-thu',  ten: 'Doanh thu và chi phí' },
  { ma: 'dong-tien',  ten: 'Dòng tiền' },
  { ma: 'chung-tu',   ten: 'Số chứng từ' },
];

VE['tong-quan'] = async (than) => {
  const [d, bd] = await Promise.all([
    goi(`/tong-quan${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`),
    goi(`/bieu-do${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`),
  ]);
  const lech = Number(d.lech || 0);
  const canBang = Math.abs(lech) < 0.005;
  const nhanKy = bd.theo_thang.map((r) => r.ky.replace('2026-', 'T'));

  const doanhThuRong = bd.theo_thang.map((r) => Number(r.doanh_thu) - Number(r.giam_tru));
  const chiPhiTong = bd.theo_thang.map((r) => Number(r.gia_von) + Number(r.chi_phi));

  // Dòng tiền lũy kế: cộng dồn phần ròng của nhóm 111 và 112 qua các tháng.
  let cong = 0;
  const luyKe = bd.dong_tien.map((r) => { cong += Number(r.rong); return cong; });

  const veBieuDo = () => {
    if (S.bieuDo === 'no-co') {
      return window.BD.cotNhom({
        nhan: nhanKy,
        chuoi: [
          { ten: 'Phát sinh Nợ', giaTri: bd.theo_thang.map((r) => r.tong_no), mau: 'var(--xanh)' },
          { ten: 'Phát sinh Có', giaTri: bd.theo_thang.map((r) => r.tong_co), mau: 'var(--vang-sang)' },
        ],
      });
    }
    if (S.bieuDo === 'doanh-thu') {
      return window.BD.cotNhom({
        nhan: nhanKy,
        chuoi: [
          { ten: 'Doanh thu thuần', giaTri: doanhThuRong, mau: 'var(--duong)' },
          { ten: 'Giá vốn và chi phí', giaTri: chiPhiTong, mau: 'var(--am)' },
        ],
      });
    }
    if (S.bieuDo === 'dong-tien') {
      return el('div', {},
        window.BD.duongLuyKe({
          nhan: bd.dong_tien.map((r) => r.ky.replace('2026-', 'T')),
          giaTri: luyKe, ten: 'Tiền lũy kế',
        }),
        window.BD.cotNhom({
          nhan: bd.dong_tien.map((r) => r.ky.replace('2026-', 'T')),
          chuoi: [
            { ten: 'Tiền mặt', giaTri: bd.dong_tien.map((r) => r.tien_mat), mau: 'var(--xanh)' },
            { ten: 'Ngân hàng', giaTri: bd.dong_tien.map((r) => r.ngan_hang), mau: 'var(--xanh-sang)' },
          ],
          cao: 190,
        }),
      );
    }
    return window.BD.cotNhom({
      nhan: nhanKy, tienTe: false,
      chuoi: [{ ten: 'Số chứng từ', giaTri: bd.theo_thang.map((r) => r.so_chung_tu), mau: 'var(--xanh)' }],
    });
  };

  const hopBD = el('div', {}, veBieuDo());
  const chon = el('div', { class: 'chon-bd' },
    ...KIEU_BD.map((k) => el('button', {
      type: 'button', 'aria-pressed': S.bieuDo === k.ma ? 'true' : 'false',
      onclick: (e) => {
        S.bieuDo = k.ma;
        chon.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        hopBD.replaceChildren(veBieuDo());
      },
    }, k.ten)),
  );

  const tongDoanhThu = doanhThuRong.reduce((s, v) => s + v, 0);
  const tongChiPhi = chiPhiTong.reduce((s, v) => s + v, 0);
  const tongKhongHopLy = bd.chi_phi_khong_hop_ly.reduce((s, r) => s + Number(r.so_tien), 0);

  than.replaceChildren(
    dauTrang('Tổng quan',
      'Bất biến quan trọng nhất của một bộ sổ: tổng Nợ phải bằng tổng Có.',
      chonKy(() => ve())),

    el('div', { class: `bao ${canBang ? 'duong' : 'am'}` },
      canBang
        ? `Sổ cân. Tổng Nợ bằng tổng Có, chênh lệch 0 đồng${S.ky ? ` ở kỳ ${S.ky}` : ''}.`
        : `Sổ lệch ${tien(Math.abs(lech))} đồng. Xem màn Soát lỗi để tìm chứng từ gây lệch.`),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Doanh thu thuần', tien(tongDoanhThu), 'đồng, sau giảm trừ', 'duong',
        window.BD.tiHon(doanhThuRong, 'var(--duong)')),
      theChiSo('Giá vốn và chi phí', tien(tongChiPhi), 'đồng', 'am',
        window.BD.tiHon(chiPhiTong, 'var(--am)')),
      theChiSo('Chênh lệch thu chi', tien(tongDoanhThu - tongChiPhi),
        tongDoanhThu >= tongChiPhi ? 'đang dương' : 'đang âm',
        tongDoanhThu >= tongChiPhi ? 'duong' : 'am',
        window.BD.tiHon(doanhThuRong.map((v, i) => v - chiPhiTong[i]),
          tongDoanhThu >= tongChiPhi ? 'var(--duong)' : 'var(--am)')),
      theChiSo('Chi phí không hợp lý', tien(tongKhongHopLy),
        'sẽ bị loại khi quyết toán thuế', 'vang',
        window.BD.tiHon(bd.chi_phi_khong_hop_ly.map((r) => r.so_tien), 'var(--vang-sang)')),
    ),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tổng phát sinh Nợ', tien(d.tong_no), 'đồng'),
      theChiSo('Tổng phát sinh Có', tien(d.tong_co), 'đồng'),
      theChiSo('Chứng từ', dinhDangSo.format(d.so_chung_tu || 0),
        `${dinhDangSo.format(d.so_but_toan || 0)} bút toán`),
      theChiSo('Chứng từ chưa cân', dinhDangSo.format(d.so_chung_tu_lech || 0),
        d.so_chung_tu_lech ? 'cần xử lý' : 'không có cái nào',
        d.so_chung_tu_lech ? 'am' : 'duong'),
    ),

    theBieuDo('Diễn biến theo tháng', chon, hopBD),

    el('div', { class: 'luoi luoi-2 cach-tren' },
      theBieuDo('Cơ cấu chi phí theo nhóm tài khoản', null,
        window.BD.vanhKhuyen({
          muc: bd.co_cau_chi_phi.map((r) => ({ ten: `${r.nhom} ${r.ten}`, giaTri: r.so_tien })),
        })),
      theBieuDo('Tài khoản phát sinh nhiều nhất', null,
        window.BD.thanhNgang({
          muc: bd.top_tai_khoan.map((r) => ({
            ten: `${r.ma} ${r.ten || ''}`.trim(), giaTri: r.tong,
          })),
        })),
    ),

    el('div', { class: 'the cach-tren' },
      el('div', { class: 'the-dau' }, 'Cân bằng theo từng kỳ'),
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Kỳ'), el('th', { class: 'tien' }, 'Tổng Nợ'),
          el('th', { class: 'tien' }, 'Tổng Có'), el('th', { class: 'tien' }, 'Chênh lệch'),
          el('th', { class: 'tien' }, 'Chứng từ'), el('th', { class: 'tien' }, 'Bút toán'),
          el('th', {}, ''))),
        el('tbody', {}, ...(d.cac_ky || []).map((k) => {
          const ok = Math.abs(Number(k.diff)) < 0.005;
          return el('tr', {},
            el('td', { class: 'ma' }, k.period_code),
            el('td', { class: 'tien' }, tien(k.total_debit)),
            el('td', { class: 'tien' }, tien(k.total_credit)),
            el('td', { class: 'tien' }, tien(k.diff)),
            el('td', { class: 'tien' }, dinhDangSo.format(k.voucher_count)),
            el('td', { class: 'tien' }, dinhDangSo.format(k.line_count)),
            el('td', {}, el('span', { class: `the-nhan ${ok ? 'duong' : 'am'}` }, ok ? 'cân' : 'lệch')),
          );
        })),
      )),
    ),
  );
};

/* ── Màn: Nhật ký chung ────────────────────────────────────────────────────
   Bố cục bám đúng file Sổ nhật ký chung bản Excel: 17 cột, cùng tên, cùng thứ
   tự. Kế toán đọc sổ này hằng ngày và đã thuộc vị trí từng cột; đổi thứ tự
   hay bỏ bớt cột là bắt họ dò lại từ đầu mỗi lần mở.

   17 cột thì rộng hơn màn hình, nên có bảng chọn cột. Mặc định bật đúng những
   cột bản Excel luôn có số liệu; bốn cột thưa dữ liệu tắt sẵn để bảng dễ đọc,
   nhưng bật lên là thấy ngay. */

const NK = {
  tim: '', tai_khoan: '', doi_tac: '', khoan_muc: '', tu_ngay: '', den_ngay: '',
  hop_ly: '', sap_xep: 'ngay', chieu: 'desc', bo_qua: 0, so_dong: 50,
};

// Thứ tự và tên đúng như file Excel. hien: có bật sẵn hay không.
const COT_NK = [
  { ma: 'ngay_hach_toan', ten: 'Ngày hạch toán', hien: true,  sort: 'ngay',
    ve: (r) => el('td', { class: 'ma' }, ngay(r.posting_date)) },
  { ma: 'ngay_chung_tu',  ten: 'Ngày chứng từ',  hien: false, sort: 'ngay_chung_tu',
    ve: (r) => el('td', { class: 'ma mo' }, ngay(r.voucher_date)) },
  { ma: 'so_chung_tu',    ten: 'Số chứng từ',    hien: true,  sort: 'so_chung_tu',
    ve: (r) => el('td', { class: 'ma' }, r.voucher_no) },
  { ma: 'ngay_hoa_don',   ten: 'Ngày hóa đơn',   hien: false, sort: 'ngay_hoa_don',
    ve: (r) => el('td', { class: 'ma mo' }, r.invoice_date ? ngay(r.invoice_date) : '—') },
  { ma: 'so_hoa_don',     ten: 'Số hóa đơn',     hien: true,  sort: 'so_hoa_don',
    ve: (r) => el('td', { class: 'ma mo' }, r.invoice_no || '—') },
  { ma: 'dien_giai',      ten: 'Diễn giải',      hien: true,
    ve: (r) => el('td', { class: 'nk-dien-giai' }, r.description || '—') },
  { ma: 'tai_khoan',      ten: 'Tài khoản',      hien: true,  sort: 'tai_khoan',
    ve: (r) => el('td', { class: 'ma' }, r.account_code,
      r.account_name ? el('div', { class: 'mo ten-tai-khoan' }, r.account_name) : null) },
  { ma: 'tk_doi_ung',     ten: 'TK đối ứng',     hien: true,  sort: 'doi_ung',
    ve: (r) => el('td', { class: 'ma mo' }, r.contra_account_code || '—') },
  { ma: 'phat_sinh_no',   ten: 'Phát sinh Nợ',   hien: true,  tien: true, sort: 'no',
    ve: (r) => el('td', { class: 'tien' }, Number(r.debit) ? tien(r.debit) : '—') },
  { ma: 'phat_sinh_co',   ten: 'Phát sinh Có',   hien: true,  tien: true, sort: 'co',
    ve: (r) => el('td', { class: 'tien' }, Number(r.credit) ? tien(r.credit) : '—') },
  { ma: 'ma_doi_tuong',   ten: 'Mã đối tượng',   hien: true,  sort: 'doi_tac',
    ve: (r) => el('td', { class: 'ma mo' }, r.partner_code || '—') },
  { ma: 'ten_doi_tuong',  ten: 'Tên đối tượng',  hien: true,
    ve: (r) => el('td', { class: 'mo' }, r.partner_name || '—') },
  { ma: 'ma_kmcp',        ten: 'Mã KMCP',        hien: true,  sort: 'khoan_muc',
    ve: (r) => el('td', { class: 'ma' }, r.cost_item_code || '—') },
  { ma: 'ten_kmcp',       ten: 'Tên KMCP',       hien: false,
    ve: (r) => el('td', { class: 'mo' }, r.cost_item_name || '—') },
  { ma: 'hop_dong_mua',   ten: 'Hợp đồng mua',   hien: false,
    ve: (r) => el('td', { class: 'ma mo' }, r.contract_buy || '—') },
  { ma: 'hop_dong_ban',   ten: 'Hợp đồng bán',   hien: false,
    ve: (r) => el('td', { class: 'ma mo' }, r.contract_sell || '—') },
  { ma: 'cp_hop_ly',      ten: 'CP hợp lý/không hợp lý', hien: true,
    ve: (r) => el('td', {}, r.is_deductible === false
      ? el('span', { class: 'the-nhan am' }, 'Không hợp lý')
      : el('span', { class: 'mo' }, 'Hợp lý')) },
];

const NK_COT = new Set(COT_NK.filter((c) => c.hien).map((c) => c.ma));

VE['nhat-ky'] = async (than) => {
  const p = new URLSearchParams();
  if (S.ky) p.set('ky', S.ky);
  for (const [k, v] of Object.entries(NK)) if (v !== '' && v !== 0) p.set(k, v);
  const d = await goi(`/nhat-ky?${p}`);

  const oTim = el('input', { value: NK.tim, placeholder: 'số chứng từ hoặc diễn giải' });
  const oTk = el('input', { value: NK.tai_khoan, placeholder: 'ví dụ 6421', class: 'ma' });
  const oDt = el('input', { value: NK.doi_tac, placeholder: 'mã đối tượng', class: 'ma' });
  const oKm = el('input', { value: NK.khoan_muc, placeholder: 'mã khoản mục', class: 'ma' });
  const oTu = el('input', { type: 'date', value: NK.tu_ngay });
  const oDen = el('input', { type: 'date', value: NK.den_ngay });
  const oHopLy = el('select', {},
    el('option', { value: '', selected: NK.hop_ly === '' || null }, 'Tất cả'),
    el('option', { value: 'true', selected: NK.hop_ly === 'true' || null }, 'Chỉ hợp lý'),
    el('option', { value: 'false', selected: NK.hop_ly === 'false' || null }, 'Chỉ không hợp lý'),
  );
  const apDung = () => {
    NK.tim = oTim.value.trim(); NK.tai_khoan = oTk.value.trim();
    NK.doi_tac = oDt.value.trim(); NK.khoan_muc = oKm.value.trim();
    NK.tu_ngay = oTu.value; NK.den_ngay = oDen.value;
    NK.hop_ly = oHopLy.value; NK.bo_qua = 0;
    ve();
  };
  for (const o of [oTim, oTk, oDt, oKm]) {
    o.addEventListener('keydown', (e) => { if (e.key === 'Enter') apDung(); });
  }

  const sapTheo = (cot) => {
    if (NK.sap_xep === cot) NK.chieu = NK.chieu === 'asc' ? 'desc' : 'asc';
    else { NK.sap_xep = cot; NK.chieu = 'desc'; }
    ve();
  };

  const cotHien = COT_NK.filter((c) => NK_COT.has(c.ma));
  const tuDong = d.tong ? NK.bo_qua + 1 : 0;
  const denDong = Math.min(NK.bo_qua + d.dong.length, d.tong);

  const chonCot = el('div', { class: 'chon-cot' },
    ...COT_NK.map((c) => el('button', {
      type: 'button', 'aria-pressed': NK_COT.has(c.ma) ? 'true' : 'false',
      onclick: () => {
        if (NK_COT.has(c.ma)) NK_COT.delete(c.ma); else NK_COT.add(c.ma);
        if (!NK_COT.size) NK_COT.add('dien_giai');
        ve();
      },
    }, c.ten)),
  );

  than.replaceChildren(
    dauTrang('Sổ nhật ký chung',
      'Sổ gốc của toàn hệ thống. Mọi báo cáo khác đều tính lại từ đây. Bố cục theo đúng '
      + 'file Excel: 17 cột, cùng tên, cùng thứ tự. Bấm vào dòng để mở trọn chứng từ.',
      ghiSoDuoc() ? el('button', {
        class: 'nut chinh', onclick: () => moFormChungTu(null),
      }, '+ Thêm chứng từ') : null),

    el('div', { class: 'the cach-duoi' }, el('div', { class: 'the-than' },
      el('div', { class: 'bo-loc' },
        chonKy(() => { NK.bo_qua = 0; ve(); }),
        el('label', { class: 'o rong' }, el('span', {}, 'Tìm'), oTim),
        el('label', { class: 'o' }, el('span', {}, 'Tài khoản bắt đầu bằng'), oTk),
        el('label', { class: 'o' }, el('span', {}, 'Mã đối tượng'), oDt),
        el('label', { class: 'o' }, el('span', {}, 'Mã khoản mục'), oKm),
        el('label', { class: 'o' }, el('span', {}, 'Từ ngày'), oTu),
        el('label', { class: 'o' }, el('span', {}, 'Đến ngày'), oDen),
        el('label', { class: 'o' }, el('span', {}, 'Chi phí'), oHopLy),
        el('button', { class: 'nut chinh', onclick: apDung }, 'Lọc'),
        el('button', {
          class: 'nut',
          onclick: () => {
            Object.assign(NK, {
              tim: '', tai_khoan: '', doi_tac: '', khoan_muc: '',
              tu_ngay: '', den_ngay: '', hop_ly: '', bo_qua: 0,
            });
            ve();
          },
        }, 'Xóa lọc'),
      ),
      el('div', { class: 'cot-hop' },
        el('span', { class: 'cot-nhan' }, 'Cột hiển thị'),
        chonCot,
      ),
    )),

    el('div', { class: 'bao' },
      `${dinhDangSo.format(d.tong)} dòng khớp · tổng Nợ ${tien(d.tong_no)} · tổng Có ${tien(d.tong_co)}`
      + ` · đang hiện ${cotHien.length}/${COT_NK.length} cột`),

    d.dong.length
      ? el('div', { class: 'the' }, el('div', { class: 'cuon' }, el('table', { class: 'nk-bang' },
          el('thead', {}, el('tr', {}, ...cotHien.map((c) => el('th', {
            class: `${c.tien ? 'tien' : ''}${c.sort ? ' co-the-sap' : ''}`,
            onclick: c.sort ? () => sapTheo(c.sort) : null,
          }, c.ten + (c.sort && NK.sap_xep === c.sort ? (NK.chieu === 'asc' ? ' ↑' : ' ↓') : ''))))),
          el('tbody', {}, ...d.dong.map((r) => el('tr', {
            class: 'bam-duoc', onclick: () => moChungTu(r.voucher_id),
          }, ...cotHien.map((c) => c.ve(r))))),
          el('tfoot', {}, el('tr', {}, ...cotHien.map((c) =>
            c.ma === 'phat_sinh_no' ? el('td', { class: 'tien' }, tien(d.tong_no))
              : c.ma === 'phat_sinh_co' ? el('td', { class: 'tien' }, tien(d.tong_co))
                : c.ma === 'ngay_hach_toan' ? el('td', {}, 'Cộng trang')
                  : el('td', {}, '')))),
        )))
      : el('div', { class: 'the' }, el('div', { class: 'trong' }, 'Không có dòng nào khớp bộ lọc.')),

    el('div', { class: 'dong-thanh cach-tren' },
      el('button', {
        class: 'nut', disabled: NK.bo_qua === 0 || null,
        onclick: () => { NK.bo_qua = Math.max(0, NK.bo_qua - NK.so_dong); ve(); },
      }, 'Trang trước'),
      el('span', { class: 'mo' },
        `${dinhDangSo.format(tuDong)}–${dinhDangSo.format(denDong)} trên ${dinhDangSo.format(d.tong)}`),
      el('button', {
        class: 'nut', disabled: denDong >= d.tong || null,
        onclick: () => { NK.bo_qua += NK.so_dong; ve(); },
      }, 'Trang sau'),
      el('label', { class: 'o' }, el('span', {}, 'Mỗi trang'),
        el('select', {
          onchange: (e) => { NK.so_dong = Number(e.target.value); NK.bo_qua = 0; ve(); },
        }, ...[25, 50, 100, 200].map((n) => el('option', {
          value: n, selected: NK.so_dong === n || null,
        }, n)))),
    ),
  );
};

async function moChungTu(id) {
  const v = await goi(`/chung-tu/${encodeURIComponent(id)}`);
  const lech = Number(v.diff || 0);
  const tuLo = Boolean(v.source_ref && v.source_ref.file);

  moNgan({
    tieuDe: `Chứng từ ${v.voucher_no}`,
    phuDe: `${ngay(v.posting_date)} · kỳ ${v.period_code}${v.voucher_type ? ` · loại ${v.voucher_type}` : ''}`,
    than: el('div', {},
      v.description ? el('div', { class: 'ngan-dien-giai' }, v.description) : null,
      Math.abs(lech) > 0.005
        ? el('div', { class: `bao ${v.balance_group ? 'cho' : 'am'} cach-tren` },
            v.balance_group
              ? `Chứng từ này không tự cân, nó cân theo cặp trong nhóm ${v.balance_group}. Lệch ${tien(lech)} đồng là bình thường.`
              : `Chứng từ lệch ${tien(lech)} đồng và không thuộc nhóm cân nào. Đây là lỗi cần sửa.`)
        : null,
      el('div', { class: 'cuon cach-tren' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Dòng'), el('th', {}, 'Tài khoản'), el('th', {}, 'Đối ứng'),
          el('th', {}, 'Diễn giải'), el('th', {}, 'Đối tượng'),
          el('th', { class: 'tien' }, 'Nợ'), el('th', { class: 'tien' }, 'Có'))),
        el('tbody', {}, ...v.dong.map((l) => el('tr', {},
          el('td', { class: 'ma mo' }, l.line_no),
          el('td', { class: 'ma' }, l.account_code,
            l.account_name ? el('div', { class: 'mo ten-tai-khoan' }, l.account_name) : null),
          el('td', { class: 'ma mo' }, l.contra_account_code || '—'),
          el('td', {}, l.description || '—'),
          el('td', { class: 'mo' }, l.partner_name || l.partner_code || '—'),
          el('td', { class: 'tien' }, Number(l.debit) ? tien(l.debit) : '—'),
          el('td', { class: 'tien' }, Number(l.credit) ? tien(l.credit) : '—'),
        ))),
        el('tfoot', {}, el('tr', {},
          el('td', { colspan: '5' }, 'Cộng'),
          el('td', { class: 'tien' }, tien(v.total_debit)),
          el('td', { class: 'tien' }, tien(v.total_credit)),
        )),
      )),
      v.dong[0]?.source_sheet
        ? el('p', { class: 'mo nguon-goc' },
            `Nguồn: ${v.dong[0].source_sheet}, dòng ${v.dong[0].source_row ?? '?'} trong file gốc.`)
        : null,
      tuLo ? el('div', { class: 'bao cach-tren' },
        'Chứng từ này đến từ một lô nhập Excel. Muốn sửa thì hoàn tác cả lô ở màn Các lô đã nhập, '
        + 'hoặc ghi bút toán điều chỉnh. Sửa lẻ sẽ làm bảng đối chiếu của lô nói dối.') : null,
    ),
    chan: ghiSoDuoc() && !tuLo ? (dong) => [
      el('button', {
        class: 'nut nguy',
        onclick: async () => {
          if (!confirm(`Xóa chứng từ ${v.voucher_no}? Mọi bút toán của nó cũng bị xóa theo.`)) return;
          try { await goi(`/chung-tu/${v.id}`, { method: 'DELETE' }); dong(); ve(); }
          catch (err) { alert(err.message); }
        },
      }, 'Xóa chứng từ'),
      el('button', { class: 'nut chinh', onclick: () => { dong(); moFormChungTu(v); } }, 'Sửa chứng từ'),
    ] : null,
  });
}

/* ── Form thêm sửa chứng từ ────────────────────────────────────────────── */

async function moFormChungTu(v) {
  const [dsTk, dsDt, dsKm] = await Promise.all([
    goi('/tai-khoan'), goi('/doi-tac'), goi('/khoan-muc'),
  ]);
  const listTk = el('datalist', { id: 'ds-tk' },
    ...dsTk.map((a) => el('option', { value: a.code }, `${a.code} · ${a.name}`)));
  const listDt = el('datalist', { id: 'ds-dt' },
    ...dsDt.slice(0, 300).map((a) => el('option', { value: a.code }, `${a.code} · ${a.name}`)));
  const listKm = el('datalist', { id: 'ds-km' },
    ...dsKm.map((a) => el('option', { value: a.code }, `${a.code} · ${a.name}`)));

  const bao = el('div', { class: 'an' });
  const oSo = el('input', { value: v?.voucher_no || '', placeholder: 'PT001/2026_08' });
  const oNgay = el('input', { type: 'date', value: ngayISO(v?.posting_date) || new Date().toISOString().slice(0, 10) });
  const oNgayCT = el('input', { type: 'date', value: ngayISO(v?.voucher_date) || '' });
  const oHD = el('input', { value: v?.invoice_no || '', placeholder: 'số hóa đơn' });
  const oDG = el('input', { value: v?.description || '', placeholder: 'diễn giải chung của chứng từ' });
  const oNhom = el('input', { value: v?.balance_group || '', placeholder: 'để trống nếu chứng từ tự cân' });

  const thanDong = el('div', {});
  const tong = el('div', { class: 'bao' });

  const tinhTong = () => {
    let no = 0; let co = 0;
    thanDong.querySelectorAll('.dong-but-toan').forEach((d) => {
      no += Number(d.querySelector('[data-o="no"]').value || 0);
      co += Number(d.querySelector('[data-o="co"]').value || 0);
    });
    const lech = Math.round((no - co) * 100) / 100;
    tong.className = Math.abs(lech) < 0.005 ? 'bao duong' : 'bao cho';
    tong.textContent = Math.abs(lech) < 0.005
      ? `Cân: Nợ ${tien(no)} bằng Có ${tien(co)}.`
      : `Chưa cân: Nợ ${tien(no)}, Có ${tien(co)}, lệch ${tien(lech)}. `
        + 'Nếu chứng từ cân theo cặp với chứng từ khác thì điền mã nhóm cân bằng.';
  };

  const themDong = (d) => {
    const oTk = el('input', { list: 'ds-tk', class: 'ma', value: d?.account_code || '', placeholder: 'TK' });
    const oDu = el('input', { list: 'ds-tk', class: 'ma', value: d?.contra_account_code || '', placeholder: 'đối ứng' });
    const oMo = el('input', { value: d?.description || '', placeholder: 'diễn giải dòng' });
    const oNo = el('input', { type: 'number', step: '0.01', 'data-o': 'no', value: Number(d?.debit) || '', oninput: tinhTong });
    const oCo = el('input', { type: 'number', step: '0.01', 'data-o': 'co', value: Number(d?.credit) || '', oninput: tinhTong });
    const oDoiTac = el('input', { list: 'ds-dt', class: 'ma', value: d?.partner_code || '', placeholder: 'đối tượng' });
    const oKM = el('input', { list: 'ds-km', class: 'ma', value: d?.cost_item_code || '', placeholder: 'khoản mục' });
    const oHopLy = el('input', { type: 'checkbox', checked: d ? d.is_deductible !== false : true });

    const hang = el('div', { class: 'dong-but-toan' },
      el('label', { class: 'o' }, el('span', {}, 'Tài khoản'), oTk),
      el('label', { class: 'o' }, el('span', {}, 'Đối ứng'), oDu),
      el('label', { class: 'o' }, el('span', {}, 'Diễn giải'), oMo),
      el('label', { class: 'o' }, el('span', {}, 'Nợ'), oNo),
      el('label', { class: 'o' }, el('span', {}, 'Có'), oCo),
      el('button', {
        class: 'nut nho', type: 'button', title: 'Xóa dòng',
        onclick: () => { hang.remove(); tinhTong(); },
      }, '✕'),
      el('label', { class: 'o' }, el('span', {}, 'Đối tượng'), oDoiTac),
      el('label', { class: 'o' }, el('span', {}, 'Khoản mục'), oKM),
      el('label', { class: 'o' }, el('span', {}, 'Chi phí hợp lý'), oHopLy),
    );
    hang.doc = () => ({
      tai_khoan: oTk.value.trim(), doi_ung: oDu.value.trim(),
      dien_giai: oMo.value.trim(), no: Number(oNo.value || 0), co: Number(oCo.value || 0),
      doi_tac: oDoiTac.value.trim(), khoan_muc: oKM.value.trim(), hop_ly: oHopLy.checked,
    });
    thanDong.appendChild(hang);
    tinhTong();
  };

  if (v?.dong?.length) v.dong.forEach(themDong);
  else { themDong(); themDong(); }

  const nutLuu = el('button', { class: 'nut chinh' }, v ? 'Lưu thay đổi' : 'Ghi vào sổ');

  const dongNgan = moNgan({
    tieuDe: v ? `Sửa chứng từ ${v.voucher_no}` : 'Thêm chứng từ mới',
    phuDe: 'Một chứng từ cần ít nhất hai dòng, một bên Nợ một bên Có. Kỳ kế toán suy từ ngày hạch toán.',
    than: el('div', {},
      listTk, listDt, listKm, bao,
      el('div', { class: 'bo-loc cach-duoi' },
        el('label', { class: 'o' }, el('span', {}, 'Số chứng từ'), oSo),
        el('label', { class: 'o' }, el('span', {}, 'Ngày hạch toán'), oNgay),
        el('label', { class: 'o' }, el('span', {}, 'Ngày chứng từ'), oNgayCT),
        el('label', { class: 'o' }, el('span', {}, 'Số hóa đơn'), oHD),
        el('label', { class: 'o rong' }, el('span', {}, 'Diễn giải'), oDG),
        el('label', { class: 'o' }, el('span', {}, 'Nhóm cân bằng'), oNhom),
      ),
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' },
          el('span', {}, 'Các dòng bút toán'),
          el('button', { class: 'nut nho', type: 'button', onclick: () => themDong() }, '+ Thêm dòng'),
        ),
        el('div', { class: 'the-than' }, thanDong),
      ),
      el('div', { class: 'cach-tren' }, tong),
    ),
    chan: () => [nutLuu],
  });

  nutLuu.addEventListener('click', async () => {
    const dong = [...thanDong.querySelectorAll('.dong-but-toan')].map((h) => h.doc());
    nutLuu.disabled = true;
    try {
      const body = {
        so_chung_tu: oSo.value.trim(),
        ngay_hach_toan: oNgay.value,
        ngay_chung_tu: oNgayCT.value || oNgay.value,
        so_hoa_don: oHD.value.trim(),
        dien_giai: oDG.value.trim(),
        nhom_can_bang: oNhom.value.trim(),
        dong,
      };
      if (v) await goi(`/chung-tu/${v.id}`, { method: 'PUT', body });
      else await goi('/chung-tu', { method: 'POST', body });
      dongNgan();
      ve();
    } catch (err) {
      bao.className = 'bao am';
      bao.textContent = err.message;
    } finally { nutLuu.disabled = false; }
  });
}

/* ── Màn: Cân đối tài khoản ────────────────────────────────────────────── */

const TINH_CHAT = { debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' };
const CD = { tim: '' };

VE['can-doi'] = async (than) => {
  const d0 = await goi(`/can-doi${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const loc = CD.tim.trim().toLowerCase();
  const d = loc
    ? d0.filter((r) => r.account_code.startsWith(loc) || (r.account_name || '').toLowerCase().includes(loc))
    : d0;
  const tongNo = d.reduce((s, r) => s + Number(r.ps_debit), 0);
  const tongCo = d.reduce((s, r) => s + Number(r.ps_credit), 0);

  const oTim = el('input', { value: CD.tim, placeholder: 'mã hoặc tên tài khoản' });
  oTim.addEventListener('keydown', (e) => { if (e.key === 'Enter') { CD.tim = oTim.value; ve(); } });

  than.replaceChildren(
    dauTrang('Bảng cân đối tài khoản',
      'Dựng lại từ chính sổ cái chứ không nhập từ file báo cáo. Nhờ vậy nó không thể lệch với sổ.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Tìm'), oTim),
      el('button', { class: 'nut chinh', onclick: () => { CD.tim = oTim.value; ve(); } }, 'Lọc')),

    el('div', { class: 'luoi luoi-2 cach-duoi' },
      theBieuDo('Mười tài khoản phát sinh lớn nhất', null,
        window.BD.thanhNgang({
          muc: [...d].sort((a, b) => (Number(b.ps_debit) + Number(b.ps_credit))
                                   - (Number(a.ps_debit) + Number(a.ps_credit)))
                     .slice(0, 10)
                     .map((r) => ({ ten: `${r.account_code} ${r.account_name || ''}`.trim(),
                                    giaTri: Number(r.ps_debit) + Number(r.ps_credit) })),
        })),
      theBieuDo('Nợ và Có của mười tài khoản đó', null,
        window.BD.cotNhom({
          nhan: [...d].sort((a, b) => (Number(b.ps_debit) + Number(b.ps_credit))
                                    - (Number(a.ps_debit) + Number(a.ps_credit)))
                      .slice(0, 8).map((r) => r.account_code),
          chuoi: [
            { ten: 'Nợ', mau: 'var(--xanh)',
              giaTri: [...d].sort((a, b) => (Number(b.ps_debit) + Number(b.ps_credit))
                                          - (Number(a.ps_debit) + Number(a.ps_credit)))
                            .slice(0, 8).map((r) => r.ps_debit) },
            { ten: 'Có', mau: 'var(--vang-sang)',
              giaTri: [...d].sort((a, b) => (Number(b.ps_debit) + Number(b.ps_credit))
                                          - (Number(a.ps_debit) + Number(a.ps_credit)))
                            .slice(0, 8).map((r) => r.ps_credit) },
          ], cao: 250,
        })),
    ),

    bang(
      [{ ten: 'Tài khoản' }, { ten: 'Tên' }, { ten: 'Tính chất' },
       { ten: 'Phát sinh Nợ', tien: true }, { ten: 'Phát sinh Có', tien: true },
       { ten: 'Chênh lệch', tien: true }, { ten: '' }],
      d.map((r) => el('tr', {},
        el('td', { class: 'ma' }, r.account_code),
        el('td', {}, r.account_name),
        el('td', { class: 'mo' }, TINH_CHAT[r.nature] || r.nature),
        el('td', { class: 'tien' }, tien(r.ps_debit)),
        el('td', { class: 'tien' }, tien(r.ps_credit)),
        el('td', { class: 'tien' }, tien(r.chenh_lech)),
        el('td', {}, el('button', {
          class: 'nut nho', onclick: () => moSoChiTiet(r.account_code, r.account_name),
        }, 'Sổ chi tiết')),
      )),
      el('tr', {},
        el('td', { colspan: '3' }, `Cộng ${dinhDangSo.format(d.length)} tài khoản`),
        el('td', { class: 'tien' }, tien(tongNo)),
        el('td', { class: 'tien' }, tien(tongCo)),
        el('td', { class: 'tien' }, tien(tongNo - tongCo)),
        el('td', {}, ''),
      ),
    ),
  );
};

async function moSoChiTiet(code, ten) {
  const d = await goi(`/so-cai/${encodeURIComponent(code)}${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  moNgan({
    tieuDe: `Sổ chi tiết ${code}`,
    phuDe: `${ten || ''} · ${S.ky ? `kỳ ${S.ky}` : 'tất cả các kỳ'} · ${dinhDangSo.format(d.length)} dòng`,
    than: el('div', {},
      d.length > 1
        ? window.BD.duongLuyKe({
            nhan: d.filter((_, i) => i % Math.ceil(d.length / 24) === 0).map((r) => ngay(r.posting_date).slice(0, 5)),
            giaTri: d.filter((_, i) => i % Math.ceil(d.length / 24) === 0).map((r) => r.luy_ke),
            ten: 'Số dư lũy kế', cao: 170,
          })
        : null,
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Ngày'), el('th', {}, 'Chứng từ'), el('th', {}, 'Diễn giải'),
          el('th', {}, 'Đối ứng'), el('th', { class: 'tien' }, 'Nợ'),
          el('th', { class: 'tien' }, 'Có'), el('th', { class: 'tien' }, 'Lũy kế'))),
        el('tbody', {}, ...d.map((r) => el('tr', {},
          el('td', { class: 'ma' }, ngay(r.posting_date)),
          el('td', { class: 'ma' }, r.voucher_no),
          el('td', {}, r.description || '—'),
          el('td', { class: 'ma mo' }, r.contra_account_code || '—'),
          el('td', { class: 'tien' }, Number(r.debit) ? tien(r.debit) : '—'),
          el('td', { class: 'tien' }, Number(r.credit) ? tien(r.credit) : '—'),
          el('td', { class: 'tien mo' }, tien(r.luy_ke)),
        ))),
      )),
    ),
  });
}

/* ── Màn: Công nợ ──────────────────────────────────────────────────────── */

const LOAI_DOI_TAC = { supplier: 'Nhà cung cấp', customer: 'Khách hàng', employee: 'Nhân viên', other: 'Khác' };
const CN = { loai: '' };

VE['cong-no'] = async (than) => {
  const p = new URLSearchParams();
  if (S.ky) p.set('ky', S.ky);
  if (CN.loai) p.set('loai', CN.loai);
  const d = await goi(`/cong-no?${p}`);
  const phaiThu = d.filter((r) => Number(r.con_lai) > 0);
  const phaiTra = d.filter((r) => Number(r.con_lai) < 0);

  than.replaceChildren(
    dauTrang('Công nợ theo đối tượng',
      'Số dương là đối tượng còn nợ mình, số âm là mình còn nợ đối tượng.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Loại'),
        el('select', { onchange: (e) => { CN.loai = e.target.value; ve(); } },
          el('option', { value: '', selected: CN.loai === '' || null }, 'Tất cả'),
          ...Object.entries(LOAI_DOI_TAC).map(([v, t]) =>
            el('option', { value: v, selected: CN.loai === v || null }, t)))),
    ),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Phải thu', tien(phaiThu.reduce((s, r) => s + Number(r.con_lai), 0)),
        `${phaiThu.length} đối tượng`, 'duong'),
      theChiSo('Phải trả', tien(Math.abs(phaiTra.reduce((s, r) => s + Number(r.con_lai), 0))),
        `${phaiTra.length} đối tượng`, 'am'),
      theChiSo('Số dòng bút toán', dinhDangSo.format(d.reduce((s, r) => s + r.so_dong, 0))),
      theChiSo('Đối tượng còn dư', dinhDangSo.format(d.length)),
    ),

    el('div', { class: 'luoi luoi-2 cach-duoi' },
      theBieuDo('Mười khoản phải thu lớn nhất', null,
        window.BD.thanhNgang({
          muc: phaiThu.slice(0, 10).map((r) => ({ ten: r.name, giaTri: r.con_lai, mau: 'var(--duong)' })),
        })),
      theBieuDo('Mười khoản phải trả lớn nhất', null,
        window.BD.thanhNgang({
          muc: phaiTra.slice(0, 10).map((r) => ({ ten: r.name, giaTri: Math.abs(Number(r.con_lai)), mau: 'var(--am)' })),
        })),
    ),

    canhBaoCatBot(d.length, 300),

    bang(
      [{ ten: 'Mã' }, { ten: 'Tên' }, { ten: 'Loại' },
       { ten: 'Phát sinh Nợ', tien: true }, { ten: 'Phát sinh Có', tien: true },
       { ten: 'Còn lại', tien: true }, { ten: 'Số dòng', tien: true }],
      d.map((r) => {
        const con = Number(r.con_lai);
        return el('tr', {},
          el('td', { class: 'ma' }, r.code),
          el('td', {}, r.name),
          el('td', { class: 'mo' }, LOAI_DOI_TAC[r.kind] || r.kind),
          el('td', { class: 'tien' }, tien(r.phat_sinh_no)),
          el('td', { class: 'tien' }, tien(r.phat_sinh_co)),
          el('td', { class: `tien ${con >= 0 ? 'chu-duong' : 'chu-am'}` }, tien(con)),
          el('td', { class: 'tien mo' }, dinhDangSo.format(r.so_dong)),
        );
      }),
    ),
  );
};

/* ── Màn: Nhập từ Excel ────────────────────────────────────────────────── */

VE['nhap-excel'] = async (than) => {
  const ket = el('div', {});

  const oFile = el('input', { type: 'file', accept: '.xlsx', class: 'an' });
  const vung = el('div', { class: 'tha-file', onclick: () => oFile.click() },
    el('h3', {}, 'Kéo file Excel vào đây, hoặc bấm để chọn'),
    el('p', {}, 'Nhận Sổ nhật ký chung, Hệ thống tài khoản, Danh mục khoản mục chi phí, '
      + 'Danh sách nhà cung cấp và Bảng cân đối tài khoản. Chỉ định dạng .xlsx, tối đa 40 MB.'),
  );
  ['dragenter', 'dragover'].forEach((t) => vung.addEventListener(t, (e) => {
    e.preventDefault(); vung.classList.add('dang-keo');
  }));
  ['dragleave', 'drop'].forEach((t) => vung.addEventListener(t, (e) => {
    e.preventDefault(); vung.classList.remove('dang-keo');
  }));
  vung.addEventListener('drop', (e) => {
    if (e.dataTransfer.files[0]) tai(e.dataTransfer.files[0]);
  });
  oFile.addEventListener('change', () => { if (oFile.files[0]) tai(oFile.files[0]); });

  async function tai(file) {
    ket.replaceChildren(el('div', { class: 'the' }, el('div', { class: 'trong' },
      `Đang đọc và kiểm tra ${file.name}… File lớn có thể mất một phút.`)));
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await goi('/nhap-lieu/kiem-tra', { method: 'POST', body: fd });
      ket.replaceChildren(veKetQua(r));
    } catch (err) {
      ket.replaceChildren(el('div', { class: 'bao am' }, err.message));
    }
  }

  function veKetQua(r) {
    const dat = r.loi.length === 0;
    const t = r.tom_tat || {};
    const chiDoiChieu = Boolean(r.chi_doi_chieu);
    const nutGhi = el('button', {
      class: 'nut chinh', disabled: (!dat || chiDoiChieu) || null,
    }, chiDoiChieu ? 'Bảng này chỉ để đối chiếu'
      : dat ? 'Ghi vào sổ' : 'Không ghi được vì có lỗi');

    nutGhi.addEventListener('click', async () => {
      if (!confirm('Ghi lô này vào sổ cái? Có thể hoàn tác cả lô về sau, nhưng nên xem kỹ bảng đối chiếu trước.')) return;
      nutGhi.disabled = true; nutGhi.textContent = 'Đang ghi…';
      try {
        const x = await goi(`/nhap-lieu/${r.lo}/ghi-so`, { method: 'POST' });
        ket.replaceChildren(el('div', { class: 'bao duong' },
          `Đã ghi ${dinhDangSo.format(x.so_ban_ghi)} bản ghi vào sổ. `
          + 'Mở màn Tổng quan để đối chiếu lại, hoặc màn Các lô đã nhập để hoàn tác nếu cần.'));
        S.cacKy = await goi('/ky').catch(() => S.cacKy);
      } catch (err) {
        nutGhi.disabled = false; nutGhi.textContent = 'Ghi vào sổ';
        ket.prepend(el('div', { class: 'bao am' }, err.message));
      }
    });

    return el('div', {},
      el('div', { class: `bao ${dat ? 'duong' : 'am'}` },
        dat ? `Qua toàn bộ kiểm tra. ${r.ten_loai}, ${dinhDangSo.format(t.so_dong || 0)} dòng.`
            : `Có ${r.loi.length} lỗi chặn. Lô này không ghi vào sổ được cho tới khi sửa file gốc.`),

      r.loi.length ? el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' }, 'Lỗi chặn'),
        el('div', { class: 'the-than' },
          ...r.loi.map((l) => el('div', { class: 'bao am' }, l))),
      ) : null,

      r.canh.length ? el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' }, 'Cần biết trước khi ghi'),
        el('div', { class: 'the-than' },
          ...r.canh.map((l) => el('div', { class: 'bao cho' }, l))),
      ) : null,

      el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' },
          el('span', {}, 'Các tầng kiểm tra'),
          el('span', { class: 'mo thuong' }, `${r.ten_file} · lô ${String(r.lo).slice(0, 8)}`)),
        el('div', { class: 'tang' }, ...r.tang.map((x, i) => el('div', {
          class: `tang-muc ${x.dat ? 'dat' : 'hong'}`,
        },
          el('div', { class: 'tang-dau' }, x.dat ? '✓' : '✕'),
          el('div', {},
            el('div', { class: 'tang-ten' }, `${i + 1}. ${x.ten}`),
            el('div', { class: 'tang-mo' }, x.mo),
          ),
        ))),
      ),

      t.so_khop !== undefined ? el('div', { class: 'luoi luoi-3 cach-duoi' },
        theChiSo('Tài khoản khớp', dinhDangSo.format(t.so_khop), 'so với sổ trong hệ thống', 'duong'),
        theChiSo('Tài khoản lệch', dinhDangSo.format(t.so_lech),
          t.so_lech ? 'cần tìm nguyên nhân' : 'không có cái nào',
          t.so_lech ? 'am' : 'duong'),
        theChiSo('Dòng đọc được', dinhDangSo.format(t.so_dong)),
      ) : null,

      t.lech?.length ? el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' }, 'Chi tiết các tài khoản lệch'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'TK'), el('th', {}, 'Tên'),
            el('th', { class: 'tien' }, 'Nợ trong sổ'), el('th', { class: 'tien' }, 'Nợ trong file'),
            el('th', { class: 'tien' }, 'Lệch Nợ'),
            el('th', { class: 'tien' }, 'Có trong sổ'), el('th', { class: 'tien' }, 'Có trong file'),
            el('th', { class: 'tien' }, 'Lệch Có'))),
          el('tbody', {}, ...t.lech.map((x) => el('tr', {},
            el('td', { class: 'ma' }, x.ma),
            el('td', {}, x.ten),
            el('td', { class: 'tien' }, tien(x.so_no)),
            el('td', { class: 'tien' }, tien(x.file_no)),
            el('td', { class: 'tien chu-am' }, tien(x.lech_no)),
            el('td', { class: 'tien' }, tien(x.so_co)),
            el('td', { class: 'tien' }, tien(x.file_co)),
            el('td', { class: 'tien chu-am' }, tien(x.lech_co)),
          ))),
        )),
      ) : null,

      t.tong_no !== undefined ? el('div', { class: 'luoi luoi-4 cach-duoi' },
        theChiSo('Tổng phát sinh Nợ', tien(t.tong_no), 'đồng'),
        theChiSo('Tổng phát sinh Có', tien(t.tong_co), 'đồng'),
        theChiSo('Chênh lệch', tien(t.lech), Math.abs(t.lech) < 0.005 ? 'cân tuyệt đối' : 'phải bằng 0',
          Math.abs(t.lech) < 0.005 ? 'duong' : 'am'),
        theChiSo('Chứng từ', dinhDangSo.format(t.so_chung_tu || 0),
          `${t.chung_tu_trung || 0} trùng sẽ bỏ qua`),
      ) : null,

      t.ky?.length ? el('div', { class: 'bao' },
        `Kỳ kế toán trong file: ${t.ky.join(', ')}.`) : null,

      r.xem_thu?.length ? el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' },
          el('span', {}, 'Xem thử dữ liệu sẽ ghi'),
          el('span', { class: 'mo thuong' }, `${r.xem_thu.length} dòng đầu`)),
        el('div', { class: 'cuon thap' }, veXemThu(r.loai, r.xem_thu)),
      ) : null,

      el('div', { class: 'dong-thanh' },
        nutGhi,
        el('button', {
          class: 'nut',
          onclick: async () => {
            try { await goi(`/nhap-lieu/${r.lo}/huy`, { method: 'POST' }); }
            catch (err) { alert(err.message); return; }
            ket.replaceChildren(el('div', { class: 'bao' }, 'Đã hủy lô. File gốc không bị đụng tới.'));
          },
        }, 'Hủy lô này'),
      ),
    );
  }

  function veXemThu(loai, dong) {
    if (loai === 'nhat_ky') {
      return el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Ngày'), el('th', {}, 'Chứng từ'), el('th', {}, 'Tài khoản'),
          el('th', {}, 'Đối ứng'), el('th', {}, 'Diễn giải'), el('th', {}, 'Đối tượng'),
          el('th', { class: 'tien' }, 'Nợ'), el('th', { class: 'tien' }, 'Có'))),
        el('tbody', {}, ...dong.map((d) => el('tr', {},
          el('td', { class: 'ma' }, ngay(d.ngay_hach_toan)),
          el('td', { class: 'ma' }, d.so_chung_tu),
          el('td', { class: 'ma' }, d.tai_khoan),
          el('td', { class: 'ma mo' }, d.doi_ung || '—'),
          el('td', {}, d.dien_giai || '—',
            d.hop_ly === false ? el('span', { class: 'the-nhan am cach-trai' }, 'không hợp lý') : null),
          el('td', { class: 'mo' }, d.ten_doi_tuong || d.ma_doi_tuong || '—'),
          el('td', { class: 'tien' }, d.no ? tien(d.no) : '—'),
          el('td', { class: 'tien' }, d.co ? tien(d.co) : '—'),
        ))),
      );
    }
    const cot = Object.keys(dong[0]).filter((k) => k !== 'dong' && k !== 'sheet');
    return el('table', {},
      el('thead', {}, el('tr', {}, ...cot.map((c) => el('th', {}, c.replace(/_/g, ' '))))),
      el('tbody', {}, ...dong.map((d) => el('tr', {},
        ...cot.map((c) => el('td', { class: c === 'ma' ? 'ma' : null }, String(d[c] ?? '—')))))),
    );
  }

  than.replaceChildren(
    dauTrang('Nhập bộ sổ từ Excel',
      'File không bao giờ ghi thẳng vào sổ cái. Nó đi qua bốn bước: đọc, kiểm tra năm tầng, '
      + 'xem thử để bạn đối chiếu, rồi mới ghi trong một giao dịch duy nhất.'),
    el('div', { class: 'the cach-duoi' }, el('div', { class: 'the-than' }, oFile, vung)),
    el('div', { class: 'bao' },
      'Bước xem thử không phải thủ tục. Bộ sổ thật đã dạy hai bài học ở đúng chỗ này: '
      + 'dòng "Tổng" cuối bảng bị đọc thành một nhà cung cấp tên rỗng, và hai bút toán ghi số âm '
      + 'suýt bị tưởng là lỗi nhập liệu. Cả hai chỉ lộ ra khi có người nhìn vào bảng đối chiếu.'),
    ket,
  );
};

/* ── Màn: Các lô đã nhập ───────────────────────────────────────────────── */

const TRANG_THAI_LO = {
  staged:    { ten: 'Đang chờ', mau: '' },
  validated: { ten: 'Đã kiểm, chưa ghi', mau: 'cho' },
  rejected:  { ten: 'Bị từ chối', mau: 'am' },
  posted:    { ten: 'Đã ghi vào sổ', mau: 'duong' },
  reverted:  { ten: 'Đã hoàn tác', mau: '' },
};

VE['lo-nhap'] = async (than) => {
  const d = await goi('/lo-nhap');
  than.replaceChildren(
    dauTrang('Các lô đã nhập',
      'Mỗi lô giữ vân tay SHA-256 của file gốc, nên nhập lại đúng file đó là nhận ra ngay. '
      + 'Lô đã ghi vẫn hoàn tác được trọn vẹn: xóa đúng những chứng từ mang mã lô đó.'),
    bang(
      [{ ten: 'File' }, { ten: 'Vân tay' }, { ten: 'Dòng', tien: true }, { ten: 'Trạng thái' },
       { ten: 'Người tạo' }, { ten: 'Lúc' }, { ten: 'Người ghi sổ' }, { ten: '' }],
      d.map((b) => {
        const tt = TRANG_THAI_LO[b.status] || { ten: b.status, mau: '' };
        return el('tr', {},
          el('td', {}, b.source_file,
            b.recon?.canh_bao?.length
              ? el('div', { class: 'mo chu-phu' }, `${b.recon.canh_bao.length} cảnh báo`) : null),
          el('td', { class: 'ma mo' }, b.van_tay),
          el('td', { class: 'tien' }, dinhDangSo.format(b.row_count)),
          el('td', {}, el('span', { class: `the-nhan ${tt.mau}` }, tt.ten)),
          el('td', { class: 'mo' }, b.created_by || '—'),
          el('td', { class: 'ma mo' }, ngayGio(b.created_at)),
          el('td', { class: 'mo' }, b.posted_by ? `${b.posted_by}, ${ngayGio(b.posted_at)}` : '—'),
          el('td', {}, el('div', { class: 'dong-thanh' },
            el('button', { class: 'nut nho', onclick: () => moLo(b.id) }, 'Chi tiết'),
            b.status === 'posted' && S.toi.role === 'vault_admin'
              ? el('button', {
                  class: 'nut nho nguy',
                  onclick: async () => {
                    if (!confirm(`Hoàn tác lô ${b.source_file}? Mọi chứng từ của lô này sẽ bị xóa khỏi sổ.`)) return;
                    try {
                      const x = await goi(`/nhap-lieu/${b.id}/hoan-tac`, { method: 'POST' });
                      alert(`Đã xóa ${x.so_chung_tu_da_xoa} chứng từ.`);
                      ve();
                    } catch (err) { alert(err.message); }
                  },
                }, 'Hoàn tác')
              : null,
          )),
        );
      }),
    ),
  );
};

async function moLo(id) {
  const b = await goi(`/nhap-lieu/${id}`);
  const r = b.recon || {};
  moNgan({
    tieuDe: b.source_file,
    phuDe: `Vân tay ${b.van_tay} · ${dinhDangSo.format(b.row_count)} dòng · ${ngayGio(b.created_at)}`,
    than: el('div', {},
      r.tong_no !== undefined ? el('div', { class: 'luoi luoi-3 cach-duoi' },
        theChiSo('Tổng Nợ', tien(r.tong_no)),
        theChiSo('Tổng Có', tien(r.tong_co)),
        theChiSo('Chênh lệch', tien(r.lech), '', Math.abs(r.lech || 0) < 0.005 ? 'duong' : 'am'),
      ) : null,
      (r.canh_bao || []).map((c) => el('div', { class: 'bao cho' }, c)),
      (b.errors || []).map((c) => el('div', { class: 'bao am' }, c)),
      r.ly_do_xac_nhan ? el('div', { class: 'the cach-duoi' },
        el('div', { class: 'the-dau' }, 'Lý do chấp nhận chênh lệch'),
        el('div', { class: 'the-than' },
          ...Object.entries(r.ly_do_xac_nhan).map(([tk, ly]) => el('div', { class: 'bao' },
            el('strong', {}, `TK ${tk}: `), ly))),
      ) : null,
      (r.tang || []).length ? el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Các tầng kiểm tra'),
        el('div', { class: 'tang' }, ...r.tang.map((x, i) => el('div', {
          class: `tang-muc ${x.dat ? 'dat' : 'hong'}`,
        },
          el('div', { class: 'tang-dau' }, x.dat ? '✓' : '✕'),
          el('div', {},
            el('div', { class: 'tang-ten' }, `${i + 1}. ${x.ten}`),
            el('div', { class: 'tang-mo' }, x.mo)),
        ))),
      ) : null,
    ),
  });
}

/* ── Danh mục: khung dùng chung cho ba màn ─────────────────────────────── */

function manDanhMuc({ tieuDe, mo, duong, cot, dong, form, timGoiY }) {
  const trangThai = { tim: '' };
  return async (than) => {
    const oTim = el('input', { value: trangThai.tim, placeholder: timGoiY });
    const lam = async () => {
      const p = trangThai.tim ? `?tim=${encodeURIComponent(trangThai.tim)}` : '';
      const d = await goi(`/${duong}${p}`);
      noiDung.replaceChildren(bang(cot, d.map((r) => dong(r, lam))));
      dem.textContent = `${dinhDangSo.format(d.length)} dòng`;
    };
    oTim.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { trangThai.tim = oTim.value.trim(); lam(); }
    });
    const noiDung = el('div', {}, el('div', { class: 'trong' }, 'Đang tải…'));
    const dem = el('span', { class: 'mo thuong' }, '');

    than.replaceChildren(
      dauTrang(tieuDe, mo,
        el('label', { class: 'o' }, el('span', {}, 'Tìm'), oTim),
        el('button', { class: 'nut', onclick: () => { trangThai.tim = oTim.value.trim(); lam(); } }, 'Lọc'),
        ghiSoDuoc() ? el('button', {
          class: 'nut chinh', onclick: () => form(null, lam),
        }, '+ Thêm mới') : null),
      el('div', { class: 'bao' }, dem),
      noiDung,
    );
    await lam();
  };
}

function formDanhMuc({ tieuDe, duong, truong, banDau, lamMoi }) {
  const bao = el('div', { class: 'an' });
  const o = {};
  const than = el('div', {}, bao);
  for (const t of truong) {
    if (t.kieu === 'select') {
      o[t.ma] = el('select', {}, ...t.chon.map(([v, ten]) =>
        el('option', { value: v, selected: (banDau?.[t.ma] || t.mac_dinh) === v || null }, ten)));
    } else if (t.kieu === 'checkbox') {
      o[t.ma] = el('input', { type: 'checkbox', checked: banDau ? banDau[t.ma] !== false : true });
    } else {
      o[t.ma] = el('input', {
        value: banDau?.[t.ma] ?? '', placeholder: t.goi_y || '',
        disabled: t.khoa_khi_sua && banDau ? true : null,
        class: t.ma === 'code' ? 'ma' : null,
      });
    }
    than.appendChild(el('label', { class: 'o cach-duoi' }, el('span', {}, t.ten), o[t.ma]));
  }
  const nut = el('button', { class: 'nut chinh' }, banDau ? 'Lưu thay đổi' : 'Thêm mới');
  const dong = moNgan({ tieuDe, hep: true, than, chan: () => [nut] });
  nut.addEventListener('click', async () => {
    nut.disabled = true;
    try {
      const body = {};
      for (const t of truong) {
        body[t.ma] = t.kieu === 'checkbox' ? o[t.ma].checked : o[t.ma].value;
      }
      if (banDau) body.code = banDau.code;
      await goi(`/${duong}`, { method: 'POST', body });
      dong();
      await lamMoi();
    } catch (err) {
      bao.className = 'bao am'; bao.textContent = err.message;
    } finally { nut.disabled = false; }
  });
}

async function xoaDanhMuc(duong, code, lamMoi, nhan) {
  if (!confirm(`Xóa ${nhan} ${code}?`)) return;
  try { await goi(`/${duong}/${encodeURIComponent(code)}`, { method: 'DELETE' }); await lamMoi(); }
  catch (err) { alert(err.message); }
}

VE['dm-tai-khoan'] = manDanhMuc({
  tieuDe: 'Hệ thống tài khoản',
  mo: 'Tài khoản đã có bút toán thì không xóa được. Đánh dấu ngừng sử dụng thay vì xóa: '
    + 'số liệu quá khứ phải giữ nguyên.',
  duong: 'tai-khoan',
  timGoiY: 'mã hoặc tên tài khoản',
  cot: [{ ten: 'Mã' }, { ten: 'Tên' }, { ten: 'Tính chất' }, { ten: 'Cấp' },
        { ten: 'Trạng thái' }, { ten: '' }],
  dong: (r, lam) => el('tr', {},
    el('td', { class: 'ma' }, r.code),
    el('td', {}, r.name),
    el('td', { class: 'mo' }, TINH_CHAT[r.nature] || r.nature),
    el('td', { class: 'mo' }, r.depth),
    el('td', {}, el('span', { class: `the-nhan ${r.is_active ? 'duong' : ''}` },
      r.is_active ? 'đang dùng' : 'ngừng dùng')),
    el('td', {}, ghiSoDuoc() ? el('div', { class: 'dong-thanh' },
      el('button', { class: 'nut nho', onclick: () => formTaiKhoan(r, lam) }, 'Sửa'),
      el('button', { class: 'nut nho nguy', onclick: () => xoaDanhMuc('tai-khoan', r.code, lam, 'tài khoản') }, 'Xóa'),
    ) : null),
  ),
  form: (r, lam) => formTaiKhoan(r, lam),
});

function formTaiKhoan(r, lam) {
  formDanhMuc({
    tieuDe: r ? `Sửa tài khoản ${r.code}` : 'Thêm tài khoản',
    duong: 'tai-khoan', banDau: r, lamMoi: lam,
    truong: [
      { ma: 'code', ten: 'Mã tài khoản', goi_y: '6421', khoa_khi_sua: true },
      { ma: 'name', ten: 'Tên tài khoản', goi_y: 'Chi phí nhân viên quản lý' },
      { ma: 'name_en', ten: 'Tên tiếng Anh', goi_y: 'không bắt buộc' },
      { ma: 'nature', ten: 'Tính chất', kieu: 'select', mac_dinh: 'both',
        chon: [['debit', 'Dư Nợ'], ['credit', 'Dư Có'], ['both', 'Lưỡng tính']] },
      { ma: 'note', ten: 'Ghi chú', goi_y: 'không bắt buộc' },
      { ma: 'is_active', ten: 'Đang sử dụng', kieu: 'checkbox' },
    ],
  });
}

function formDoiTac(r, lam) {
  formDanhMuc({
    tieuDe: r ? `Sửa đối tượng ${r.code}` : 'Thêm đối tượng',
    duong: 'doi-tac', banDau: r, lamMoi: lam,
    truong: [
      { ma: 'code', ten: 'Mã đối tượng', goi_y: 'NCC00300', khoa_khi_sua: true },
      { ma: 'name', ten: 'Tên', goi_y: 'Công ty TNHH ...' },
      { ma: 'kind', ten: 'Loại', kieu: 'select', mac_dinh: 'customer',
        chon: Object.entries(LOAI_DOI_TAC) },
      { ma: 'tax_code', ten: 'Mã số thuế', goi_y: 'không bắt buộc' },
      { ma: 'address', ten: 'Địa chỉ', goi_y: 'không bắt buộc' },
      { ma: 'phone', ten: 'Điện thoại', goi_y: 'không bắt buộc' },
      { ma: 'is_active', ten: 'Đang sử dụng', kieu: 'checkbox' },
    ],
  });
}

VE['dm-khoan-muc'] = manDanhMuc({
  tieuDe: 'Khoản mục chi phí',
  mo: 'Mã dạng DN, DN.LVT, DN.PVC. Hậu tố chính là mã chi nhánh. Cột Chi phí đã gắn chỉ '
    + 'cộng phát sinh Nợ của tài khoản chi phí, đúng quy tắc của file tổng hợp.',
  duong: 'khoan-muc',
  timGoiY: 'mã hoặc tên khoản mục',
  cot: [{ ten: 'Mã' }, { ten: 'Tên' }, { ten: 'Chi nhánh' }, { ten: 'Số dòng', tien: true },
        { ten: 'Chi phí đã gắn', tien: true }, { ten: 'Trạng thái' }, { ten: '' }],
  dong: (r, lam) => el('tr', {},
    el('td', { class: 'ma' }, r.code),
    el('td', {}, r.name,
      r.auto_created
        ? el('span', { class: 'the-nhan cho cach-trai' }, 'máy tự tạo, nên rà lại') : null),
    el('td', { class: 'mo' }, r.branch_code || '—'),
    el('td', { class: 'tien mo' }, r.so_dong ? dinhDangSo.format(r.so_dong) : '—'),
    el('td', { class: 'tien' }, Number(r.chi_phi) ? tien(r.chi_phi) : '—'),
    el('td', {}, el('span', { class: `the-nhan ${r.is_active ? 'duong' : ''}` },
      r.is_active ? 'đang dùng' : 'ngừng dùng')),
    el('td', {}, ghiSoDuoc() ? el('div', { class: 'dong-thanh' },
      el('button', { class: 'nut nho', onclick: () => formKhoanMuc(r, lam) }, 'Sửa'),
      !r.so_dong ? el('button', {
        class: 'nut nho nguy',
        onclick: () => xoaDanhMuc('khoan-muc', r.code, lam, 'khoản mục'),
      }, 'Xóa') : null,
    ) : null),
  ),
  form: (r, lam) => formKhoanMuc(r, lam),
});

function formKhoanMuc(r, lam) {
  formDanhMuc({
    tieuDe: r ? `Sửa khoản mục ${r.code}` : 'Thêm khoản mục',
    duong: 'khoan-muc', banDau: r, lamMoi: lam,
    truong: [
      { ma: 'code', ten: 'Mã khoản mục', goi_y: 'DN.LVT', khoa_khi_sua: true },
      { ma: 'name', ten: 'Tên khoản mục', goi_y: 'Chi phí điện nước' },
      { ma: 'branch_code', ten: 'Mã chi nhánh', goi_y: 'suy từ hậu tố nếu để trống' },
      { ma: 'is_active', ten: 'Đang sử dụng', kieu: 'checkbox' },
    ],
  });
}

/* ── Màn: Soát lỗi ─────────────────────────────────────────────────────── */

VE['soat-loi'] = async (than) => {
  const d = await goi(`/soat-loi${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const sach = !d.chung_tu_lech.length && !d.ky_lech.length && !d.tai_khoan_la.length;

  than.replaceChildren(
    dauTrang('Soát lỗi',
      'Ba loại lỗi đủ để phát hiện gần hết sai sót nhập liệu: chứng từ không cân, kỳ không cân, '
      + 'và bút toán ghi vào tài khoản không có trong hệ thống.',
      chonKy(() => ve())),

    sach ? el('div', { class: 'bao duong' }, 'Không tìm thấy lỗi nào.') : null,

    d.ky_lech.length ? el('div', { class: 'the cach-duoi' },
      el('div', { class: 'the-dau' }, 'Kỳ không cân · nghiêm trọng nhất'),
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Kỳ'), el('th', { class: 'tien' }, 'Chênh lệch'))),
        el('tbody', {}, ...d.ky_lech.map((k) => el('tr', {},
          el('td', { class: 'ma' }, k.period_code),
          el('td', { class: 'tien chu-am' }, tien(k.diff)),
        ))),
      )),
    ) : null,

    d.chung_tu_lech.length ? el('div', { class: 'the cach-duoi' },
      el('div', { class: 'the-dau' },
        el('span', {}, 'Chứng từ không cân và không thuộc nhóm cân nào'),
        el('span', { class: 'mo thuong' }, `${d.chung_tu_lech.length} chứng từ`)),
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Chứng từ'), el('th', {}, 'Ngày'), el('th', {}, 'Kỳ'),
          el('th', { class: 'tien' }, 'Nợ'), el('th', { class: 'tien' }, 'Có'),
          el('th', { class: 'tien' }, 'Lệch'), el('th', { class: 'tien' }, 'Số dòng'))),
        el('tbody', {}, ...d.chung_tu_lech.map((v) => el('tr', {},
          el('td', { class: 'ma' }, v.voucher_no),
          el('td', { class: 'ma' }, ngay(v.posting_date)),
          el('td', { class: 'ma mo' }, v.period_code),
          el('td', { class: 'tien' }, tien(v.total_debit)),
          el('td', { class: 'tien' }, tien(v.total_credit)),
          el('td', { class: 'tien chu-am' }, tien(v.diff)),
          el('td', { class: 'tien mo' }, v.line_count),
        ))),
      )),
    ) : null,

    d.tai_khoan_la.length ? el('div', { class: 'the' },
      el('div', { class: 'the-dau' }, 'Bút toán ghi vào tài khoản không có trong hệ thống tài khoản'),
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Mã tài khoản'), el('th', { class: 'tien' }, 'Số dòng'))),
        el('tbody', {}, ...d.tai_khoan_la.map((a) => el('tr', {},
          el('td', { class: 'ma' }, a.account_code),
          el('td', { class: 'tien' }, dinhDangSo.format(a.so_dong)),
        ))),
      )),
    ) : null,
  );
};

/* ── Màn: Chi phí không hợp lý ─────────────────────────────────────────── */

VE['chi-phi'] = async (than) => {
  const [d, bd] = await Promise.all([
    goi(`/chi-phi-khong-hop-ly${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`),
    goi('/bieu-do'),
  ]);
  // Ve No, khong phai hieu so: but toan nao cung ghi hai ve nen hieu so bang 0.
  const tong = d.reduce((s, r) => s + Number(r.debit), 0);

  than.replaceChildren(
    dauTrang('Chi phí không hợp lý',
      'Nguồn trực tiếp cho Bảng kê chi phí không được trừ khi quyết toán thuế thu nhập doanh nghiệp.',
      chonKy(() => ve())),
    el('div', { class: 'bao cho' },
      `${dinhDangSo.format(d.length)} bút toán · tổng ${tien(tong)} đồng sẽ bị loại khi tính thu nhập chịu thuế.`),
    theBieuDo('Chi phí không hợp lý theo tháng', null,
      window.BD.cotNhom({
        nhan: bd.chi_phi_khong_hop_ly.map((r) => r.ky.replace('2026-', 'T')),
        chuoi: [{ ten: 'Không hợp lý', giaTri: bd.chi_phi_khong_hop_ly.map((r) => r.so_tien),
                  mau: 'var(--vang-sang)' }],
        cao: 190,
      })),
    el('div', { class: 'cach-tren' },
      bang(
        [{ ten: 'Ngày' }, { ten: 'Chứng từ' }, { ten: 'Tài khoản' }, { ten: 'Diễn giải' },
         { ten: 'Đối tượng' }, { ten: 'Nợ', tien: true }, { ten: 'Có', tien: true }],
        d.map((r) => el('tr', {},
          el('td', { class: 'ma' }, ngay(r.posting_date)),
          el('td', { class: 'ma' }, r.voucher_no),
          el('td', { class: 'ma' }, r.account_code),
          el('td', {}, r.description || '—'),
          el('td', { class: 'mo' }, r.partner_code || '—'),
          el('td', { class: 'tien' }, Number(r.debit) ? tien(r.debit) : '—'),
          el('td', { class: 'tien' }, Number(r.credit) ? tien(r.credit) : '—'),
        )),
      )),
  );
};

/* ── Màn: Kỳ kế toán ───────────────────────────────────────────────────── */

const TRANG_THAI_KY = {
  open:   { ten: 'Đang mở', mau: 'duong', mo: 'Ghi sổ bình thường.' },
  closed: { ten: 'Đã chốt', mau: 'cho', mo: 'Chỉ ghi bút toán điều chỉnh.' },
  locked: { ten: 'Đã khóa', mau: 'am', mo: 'Không ghi được gì. Database chặn ở tầng trigger.' },
};

VE['ky'] = async (than) => {
  const d = await goi('/ky');
  S.cacKy = d;
  const suaDuoc = ghiSoDuoc();

  than.replaceChildren(
    dauTrang('Kỳ kế toán',
      'Khóa kỳ là lớp bảo vệ chống sửa số liệu quá khứ. Kỳ đã khóa thì chính database từ chối '
      + 'mọi thay đổi, không phụ thuộc vào giao diện.'),
    theBieuDo('Quy mô phát sinh theo kỳ', null,
      window.BD.cotNhom({
        nhan: d.map((k) => k.code).reverse(),
        chuoi: [
          { ten: 'Tổng Nợ', giaTri: d.map((k) => k.tong_no).reverse(), mau: 'var(--xanh)' },
          { ten: 'Tổng Có', giaTri: d.map((k) => k.tong_co).reverse(), mau: 'var(--vang-sang)' },
        ], cao: 200,
      })),
    el('div', { class: 'cach-tren' }, bang(
      [{ ten: 'Kỳ' }, { ten: 'Từ ngày' }, { ten: 'Đến ngày' }, { ten: 'Trạng thái' },
       { ten: 'Chứng từ', tien: true }, { ten: 'Tổng Nợ', tien: true },
       { ten: 'Tổng Có', tien: true }, { ten: 'Người chốt' }, { ten: '' }],
      d.map((k) => {
        const tt = TRANG_THAI_KY[k.status] || { ten: k.status, mau: '' };
        return el('tr', {},
          el('td', { class: 'ma' }, k.code),
          el('td', { class: 'ma mo' }, ngay(k.start_date)),
          el('td', { class: 'ma mo' }, ngay(k.end_date)),
          el('td', {}, el('span', { class: `the-nhan ${tt.mau}` }, tt.ten),
            el('div', { class: 'mo chu-phu' }, tt.mo)),
          el('td', { class: 'tien' }, dinhDangSo.format(k.so_chung_tu)),
          el('td', { class: 'tien' }, tien(k.tong_no)),
          el('td', { class: 'tien' }, tien(k.tong_co)),
          el('td', { class: 'mo' }, k.closed_by ? `${k.closed_by}, ${ngayGio(k.closed_at)}` : '—'),
          el('td', {}, suaDuoc ? el('select', {
            onchange: async (e) => {
              const moi = e.target.value;
              if (moi === k.status) return;
              const xacNhan = moi === 'locked'
                ? `Khóa kỳ ${k.code}? Sau khi khóa, không ai ghi thêm được vào kỳ này, kể cả bạn. `
                  + 'Muốn sửa phải ghi bút toán điều chỉnh ở kỳ đang mở.'
                : `Đổi kỳ ${k.code} sang ${TRANG_THAI_KY[moi].ten.toLowerCase()}?`;
              if (!confirm(xacNhan)) { e.target.value = k.status; return; }
              try {
                await goi(`/ky/${encodeURIComponent(k.code)}/trang-thai`, {
                  method: 'POST', body: { trang_thai: moi },
                });
                ve();
              } catch (err) { alert(err.message); e.target.value = k.status; }
            },
          },
            ...Object.entries(TRANG_THAI_KY).map(([v, t]) =>
              el('option', { value: v, selected: k.status === v || null }, t.ten)),
          ) : null),
        );
      }),
    )),
  );
};

/* ── Màn: Số liệu vận hành ─────────────────────────────────────────────── */

VE['van-hanh'] = async (than) => {
  const d = await goi('/van-hanh');
  const theoThang = new Map();
  d.lead_theo_thang.forEach((r) => {
    const k = String(r.thang).slice(0, 7);
    theoThang.set(k, (theoThang.get(k) || 0) + r.so_lead);
  });
  const thang = [...theoThang.keys()].sort();

  const tongLead = d.lead_theo_nguon.reduce((s, r) => s + r.so_lead, 0);
  const tongDen = d.lead_theo_nguon.reduce((s, r) => s + r.den_phong_kham, 0);

  than.replaceChildren(
    dauTrang('Số liệu vận hành',
      'Két đọc được số liệu từ các phân hệ khác, nhưng chỉ một chiều và chỉ những cột cần cho '
      + 'kế toán. Tên và số điện thoại khách hàng không đi qua đây.'),

    el('div', { class: 'bao' },
      'Dữ liệu dưới đây đọc qua lớp view finance_src. Phân hệ vận hành không có đường nào '
      + 'đọc ngược lại sổ sách.'),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tổng lead', dinhDangSo.format(tongLead)),
      theChiSo('Đã đến phòng khám', dinhDangSo.format(tongDen),
        tongLead ? `${Math.round(tongDen / tongLead * 100)}% chuyển đổi` : '', 'duong'),
      theChiSo('Nhân sự PG có công', dinhDangSo.format(d.cong_pg.length)),
      theChiSo('Lần chấm ngoại tuyến',
        dinhDangSo.format(d.cong_pg.reduce((s, r) => s + (r.cham_ngoai_tuyen || 0), 0)),
        'đồng bộ lại khi có mạng', 'vang'),
    ),

    el('div', { class: 'luoi luoi-2 cach-duoi' },
      theBieuDo('Lead theo tháng', null,
        window.BD.cotNhom({
          nhan: thang.map((t) => t.replace(/^\d{4}-/, 'T')),
          chuoi: [{ ten: 'Số lead', giaTri: thang.map((t) => theoThang.get(t)), mau: 'var(--xanh)' }],
          tienTe: false, cao: 200,
        })),
      theBieuDo('Lead theo nguồn', null,
        window.BD.vanhKhuyen({
          muc: (() => {
            const m = new Map();
            d.lead_theo_nguon.forEach((r) => m.set(r.nguon, (m.get(r.nguon) || 0) + r.so_lead));
            return [...m].map(([ten, giaTri]) => ({ ten, giaTri }));
          })(),
        })),
    ),

    el('div', { class: 'luoi luoi-2' },
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Lead theo nguồn và dịch vụ'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Nguồn'), el('th', {}, 'Dịch vụ'),
            el('th', { class: 'tien' }, 'Số lead'), el('th', { class: 'tien' }, 'Đến khám'),
            el('th', { class: 'tien' }, 'Tỷ lệ'))),
          el('tbody', {}, ...d.lead_theo_nguon.map((r) => el('tr', {},
            el('td', {}, r.nguon),
            el('td', { class: 'mo' }, r.dich_vu),
            el('td', { class: 'tien' }, dinhDangSo.format(r.so_lead)),
            el('td', { class: 'tien' }, dinhDangSo.format(r.den_phong_kham)),
            el('td', { class: 'tien mo' }, r.so_lead ? `${Math.round(r.den_phong_kham / r.so_lead * 100)}%` : '—'),
          ))),
        )),
      ),

      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Ngày công PG'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Mã PG'), el('th', { class: 'tien' }, 'Lần chấm'),
            el('th', { class: 'tien' }, 'Ngoại tuyến'), el('th', {}, 'Khoảng thời gian'))),
          el('tbody', {}, ...d.cong_pg.map((r) => el('tr', {},
            el('td', { class: 'ma' }, r.pg_code),
            el('td', { class: 'tien' }, dinhDangSo.format(r.so_lan_cham)),
            el('td', { class: 'tien mo' }, r.cham_ngoai_tuyen || '—'),
            el('td', { class: 'mo' }, r.tu_ngay ? `${ngay(r.tu_ngay)} – ${ngay(r.den_ngay)}` : 'chưa gắn ca'),
          ))),
        )),
      ),
    ),

    el('div', { class: 'the cach-tren' },
      el('div', { class: 'the-dau' },
        el('span', {}, d.luong_chi_tiet ? 'Đơn giá lương theo người' : 'Đơn giá lương theo bộ phận'),
        !d.luong_chi_tiet
          ? el('span', { class: 'mo thuong' }, 'vai trò chỉ xem không thấy lương từng người')
          : null),
      el('div', { class: 'cuon thap' }, d.luong_chi_tiet
        ? el('table', {},
            el('thead', {}, el('tr', {},
              el('th', {}, 'Mã'), el('th', {}, 'Họ tên'), el('th', {}, 'Bộ phận'),
              el('th', { class: 'tien' }, 'Đơn giá giờ'),
              el('th', { class: 'tien' }, 'Lương thỏa thuận'), el('th', {}, 'Trạng thái'))),
            el('tbody', {}, ...d.luong.map((r) => el('tr', {},
              el('td', { class: 'ma' }, r.employee_code || '—'),
              el('td', {}, r.full_name || '—'),
              el('td', { class: 'mo' }, r.department || '—'),
              el('td', { class: 'tien' }, tien(r.hourly_rate)),
              el('td', { class: 'tien' }, tien(r.salary_offer)),
              el('td', { class: 'mo' }, r.status || '—'),
            ))))
        : el('table', {},
            el('thead', {}, el('tr', {},
              el('th', {}, 'Bộ phận'), el('th', { class: 'tien' }, 'Số người'),
              el('th', { class: 'tien' }, 'Đơn giá giờ trung bình'))),
            el('tbody', {}, ...d.luong.map((r) => el('tr', {},
              el('td', {}, r.bo_phan),
              el('td', { class: 'tien' }, dinhDangSo.format(r.so_nguoi)),
              el('td', { class: 'tien' }, tien(r.don_gia_gio_trung_binh)),
            ))))),
    ),
  );
};

/* ── Màn: Nhật ký truy cập ─────────────────────────────────────────────── */

const TC = { nguoi: '', hanh_dong: '' };

VE['truy-cap'] = async (than) => {
  const p = new URLSearchParams({ so_dong: '300' });
  if (TC.nguoi) p.set('nguoi', TC.nguoi);
  if (TC.hanh_dong) p.set('hanh_dong', TC.hanh_dong);
  const d = await goi(`/nhat-ky-truy-cap?${p}`);
  const hanhDong = [...new Set(d.map((r) => r.action))].sort();

  than.replaceChildren(
    dauTrang('Nhật ký truy cập',
      'Mọi lần mở sổ đều để lại vết. Bảng này chỉ thêm được: trigger ở database từ chối mọi lệnh '
      + 'sửa và xóa, kể cả từ chính dịch vụ này.',
      el('label', { class: 'o' }, el('span', {}, 'Người'),
        el('input', {
          value: TC.nguoi, placeholder: 'tên tài khoản',
          onchange: (e) => { TC.nguoi = e.target.value.trim(); ve(); },
        })),
      el('label', { class: 'o' }, el('span', {}, 'Hành động'),
        el('select', { onchange: (e) => { TC.hanh_dong = e.target.value; ve(); } },
          el('option', { value: '', selected: TC.hanh_dong === '' || null }, 'Tất cả'),
          ...hanhDong.map((a) => el('option', { value: a, selected: TC.hanh_dong === a || null }, a)))),
    ),
    bang(
      [{ ten: 'Thời điểm' }, { ten: 'Người' }, { ten: 'Vai trò' }, { ten: 'Hành động' },
       { ten: 'Đối tượng' }, { ten: 'Số dòng', tien: true }, { ten: 'Địa chỉ máy' }],
      d.map((r) => el('tr', {},
        el('td', { class: 'ma' }, ngayGio(r.at)),
        el('td', {}, r.actor),
        el('td', { class: 'mo' }, r.actor_role || '—'),
        el('td', {}, /that_bai|tu_choi|xoa_|hoan_tac/.test(r.action)
          ? el('span', { class: 'the-nhan am' }, r.action)
          : /tao_|luu_|ghi_so|sua_/.test(r.action)
            ? el('span', { class: 'the-nhan xanh' }, r.action)
            : r.action),
        el('td', { class: 'mo ma' }, r.target || '—'),
        el('td', { class: 'tien mo' }, r.row_count ?? '—'),
        el('td', { class: 'ma mo' }, r.ip || '—'),
      )),
    ),
  );
};

/* ── Màn: Người dùng ───────────────────────────────────────────────────── */

VE['nguoi-dung'] = async (than) => {
  const d = await goi('/nguoi-dung');
  const bao = el('div', { class: 'an' });

  const oTen = el('input', { placeholder: 'KeToan2' });
  const oHoTen = el('input', { placeholder: 'Nguyễn Văn A' });
  const oVai = el('select', {}, ...Object.entries(TEN_VAI).map(([v, t]) =>
    el('option', { value: v, selected: v === 'accountant' || null }, t)));

  than.replaceChildren(
    dauTrang('Người dùng két',
      'Tài khoản ở đây tách hoàn toàn với tài khoản hệ vận hành. Người có quyền quản trị phòng '
      + 'khám không mặc nhiên vào được sổ sách.'),
    bao,

    el('div', { class: 'the cach-duoi' },
      el('div', { class: 'the-dau' }, 'Tạo tài khoản mới'),
      el('div', { class: 'the-than' }, el('div', { class: 'bo-loc' },
        el('label', { class: 'o' }, el('span', {}, 'Tên tài khoản'), oTen),
        el('label', { class: 'o' }, el('span', {}, 'Họ tên'), oHoTen),
        el('label', { class: 'o' }, el('span', {}, 'Vai trò'), oVai),
        el('button', {
          class: 'nut chinh',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await goi('/nguoi-dung', {
                method: 'POST',
                body: { username: oTen.value.trim(), full_name: oHoTen.value.trim(), role: oVai.value },
              });
              bao.className = 'bao duong';
              bao.replaceChildren(
                el('div', {}, `Đã tạo ${r.username}. Mật khẩu tạm, chỉ hiện một lần:`),
                el('div', { class: 'ma mat-khau-tam' }, r.mat_khau_tam),
                el('div', {}, 'Gửi cho người dùng qua kênh riêng. Họ sẽ bị bắt đổi ngay lần đăng nhập đầu.'),
              );
              oTen.value = ''; oHoTen.value = '';
              window.scrollTo({ top: 0 });
            } catch (err) {
              bao.className = 'bao am'; bao.textContent = err.message;
            } finally { e.target.disabled = false; }
          },
        }, 'Tạo tài khoản'),
      )),
    ),

    bang(
      [{ ten: 'Tài khoản' }, { ten: 'Họ tên' }, { ten: 'Vai trò' }, { ten: 'Trạng thái' },
       { ten: 'Đăng nhập gần nhất' }, { ten: 'Đổi mật khẩu lần cuối' }, { ten: '' }],
      d.map((u) => {
        const laToi = u.id === S.toi.id;
        const dangKhoa = u.locked_until && new Date(u.locked_until) > new Date();
        return el('tr', {},
          el('td', { class: 'ma' }, u.username,
            laToi ? el('span', { class: 'the-nhan xanh cach-trai' }, 'bạn') : null),
          el('td', {}, u.full_name),
          el('td', {}, laToi
            ? el('span', { class: 'mo' }, TEN_VAI[u.role] || u.role)
            : el('select', {
                onchange: async (e) => {
                  try { await goi(`/nguoi-dung/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }); ve(); }
                  catch (err) { alert(err.message); e.target.value = u.role; }
                },
              }, ...Object.entries(TEN_VAI).map(([v, t]) =>
                el('option', { value: v, selected: u.role === v || null }, t)))),
          el('td', {},
            !u.is_active ? el('span', { class: 'the-nhan am' }, 'đã khóa')
              : dangKhoa ? el('span', { class: 'the-nhan cho' }, 'tạm khóa do sai mật khẩu')
              : el('span', { class: 'the-nhan duong' }, 'hoạt động'),
            u.must_change_password
              ? el('div', { class: 'mo chu-phu' }, 'chưa đổi mật khẩu tạm') : null),
          el('td', { class: 'ma mo' }, u.last_login_at ? ngayGio(u.last_login_at) : 'chưa bao giờ'),
          el('td', { class: 'ma mo' }, u.password_changed_at ? ngayGio(u.password_changed_at) : '—'),
          el('td', {}, laToi ? null : el('button', {
            class: u.is_active ? 'nut nho nguy' : 'nut nho',
            onclick: async () => {
              const bat = !u.is_active;
              if (!confirm(bat ? `Mở khóa ${u.username}?`
                : `Khóa ${u.username}? Mọi phiên đang mở của họ sẽ bị chấm dứt ngay.`)) return;
              try { await goi(`/nguoi-dung/${u.id}`, { method: 'PATCH', body: { is_active: bat } }); ve(); }
              catch (err) { alert(err.message); }
            },
          }, u.is_active ? 'Khóa' : 'Mở khóa')),
        );
      }),
    ),
  );
};

/* ── Màn: Hồ sơ của tôi ────────────────────────────────────────────────── */

VE['ho-so'] = async (than) => {
  const me = await goi('/me');
  const baoHs = el('div', { class: 'an' });
  const baoMk = el('div', { class: 'an' });

  const oHoTen = el('input', { value: me.full_name || '' });
  const oEmail = el('input', { type: 'email', value: me.email || '' });
  const oDt = el('input', { value: me.phone || '' });

  const cu = el('input', { type: 'password', autocomplete: 'current-password' });
  const moi = el('input', { type: 'password', autocomplete: 'new-password' });
  const lai = el('input', { type: 'password', autocomplete: 'new-password' });

  than.replaceChildren(
    dauTrang('Hồ sơ của tôi',
      'Bạn tự sửa được thông tin liên hệ và mật khẩu của mình. Vai trò thì không: đổi vai trò của '
      + 'chính mình bị chặn ngay tại database, không phải chỉ ẩn nút.'),

    el('div', { class: 'luoi luoi-2' },
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Thông tin liên hệ'),
        el('div', { class: 'the-than' },
          baoHs,
          el('div', { class: 'doi-mk' },
            el('label', { class: 'o' }, el('span', {}, 'Tài khoản'),
              el('input', { value: me.username, disabled: true })),
            el('label', { class: 'o' }, el('span', {}, 'Vai trò'),
              el('input', { value: TEN_VAI[me.role] || me.role, disabled: true })),
            el('label', { class: 'o' }, el('span', {}, 'Họ tên'), oHoTen),
            el('label', { class: 'o' }, el('span', {}, 'Email'), oEmail),
            el('label', { class: 'o' }, el('span', {}, 'Điện thoại'), oDt),
            el('button', {
              class: 'nut chinh',
              onclick: async (e) => {
                e.target.disabled = true;
                try {
                  const r = await goi('/me', {
                    method: 'PATCH',
                    body: { full_name: oHoTen.value.trim(), email: oEmail.value.trim(), phone: oDt.value.trim() },
                  });
                  S.toi.full_name = r.full_name;
                  baoHs.className = 'bao duong';
                  baoHs.textContent = 'Đã lưu.';
                } catch (err) {
                  baoHs.className = 'bao am';
                  baoHs.textContent = err.message;
                } finally { e.target.disabled = false; }
              },
            }, 'Lưu thông tin'),
          ),
        ),
      ),

      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Đổi mật khẩu'),
        el('div', { class: 'the-than' },
          baoMk,
          el('div', { class: 'doi-mk' },
            el('label', { class: 'o' }, el('span', {}, 'Mật khẩu hiện tại'), cu),
            el('label', { class: 'o' }, el('span', {}, 'Mật khẩu mới'), moi),
            el('label', { class: 'o' }, el('span', {}, 'Nhập lại mật khẩu mới'), lai),
            el('p', { class: 'mo ghi-chu' },
              'Từ 12 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt. ',
              'Đổi xong mọi phiên đang mở ở máy khác sẽ bị đăng xuất.'),
            el('button', {
              class: 'nut chinh',
              onclick: async (e) => {
                if (moi.value !== lai.value) {
                  baoMk.className = 'bao am';
                  baoMk.textContent = 'Hai lần nhập mật khẩu mới không giống nhau.';
                  return;
                }
                e.target.disabled = true;
                try {
                  await goi('/me/password', {
                    method: 'POST',
                    body: { mat_khau_cu: cu.value, mat_khau_moi: moi.value },
                  });
                  veCong('Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.');
                } catch (err) {
                  baoMk.className = 'bao am';
                  baoMk.textContent = err.message;
                } finally { e.target.disabled = false; }
              },
            }, 'Đổi mật khẩu'),
          ),
        ),
      ),
    ),
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   BÁO CÁO · tất cả dựng lại từ Sổ nhật ký chung
   ══════════════════════════════════════════════════════════════════════════
   Bộ Excel của kế toán có 9 file là báo cáo kết xuất từ cùng một sổ. Nhập cả
   9 file đó vào là tạo ra 9 nguồn sự thật, và chúng sẽ mâu thuẫn nhau — TK
   1388 đã cho thấy điều đó xảy ra thật. Nên chúng được tính lại ở đây từ
   nhật ký, và vì cùng một nguồn nên không thể lệch nhau. */

/**
 * Truy vấn giới hạn số dòng để trang không đơ. Cắt bớt mà không nói là để
 * người đọc tin rằng họ đang nhìn toàn bộ sổ trong khi không phải, và với sổ
 * kế toán thì đó là loại hiểu nhầm đắt nhất.
 */
function canhBaoCatBot(soDong, tran, tongThat) {
  if (soDong < tran) return null;
  return el('div', { class: 'bao cho' },
    `Đang hiển thị ${dinhDangSo.format(tran)} dòng đầu`
    + (tongThat ? ` trên tổng ${dinhDangSo.format(tongThat)} dòng` : '')
    + '. Thu hẹp khoảng ngày hoặc chọn một kỳ cụ thể để xem hết.');
}

function nhanNguon(nguonExcel) {
  return el('div', { class: 'bao' },
    el('strong', {}, 'Dựng lại từ Sổ nhật ký chung. '),
    'Báo cáo này không nhập từ file. Nó được tính lại từ chính các bút toán trong sổ, '
    + `nên không thể lệch với sổ. File Excel tương ứng: ${nguonExcel}.`);
}

/* ── Sổ quỹ tiền mặt ───────────────────────────────────────────────────── */

const SQ = { tu_ngay: '', den_ngay: '' };

VE['bc-so-quy'] = async (than) => {
  const p = new URLSearchParams();
  if (S.ky) p.set('ky', S.ky);
  if (SQ.tu_ngay) p.set('tu_ngay', SQ.tu_ngay);
  if (SQ.den_ngay) p.set('den_ngay', SQ.den_ngay);
  const d = await goi(`/bc/so-quy?${p}`);

  const oTu = el('input', { type: 'date', value: SQ.tu_ngay });
  const oDen = el('input', { type: 'date', value: SQ.den_ngay });
  const cuoiKy = Number(d.dau_ky) + Number(d.tong_thu) - Number(d.tong_chi);

  than.replaceChildren(
    dauTrang('Sổ kế toán chi tiết quỹ tiền mặt',
      'Toàn bộ tiền mặt vào ra trong kỳ, kèm số tồn sau mỗi lần. Tài khoản 111.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Từ ngày'), oTu),
      el('label', { class: 'o' }, el('span', {}, 'Đến ngày'), oDen),
      el('button', {
        class: 'nut chinh',
        onclick: () => { SQ.tu_ngay = oTu.value; SQ.den_ngay = oDen.value; ve(); },
      }, 'Lọc')),

    nhanNguon('So_ke_toan_chi_tiet_quy_tien_mat.xlsx'),
    canhBaoCatBot(d.dong.length, 5000, d.so_dong),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tồn đầu kỳ', tien(d.dau_ky),
        Number(d.dau_ky) ? 'đồng' : 'chưa nạp số dư đầu kỳ', Number(d.dau_ky) ? '' : 'vang'),
      theChiSo('Tổng thu', tien(d.tong_thu), `${dinhDangSo.format(d.so_dong)} lượt`, 'duong'),
      theChiSo('Tổng chi', tien(d.tong_chi), '', 'am'),
      theChiSo('Tồn cuối kỳ', tien(cuoiKy),
        cuoiKy >= 0 ? 'đồng' : 'quỹ âm, cần kiểm tra', cuoiKy >= 0 ? '' : 'am'),
    ),

    bang(
      [{ ten: 'Ngày' }, { ten: 'Phiếu thu' }, { ten: 'Phiếu chi' }, { ten: 'Đối tượng' },
       { ten: 'Diễn giải' }, { ten: 'TK đối ứng' },
       { ten: 'Thu', tien: true }, { ten: 'Chi', tien: true }, { ten: 'Tồn', tien: true }],
      d.dong.map((r) => el('tr', {},
        el('td', { class: 'ma' }, ngay(r.posting_date)),
        el('td', { class: 'ma' }, Number(r.thu) ? r.voucher_no : '—'),
        el('td', { class: 'ma' }, Number(r.chi) ? r.voucher_no : '—'),
        el('td', { class: 'mo' }, r.partner_name || r.partner_code || '—'),
        el('td', {}, r.description || '—'),
        el('td', { class: 'ma mo' }, r.contra_account_code || '—'),
        el('td', { class: 'tien' }, Number(r.thu) ? tien(r.thu) : '—'),
        el('td', { class: 'tien' }, Number(r.chi) ? tien(r.chi) : '—'),
        el('td', { class: 'tien mo' }, tien(Number(d.dau_ky) + Number(r.ton))),
      )),
      el('tr', {},
        el('td', { colspan: '6' }, `Cộng ${dinhDangSo.format(d.dong.length)} dòng`),
        el('td', { class: 'tien' }, tien(d.tong_thu)),
        el('td', { class: 'tien' }, tien(d.tong_chi)),
        el('td', { class: 'tien' }, tien(cuoiKy)),
      ),
    ),
  );
};

/* ── Sổ tiền gửi ngân hàng ─────────────────────────────────────────────── */

const SNH = { tai_khoan: '' };

VE['bc-so-ngan-hang'] = async (than) => {
  const ds = await goi('/bc/tai-khoan-ngan-hang');
  if (!SNH.tai_khoan && ds.length) SNH.tai_khoan = ds[0].code;
  const p = new URLSearchParams({ tai_khoan: SNH.tai_khoan || '112' });
  if (S.ky) p.set('ky', S.ky);
  const d = await goi(`/bc/so-ngan-hang?${p}`);
  const cuoiKy = Number(d.dau_ky) + Number(d.tong_thu) - Number(d.tong_chi);
  const dangChon = ds.find((x) => x.code === SNH.tai_khoan);

  than.replaceChildren(
    dauTrang('Sổ tiền gửi ngân hàng',
      'Một sổ cho mỗi tài khoản ngân hàng. Tài khoản 112.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Tài khoản ngân hàng'),
        el('select', { onchange: (e) => { SNH.tai_khoan = e.target.value; ve(); } },
          ...ds.map((x) => el('option', {
            value: x.code, selected: SNH.tai_khoan === x.code || null,
          }, `${x.code} · ${x.name}`)))),
    ),

    nhanNguon('So_tien_gui_ngan_hang.xlsx'),
    canhBaoCatBot(d.dong.length, 5000, d.so_dong),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tồn đầu kỳ', tien(d.dau_ky),
        Number(d.dau_ky) ? 'đồng' : 'chưa nạp số dư đầu kỳ', Number(d.dau_ky) ? '' : 'vang'),
      theChiSo('Tổng thu', tien(d.tong_thu), `${dinhDangSo.format(d.so_dong)} lượt`, 'duong'),
      theChiSo('Tổng chi', tien(d.tong_chi), '', 'am'),
      theChiSo('Tồn cuối kỳ', tien(cuoiKy), dangChon ? dangChon.name : ''),
    ),

    ds.length > 1 ? theBieuDo('So sánh các tài khoản ngân hàng', null,
      window.BD.cotNhom({
        nhan: ds.map((x) => x.code),
        chuoi: [
          { ten: 'Thu', giaTri: ds.map((x) => x.tong_thu), mau: 'var(--xanh)' },
          { ten: 'Chi', giaTri: ds.map((x) => x.tong_chi), mau: 'var(--vang-sang)' },
        ], cao: 200,
      })) : null,

    el('div', { class: 'cach-tren' }, bang(
      [{ ten: 'Ngày' }, { ten: 'Chứng từ' }, { ten: 'Đối tượng' }, { ten: 'Diễn giải' },
       { ten: 'TK đối ứng' }, { ten: 'Thu', tien: true }, { ten: 'Chi', tien: true },
       { ten: 'Tồn', tien: true }],
      d.dong.map((r) => el('tr', {},
        el('td', { class: 'ma' }, ngay(r.posting_date)),
        el('td', { class: 'ma' }, r.voucher_no),
        el('td', { class: 'mo' }, r.partner_name || r.partner_code || '—'),
        el('td', {}, r.description || '—'),
        el('td', { class: 'ma mo' }, r.contra_account_code || '—'),
        el('td', { class: 'tien' }, Number(r.thu) ? tien(r.thu) : '—'),
        el('td', { class: 'tien' }, Number(r.chi) ? tien(r.chi) : '—'),
        el('td', { class: 'tien mo' }, tien(Number(d.dau_ky) + Number(r.ton))),
      )),
      el('tr', {},
        el('td', { colspan: '5' }, `Cộng ${dinhDangSo.format(d.dong.length)} dòng`),
        el('td', { class: 'tien' }, tien(d.tong_thu)),
        el('td', { class: 'tien' }, tien(d.tong_chi)),
        el('td', { class: 'tien' }, tien(cuoiKy)),
      ),
    )),
  );
};

/* ── Tổng hợp công nợ ──────────────────────────────────────────────────── */

const THCN = { loai: 'phai_thu' };
const TEN_CN = { phai_thu: 'phải thu khách hàng', phai_tra: 'phải trả nhà cung cấp' };

VE['bc-tong-hop-cong-no'] = async (than) => {
  const p = new URLSearchParams({ loai: THCN.loai });
  if (S.ky) p.set('ky', S.ky);
  const d = await goi(`/bc/tong-hop-cong-no?${p}`);
  const tongCuoi = d.reduce((s, r) => s + Number(r.cuoi_ky), 0);

  than.replaceChildren(
    dauTrang(`Tổng hợp công nợ ${TEN_CN[THCN.loai]}`,
      'Số dư đầu kỳ, phát sinh trong kỳ, số dư cuối kỳ của từng đối tượng. '
      + `Tài khoản ${THCN.loai === 'phai_thu' ? '131' : '331'}.`,
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Loại'),
        el('select', { onchange: (e) => { THCN.loai = e.target.value; ve(); } },
          el('option', { value: 'phai_thu', selected: THCN.loai === 'phai_thu' || null },
            'Phải thu khách hàng'),
          el('option', { value: 'phai_tra', selected: THCN.loai === 'phai_tra' || null },
            'Phải trả nhà cung cấp'))),
    ),

    nhanNguon(THCN.loai === 'phai_thu'
      ? 'Tong_hop_cong_no_phai_thu_khach_hang.xlsx'
      : 'Tong_hop_cong_no_phai_tra_nha_cung_cap.xlsx'),

    el('div', { class: 'luoi luoi-3 cach-duoi' },
      theChiSo('Số đối tượng', dinhDangSo.format(d.length)),
      theChiSo('Tổng phát sinh Nợ', tien(d.reduce((s, r) => s + Number(r.ps_no), 0))),
      theChiSo('Tổng dư cuối kỳ', tien(tongCuoi), 'đồng', tongCuoi >= 0 ? 'duong' : 'am'),
    ),

    canhBaoCatBot(d.length, 500),

    theBieuDo('Mười đối tượng dư lớn nhất', null,
      window.BD.thanhNgang({
        muc: d.slice(0, 10).map((r) => ({ ten: r.name, giaTri: Math.abs(Number(r.cuoi_ky)) })),
      })),

    el('div', { class: 'cach-tren' }, bang(
      [{ ten: 'Mã' }, { ten: 'Tên' }, { ten: 'TK' }, { ten: 'Dư đầu kỳ', tien: true },
       { ten: 'Phát sinh Nợ', tien: true }, { ten: 'Phát sinh Có', tien: true },
       { ten: 'Dư cuối kỳ', tien: true }, { ten: '' }],
      d.map((r) => el('tr', {},
        el('td', { class: 'ma' }, r.code),
        el('td', {}, r.name),
        el('td', { class: 'ma mo' }, r.tk_cong_no),
        el('td', { class: 'tien mo' }, tien(r.dau_ky)),
        el('td', { class: 'tien' }, tien(r.ps_no)),
        el('td', { class: 'tien' }, tien(r.ps_co)),
        el('td', { class: `tien ${Number(r.cuoi_ky) >= 0 ? 'chu-duong' : 'chu-am'}` },
          tien(r.cuoi_ky)),
        el('td', {}, el('button', {
          class: 'nut nho', onclick: () => moChiTietCongNo(THCN.loai, r.code, r.name),
        }, 'Chi tiết')),
      )),
      el('tr', {},
        el('td', { colspan: '3' }, `Cộng ${dinhDangSo.format(d.length)} đối tượng`),
        el('td', { class: 'tien' }, tien(d.reduce((s, r) => s + Number(r.dau_ky), 0))),
        el('td', { class: 'tien' }, tien(d.reduce((s, r) => s + Number(r.ps_no), 0))),
        el('td', { class: 'tien' }, tien(d.reduce((s, r) => s + Number(r.ps_co), 0))),
        el('td', { class: 'tien' }, tien(tongCuoi)),
        el('td', {}, ''),
      ),
    )),
  );
};

async function moChiTietCongNo(loai, ma, ten) {
  const p = new URLSearchParams({ loai, doi_tac: ma });
  if (S.ky) p.set('ky', S.ky);
  const d = await goi(`/bc/chi-tiet-cong-no?${p}`);
  moNgan({
    tieuDe: `Chi tiết công nợ · ${ten}`,
    phuDe: `${ma}${d.doi_tac?.tax_code ? ` · MST ${d.doi_tac.tax_code}` : ''} · `
      + `${dinhDangSo.format(d.dong.length)} dòng · dựng từ Sổ nhật ký chung`,
    than: el('div', {},
      el('div', { class: 'cuon' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Ngày HT'), el('th', {}, 'Ngày CT'), el('th', {}, 'Số chứng từ'),
          el('th', {}, 'Số hóa đơn'), el('th', {}, 'Diễn giải'),
          el('th', {}, 'TK công nợ'), el('th', {}, 'TK đối ứng'),
          el('th', { class: 'tien' }, 'Phát sinh Nợ'),
          el('th', { class: 'tien' }, 'Phát sinh Có'),
          el('th', { class: 'tien' }, 'Số dư'))),
        el('tbody', {}, ...d.dong.map((r) => el('tr', {},
          el('td', { class: 'ma' }, ngay(r.posting_date)),
          el('td', { class: 'ma mo' }, ngay(r.voucher_date)),
          el('td', { class: 'ma' }, r.voucher_no),
          el('td', { class: 'ma mo' }, r.invoice_no || '—'),
          el('td', {}, r.description || '—'),
          el('td', { class: 'ma mo' }, r.tk_cong_no),
          el('td', { class: 'ma mo' }, r.contra_account_code || '—'),
          el('td', { class: 'tien' }, Number(r.ps_no) ? tien(r.ps_no) : '—'),
          el('td', { class: 'tien' }, Number(r.ps_co) ? tien(r.ps_co) : '—'),
          el('td', { class: 'tien mo' }, tien(r.so_du)),
        ))),
        el('tfoot', {}, el('tr', {},
          el('td', { colspan: '7' }, 'Cộng'),
          el('td', { class: 'tien' }, tien(d.tong_no)),
          el('td', { class: 'tien' }, tien(d.tong_co)),
          el('td', { class: 'tien' }, tien(Number(d.tong_no) - Number(d.tong_co))),
        )),
      )),
    ),
  });
}

/* ── Dòng tiền ─────────────────────────────────────────────────────────── */

VE['bc-dong-tien'] = async (than) => {
  const d = await goi(`/bc/dong-tien${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);

  than.replaceChildren(
    dauTrang('Dòng tiền',
      'Tiền vào và tiền ra, phân loại theo tài khoản đối ứng. Đó là cách duy nhất biết '
      + 'một đồng tiền vào ra vì lý do gì, và thông tin đó nằm sẵn trong nhật ký.',
      chonKy(() => ve())),

    nhanNguon('Dong_tien.xlsx'),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tiền tồn đầu kỳ', tien(d.dau_ky),
        Number(d.dau_ky) ? 'đồng' : 'chưa nạp số dư đầu kỳ', Number(d.dau_ky) ? '' : 'vang'),
      theChiSo('Tổng thu', tien(d.tong_thu), 'đồng', 'duong'),
      theChiSo('Tổng chi', tien(d.tong_chi), 'đồng', 'am'),
      theChiSo('Tiền tồn cuối kỳ', tien(d.cuoi_ky), 'đồng',
        Number(d.cuoi_ky) >= 0 ? 'duong' : 'am'),
    ),

    theBieuDo('Thu chi theo tháng', null,
      window.BD.cotNhom({
        nhan: d.theo_thang.map((r) => r.ky.replace(/^\d{4}-/, 'T')),
        chuoi: [
          { ten: 'Thu tiền mặt', giaTri: d.theo_thang.map((r) => r.tm_thu), mau: 'var(--xanh)' },
          { ten: 'Thu ngân hàng', giaTri: d.theo_thang.map((r) => r.nh_thu), mau: 'var(--xanh-sang)' },
          { ten: 'Chi tiền mặt', giaTri: d.theo_thang.map((r) => r.tm_chi), mau: 'var(--vang-sang)' },
          { ten: 'Chi ngân hàng', giaTri: d.theo_thang.map((r) => r.nh_chi), mau: 'var(--vang)' },
        ], cao: 240,
      })),

    el('div', { class: 'luoi luoi-2 cach-tren' },
      theBieuDo('Tiền vào theo nguồn', null,
        window.BD.vanhKhuyen({ muc: d.thu.map((r) => ({ ten: r.muc, giaTri: r.so_tien })) })),
      theBieuDo('Tiền ra theo mục đích', null,
        window.BD.vanhKhuyen({ muc: d.chi.map((r) => ({ ten: r.muc, giaTri: r.so_tien })) })),
    ),

    el('div', { class: 'luoi luoi-2 cach-tren' },
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Chi tiết tiền vào'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Mục thu'),
            el('th', { class: 'tien' }, 'Số tiền'), el('th', { class: 'tien' }, 'Số lượt'))),
          el('tbody', {}, ...d.thu.map((r) => el('tr', {},
            el('td', {}, r.muc),
            el('td', { class: 'tien chu-duong' }, tien(r.so_tien)),
            el('td', { class: 'tien mo' }, dinhDangSo.format(r.so_dong)),
          ))),
          el('tfoot', {}, el('tr', {}, el('td', {}, 'Cộng'),
            el('td', { class: 'tien' }, tien(d.tong_thu)), el('td', {}, ''))),
        )),
      ),
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Chi tiết tiền ra'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Mục chi'),
            el('th', { class: 'tien' }, 'Số tiền'), el('th', { class: 'tien' }, 'Số lượt'))),
          el('tbody', {}, ...d.chi.map((r) => el('tr', {},
            el('td', {}, r.muc),
            el('td', { class: 'tien chu-am' }, tien(r.so_tien)),
            el('td', { class: 'tien mo' }, dinhDangSo.format(r.so_dong)),
          ))),
          el('tfoot', {}, el('tr', {}, el('td', {}, 'Cộng'),
            el('td', { class: 'tien' }, tien(d.tong_chi)), el('td', {}, ''))),
        )),
      ),
    ),
  );
};

/* ── B01-DN · Báo cáo tình hình tài chính ──────────────────────────────── */

VE['bc-b01'] = async (than) => {
  const [d, dk] = await Promise.all([goi('/bc/b01'), goi('/bc/dau-ky')]);
  const tongTS = d.find((r) => r.ma === '270');
  const tongNV = d.find((r) => r.ma === '440');
  const lech = Number(tongTS?.cuoi_ky || 0) - Number(tongNV?.cuoi_ky || 0);

  than.replaceChildren(
    dauTrang('B01-DN · Báo cáo tình hình tài chính',
      'Bảng cân đối kế toán theo Thông tư 200, dựng từ số dư đầu kỳ cộng phát sinh trong '
      + 'nhật ký chung. Mỗi chỉ tiêu là một nhóm tài khoản.'),

    nhanNguon('B01_dn_bao_cao_tinh_hinh_tai_chinh.xlsx'),

    !dk.so_tai_khoan
      ? el('div', { class: 'bao cho' },
          'Chưa nạp số dư đầu kỳ, nên báo cáo này chỉ phản ánh phát sinh trong năm chứ không '
          + 'phải tình hình tài chính thật. Vào màn Nhập từ Excel, tải '
          + 'Bang_can_doi_tai_khoan.xlsx rồi bấm Ghi vào sổ để nạp số dư đầu kỳ.')
      : el('div', { class: 'bao duong' },
          `Đã nạp số dư đầu kỳ của ${dinhDangSo.format(dk.so_tai_khoan)} tài khoản `
          + `từ ${dk.tu_file}.`),

    el('div', { class: `bao ${Math.abs(lech) < 1 ? 'duong' : 'am'}` },
      Math.abs(lech) < 1
        ? 'Tổng tài sản bằng tổng nguồn vốn. Bảng cân.'
        : `Tổng tài sản lệch tổng nguồn vốn ${tien(lech)} đồng. Thường là do chưa nạp số dư `
          + 'đầu kỳ, hoặc kết quả kinh doanh trong năm chưa được kết chuyển sang 421.'),

    bang(
      [{ ten: 'Chỉ tiêu' }, { ten: 'Mã số' }, { ten: 'Tài khoản' },
       { ten: 'Số cuối kỳ', tien: true }, { ten: 'Số đầu năm', tien: true }],
      d.map((r) => el('tr', { class: r.nhom ? 'b01-nhom' : null },
        el('td', { class: r.dam ? 'b01-dam' : (r.nhom ? 'b01-nhom-ten' : '') }, r.ten),
        el('td', { class: 'ma mo' }, r.ma),
        el('td', { class: 'ma mo' }, r.tai_khoan || '—'),
        el('td', { class: `tien ${r.dam ? 'b01-dam' : ''}` }, tien(r.cuoi_ky)),
        el('td', { class: 'tien mo' }, tien(r.dau_nam)),
      )),
    ),
  );
};

/* ── Sổ chi tiết các tài khoản ─────────────────────────────────────────────
   Nguồn Excel: So_chi_tiet_cac_tai_khoan.xlsx

   Bố cục hai cột: bên trái là toàn bộ 256 tài khoản để duyệt, bên phải là sổ
   của tài khoản đang chọn.

   Danh sách bên trái kèm số dòng và phát sinh của từng tài khoản, vì bộ tài
   khoản này có 142 cái khai báo sẵn mà chưa dùng tới. Không có cột số liệu
   thì người dùng bấm lần lượt qua 142 bảng rỗng mới tìm ra cái có dữ liệu. */

const SCT = { tai_khoan: '1111', tim: '', chi_co_ps: true, gom_con: true, tu_ngay: '', den_ngay: '' };

VE['bc-so-chi-tiet'] = async (than) => {
  const cay = await goi('/bc/cay-tai-khoan');

  const loc = SCT.tim.trim().toLowerCase();
  const hienThi = cay.filter((a) => {
    if (SCT.chi_co_ps && !a.so_dong_gom) return false;
    if (!loc) return true;
    return a.code.startsWith(loc) || (a.name || '').toLowerCase().includes(loc);
  });

  const oTim = el('input', { value: SCT.tim, placeholder: 'mã hoặc tên tài khoản' });
  oTim.addEventListener('input', () => {
    SCT.tim = oTim.value;
    veDanhSach();
  });

  const dsHop = el('div', { class: 'tk-ds' });
  const dem = el('div', { class: 'tk-dem' });

  function veDanhSach() {
    const l = SCT.tim.trim().toLowerCase();
    const ds = cay.filter((a) => {
      if (SCT.chi_co_ps && !a.so_dong_gom) return false;
      if (!l) return true;
      return a.code.startsWith(l) || (a.name || '').toLowerCase().includes(l);
    });
    dem.textContent = `${dinhDangSo.format(ds.length)} trên ${dinhDangSo.format(cay.length)} tài khoản`;
    dsHop.replaceChildren(...ds.map((a) => el('button', {
      class: `tk-muc c${Math.min(a.depth, 4)}${a.code === SCT.tai_khoan ? ' dang-chon' : ''}`,
      onclick: () => { SCT.tai_khoan = a.code; ve(); },
      title: `${a.code} · ${a.name}`,
    },
      el('span', { class: 'tk-ma' }, a.code),
      el('span', { class: 'tk-ten' }, a.name),
      el('span', { class: 'tk-so' },
        a.so_dong_gom ? dinhDangSo.format(a.so_dong_gom) : '—'),
      a.co_con ? el('span', { class: 'the-nhan' }, 'cha') : null,
    )));
    if (!ds.length) dsHop.replaceChildren(el('div', { class: 'trong' }, 'Không có tài khoản nào khớp.'));
  }

  let d;
  try {
    const p = new URLSearchParams({ gom_con: String(SCT.gom_con) });
    if (S.ky) p.set('ky', S.ky);
    if (SCT.tu_ngay) p.set('tu_ngay', SCT.tu_ngay);
    if (SCT.den_ngay) p.set('den_ngay', SCT.den_ngay);
    d = await goi(`/bc/so-chi-tiet/${encodeURIComponent(SCT.tai_khoan)}?${p}`);
  } catch (err) {
    d = { loi: err.message };
  }

  const oTu = el('input', { type: 'date', value: SCT.tu_ngay });
  const oDen = el('input', { type: 'date', value: SCT.den_ngay });
  const oGom = el('input', {
    type: 'checkbox', checked: SCT.gom_con,
    disabled: d.co_con ? true : null,
    onchange: (e) => { SCT.gom_con = e.target.checked; ve(); },
  });

  const cuoiKy = d.loi ? 0
    : Number(d.dau_ky) + Number(d.tong_no) - Number(d.tong_co);

  than.replaceChildren(
    dauTrang('Sổ chi tiết các tài khoản',
      'Toàn bộ bút toán của một tài khoản, kèm số dư sau mỗi dòng. Chọn tài khoản ở danh '
      + 'sách bên trái.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Từ ngày'), oTu),
      el('label', { class: 'o' }, el('span', {}, 'Đến ngày'), oDen),
      el('button', {
        class: 'nut chinh',
        onclick: () => { SCT.tu_ngay = oTu.value; SCT.den_ngay = oDen.value; ve(); },
      }, 'Lọc')),

    nhanNguon('So_chi_tiet_cac_tai_khoan.xlsx'),

    el('div', { class: 'tk-khung' },
      el('div', { class: 'the tk-canh' },
        el('div', { class: 'the-dau' }, 'Tất cả tài khoản'),
        el('div', { class: 'the-than' },
          el('label', { class: 'o' }, el('span', {}, 'Tìm'), oTim),
          el('label', { class: 'tk-loc' },
            el('input', {
              type: 'checkbox', checked: SCT.chi_co_ps,
              onchange: (e) => { SCT.chi_co_ps = e.target.checked; veDanhSach(); },
            }),
            el('span', {}, 'Chỉ tài khoản có phát sinh'),
          ),
          dem,
        ),
        dsHop,
      ),

      el('div', { class: 'tk-than' },
        d.loi ? el('div', { class: 'bao am' }, d.loi) : el('div', {},
          el('div', { class: 'the cach-duoi' }, el('div', { class: 'the-than' },
            el('div', { class: 'tk-tieu-de' },
              el('div', {},
                el('div', { class: 'ngan-ten' }, `${d.code} · ${d.name}`),
                el('div', { class: 'mo ngan-phu' },
                  `${TINH_CHAT[d.nature] || d.nature} · cấp ${d.depth}`
                  + (d.co_con ? ` · tài khoản cha, gồm ${d.tai_khoan_con.length} tài khoản con` : '')),
              ),
              el('label', { class: 'tk-loc' }, oGom,
                el('span', {}, d.co_con
                  ? 'Tài khoản cha luôn gộp con'
                  : 'Gồm cả tài khoản con')),
            ),
          )),

          d.co_con ? el('div', { class: 'bao' },
            'Tài khoản này không mang bút toán nào của riêng nó. Mọi con số nằm ở các tài '
            + 'khoản con, và sổ dưới đây đã gộp chúng lại.') : null,

          canhBaoCatBot(d.dong.length, 5000, d.so_dong),

          el('div', { class: 'luoi luoi-4 cach-duoi' },
            theChiSo('Dư đầu kỳ', tien(d.dau_ky),
              Number(d.dau_ky) ? 'đồng' : 'chưa nạp số dư đầu kỳ',
              Number(d.dau_ky) ? '' : 'vang'),
            theChiSo('Phát sinh Nợ', tien(d.tong_no), `${dinhDangSo.format(d.so_dong)} dòng`),
            theChiSo('Phát sinh Có', tien(d.tong_co)),
            theChiSo('Dư cuối kỳ', tien(cuoiKy), 'đồng',
              cuoiKy >= 0 ? 'duong' : 'am'),
          ),

          d.tai_khoan_con.length ? el('div', { class: 'the cach-duoi' },
            el('div', { class: 'the-dau' }, 'Các tài khoản con'),
            el('div', { class: 'cuon thap' }, el('table', {},
              el('thead', {}, el('tr', {},
                el('th', {}, 'Mã'), el('th', {}, 'Tên'),
                el('th', { class: 'tien' }, 'Số dòng'),
                el('th', { class: 'tien' }, 'Phát sinh Nợ'),
                el('th', { class: 'tien' }, 'Phát sinh Có'), el('th', {}, ''))),
              el('tbody', {}, ...d.tai_khoan_con.map((c) => el('tr', {},
                el('td', { class: 'ma' }, c.code),
                el('td', {}, c.name),
                el('td', { class: 'tien mo' }, c.so_dong ? dinhDangSo.format(c.so_dong) : '—'),
                el('td', { class: 'tien' }, Number(c.ps_no) ? tien(c.ps_no) : '—'),
                el('td', { class: 'tien' }, Number(c.ps_co) ? tien(c.ps_co) : '—'),
                el('td', {}, c.so_dong ? el('button', {
                  class: 'nut nho', onclick: () => { SCT.tai_khoan = c.code; ve(); },
                }, 'Mở sổ') : null),
              ))),
            )),
          ) : null,

          d.dong.length ? bang(
            [{ ten: 'Ngày HT' }, { ten: 'Ngày CT' }, { ten: 'Số chứng từ' },
             { ten: 'Số hóa đơn' }, d.gom_con && d.co_con ? { ten: 'Tài khoản' } : null,
             { ten: 'Diễn giải' }, { ten: 'TK đối ứng' }, { ten: 'Đối tượng' },
             { ten: 'Khoản mục' },
             { ten: 'Phát sinh Nợ', tien: true }, { ten: 'Phát sinh Có', tien: true },
             { ten: 'Số dư', tien: true }].filter(Boolean),
            d.dong.map((r) => el('tr', {},
              el('td', { class: 'ma' }, ngay(r.posting_date)),
              el('td', { class: 'ma mo' }, ngay(r.voucher_date)),
              el('td', { class: 'ma' }, r.voucher_no),
              el('td', { class: 'ma mo' }, r.invoice_no || '—'),
              d.gom_con && d.co_con ? el('td', { class: 'ma' }, r.account_code) : null,
              el('td', {}, r.description || '—',
                r.is_deductible === false
                  ? el('span', { class: 'the-nhan am cach-trai' }, 'không hợp lý') : null),
              el('td', { class: 'ma mo' }, r.contra_account_code || '—'),
              el('td', { class: 'mo' }, r.partner_name || r.partner_code || '—'),
              el('td', { class: 'ma mo' }, r.cost_item_code || '—'),
              el('td', { class: 'tien' }, Number(r.ps_no) ? tien(r.ps_no) : '—'),
              el('td', { class: 'tien' }, Number(r.ps_co) ? tien(r.ps_co) : '—'),
              el('td', { class: 'tien mo' }, tien(r.so_du)),
            )),
            el('tr', {},
              el('td', { colspan: String(d.gom_con && d.co_con ? 9 : 8) }, 'Cộng phát sinh'),
              el('td', { class: 'tien' }, tien(d.tong_no)),
              el('td', { class: 'tien' }, tien(d.tong_co)),
              el('td', { class: 'tien' }, tien(cuoiKy)),
            ),
          ) : el('div', { class: 'the' }, el('div', { class: 'trong' },
            `Tài khoản ${d.code} chưa có bút toán nào`
            + (S.ky ? ` trong kỳ ${S.ky}` : '')
            + (SCT.tu_ngay || SCT.den_ngay ? ' trong khoảng ngày đang lọc' : '')
            + '. Tài khoản này đã khai báo trong hệ thống tài khoản nhưng chưa phát sinh.')),
        ),
      ),
    ),
  );

  veDanhSach();
};

/* ── Ba báo cáo không dựng lại được ────────────────────────────────────── */

const KHONG_DUNG_DUOC = [
  { ten: 'Bảng tính khấu hao tài sản cố định',
    file: 'Bang_tinh_khau_hao_tai_san_co_dinh_theo_nam.xlsx',
    thieu: 'Nhật ký chỉ ghi bút toán khấu hao hằng tháng, không ghi nguyên giá, ngày ghi tăng '
      + 'và thời gian sử dụng của từng tài sản. Không có ba thứ đó thì không tính được hao mòn '
      + 'lũy kế và giá trị còn lại.' },
  { ten: 'Bảng phân bổ công cụ dụng cụ',
    file: 'Bang_tinh_phan_bo_cong_cu_dung_cu_theo_nam.xlsx',
    thieu: 'Cùng lý do: cần số kỳ phân bổ và giá trị gốc của từng công cụ, nhật ký chỉ có bút '
      + 'toán phân bổ từng tháng.' },
  { ten: 'Tổng hợp tồn kho',
    file: 'Tong_hop_ton_kho.xlsx',
    thieu: 'Nhật ký ghi giá trị nhập xuất kho bằng tiền, không ghi mã hàng và số lượng. Không '
      + 'có số lượng thì không ra được tồn kho theo từng mặt hàng.' },
];

VE['bc-khong-dung-duoc'] = async (than) => {
  than.replaceChildren(
    dauTrang('Ba báo cáo cần dữ liệu riêng',
      'Bộ Excel của kế toán có 17 file. Mười bốn file đã nằm trong hệ thống này. Ba file còn '
      + 'lại không dựng lại được từ nhật ký chung, và nói thẳng ra thì tốt hơn là bịa một con '
      + 'số trông hợp lý.'),

    el('div', { class: 'luoi luoi-3' },
      ...KHONG_DUNG_DUOC.map((x) => el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, x.ten),
        el('div', { class: 'the-than' },
          el('p', { class: 'ghi-chu' }, x.thieu),
          el('p', { class: 'mo nguon-goc ma' }, x.file),
        ),
      )),
    ),

    el('div', { class: 'bao cach-tren' },
      'Muốn có ba báo cáo này trong hệ thống thì cần thêm ba danh mục: tài sản cố định, công '
      + 'cụ dụng cụ, và hàng hóa vật tư. Khi có danh mục, phần tính khấu hao và phân bổ sẽ tự '
      + 'chạy từ đó, và bút toán hằng tháng sinh ra tự động thay vì nhập tay.'),
  );
};

/* ── Tổng hợp chi phí theo khoản mục ───────────────────────────────────────
   Quy tắc cộng đã kiểm chứng bằng cách đối chiếu hai file thật: chỉ cộng phát
   sinh Nợ của TÀI KHOẢN CHI PHÍ. Mã khoản mục gắn trên tài khoản công nợ hay
   tài khoản tiền là để truy vết dòng tiền, cộng vào là tính chi hai lần. */

VE['bc-chi-phi-khoan-muc'] = async (than) => {
  const d = await goi(`/bc/chi-phi-khoan-muc${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const tongKyNay = d.dong.reduce((s, r) => s + Number(r.ky_nay), 0);
  const tongNgoai = d.dong.reduce((s, r) => s + Number(r.no_ngoai_chi_phi), 0);
  const coSo = d.dong.filter((r) => Number(r.ky_nay) > 0);

  than.replaceChildren(
    dauTrang('Tổng hợp chi phí theo khoản mục',
      'Chi phí gom theo mã khoản mục, lấy từ cột Mã KMCP trên sổ nhật ký chung.',
      chonKy(() => ve())),

    nhanNguon('Tong_hop_chi_phi_theo_khoan_muc_chi_phi.xlsx'),

    el('div', { class: 'bao' },
      el('strong', {}, 'Quy tắc cộng: '),
      'chỉ cộng phát sinh Nợ của tài khoản chi phí nhóm 6 và 8. Đây là quy tắc suy ra từ '
      + 'chính hai file của bạn: khoản mục MK có tổng phát sinh Nợ 277.037.990 trên mọi tài '
      + 'khoản, nhưng file tổng hợp ghi 243.344.990, đúng bằng phần trên TK 6416. Phần '
      + '33.693.000 còn lại nằm ở TK 3311, là vế đối ứng chứ không phải chi phí.'),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      theChiSo('Tổng chi phí theo khoản mục', tien(tongKyNay), 'đồng'),
      theChiSo('Số khoản mục có chi phí', dinhDangSo.format(coSo.length),
        `${d.dong.length} mã được gắn`),
      theChiSo('Gắn ngoài tài khoản chi phí', tien(tongNgoai),
        'không cộng vào tổng trên', tongNgoai ? 'vang' : ''),
      theChiSo('Khoản mục gắn thiếu', dinhDangSo.format(d.gan_thieu.length),
        d.gan_thieu.length ? 'không lên được báo cáo' : 'không có cái nào',
        d.gan_thieu.length ? 'am' : 'duong'),
    ),

    coSo.length ? el('div', { class: 'luoi luoi-2 cach-duoi' },
      theBieuDo('Cơ cấu chi phí theo khoản mục', null,
        window.BD.vanhKhuyen({
          muc: coSo.map((r) => ({ ten: `${r.ma} · ${r.ten}`, giaTri: r.ky_nay })),
        })),
      theBieuDo('Chi phí gắn khoản mục theo tháng', null,
        window.BD.cotNhom({
          nhan: d.theo_thang.map((r) => r.ky.replace(/^\d{4}-/, 'T')),
          chuoi: [{ ten: 'Chi phí', giaTri: d.theo_thang.map((r) => r.chi_phi),
                    mau: 'var(--xanh)' }],
          cao: 200,
        })),
    ) : null,

    bang(
      [{ ten: 'Mã khoản mục' }, { ten: 'Tên khoản mục' }, { ten: 'Chi nhánh' },
       { ten: 'Kỳ này', tien: true }, { ten: 'Lũy kế từ đầu năm', tien: true },
       { ten: 'Gắn ngoài TK chi phí', tien: true }, { ten: 'Số dòng', tien: true }],
      d.dong.map((r) => el('tr', {},
        el('td', { class: 'ma' }, r.ma),
        el('td', {}, r.ten),
        el('td', { class: 'mo' }, r.chi_nhanh || '—'),
        el('td', { class: 'tien' }, tien(r.ky_nay)),
        el('td', { class: 'tien mo' }, tien(r.luy_ke)),
        el('td', { class: `tien ${Number(r.no_ngoai_chi_phi) ? 'mo' : ''}` },
          Number(r.no_ngoai_chi_phi) ? tien(r.no_ngoai_chi_phi) : '—'),
        el('td', { class: 'tien mo' }, `${r.so_dong_chi_phi}/${r.so_dong}`),
      )),
      el('tr', {},
        el('td', { colspan: '3' }, `Cộng ${dinhDangSo.format(d.dong.length)} khoản mục`),
        el('td', { class: 'tien' }, tien(tongKyNay)),
        el('td', { class: 'tien' }, tien(d.dong.reduce((s, r) => s + Number(r.luy_ke), 0))),
        el('td', { class: 'tien mo' }, tien(tongNgoai)),
        el('td', {}, ''),
      ),
    ),

    d.gan_thieu.length ? el('div', { class: 'the cach-tren' },
      el('div', { class: 'the-dau' },
        el('span', {}, 'Khoản mục gắn thiếu'),
        el('span', { class: 'mo thuong' }, 'chi phí của chúng không lên được báo cáo')),
      el('div', { class: 'the-than' },
        el('p', { class: 'ghi-chu cach-duoi' },
          'Những mã dưới đây chỉ được gắn ở tài khoản công nợ hoặc tài khoản tiền, không '
          + 'gắn ở dòng tài khoản chi phí. Bút toán ghi nhận chi phí của chúng thiếu mã '
          + 'khoản mục, nên khoản chi đó không bao giờ xuất hiện trên báo cáo theo khoản mục.'),
        el('div', { class: 'cuon thap' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Mã'), el('th', {}, 'Tên'),
            el('th', { class: 'tien' }, 'Số dòng'),
            el('th', { class: 'tien' }, 'Tổng phát sinh Nợ'),
            el('th', {}, 'Chỉ gắn ở các tài khoản'))),
          el('tbody', {}, ...d.gan_thieu.map((r) => el('tr', {},
            el('td', { class: 'ma' }, r.ma),
            el('td', {}, r.ten),
            el('td', { class: 'tien mo' }, r.so_dong),
            el('td', { class: 'tien' }, tien(r.tong_no)),
            el('td', { class: 'ma mo' }, r.cac_tai_khoan),
          ))),
        )),
      ),
    ) : null,
  );
};

/* ── Đối tượng: khách hàng và đối tác, hai màn riêng ───────────────────────
   Tách vì hai nhóm khác nhau về mọi mặt: khách hàng hàng nghìn, mã sinh tự
   động, ghi ở TK 131; đối tác hàng trăm, mã do kế toán đặt, ghi ở TK 331.
   Trộn chung một danh sách sáu nghìn dòng thì tìm một nhà cung cấp phải lội
   qua sáu nghìn cái tên bệnh nhân. */

function manDoiTuong(nhom, tieuDe, moTa, loaiChon) {
  const tt = { tim: '', loai: '' };
  return async (than) => {
    const oTim = el('input', { value: tt.tim, placeholder: 'mã hoặc tên' });
    const dem = el('span', { class: 'mo thuong' }, '');
    const noiDung = el('div', {}, el('div', { class: 'trong' }, 'Đang tải…'));

    const lam = async () => {
      const p = new URLSearchParams({ nhom });
      if (tt.tim) p.set('tim', tt.tim);
      if (tt.loai) p.set('loai', tt.loai);
      const d = await goi(`/doi-tac?${p}`);
      const coDu = d.filter((r) => Number(r.con_lai) !== 0);
      dem.textContent = `${dinhDangSo.format(d.length)} đối tượng`
        + (coDu.length ? ` · ${coDu.length} còn dư công nợ` : '');
      noiDung.replaceChildren(bang(
        [{ ten: 'Mã' }, { ten: 'Tên' }, { ten: 'Loại' }, { ten: 'Mã số thuế' },
         { ten: 'Điện thoại' }, { ten: 'Số bút toán', tien: true },
         { ten: 'Còn lại', tien: true }, { ten: 'Trạng thái' }, { ten: '' }],
        d.map((r) => el('tr', {},
          el('td', { class: 'ma' }, r.code),
          el('td', {}, r.name,
            r.address ? el('div', { class: 'mo chu-phu' }, String(r.address).slice(0, 70)) : null),
          el('td', { class: 'mo' }, LOAI_DOI_TAC[r.kind] || r.kind),
          el('td', { class: 'ma mo' }, r.tax_code || '—'),
          el('td', { class: 'ma mo' }, r.phone || '—'),
          el('td', { class: 'tien mo' }, r.so_dong ? dinhDangSo.format(r.so_dong) : '—'),
          el('td', { class: `tien ${Number(r.con_lai) >= 0 ? 'chu-duong' : 'chu-am'}` },
            Number(r.con_lai) ? tien(r.con_lai) : '—'),
          el('td', {}, el('span', { class: `the-nhan ${r.is_active ? 'duong' : ''}` },
            r.is_active ? 'đang dùng' : 'ngừng dùng')),
          el('td', {}, el('div', { class: 'dong-thanh' },
            r.so_dong ? el('button', {
              class: 'nut nho',
              onclick: () => moChiTietCongNo(nhom === 'khach_hang' ? 'phai_thu' : 'phai_tra',
                r.code, r.name),
            }, 'Công nợ') : null,
            ghiSoDuoc() ? el('button', {
              class: 'nut nho', onclick: () => formDoiTac(r, lam),
            }, 'Sửa') : null,
            ghiSoDuoc() && !r.so_dong ? el('button', {
              class: 'nut nho nguy',
              onclick: () => xoaDanhMuc('doi-tac', r.code, lam, 'đối tượng'),
            }, 'Xóa') : null,
          )),
        )),
      ));
    };
    oTim.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { tt.tim = oTim.value.trim(); lam(); }
    });

    than.replaceChildren(
      dauTrang(tieuDe, moTa,
        el('label', { class: 'o' }, el('span', {}, 'Tìm'), oTim),
        loaiChon ? el('label', { class: 'o' }, el('span', {}, 'Loại'),
          el('select', { onchange: (e) => { tt.loai = e.target.value; lam(); } },
            el('option', { value: '' }, 'Tất cả'),
            ...loaiChon.map((k) => el('option', { value: k }, LOAI_DOI_TAC[k])))) : null,
        el('button', {
          class: 'nut', onclick: () => { tt.tim = oTim.value.trim(); lam(); },
        }, 'Lọc'),
        ghiSoDuoc() ? el('button', {
          class: 'nut chinh', onclick: () => formDoiTac(null, lam),
        }, '+ Thêm mới') : null),
      el('div', { class: 'bao' }, dem),
      noiDung,
    );
    await lam();
  };
}

VE['dm-khach-hang'] = manDoiTuong('khach_hang', 'Đối tượng khách hàng',
  'Khách hàng ghi ở tài khoản 131. Mã do phần mềm sinh theo chi nhánh: '
  + 'APC, PVC, LVT.');

VE['dm-doi-tac'] = manDoiTuong('doi_tac', 'Đối tượng đối tác',
  'Nhà cung cấp, nhân viên và các đối tượng khác, ghi ở tài khoản 331 và 334. '
  + 'Mã do kế toán đặt: NCC, NV.',
  ['supplier', 'employee', 'other']);

/* ── Khởi động ─────────────────────────────────────────────────────────── */

async function khoiDong() {
  try {
    if (!S.token) await lamMoiNeuCan();
    const me = await goi('/me');
    S.toi = me;
    if (!me.must_change_password) {
      try { S.cacKy = await goi('/ky'); } catch { S.cacKy = []; }
    }
    ve();
  } catch {
    veCong();
  }
}

khoiDong();
