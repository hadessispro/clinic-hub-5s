/* Mặt cắt giải phẫu răng — sơ đồ tư vấn cho bệnh nhân.
 *
 * VÌ SAO VẼ BẰNG CÔNG THỨC chứ không dùng mẫu quét: màn này là SƠ ĐỒ, không
 * phải ảnh chụp. Nó cần đúng tầng cấu tạo (men → ngà → tuỷ → xê-măng → dây
 * chằng → xương) và cần bấm được vào từng tầng để tô sáng — thứ không mẫu 3D
 * nào bán sẵn. Vẽ công thức thì dung lượng bằng 0, tô sáng từng lớp là chuyện
 * đổi vật liệu, và số đo lấy theo giải phẫu thật nên tỉ lệ không bịa.
 *
 * Cảnh dựng theo răng hàm lớn HÀM DƯỚI cắt dọc gần–xa: hai chân răng, hai ống
 * tuỷ, và bó mạch – thần kinh trong ống răng dưới chạy ngang qua xương — đúng
 * cấu trúc mà bác sĩ cần chỉ cho khách khi tư vấn nội nha, nha chu hay cấy
 * ghép ("ống thần kinh nằm ngay dưới chóp chân răng này").
 *
 * Mọi lớp là tấm cắt (ExtrudeGeometry) xếp chồng theo trục z, mặt cắt hướng
 * về người xem; xoay được nhưng giới hạn góc để mặt cắt không lật ra sau —
 * lật ra sau thì sơ đồ thành vô nghĩa.
 */

import * as THREE from 'three';

/* Bảng lớp: nguồn sự thật DUY NHẤT cho cả cảnh 3D lẫn dải nút chọn ở màn
 * ngoài. Màn ngoài đọc từ đây, không chép lại — chép lại là hai bản lệch nhau
 * ngay lần sửa đầu tiên. */
export const LOP = {
  men: {
    ten: 'Men răng', tenAnh: 'Enamel', mau: '#f7f3ea',
    mota: 'Lớp ngoài cùng của thân răng, mô cứng nhất cơ thể (~96% khoáng chất) '
      + 'nhưng không có tế bào sống và không tự lành. Không có dây thần kinh nên '
      + 'sâu ở men CHƯA đau — trám ở giai đoạn này là nhẹ nhàng và rẻ nhất.',
  },
  nga: {
    ten: 'Ngà răng', tenAnh: 'Dentin', mau: '#eed9a4',
    mota: 'Chiếm phần lớn khối răng, mềm hơn men và có hàng triệu ống ngà li ti '
      + 'dẫn thẳng về tuỷ. Sâu qua men vào ngà là bắt đầu ê buốt khi ăn nóng, '
      + 'lạnh, ngọt — và từ đây sâu lan NHANH hơn hẳn vì ngà mềm hơn men.',
  },
  tuy: {
    ten: 'Buồng tuỷ & ống tuỷ', tenAnh: 'Pulp cavity', mau: '#cf6b62',
    mota: 'Mô sống ở lõi răng: buồng tuỷ trong thân và ống tuỷ chạy xuống từng '
      + 'chân, chứa mạch máu và thần kinh nuôi răng. Sâu vào tới tuỷ là đau dữ '
      + 'dội, phải điều trị tuỷ (nội nha) — làm sạch ống tuỷ rồi hàn kín lại.',
  },
  mach: {
    ten: 'Mạch máu & thần kinh', tenAnh: 'Vessels and nerves', mau: '#c23b2e',
    mota: 'Bó động mạch (đỏ) – tĩnh mạch (xanh) – thần kinh (vàng) chạy trong '
      + 'ống răng dưới xuyên qua xương hàm, chia nhánh chui qua lỗ chóp ở đỉnh '
      + 'mỗi chân răng để vào tuỷ. Nhổ răng khôn hay cắm implant vùng này phải '
      + 'chụp phim trước, vì ống thần kinh nằm ngay dưới chóp chân răng.',
  },
  xemang: {
    ten: 'Xê-măng', tenAnh: 'Cementum', mau: '#d9c08a',
    mota: 'Lớp mỏng phủ ngoài chân răng — không phải men. Đây là chỗ dây chằng '
      + 'nha chu bám vào; tụt nướu làm lộ lớp này nên chân răng ê buốt và dễ '
      + 'sâu hơn thân răng.',
  },
  daychang: {
    ten: 'Dây chằng nha chu', tenAnh: 'Periodontal ligament', mau: '#c96a5f',
    mota: 'Hàng nghìn sợi treo răng vào xương ổ — răng không dính cứng vào '
      + 'xương mà "treo" đàn hồi, nên nhai có độ nhún và cảm nhận được lực. '
      + 'Viêm nha chu phá huỷ lớp này là lý do răng lung lay rồi rụng dù răng '
      + 'không hề sâu.',
  },
  nuou: {
    ten: 'Nướu (lợi)', tenAnh: 'Gum – Gingiva', mau: '#d97b74',
    mota: 'Mô mềm ôm kín cổ răng, là hàng rào chắn vi khuẩn xuống xương. Chảy '
      + 'máu khi chải răng là dấu hiệu viêm nướu sớm — giai đoạn còn hồi phục '
      + 'hoàn toàn được bằng cạo vôi và chải đúng cách.',
  },
  xuong: {
    ten: 'Xương ổ răng', tenAnh: 'Alveolar bone', mau: '#e0d5b8',
    mota: 'Phần xương hàm giữ chân răng, bên trong xốp như tổ ong. Mất răng lâu '
      + 'ngày hoặc nha chu nặng làm xương tiêu dần — vì vậy nhiều ca cấy ghép '
      + 'phải ghép xương trước khi đặt trụ implant.',
  },
};

/* ── Hình phẳng của từng lớp, đơn vị milimét thật ─────────────────────────
 *
 * Số đo theo răng hàm lớn thứ nhất hàm dưới: thân cao ~7,5 mm rộng ~10,5 mm,
 * chân dài ~13 mm, men dày ~1–1,2 mm ở múi và mỏng dần về cổ răng — đúng
 * khoảng trong sách giải phẫu răng, không phải số cho đẹp. */

const hinhKin = (pts) => {
  const s = new THREE.Shape();
  const v = pts.map(([x, y]) => new THREE.Vector2(x, y));
  s.moveTo(v[0].x, v[0].y);
  s.splineThru(v.slice(1));
  s.closePath();
  return s;
};
const duongKin = (pts) => {
  const p = new THREE.Path();
  const v = pts.map(([x, y]) => new THREE.Vector2(x, y));
  p.moveTo(v[0].x, v[0].y);
  p.splineThru(v.slice(1));
  p.closePath();
  return p;
};

// Đường viền thân răng (mặt ngoài men): hai múi, rãnh giữa, thắt ở cổ.
const VIEN_THAN = [
  [-4.6, -0.3], [-5.4, 2.5], [-5.0, 5.2], [-3.0, 7.4],
  [0, 5.9], [3.0, 7.4], [5.0, 5.2], [5.4, 2.5], [4.6, -0.3],
];
// Đường nối men–ngà: men dày ở múi, mỏng dần về cổ răng.
const VIEN_MEN_TRONG = [
  [-4.25, 0.15], [-4.35, 2.3], [-3.9, 4.4], [-2.6, 6.0],
  [0, 4.7], [2.6, 6.0], [3.9, 4.4], [4.35, 2.3], [4.25, 0.15],
];
// Chân răng: hai chân toè rồi chụm về chóp, vòm chẽ (furcation) ở giữa.
const VIEN_CHAN = [
  [4.6, -0.3], [4.4, -2.0], [3.9, -6], [3.2, -10], [2.3, -12.5],
  [1.7, -9.5], [1.6, -6], [0, -3.6], [-1.6, -6], [-1.7, -9.5],
  [-2.3, -12.5], [-3.2, -10], [-3.9, -6], [-4.4, -2.0], [-4.6, -0.3],
];
// Tuỷ: buồng tuỷ hai sừng dưới hai múi, hai ống tuỷ xuống hai chân.
const VIEN_TUY = [
  [-1.9, 2.6], [-2.2, -0.3], [-1.9, -3.2], [-2.2, -7], [-2.0, -11.0],
  [-1.45, -7], [-1.1, -3.4], [0, -2.4], [1.1, -3.4], [1.45, -7],
  [2.0, -11.0], [2.2, -7], [1.9, -3.2], [2.2, -0.3], [1.9, 2.6], [0, 1.2],
];
// Xê-măng: viền chân răng nở ra ~0,4 mm — hiện thành viền mỏng sau lớp ngà.
const VIEN_XE_MANG = [
  [5.0, 0.2], [4.8, -2], [4.3, -6], [3.6, -10.2], [2.5, -12.9],
  [1.35, -9.6], [1.2, -6], [0, -3.2], [-1.2, -6], [-1.35, -9.6],
  [-2.5, -12.9], [-3.6, -10.2], [-4.3, -6], [-4.8, -2], [-5.0, 0.2],
];
/* Ổ răng trong xương: MỖI CHÂN MỘT LỖ RIÊNG, không gộp hai chân vào một
 * đường bao. Đường bao hai thuỳ phải ngoặt gắt ở chóp và vòm chẽ, spline
 * vặn xoắn tại đó làm tam giác hoá gãy — vách xương giữa hai chân biến mất
 * thành mảng trắng. Hai lỗ đơn giản thì không có chỗ nào để xoắn, và vách
 * chẽ (phần xương giữa hai lỗ) tự nhiên còn nguyên, đúng giải phẫu. */
const O_RANG_PHAI = [
  [1.7, -2.4], [0.85, -6.2], [1.0, -9.8], [2.8, -13.4],
  [4.1, -10.4], [4.9, -6], [5.5, -2.0], [3.5, -1.5],
];
const O_RANG_TRAI = O_RANG_PHAI.map(([x, y]) => [-x, y]);

/* Vân xương xốp vẽ bằng canvas — thay cho ảnh vân phải tải về. Bên trong
 * xương hàm là xương bè lỗ chỗ như tổ ong, một màu phẳng nhìn ra tấm bìa. */
function vanXuong() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const b = c.getContext('2d');
  b.fillStyle = '#e7ddc2'; b.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i += 1) {
    b.fillStyle = i % 4 ? 'rgba(178,164,124,0.42)' : 'rgba(243,238,222,0.8)';
    b.beginPath();
    b.ellipse(Math.random() * 128, Math.random() * 128,
      0.8 + Math.random() * 2.4, 0.6 + Math.random() * 1.8,
      Math.random() * Math.PI, 0, Math.PI * 2);
    b.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.09, 0.09);
  return t;
}

export function taoCanhGiaiPhau(khung, khiChonLop) {
  const canh = new THREE.Scene();
  canh.background = new THREE.Color(0xe8efee);

  const may = new THREE.PerspectiveCamera(34, 1, 1, 400);
  may.position.set(0, -4, 56);
  may.lookAt(0, -6.5, 0);

  const ve = new THREE.WebGLRenderer({ antialias: true });
  ve.setPixelRatio(Math.min(devicePixelRatio, 2));
  khung.appendChild(ve.domElement);

  canh.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.2));
  const den = new THREE.DirectionalLight(0xffffff, 1.2);
  den.position.set(30, 50, 80);
  canh.add(den);
  // Đèn phụ chiếu thẳng từ phía người xem: răng kế bên nằm lùi sau nên hai
  // đèn kia chỉ sượt qua, thiếu đèn này chúng xám xịt như đá.
  const denPhu = new THREE.DirectionalLight(0xfff6e8, 0.45);
  denPhu.position.set(0, -5, 90);
  canh.add(denPhu);

  const nhom = new THREE.Group();
  canh.add(nhom);

  /* Sổ bộ phận: mỗi lớp giữ danh sách khối của nó để tô sáng / làm mờ. */
  const boPhan = {};
  Object.keys(LOP).forEach((k) => { boPhan[k] = []; });

  const tam = (hinh, mauSo, z, day, themVao, tuyChon = {}) => {
    const g = new THREE.ExtrudeGeometry(hinh, {
      depth: day, bevelEnabled: false, curveSegments: 18,
    });
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: mauSo, roughness: 0.62, metalness: 0, transparent: true,
      ...tuyChon,
    }));
    m.position.z = z - day;
    nhom.add(m);
    if (themVao) boPhan[themVao].push(m);
    return m;
  };

  /* Xương: khối lớn, bờ trên lượn theo cổ răng, ổ răng là LỖ trong hình —
   * nên vách xương giữa hai chân răng (vách chẽ) tự nhiên còn nguyên, đúng
   * giải phẫu chứ không phải khoét cả mảng. */
  const xuong = hinhKin([
    [-18, -22], [-18, -3.5], [-12, -2.2], [-7, -3.0], [-5.6, -1.8],
    [0, -2.1], [5.6, -1.8], [7, -3.0], [12, -2.2], [18, -3.5], [18, -22],
  ]);
  xuong.holes.push(duongKin(O_RANG_PHAI));
  xuong.holes.push(duongKin(O_RANG_TRAI));
  tam(xuong, 0xffffff, 0, 10, 'xuong', { map: vanXuong(), roughness: 0.85 });
  /* Tấm lót sẫm sau cùng: nhìn qua khe ổ răng (giữa chân răng và bờ xương)
   * phải thấy CHIỀU SÂU tối, không phải nền trắng của cảnh xuyên qua. */
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(36, 22),
    new THREE.MeshStandardMaterial({ color: 0x9d8f6f, roughness: 0.95, transparent: true }));
  lot.position.set(0, -12, -9.7);
  nhom.add(lot); boPhan.xuong.push(lot);
  // Ống răng dưới: dải sẫm trong xương nơi bó mạch – thần kinh chạy qua.
  const ong = new THREE.Mesh(new THREE.PlaneGeometry(35, 4.8),
    new THREE.MeshStandardMaterial({ color: 0xc2b28b, roughness: 0.9, transparent: true }));
  ong.position.set(0, -18.1, 0.12);
  nhom.add(ong); boPhan.xuong.push(ong);

  // Nướu: dải mềm phủ bờ xương, nhô lên ôm cổ răng (gai nướu).
  tam(hinhKin([
    [-18, -3.8], [-18, -0.6], [-12, 0.1], [-7.5, 0.3], [-5.2, 1.7],
    [-4.4, 1.1], [0, 0.5], [4.4, 1.1], [5.2, 1.7], [7.5, 0.3],
    [12, 0.1], [18, -0.6], [18, -3.8],
  ]), 0xd97b74, 0.05, 8, 'nuou', { roughness: 0.7 });

  /* Dây chằng nha chu: vẽ ĐỨT ĐOẠN dọc quanh chân răng — trong sách giải
   * phẫu lớp này luôn vẽ nét đứt vì nó là các bó sợi rời, không phải màng
   * liền. Một dải liền màu sẽ đọc nhầm thành lớp xê-măng thứ hai. */
  {
    const duong = duongKin(VIEN_XE_MANG);
    const diem = duong.getSpacedPoints(120);
    const hinhVach = new THREE.BoxGeometry(0.48, 0.2, 0.5);
    for (let i = 0; i < diem.length - 1; i += 2) {
      const a = diem[i]; const b = diem[i + 1];
      if (a.y > -0.4) continue;               // chỉ quanh chân, không lên thân
      const v = new THREE.Mesh(hinhVach, new THREE.MeshStandardMaterial({
        color: 0xc96a5f, roughness: 0.7, transparent: true,
      }));
      v.position.set(((a.x + b.x) / 2) * 1.06, (a.y + b.y) / 2 - 0.1, 0.08);
      v.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      nhom.add(v); boPhan.daychang.push(v);
    }
  }

  tam(hinhKin(VIEN_XE_MANG), 0xd9c08a, 0.14, 7, 'xemang');

  // Ngà: trọn hình răng — men và tuỷ nằm đè phía trước để lộ đúng phần ngà.
  tam(hinhKin([...VIEN_THAN, ...VIEN_CHAN.slice(1)]), 0xeed9a4, 0.22, 6.5, 'nga',
    { roughness: 0.55 });

  // Men: vành ngoài thân răng, lỗ ở giữa là đường nối men–ngà.
  const men = hinhKin(VIEN_THAN);
  men.holes.push(duongKin(VIEN_MEN_TRONG));
  tam(men, 0xf7f3ea, 0.30, 6.5, 'men', { roughness: 0.3 });

  tam(hinhKin(VIEN_TUY), 0xcf6b62, 0.38, 5, 'tuy', { roughness: 0.6 });

  /* Bó mạch – thần kinh: ba ống chạy ngang trong ống răng dưới, mỗi chân răng
   * một nhánh chui qua lỗ chóp lên ống tuỷ rồi toả trong buồng tuỷ. */
  const veOng = (pts, mauSo, r) => {
    const cong = new THREE.CatmullRomCurve3(
      pts.map(([x, y]) => new THREE.Vector3(x, y, 0.6)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(cong, 48, r, 8),
      new THREE.MeshStandardMaterial({ color: mauSo, roughness: 0.5, transparent: true }));
    nhom.add(m); boPhan.mach.push(m);
  };
  veOng([[-17.5, -16.9], [-9, -16.6], [0, -17.1], [9, -16.7], [17.5, -17.0]], 0xc23b2e, 0.42);
  veOng([[-17.5, -18.1], [-9, -17.8], [0, -18.3], [9, -17.9], [17.5, -18.2]], 0x3b5bc2, 0.5);
  veOng([[-17.5, -19.4], [-9, -19.1], [0, -19.5], [9, -19.2], [17.5, -19.4]], 0xe0be3c, 0.55);
  /* Nhánh vào từng chân: cả ba ống đi CHUNG dọc trục ống tuỷ, chỉ lệch nhau
   * ~0,2 mm — ống tuỷ chỉ rộng chưa tới 1 mm, toè rộng hơn là ống "mọc"
   * xuyên qua ngà, sai ngay với người có chuyên môn. */
  [-1, 1].forEach((b) => {
    const truc = [[1.9, -16.9], [2.2, -13.8], [1.95, -10.8], [1.75, -7],
      [1.5, -3.6], [1.15, -1.2], [1.5, 1.5]];
    const lech = (d) => truc.map(([x, y]) => [b * (x + d), y]);
    veOng(lech(0), 0xc23b2e, 0.19);
    veOng(lech(-0.2), 0x3b5bc2, 0.15);
    veOng(lech(0.2), 0xe0be3c, 0.13);
    veOng([[b * 0.9, -0.6], [b * 0.4, 0.4], [0, 1.0]], 0xc23b2e, 0.12);
  });

  /* Răng bên cạnh còn nguyên, đặt lùi về sau: nhìn vào là hiểu ngay chiếc
   * giữa đã bị "cắt mở", không phải một chiếc răng dị dạng đứng một mình. */
  const matCat = [[0.001, -8], [2.6, -7.6], [3.4, -4], [4.0, -0.5],
    [4.2, 2.5], [3.9, 4.8], [3.2, 6.2], [1.6, 7.0], [0.001, 7.2]];
  const nguCanh = [];
  [-12.3, 12.3].forEach((x) => {
    const g = new THREE.LatheGeometry(
      matCat.map(([a, b]) => new THREE.Vector2(a, b)), 20);
    g.scale(1, 1, 0.95);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xf5f0e6, roughness: 0.35, transparent: true,
    }));
    m.position.set(x, 0.2, -5);
    nhom.add(m); nguCanh.push(m);
  });

  /* ── Điểm bấm (+) neo vào toạ độ 3D, chiếu ra màn hình mỗi khung hình ── */
  const NEO = {
    men: [2.9, 7.0, 1], nga: [3.6, 3.4, 1], tuy: [0, 0.9, 1.2],
    mach: [6.5, -17.2, 1.2], xemang: [-3.75, -8.6, 1],
    daychang: [-4.9, -4.8, 1], nuou: [-6.6, 0.9, 1], xuong: [11, -11, 1],
  };
  const nutDiem = {};
  Object.entries(NEO).forEach(([k, [x, y, z]]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sbn-gp-diem';
    b.textContent = '+';
    b.title = `${LOP[k].ten} (${LOP[k].tenAnh})`;
    b.addEventListener('click', () => chonLop(lopChon === k ? '' : k, true));
    khung.appendChild(b);
    nutDiem[k] = { nut: b, vt: new THREE.Vector3(x, y, z) };
  });

  let lopChon = '';
  function chonLop(ma, baoRaNgoai) {
    lopChon = ma || '';
    Object.entries(boPhan).forEach(([k, ds]) => {
      const sang = !lopChon || k === lopChon;
      ds.forEach((m) => {
        m.material.opacity = sang ? 1 : 0.1;
        m.material.emissive = new THREE.Color(lopChon && sang ? 0x2a1a12 : 0x000000);
      });
    });
    nguCanh.forEach((m) => { m.material.opacity = lopChon ? 0.1 : 1; });
    Object.entries(nutDiem).forEach(([k, d]) =>
      d.nut.classList.toggle('is-chon', k === lopChon));
    if (baoRaNgoai && khiChonLop) khiChonLop(lopChon);
  }

  /* Xoay bằng kéo chuột, giới hạn góc để mặt cắt luôn hướng về người xem. */
  let dangKeo = false; let tX = 0; let tY = 0;
  let quanhY = 0; let quanhX = 0;
  const dat = () => {
    quanhY = Math.max(-0.55, Math.min(0.55, quanhY));
    quanhX = Math.max(-0.32, Math.min(0.28, quanhX));
    nhom.rotation.set(quanhX, quanhY, 0);
  };
  const batDau = (e) => {
    dangKeo = true;
    tX = (e.touches ? e.touches[0] : e).clientX;
    tY = (e.touches ? e.touches[0] : e).clientY;
  };
  const keo = (e) => {
    if (!dangKeo) return;
    const x = (e.touches ? e.touches[0] : e).clientX;
    const y = (e.touches ? e.touches[0] : e).clientY;
    quanhY += (x - tX) * 0.006; quanhX += (y - tY) * 0.006;
    tX = x; tY = y; dat();
    if (e.cancelable) e.preventDefault();
  };
  const thoi = () => { dangKeo = false; };
  ve.domElement.addEventListener('mousedown', batDau);
  window.addEventListener('mousemove', keo);
  window.addEventListener('mouseup', thoi);
  ve.domElement.addEventListener('touchstart', batDau, { passive: true });
  ve.domElement.addEventListener('touchmove', keo, { passive: false });
  ve.domElement.addEventListener('touchend', thoi);

  const doLai = () => {
    const r = khung.clientWidth || 600;
    const c = khung.clientHeight || 420;
    ve.setSize(r, c, false);
    may.aspect = r / c;
    may.updateProjectionMatrix();
  };
  doLai();
  const theoDoi = new ResizeObserver(doLai);
  theoDoi.observe(khung);

  const chieu = new THREE.Vector3();
  let chay = true;
  const quay = () => {
    if (!chay) return;
    ve.render(canh, may);
    // Neo điểm bấm theo cảnh: xoay cảnh thì nút (+) đi theo đúng bộ phận.
    const r = ve.domElement.getBoundingClientRect();
    Object.values(nutDiem).forEach((d) => {
      chieu.copy(d.vt).applyMatrix4(nhom.matrixWorld).project(may);
      d.nut.style.left = `${(chieu.x * 0.5 + 0.5) * r.width}px`;
      d.nut.style.top = `${(-chieu.y * 0.5 + 0.5) * r.height}px`;
    });
    requestAnimationFrame(quay);
  };
  quay();

  return {
    chonLop: (ma) => chonLop(ma, false),
    huy() {
      chay = false;
      theoDoi.disconnect();
      window.removeEventListener('mousemove', keo);
      window.removeEventListener('mouseup', thoi);
      Object.values(nutDiem).forEach((d) => d.nut.remove());
      nhom.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      ve.dispose();
      ve.domElement.remove();
    },
  };
}
