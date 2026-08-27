'use strict';
/*
 * Biểu đồ SVG tự dựng cho Finance Vault.
 *
 * Không dùng Chart.js, D3 hay bất cứ thư viện nào. Hai lý do, lý do thứ hai
 * mới là lý do thật:
 *
 *   1. Content-Security-Policy của trang này là script-src 'self'. Thư viện
 *      từ CDN không chạy được.
 *   2. Kể cả tự host thì mỗi thư viện là vài chục nghìn dòng mã của người lạ
 *      chạy trên cùng trang với sổ kế toán, đọc được mọi con số trên màn hình.
 *      Với vài loại biểu đồ, cái giá đó không đáng.
 *
 * Mọi biểu đồ lấy màu từ biến CSS nên tự đổi theo chế độ sáng tối, và dùng
 * viewBox nên tự co giãn theo khung mà không cần nghe sự kiện resize.
 */

const NS = 'http://www.w3.org/2000/svg';

function n(tag, attrs = {}, ...con) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    e.setAttribute(k, String(v));
  }
  for (const c of con.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

/** Tooltip gốc của trình duyệt: không đẹp bằng tooltip tự vẽ, nhưng đọc được
 *  bằng trình đọc màn hình và không bao giờ bị kẹt lại trên màn hình. */
function chuGiai(text) {
  return n('title', {}, text);
}

const dsSo = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** Rút gọn số tiền cho nhãn trục: 14.409.774.959 thành 14,4 tỷ. */
function gonTien(v) {
  const x = Number(v) || 0;
  const d = Math.abs(x);
  if (d >= 1e9) return `${(x / 1e9).toFixed(d >= 1e10 ? 0 : 1).replace('.', ',')} tỷ`;
  if (d >= 1e6) return `${(x / 1e6).toFixed(d >= 1e7 ? 0 : 1).replace('.', ',')} tr`;
  if (d >= 1e3) return `${Math.round(x / 1e3)}k`;
  return dsSo.format(Math.round(x));
}

/** Chọn bước chia trục sao cho nhãn là số tròn: 1, 2, 2.5 hoặc 5 nhân lũy thừa 10. */
function buocDep(max, soVach) {
  if (!(max > 0)) return 1;
  const tho = max / soVach;
  const bac = 10 ** Math.floor(Math.log10(tho));
  for (const b of [1, 2, 2.5, 5, 10]) {
    if (bac * b >= tho) return bac * b;
  }
  return bac * 10;
}

const MAU = ['var(--xanh)', 'var(--vang-sang)', 'var(--duong)', 'var(--am)',
             'var(--xanh-sang)', 'var(--vang)', '#7b61c9', '#0f8fa3',
             '#c96f2b', '#5a7ea8'];

function khungTrong(loi) {
  const d = document.createElement('div');
  d.className = 'bd-trong';
  d.textContent = loi || 'Chưa có số liệu cho khoảng thời gian này.';
  return d;
}

/* ── Cột nhóm ──────────────────────────────────────────────────────────────
   Dùng khi cần so hai ba đại lượng cùng đơn vị qua các kỳ: Nợ với Có, doanh
   thu với chi phí. Mắt so chiều cao cột cạnh nhau chính xác hơn nhiều so với
   so hai đường chồng lên nhau. */

function cotNhom({ nhan, chuoi, cao = 230, tienTe = true }) {
  if (!nhan.length || !chuoi.length) return khungTrong();

  const W = 760, H = cao;
  const le = { tren: 14, phai: 10, duoi: 26, trai: 58 };
  const w = W - le.trai - le.phai;
  const h = H - le.tren - le.duoi;

  const moiGiaTri = chuoi.flatMap((s) => s.giaTri.map((v) => Number(v) || 0));
  const dinh = Math.max(...moiGiaTri, 0);
  const day = Math.min(...moiGiaTri, 0);
  const buoc = buocDep(Math.max(dinh, -day) || 1, 4);
  const tren = Math.ceil((dinh || 1) / buoc) * buoc;
  const duoi = day < 0 ? Math.floor(day / buoc) * buoc : 0;
  const khoang = (tren - duoi) || 1;
  const y = (v) => le.tren + h - ((Number(v) || 0) - duoi) / khoang * h;

  const g = [];

  // Lưới ngang và nhãn trục dọc
  for (let v = duoi; v <= tren + 1e-9; v += buoc) {
    g.push(n('line', { class: 'luoi-ngang', x1: le.trai, x2: le.trai + w, y1: y(v), y2: y(v) }));
    g.push(n('text', {
      class: 'nhan-truc', x: le.trai - 7, y: y(v) + 3.5, 'text-anchor': 'end',
    }, tienTe ? gonTien(v) : dsSo.format(v)));
  }

  const buocX = w / nhan.length;
  const soChuoi = chuoi.length;
  const rongNhom = Math.min(buocX * 0.68, 54);
  const rongCot = rongNhom / soChuoi;

  nhan.forEach((ten, i) => {
    const x0 = le.trai + buocX * i + (buocX - rongNhom) / 2;
    chuoi.forEach((s, j) => {
      const v = Number(s.giaTri[i]) || 0;
      const yv = y(v);
      const y0 = y(0);
      const cao2 = Math.max(Math.abs(yv - y0), v === 0 ? 0 : 1.5);
      g.push(n('rect', {
        class: 'cot',
        x: x0 + rongCot * j, y: Math.min(yv, y0),
        width: Math.max(rongCot - 1.5, 1), height: cao2,
        rx: Math.min(2.5, rongCot / 3), fill: s.mau || MAU[j % MAU.length],
      }, chuGiai(`${ten} · ${s.ten}: ${tienTe ? dsSo.format(Math.round(v)) : dsSo.format(v)}`)));
    });
    g.push(n('text', {
      class: 'nhan-truc', x: le.trai + buocX * i + buocX / 2,
      y: H - 8, 'text-anchor': 'middle',
    }, ten));
  });

  g.push(n('line', { class: 'truc', x1: le.trai, x2: le.trai + w, y1: y(0), y2: y(0) }));

  const svg = n('svg', {
    class: 'bd', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Biểu đồ cột: ${chuoi.map((s) => s.ten).join(', ')}`,
    preserveAspectRatio: 'xMidYMid meet',
  }, g);

  const hop = document.createElement('div');
  hop.className = 'bd-hop';
  hop.appendChild(svg);
  hop.appendChild(chuThich(chuoi));
  return hop;
}

function chuThich(chuoi) {
  const d = document.createElement('div');
  d.className = 'chu-thich';
  chuoi.forEach((s, j) => {
    const sp = document.createElement('span');
    const i = document.createElement('i');
    i.style.setProperty('background', s.mau || MAU[j % MAU.length]);
    sp.appendChild(i);
    sp.appendChild(document.createTextNode(s.ten));
    d.appendChild(sp);
  });
  return d;
}

/* ── Đường có vùng tô ──────────────────────────────────────────────────────
   Dùng cho số dư lũy kế: thứ mà người xem quan tâm là xu hướng đi lên hay đi
   xuống, không phải giá trị từng điểm. */

function duongLuyKe({ nhan, giaTri, cao = 210, ten = 'Lũy kế' }) {
  if (!nhan.length) return khungTrong();

  const W = 760, H = cao;
  const le = { tren: 14, phai: 10, duoi: 26, trai: 58 };
  const w = W - le.trai - le.phai;
  const h = H - le.tren - le.duoi;

  const vals = giaTri.map((v) => Number(v) || 0);
  const dinh = Math.max(...vals, 0);
  const day = Math.min(...vals, 0);
  const buoc = buocDep(Math.max(Math.abs(dinh), Math.abs(day)) || 1, 4);
  const tren = Math.ceil((dinh || 1) / buoc) * buoc;
  const duoi = day < 0 ? Math.floor(day / buoc) * buoc : 0;
  const khoang = (tren - duoi) || 1;
  const y = (v) => le.tren + h - ((Number(v) || 0) - duoi) / khoang * h;
  const x = (i) => le.trai + (vals.length === 1 ? w / 2 : (w * i) / (vals.length - 1));

  const g = [];
  for (let v = duoi; v <= tren + 1e-9; v += buoc) {
    g.push(n('line', { class: 'luoi-ngang', x1: le.trai, x2: le.trai + w, y1: y(v), y2: y(v) }));
    g.push(n('text', { class: 'nhan-truc', x: le.trai - 7, y: y(v) + 3.5, 'text-anchor': 'end' },
      gonTien(v)));
  }

  const diem = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  g.push(n('polygon', {
    points: `${le.trai},${y(0)} ${diem} ${x(vals.length - 1)},${y(0)}`,
    fill: 'var(--xanh)', opacity: '.12',
  }));
  g.push(n('polyline', {
    points: diem, fill: 'none', stroke: 'var(--xanh)',
    'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  vals.forEach((v, i) => {
    g.push(n('circle', {
      cx: x(i), cy: y(v), r: 3.4, fill: 'var(--the)',
      stroke: 'var(--xanh)', 'stroke-width': '2',
    }, chuGiai(`${nhan[i]} · ${ten}: ${dsSo.format(Math.round(v))}`)));
    g.push(n('text', {
      class: 'nhan-truc', x: x(i), y: H - 8, 'text-anchor': 'middle',
    }, nhan[i]));
  });

  g.push(n('line', { class: 'truc', x1: le.trai, x2: le.trai + w, y1: y(0), y2: y(0) }));

  const hop = document.createElement('div');
  hop.className = 'bd-hop';
  hop.appendChild(n('svg', {
    class: 'bd', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Biểu đồ đường: ${ten}`, preserveAspectRatio: 'xMidYMid meet',
  }, g));
  return hop;
}

/* ── Vành khuyên ───────────────────────────────────────────────────────────
   Chỉ dùng khi tổng có ý nghĩa và số phần ít. Cơ cấu chi phí đúng cả hai điều
   kiện đó. Phần nhỏ hơn 2% gom vào "Khác" vì lát bánh mỏng hơn thế thì không
   đọc được. */

function vanhKhuyen({ muc, cao = 230 }) {
  const sach = muc.map((m) => ({ ten: m.ten, giaTri: Math.abs(Number(m.giaTri) || 0) }))
                  .filter((m) => m.giaTri > 0)
                  .sort((a, b) => b.giaTri - a.giaTri);
  if (!sach.length) return khungTrong();

  const tong = sach.reduce((s, m) => s + m.giaTri, 0);
  const lon = sach.filter((m) => m.giaTri / tong >= 0.02);
  const nho = sach.filter((m) => m.giaTri / tong < 0.02);
  const phan = nho.length
    ? [...lon, { ten: `Khác (${nho.length} mục)`, giaTri: nho.reduce((s, m) => s + m.giaTri, 0) }]
    : lon;

  const H = cao, W = cao;
  const cx = W / 2, cy = H / 2, R = cao / 2 - 6, r = R * 0.6;
  let goc = -Math.PI / 2;
  const g = [];

  phan.forEach((m, i) => {
    const phanTram = m.giaTri / tong;
    const gocCuoi = goc + phanTram * Math.PI * 2;
    const lon2 = phanTram > 0.5 ? 1 : 0;
    const p = [
      `M ${cx + R * Math.cos(goc)} ${cy + R * Math.sin(goc)}`,
      `A ${R} ${R} 0 ${lon2} 1 ${cx + R * Math.cos(gocCuoi)} ${cy + R * Math.sin(gocCuoi)}`,
      `L ${cx + r * Math.cos(gocCuoi)} ${cy + r * Math.sin(gocCuoi)}`,
      `A ${r} ${r} 0 ${lon2} 0 ${cx + r * Math.cos(goc)} ${cy + r * Math.sin(goc)}`,
      'Z',
    ].join(' ');
    g.push(n('path', {
      d: p, fill: MAU[i % MAU.length], stroke: 'var(--the)', 'stroke-width': '1.5',
    }, chuGiai(`${m.ten}: ${dsSo.format(Math.round(m.giaTri))} · ${(phanTram * 100).toFixed(1)}%`)));
    goc = gocCuoi;
  });

  g.push(n('text', {
    x: cx, y: cy - 4, 'text-anchor': 'middle',
    'font-size': '15', 'font-weight': '650', fill: 'var(--muc)',
    'font-family': 'var(--so)',
  }, gonTien(tong)));
  g.push(n('text', {
    x: cx, y: cy + 13, 'text-anchor': 'middle', 'font-size': '10.5', fill: 'var(--muc-mo)',
  }, 'tổng cộng'));

  const hop = document.createElement('div');
  hop.className = 'bd-hop';
  const hang = document.createElement('div');
  hang.className = 'vk-hang';
  hang.appendChild(n('svg', {
    class: 'bd vk-vong', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Biểu đồ vành khuyên cơ cấu', preserveAspectRatio: 'xMidYMid meet',
  }, g));

  const ds = document.createElement('div');
  ds.className = 'vk-danh-sach';
  phan.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'vk-dong';
    const sw = document.createElement('i');
    sw.style.setProperty('background', MAU[i % MAU.length]);
    const ten = document.createElement('span');
    ten.className = 'vk-ten';
    ten.textContent = m.ten;
    const so = document.createElement('span');
    so.className = 'vk-so';
    so.textContent = `${dsSo.format(Math.round(m.giaTri))}  ·  ${(m.giaTri / tong * 100).toFixed(1)}%`;
    d.append(sw, ten, so);
    ds.appendChild(d);
  });
  hang.appendChild(ds);
  hop.appendChild(hang);
  return hop;
}

/* ── Thanh ngang ───────────────────────────────────────────────────────────
   Tên tài khoản dài, cột dọc không đủ chỗ viết. Thanh ngang thì có. */

function thanhNgang({ muc, cao = 20 }) {
  const sach = muc.filter((m) => Math.abs(Number(m.giaTri) || 0) > 0);
  if (!sach.length) return khungTrong();
  const dinh = Math.max(...sach.map((m) => Math.abs(Number(m.giaTri))));

  const hop = document.createElement('div');
  hop.className = 'tn-hop';
  sach.forEach((m, i) => {
    const d = document.createElement('div');
    d.className = 'tn-dong';
    d.title = `${m.ten}: ${dsSo.format(Math.round(Number(m.giaTri)))}`;

    const ten = document.createElement('div');
    ten.className = 'tn-ten';
    ten.textContent = m.ten;

    const rai = document.createElement('div');
    rai.className = 'tn-rai';
    const thanh = document.createElement('i');
    thanh.className = 'tn-thanh';
    thanh.style.setProperty('width', `${Math.max(Math.abs(Number(m.giaTri)) / dinh * 100, 0.6)}%`);
    thanh.style.setProperty('background', m.mau || MAU[i % MAU.length]);
    rai.appendChild(thanh);

    const so = document.createElement('div');
    so.className = 'tn-so';
    so.textContent = gonTien(m.giaTri);

    d.append(ten, rai, so);
    hop.appendChild(d);
  });
  return hop;
}

/* ── Đường tí hon trong thẻ chỉ số ─────────────────────────────────────── */

function tiHon(giaTri, mau = 'var(--xanh)') {
  const vals = (giaTri || []).map((v) => Number(v) || 0);
  if (vals.length < 2) return null;
  const W = 120, H = 30;
  const dinh = Math.max(...vals), day = Math.min(...vals);
  const khoang = (dinh - day) || 1;
  const x = (i) => (W * i) / (vals.length - 1);
  const y = (v) => H - 3 - ((v - day) / khoang) * (H - 6);
  const diem = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return n('svg', {
    class: 'ti-hon', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true',
  },
    n('polygon', { points: `0,${H} ${diem} ${W},${H}`, fill: mau, opacity: '.13' }),
    n('polyline', { points: diem, fill: 'none', stroke: mau, 'stroke-width': '1.8', 'stroke-linejoin': 'round' }),
  );
}

window.BD = { cotNhom, duongLuyKe, vanhKhuyen, thanhNgang, tiHon, gonTien, MAU };
