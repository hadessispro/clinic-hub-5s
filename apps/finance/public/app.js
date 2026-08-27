'use strict';
/*
 * Finance Vault · giao diện.
 *
 * Không dùng khung nào cả. Két tiền càng ít phụ thuộc bên ngoài càng ít mặt
 * tấn công: mỗi gói npm trong trình duyệt là một người lạ được phép đọc mọi
 * con số trên màn hình này.
 *
 * Ba quy ước:
 *   1. Số tiền là chuỗi từ đầu tới cuối, chỉ đổi sang số khi định dạng hiển
 *      thị. numeric(18,2) vượt dải an toàn của Number.
 *   2. Mọi văn bản từ máy chủ đều đi qua createTextNode, không bao giờ
 *      innerHTML. Tên đối tác là dữ liệu người nhập.
 *   3. Token nằm trong biến JavaScript, không nằm trong localStorage. Đóng tab
 *      là mất phiên, đúng như két tiền nên hành xử.
 */

const GOC = location.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '') || '/vault';
const API = `${GOC}/api`;

/* ── Trạng thái ────────────────────────────────────────────────────────── */

const S = {
  token: null,
  hetHanLuc: 0,
  toi: null,
  man: 'tong-quan',
  ky: '',
  cacKy: [],
};

/* ── Tiện ích ──────────────────────────────────────────────────────────── */

const el = (tag, props = {}, ...con) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;           // chỉ dùng cho SVG cố định trong mã
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

/**
 * Token sống 10 phút. Làm mới trước khi hết hạn 60 giây để người dùng không
 * bao giờ nhìn thấy một lần lỗi 401 giữa chừng.
 */
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
  const r = await fetch(`${API}${duong}`, {
    ...tuyChon,
    credentials: 'same-origin',
    headers: {
      ...(tuyChon.body ? { 'Content-Type': 'application/json' } : {}),
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
      ...(tuyChon.headers || {}),
    },
    body: tuyChon.body ? JSON.stringify(tuyChon.body) : undefined,
  });
  const kieu = r.headers.get('content-type') || '';
  const d = kieu.includes('json') ? await r.json() : { loi: await r.text() };
  if (r.status === 401 && S.token) { veCong('Phiên đã hết. Đăng nhập lại.'); throw new Error('HET_PHIEN'); }
  if (r.status === 428) { S.toi.must_change_password = true; ve(); throw new Error('PHAI_DOI_MAT_KHAU'); }
  if (!r.ok) throw new Error(d.loi || `Lỗi ${r.status}`);
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
  { nhom: 'Sổ sách' },
  { ma: 'tong-quan', ten: 'Tổng quan', icon: 'M3 13h4v6H3zM10 5h4v14h-4zM17 9h4v10h-4z' },
  { ma: 'nhat-ky', ten: 'Nhật ký chung', icon: 'M4 4h13l3 3v13H4zM8 9h8M8 13h8M8 17h5' },
  { ma: 'can-doi', ten: 'Cân đối tài khoản', icon: 'M12 3v18M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z' },
  { ma: 'cong-no', ten: 'Công nợ', icon: 'M3 7h18v12H3zM3 11h18M7 15h4' },
  { nhom: 'Kiểm soát' },
  { ma: 'soat-loi', ten: 'Soát lỗi', icon: 'M12 3l9 16H3zM12 9v5M12 16.5v.5' },
  { ma: 'chi-phi', ten: 'Chi phí không hợp lý', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 8l8 8M16 8l-8 8' },
  { ma: 'ky', ten: 'Kỳ kế toán', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { nhom: 'Phân tích' },
  { ma: 'van-hanh', ten: 'Số liệu vận hành', icon: 'M4 19V9M10 19V4M16 19v-7M22 19H2' },
  { nhom: 'Quản trị' },
  { ma: 'truy-cap', ten: 'Nhật ký truy cập', icon: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2', quyen: ['vault_admin'] },
  { ma: 'nguoi-dung', ten: 'Người dùng', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0', quyen: ['vault_admin'] },
  { ma: 'ho-so', ten: 'Hồ sơ của tôi', icon: 'M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z' },
];

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

const TEN_VAI = {
  accountant: 'Kế toán · ghi sổ',
  viewer: 'Chỉ xem báo cáo',
  vault_admin: 'Quản trị két',
};

/* ── Thanh chọn kỳ, dùng chung nhiều màn ───────────────────────────────── */

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
    phai.length ? el('div', { class: 'bo-loc' }, ...phai) : null,
  );
}

function bang(cot, dong, chan) {
  if (!dong.length) return el('div', { class: 'the' }, el('div', { class: 'trong' }, 'Không có dòng nào khớp.'));
  return el('div', { class: 'the' }, el('div', { class: 'cuon' },
    el('table', {},
      el('thead', {}, el('tr', {}, ...cot.map((c) =>
        el('th', { class: c.tien ? 'tien' : null }, c.ten)))),
      el('tbody', {}, ...dong),
      chan ? el('tfoot', {}, chan) : null,
    ),
  ));
}

/* ── Màn: Tổng quan ────────────────────────────────────────────────────── */

const VE = {};

VE['tong-quan'] = async (than) => {
  const d = await goi(`/tong-quan${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const lech = Number(d.lech || 0);
  const canBang = Math.abs(lech) < 0.005;

  than.replaceChildren(
    dauTrang('Tổng quan', 'Bất biến quan trọng nhất của một bộ sổ: tổng Nợ phải bằng tổng Có.',
      chonKy(() => ve())),

    el('div', { class: `bao ${canBang ? 'duong' : 'am'}` },
      canBang
        ? `Sổ cân. Tổng Nợ bằng tổng Có, chênh lệch 0 đồng${S.ky ? ` ở kỳ ${S.ky}` : ''}.`
        : `Sổ lệch ${tien(Math.abs(lech))} đồng. Xem màn Soát lỗi để tìm chứng từ gây lệch.`),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      the_chi_so('Tổng phát sinh Nợ', tien(d.tong_no), 'đồng'),
      the_chi_so('Tổng phát sinh Có', tien(d.tong_co), 'đồng'),
      the_chi_so('Chênh lệch', tien(d.lech), canBang ? 'cân tuyệt đối' : 'cần xử lý',
        canBang ? 'duong' : 'am'),
      the_chi_so('Chứng từ chưa cân', dinhDangSo.format(d.so_chung_tu_lech || 0),
        'không thuộc nhóm cân nào', d.so_chung_tu_lech ? 'am' : 'duong'),
    ),

    el('div', { class: 'luoi luoi-4 cach-duoi' },
      the_chi_so('Chứng từ', dinhDangSo.format(d.so_chung_tu || 0)),
      the_chi_so('Bút toán', dinhDangSo.format(d.so_but_toan || 0)),
      the_chi_so('Tài khoản', dinhDangSo.format(d.so_tai_khoan || 0)),
      the_chi_so('Đối tượng công nợ', dinhDangSo.format(d.so_doi_tac || 0)),
    ),

    el('div', { class: 'the' },
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

function the_chi_so(nhan, giaTri, phu, mau) {
  return el('div', { class: `the chi-so ${mau || ''}` },
    el('div', { class: 'nhan-chi-so' }, nhan),
    el('div', { class: 'gia-tri' }, giaTri),
    phu ? el('div', { class: 'phu' }, phu) : null,
  );
}

/* ── Màn: Nhật ký chung ────────────────────────────────────────────────── */

const NK = { tim: '', tai_khoan: '', tu_ngay: '', den_ngay: '', bo_qua: 0, so_dong: 50 };

VE['nhat-ky'] = async (than) => {
  const p = new URLSearchParams();
  if (S.ky) p.set('ky', S.ky);
  for (const [k, v] of Object.entries(NK)) if (v !== '' && v !== 0) p.set(k, v);
  const d = await goi(`/nhat-ky?${p}`);

  const oTim = el('input', { value: NK.tim, placeholder: 'số chứng từ hoặc diễn giải' });
  const oTk = el('input', { value: NK.tai_khoan, placeholder: 'ví dụ 6421', class: 'ma' });
  const oTu = el('input', { type: 'date', value: NK.tu_ngay });
  const oDen = el('input', { type: 'date', value: NK.den_ngay });
  const apDung = () => {
    NK.tim = oTim.value.trim(); NK.tai_khoan = oTk.value.trim();
    NK.tu_ngay = oTu.value; NK.den_ngay = oDen.value; NK.bo_qua = 0;
    ve();
  };
  for (const o of [oTim, oTk]) o.addEventListener('keydown', (e) => { if (e.key === 'Enter') apDung(); });

  const tuDong = d.tong ? NK.bo_qua + 1 : 0;
  const denDong = Math.min(NK.bo_qua + d.dong.length, d.tong);

  than.replaceChildren(
    dauTrang('Nhật ký chung',
      'Mỗi nghiệp vụ ghi hai dòng, một bên Nợ một bên Có. Bấm vào dòng để mở toàn bộ chứng từ.'),

    el('div', { class: 'the cach-duoi' }, el('div', { class: 'the-than' },
      el('div', { class: 'bo-loc' },
        chonKy(() => { NK.bo_qua = 0; ve(); }),
        el('label', { class: 'o' }, el('span', {}, 'Tìm'), oTim),
        el('label', { class: 'o' }, el('span', {}, 'Tài khoản bắt đầu bằng'), oTk),
        el('label', { class: 'o' }, el('span', {}, 'Từ ngày'), oTu),
        el('label', { class: 'o' }, el('span', {}, 'Đến ngày'), oDen),
        el('button', { class: 'nut chinh', onclick: apDung }, 'Lọc'),
        el('button', {
          class: 'nut',
          onclick: () => { Object.assign(NK, { tim: '', tai_khoan: '', tu_ngay: '', den_ngay: '', bo_qua: 0 }); ve(); },
        }, 'Xóa lọc'),
      ),
    )),

    el('div', { class: 'bao' },
      `${dinhDangSo.format(d.tong)} dòng khớp · tổng Nợ ${tien(d.tong_no)} · tổng Có ${tien(d.tong_co)}`),

    bang(
      [{ ten: 'Ngày' }, { ten: 'Chứng từ' }, { ten: 'Tài khoản' }, { ten: 'Đối ứng' },
       { ten: 'Diễn giải' }, { ten: 'Đối tượng' }, { ten: 'Nợ', tien: true }, { ten: 'Có', tien: true }],
      d.dong.map((l) => el('tr', {
        class: 'bam-duoc',
        onclick: () => moChungTu(l.voucher_id),
      },
        el('td', { class: 'ma' }, ngay(l.posting_date)),
        el('td', { class: 'ma' }, l.voucher_no),
        el('td', { class: 'ma' }, l.account_code,
          l.account_name ? el('div', { class: 'mo ten-tai-khoan' }, l.account_name) : null),
        el('td', { class: 'ma mo' }, l.contra_account_code || '—'),
        el('td', {}, l.description || '—',
          l.is_deductible === false ? el('span', { class: 'the-nhan am cach-trai' }, 'không hợp lý') : null),
        el('td', { class: 'mo' }, l.partner_name || l.partner_code || '—'),
        el('td', { class: 'tien' }, Number(l.debit) ? tien(l.debit) : '—'),
        el('td', { class: 'tien' }, Number(l.credit) ? tien(l.credit) : '—'),
      )),
    ),

    el('div', { class: 'dong-thanh cach-tren' },
      el('button', {
        class: 'nut', disabled: NK.bo_qua === 0 || null,
        onclick: () => { NK.bo_qua = Math.max(0, NK.bo_qua - NK.so_dong); ve(); },
      }, 'Trang trước'),
      el('span', { class: 'mo' }, `${dinhDangSo.format(tuDong)}–${dinhDangSo.format(denDong)} trên ${dinhDangSo.format(d.tong)}`),
      el('button', {
        class: 'nut', disabled: denDong >= d.tong || null,
        onclick: () => { NK.bo_qua += NK.so_dong; ve(); },
      }, 'Trang sau'),
    ),
  );
};

async function moChungTu(id) {
  const v = await goi(`/chung-tu/${encodeURIComponent(id)}`);
  const lech = Number(v.diff || 0);
  const dong = el('div', { class: 'man-che', onclick: (e) => { if (e.target === dong) dong.remove(); } },
    el('div', { class: 'ngan' },
      el('div', { class: 'ngan-dau' },
        el('div', {},
          el('div', { class: 'ngan-ten' }, `Chứng từ ${v.voucher_no}`),
          el('div', { class: 'mo ngan-phu' },
            `${ngay(v.posting_date)} · kỳ ${v.period_code}${v.voucher_type ? ` · loại ${v.voucher_type}` : ''}`),
          v.description ? el('div', { class: 'ngan-dien-giai' }, v.description) : null,
        ),
        el('button', { class: 'nut nho', onclick: () => dong.remove() }, 'Đóng'),
      ),
      el('div', { class: 'the-than' },
        Math.abs(lech) > 0.005
          ? el('div', { class: `bao ${v.balance_group ? 'cho' : 'am'}` },
              v.balance_group
                ? `Chứng từ này không tự cân, nó cân theo cặp trong nhóm ${v.balance_group}. Lệch ${tien(lech)} đồng là bình thường.`
                : `Chứng từ lệch ${tien(lech)} đồng và không thuộc nhóm cân nào. Đây là lỗi cần sửa.`)
          : null,
        el('div', { class: 'cuon' }, el('table', {},
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
      ),
    ),
  );
  document.body.appendChild(dong);
}

/* ── Màn: Cân đối tài khoản ────────────────────────────────────────────── */

VE['can-doi'] = async (than) => {
  const d = await goi(`/can-doi${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const tongNo = d.reduce((s, r) => s + Number(r.ps_debit), 0);
  const tongCo = d.reduce((s, r) => s + Number(r.ps_credit), 0);

  than.replaceChildren(
    dauTrang('Bảng cân đối tài khoản',
      'Dựng lại từ chính sổ cái chứ không nhập từ file báo cáo. Nhờ vậy nó không thể lệch với sổ.',
      chonKy(() => ve())),
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
          class: 'nut nho',
          onclick: () => moSoChiTiet(r.account_code, r.account_name),
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

const TINH_CHAT = { debit: 'Dư Nợ', credit: 'Dư Có', both: 'Lưỡng tính' };

async function moSoChiTiet(code, ten) {
  const d = await goi(`/so-cai/${encodeURIComponent(code)}${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const dong = el('div', { class: 'man-che', onclick: (e) => { if (e.target === dong) dong.remove(); } },
    el('div', { class: 'ngan' },
      el('div', { class: 'ngan-dau' },
        el('div', {},
          el('div', { class: 'ngan-ten' }, `Sổ chi tiết ${code}`),
          el('div', { class: 'mo ngan-phu' },
            `${ten}${S.ky ? ` · kỳ ${S.ky}` : ' · tất cả các kỳ'} · ${dinhDangSo.format(d.length)} dòng`),
        ),
        el('button', { class: 'nut nho', onclick: () => dong.remove() }, 'Đóng'),
      ),
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
  );
  document.body.appendChild(dong);
}

/* ── Màn: Công nợ ──────────────────────────────────────────────────────── */

const CN = { loai: '' };

VE['cong-no'] = async (than) => {
  const p = new URLSearchParams();
  if (S.ky) p.set('ky', S.ky);
  if (CN.loai) p.set('loai', CN.loai);
  const d = await goi(`/cong-no?${p}`);

  than.replaceChildren(
    dauTrang('Công nợ theo đối tượng',
      'Số dương là đối tượng còn nợ mình, số âm là mình còn nợ đối tượng.',
      chonKy(() => ve()),
      el('label', { class: 'o' }, el('span', {}, 'Loại'),
        el('select', { onchange: (e) => { CN.loai = e.target.value; ve(); } },
          el('option', { value: '', selected: CN.loai === '' || null }, 'Tất cả'),
          el('option', { value: 'supplier', selected: CN.loai === 'supplier' || null }, 'Nhà cung cấp'),
          el('option', { value: 'customer', selected: CN.loai === 'customer' || null }, 'Khách hàng'),
          el('option', { value: 'employee', selected: CN.loai === 'employee' || null }, 'Nhân viên'),
          el('option', { value: 'other', selected: CN.loai === 'other' || null }, 'Khác'),
        )),
    ),
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

const LOAI_DOI_TAC = { supplier: 'Nhà cung cấp', customer: 'Khách hàng', employee: 'Nhân viên', other: 'Khác' };

/* ── Màn: Soát lỗi ─────────────────────────────────────────────────────── */

VE['soat-loi'] = async (than) => {
  const d = await goi(`/soat-loi${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const sach = !d.chung_tu_lech.length && !d.ky_lech.length && !d.tai_khoan_la.length;

  than.replaceChildren(
    dauTrang('Soát lỗi',
      'Ba loại lỗi đủ để phát hiện gần hết sai sót nhập liệu: chứng từ không cân, kỳ không cân, và bút toán ghi vào tài khoản không có trong hệ thống.',
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
  const d = await goi(`/chi-phi-khong-hop-ly${S.ky ? `?ky=${encodeURIComponent(S.ky)}` : ''}`);
  const tong = d.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0);

  than.replaceChildren(
    dauTrang('Chi phí không hợp lý',
      'Nguồn trực tiếp cho Bảng kê chi phí không được trừ khi quyết toán thuế thu nhập doanh nghiệp.',
      chonKy(() => ve())),
    el('div', { class: 'bao cho' },
      `${dinhDangSo.format(d.length)} bút toán · tổng ${tien(tong)} đồng sẽ bị loại khi tính thu nhập chịu thuế.`),
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
    ),
  );
};

/* ── Màn: Kỳ kế toán ───────────────────────────────────────────────────── */

const TRANG_THAI_KY = {
  open: { ten: 'Đang mở', mau: '', mo: 'Ghi sổ bình thường.' },
  closed: { ten: 'Đã chốt', mau: 'cho', mo: 'Chỉ ghi bút toán điều chỉnh.' },
  locked: { ten: 'Đã khóa', mau: 'am', mo: 'Không ghi được gì. Database chặn ở tầng trigger.' },
};

VE['ky'] = async (than) => {
  const d = await goi('/ky');
  S.cacKy = d;
  const suaDuoc = ['accountant', 'vault_admin'].includes(S.toi.role);

  than.replaceChildren(
    dauTrang('Kỳ kế toán',
      'Khóa kỳ là lớp bảo vệ chống sửa số liệu quá khứ. Kỳ đã khóa thì chính database từ chối mọi thay đổi, không phụ thuộc vào giao diện.'),
    bang(
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
                ? `Khóa kỳ ${k.code}? Sau khi khóa, không ai ghi thêm được vào kỳ này, kể cả bạn. Muốn sửa phải ghi bút toán điều chỉnh ở kỳ đang mở.`
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
    ),
  );
};

/* ── Màn: Số liệu vận hành ─────────────────────────────────────────────── */

VE['van-hanh'] = async (than) => {
  const d = await goi('/van-hanh');

  than.replaceChildren(
    dauTrang('Số liệu vận hành',
      'Két đọc được số liệu từ các phân hệ khác, nhưng chỉ một chiều và chỉ những cột cần cho kế toán. Tên và số điện thoại khách hàng không đi qua đây.'),

    el('div', { class: 'bao' },
      'Dữ liệu dưới đây đọc qua lớp view finance_src. Phân hệ vận hành không có đường nào đọc ngược lại sổ sách.'),

    el('div', { class: 'luoi luoi-2' },
      el('div', { class: 'the' },
        el('div', { class: 'the-dau' }, 'Lead theo nguồn và dịch vụ'),
        el('div', { class: 'cuon' }, el('table', {},
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
        el('div', { class: 'cuon' }, el('table', {},
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
      el('div', { class: 'cuon' }, d.luong_chi_tiet
        ? el('table', {},
            el('thead', {}, el('tr', {},
              el('th', {}, 'Mã'), el('th', {}, 'Họ tên'), el('th', {}, 'Bộ phận'),
              el('th', { class: 'tien' }, 'Đơn giá giờ'), el('th', { class: 'tien' }, 'Lương thỏa thuận'),
              el('th', {}, 'Trạng thái'))),
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

VE['truy-cap'] = async (than) => {
  const d = await goi('/nhat-ky-truy-cap?so_dong=300');
  than.replaceChildren(
    dauTrang('Nhật ký truy cập',
      'Mọi lần mở sổ đều để lại vết. Bảng này chỉ thêm được: trigger ở database từ chối mọi lệnh sửa và xóa, kể cả từ chính dịch vụ này.'),
    bang(
      [{ ten: 'Thời điểm' }, { ten: 'Người' }, { ten: 'Vai trò' }, { ten: 'Hành động' },
       { ten: 'Đối tượng' }, { ten: 'Số dòng', tien: true }, { ten: 'Địa chỉ máy' }],
      d.map((r) => el('tr', {},
        el('td', { class: 'ma' }, ngayGio(r.at)),
        el('td', {}, r.actor),
        el('td', { class: 'mo' }, r.actor_role || '—'),
        el('td', {}, r.action.startsWith('dang_nhap_that_bai') || r.action === 'tu_choi_quyen'
          ? el('span', { class: 'the-nhan am' }, r.action)
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
  const oVai = el('select', {},
    el('option', { value: 'accountant' }, 'Kế toán · ghi sổ'),
    el('option', { value: 'viewer' }, 'Chỉ xem báo cáo'),
    el('option', { value: 'vault_admin' }, 'Quản trị két'),
  );

  than.replaceChildren(
    dauTrang('Người dùng két',
      'Tài khoản ở đây tách hoàn toàn với tài khoản hệ vận hành. Người có quyền quản trị phòng khám không mặc nhiên vào được sổ sách.'),
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
              bao.className = 'bao am';
              bao.textContent = err.message;
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
          el('td', { class: 'ma' }, u.username, laToi ? el('span', { class: 'the-nhan cach-trai' }, 'bạn') : null),
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
            u.must_change_password ? el('div', { class: 'mo chu-phu' }, 'chưa đổi mật khẩu tạm') : null),
          el('td', { class: 'ma mo' }, u.last_login_at ? ngayGio(u.last_login_at) : 'chưa bao giờ'),
          el('td', { class: 'ma mo' }, u.password_changed_at ? ngayGio(u.password_changed_at) : '—'),
          el('td', {}, laToi ? null : el('button', {
            class: 'nut nho',
            onclick: async () => {
              const bat = !u.is_active;
              if (!confirm(bat ? `Mở khóa ${u.username}?` : `Khóa ${u.username}? Mọi phiên đang mở của họ sẽ bị chấm dứt ngay.`)) return;
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
      'Bạn tự sửa được thông tin liên hệ và mật khẩu của mình. Vai trò thì không: đổi vai trò của chính mình bị chặn ngay tại database, không phải chỉ ẩn nút.'),

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
