/* Cung hàm 3D cho bệnh nhân xem.
 *
 * VÌ SAO CÓ MÀN NÀY, và vì sao nó KHÔNG thay sơ đồ 2D:
 *
 * Sơ đồ 2D là nơi bác sĩ GHI. Nó chính xác tới từng mặt răng, in ra được, ký
 * số được, và bấm đúng ô mặt răng bằng chuột là chuyện dễ. Cảnh 3D không làm
 * được cả ba việc đó — bấm trúng một mặt răng trong không gian ba chiều là
 * thao tác khó, in ra thì mất góc nhìn, và ký lên một cảnh dựng runtime thì
 * vô nghĩa.
 *
 * Cảnh 3D là nơi bệnh nhân NHÌN. Người ngồi trên ghế không đọc được ký hiệu
 * FDI, nhưng xoay cung hàm và thấy cái răng đỏ nằm ở đâu thì hiểu ngay.
 *
 * Nên cả hai đọc từ ĐÚNG một nguồn: sơ đồ răng trong hồ sơ. Không bên nào giữ
 * bản sao, không bên nào tự suy ra trạng thái.
 *
 * Hình răng dựng bằng công thức, không phải mẫu quét thật. Nó đúng về loại
 * răng, số múi và vị trí trên cung hàm; nó không đúng về giải phẫu chi tiết
 * của một người cụ thể. Dùng để chỉ chỗ và giải thích, không dùng để đo đạc.
 */

import * as THREE from 'three';

/* Màu theo tình trạng, cùng ý nghĩa với sơ đồ 2D nhưng đậm hơn: trên nền tối
 * và có đổ bóng, màu nhạt của sơ đồ 2D sẽ chìm hết. */
const MAU = {
  lanh: 0xf2ede4,
  sau:  0xc75b48,
  tram: 0x5b9bd0,
  phuc: 0xa88fd8,
  noi:  0xd7a34a,
  mat:  0x2a3a37,
};

/* Kích thước và hình dạng theo loại răng, đơn vị milimét thật.
 *
 * Số đo lấy theo khoảng trung bình của răng vĩnh viễn người trưởng thành. Dùng
 * số thật thay vì số cho đẹp: răng hàm lớn rộng gấp đôi răng cửa, răng nanh có
 * chân dài nhất hàm — bệnh nhân nhận ra ngay khi nhìn, và sai tỉ lệ thì cảnh
 * trông như đồ chơi.
 *
 * `chan` là SỐ chân răng, không phải chiều dài. Đây là chi tiết dễ bỏ qua nhất
 * mà lại dễ thấy nhất: răng hàm lớn hàm trên có ba chân, hàm dưới hai chân,
 * còn răng cửa một chân. Vẽ răng hàm một chân là sai ngay ở mức người không
 * học nha khoa cũng thấy lạ.
 */
const CO = {
  cua_giua: { rong: 8.5, day: 7.0, cao: 10.5, dai_chan: 13, chan: 1, mui: 0, dang: 'cua' },
  cua_ben:  { rong: 6.5, day: 6.0, cao: 9.0,  dai_chan: 13, chan: 1, mui: 0, dang: 'cua' },
  nanh:     { rong: 7.5, day: 8.0, cao: 11.0, dai_chan: 17, chan: 1, mui: 1, dang: 'nanh' },
  ham_nho:  { rong: 7.0, day: 9.0, cao: 8.5,  dai_chan: 14, chan: 1, mui: 2, dang: 'ham' },
  ham_lon:  { rong: 10.5, day: 11.0, cao: 7.5, dai_chan: 13, chan: 3, mui: 4, dang: 'ham' },
  khon:     { rong: 9.0, day: 10.0, cao: 6.5, dai_chan: 11, chan: 2, mui: 3, dang: 'ham' },
};

/* Thân răng dựng theo mặt cắt xoay quanh trục, không phải khối cầu bóp méo.
 *
 * Mặt cắt là thứ quyết định răng trông ra răng: cổ răng thắt lại, thân phình
 * ra ở đường vòng lớn nhất rồi thu vào phía mặt nhai. Khối cầu bóp méo không
 * có ba đoạn đó nên nhìn ra hình viên thuốc.
 */
function matCatThan(co) {
  const r = co.rong / 2;
  const h = co.cao;
  if (co.dang === 'cua') {
    // Răng cửa: mỏng theo chiều ngoài-trong, rìa cắn gần như phẳng.
    return [
      [r * 0.62, -h * 0.50],  // cổ răng, thắt lại
      [r * 0.92, -h * 0.24],  // đường vòng lớn nhất
      [r * 1.00, 0.0],
      [r * 0.96, h * 0.26],
      [r * 0.80, h * 0.46],   // rìa cắn còn bề dày
      [r * 0.30, h * 0.50],
      [0.001, h * 0.50],
    ];
  }
  if (co.dang === 'nanh') {
    return [
      [r * 0.60, -h * 0.50],
      [r * 0.94, -h * 0.20],
      [r * 1.00, h * 0.02],
      [r * 0.84, h * 0.28],
      [r * 0.42, h * 0.44],
      [0.001, h * 0.52],      // nhọn dần về đỉnh múi
    ];
  }
  // Răng hàm: thân bè, mặt nhai rộng và gần phẳng để đặt múi lên.
  return [
    [r * 0.66, -h * 0.50],
    [r * 0.95, -h * 0.18],
    [r * 1.00, h * 0.02],
    [r * 0.97, h * 0.24],
    [r * 0.86, h * 0.40],
    [r * 0.40, h * 0.46],
    [0.001, h * 0.46],
  ];
}

function thanRang(co, hamTren) {
  const cac = [];
  const r = co.rong / 2;

  const diem = matCatThan(co).map(([x, y]) => new THREE.Vector2(x, y));
  const than = new THREE.LatheGeometry(diem, 24);
  // Bóp theo chiều ngoài-trong: răng thật không tròn xoay, răng cửa dẹt rõ.
  than.scale(1, 1, co.day / co.rong);
  cac.push(than);

  /* Múi nhai.
   *
   * Đặt thành cụm quanh một rãnh giữa. Khoảng hở giữa các múi CHÍNH LÀ rãnh —
   * không cắt hình được nếu không kéo thêm thư viện phép toán khối, mà khoảng
   * hở đọc ra đúng cái rãnh đó khi nhìn từ mặt nhai.
   */
  if (co.mui === 1) {
    const m = new THREE.ConeGeometry(r * 0.34, co.cao * 0.34, 14);
    m.translate(0, co.cao * 0.46, 0);
    cac.push(m);
  } else if (co.mui === 2) {
    // Răng hàm nhỏ: một múi ngoài lớn, một múi trong nhỏ hơn, rãnh chạy giữa.
    [[0, 0.30, 0.30], [0, -0.30, 0.25]].forEach(([dx, dz, k]) => {
      const m = new THREE.SphereGeometry(r * k, 14, 10);
      m.scale(1, 0.9, 1);
      m.translate(dx * r, co.cao * 0.40, dz * co.day);
      cac.push(m);
    });
  } else if (co.mui >= 3) {
    // Răng hàm lớn: bốn múi ở bốn góc, rãnh hình chữ thập ở giữa.
    const goc = co.mui === 4
      ? [[-0.30, -0.28], [0.30, -0.28], [-0.30, 0.28], [0.30, 0.28]]
      : [[-0.30, -0.26], [0.30, -0.26], [0, 0.30]];
    goc.forEach(([dx, dz]) => {
      const m = new THREE.SphereGeometry(r * 0.30, 14, 10);
      m.scale(1, 0.78, 1);
      m.translate(dx * co.rong, co.cao * 0.36, dz * co.day);
      cac.push(m);
    });
  }

  /* Chân răng.
   *
   * Số chân là chi tiết dễ thấy nhất khi nhìn nghiêng: răng hàm lớn hàm trên
   * ba chân, hàm dưới hai chân. Chân toè ra rồi chụm lại ở chóp, không phải
   * một ống thẳng.
   */
  const dai = co.dai_chan;
  const dinhChan = -(co.cao * 0.5);
  const veChan = (dx, dz, day) => {
    const g = new THREE.CylinderGeometry(r * day, r * day * 0.30, dai, 12);
    g.translate(dx, dinhChan - dai / 2 + co.cao * 0.06, dz);
    // Chân xoè: nghiêng nhẹ ra ngoài rồi chụm về chóp.
    if (dx || dz) {
      const m = new THREE.Matrix4().makeRotationZ(dx ? -Math.sign(dx) * 0.16 : 0);
      if (dz) m.multiply(new THREE.Matrix4().makeRotationX(Math.sign(dz) * 0.16));
      g.applyMatrix4(m);
    }
    return g;
  };

  if (co.chan === 1) cac.push(veChan(0, 0, 0.34));
  else if (co.chan === 2) {
    cac.push(veChan(0, -co.day * 0.20, 0.26));
    cac.push(veChan(0, co.day * 0.20, 0.26));
  } else {
    // Ba chân: hai phía ngoài, một phía trong to hơn.
    cac.push(veChan(-co.rong * 0.22, -co.day * 0.16, 0.22));
    cac.push(veChan(co.rong * 0.22, -co.day * 0.16, 0.22));
    cac.push(veChan(0, co.day * 0.24, 0.27));
  }

  const gop = gopHinh(cac);
  // Hàm dưới lật ngược: mặt nhai của hai hàm phải hướng vào nhau.
  if (!hamTren) gop.rotateX(Math.PI);
  return gop;
}

/** Gộp nhiều hình thành một, để mỗi răng chỉ là một khối bấm được. */
function gopHinh(ds) {
  const viTri = []; const phap = []; const chiSo = [];
  let lech = 0;
  ds.forEach((g) => {
    const nonIdx = g.index ? g.index.array : null;
    const v = g.attributes.position.array;
    const n = g.attributes.normal.array;
    viTri.push(...v); phap.push(...n);
    const soDinh = v.length / 3;
    if (nonIdx) nonIdx.forEach((i) => chiSo.push(i + lech));
    else for (let i = 0; i < soDinh; i += 1) chiSo.push(i + lech);
    lech += soDinh;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(viTri, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(phap, 3));
  g.setIndex(chiSo);
  return g;
}

/* Vị trí răng trên cung hàm.
 *
 * Cung răng người là một đường cong parabol, không phải nửa vòng tròn: phía
 * trước hẹp và cong gắt, phía sau gần như thẳng. Dùng vòng tròn thì răng hàm
 * bị đẩy vào trong và cảnh trông sai ngay cả với người không học nha khoa.
 */
function viTriTrenCung(chiSo, ben) {
  const t = chiSo / 7;                 // 0 ở răng cửa giữa, 1 ở răng khôn
  // Dấu trừ: theo quy ước lâm sàng, hình được nhìn như khi ĐỐI DIỆN bệnh
  // nhân, nên bên phải của bệnh nhân nằm ở bên trái hình. Sơ đồ 2D ngay cạnh
  // đây cũng vẽ như vậy; để hai hình ngược chiều nhau là bẫy đọc nhầm mặt
  // răng, mà đọc nhầm mặt răng thì khoan nhầm chỗ.
  const x = -ben * (4 + t * 26);
  const z = -(2 + t * t * 34);
  const huong = Math.atan2(x, -z);
  return { x, z, huong };
}

/* Nạp mô hình ngoài: bản quét của bệnh nhân, hoặc bộ mẫu giải phẫu đã mua.
 *
 * Hai loại nguồn, hai mức giá trị khác hẳn nhau:
 *
 *   BẢN QUÉT (STL, PLY) từ máy quét trong miệng — đúng giải phẫu của CHÍNH
 *   người đang ngồi trên ghế. Đây là mức cao nhất, và cũng là thứ không mua
 *   được: nó phải quét ra.
 *
 *   BỘ MẪU GIẢI PHẪU (GLB, glTF, OBJ) — răng đúng chuẩn giải phẫu nhưng ai
 *   cũng giống ai. Dùng để giải thích bệnh lý nói chung, không dùng để chỉ
 *   đúng cái răng của người này.
 *
 * ĐIỀU KIỆN BẮT BUỘC với bộ mẫu: mỗi răng phải là MỘT KHỐI RIÊNG, không phải
 * một khối gộp cả hàm. Khối gộp thì không tô màu được từng răng, không bấm
 * chọn được từng răng — mất luôn lý do có màn này.
 *
 * Hàm dưới tự dò tên khối để gán mã răng FDI. Nhận các kiểu đặt tên thường
 * gặp: "16", "Tooth_16", "tooth16", "T16", "UR6" (upper right 6).
 */

/** Đoán mã răng FDI từ tên khối trong tệp mẫu. Trả null nếu không đoán được. */
function doanMaRang(ten) {
  const t = String(ten || '').trim();

  // Dạng trực tiếp: có hai chữ số 11–48 đứng riêng.
  const fdi = t.match(/(?:^|[^0-9])([1-4][1-8])(?:[^0-9]|$)/);
  if (fdi) return fdi[1];

  // Dạng chữ: UR6 = upper right 6 → phần hàm 1; UL = 2; LL = 3; LR = 4.
  const chu = t.toUpperCase().match(/\b(U|L)\s*(R|L)\s*([1-8])\b/);
  if (chu) {
    const phan = chu[1] === 'U' ? (chu[2] === 'R' ? 1 : 2) : (chu[2] === 'L' ? 3 : 4);
    return `${phan}${chu[3]}`;
  }
  return null;
}

export async function napMoHinh(tepQuet) {
  const ten = (tepQuet.name || '').toLowerCase();
  const duoi = ten.slice(ten.lastIndexOf('.'));
  const nhan = ['.stl', '.ply', '.glb', '.gltf', '.obj'];
  if (!nhan.includes(duoi)) {
    throw new Error(`Chỉ nhận ${nhan.join(', ')}. Tệp .3ds, .max, .blend hay .c4d `
      + 'phải xuất sang GLB trước — Blender mở được cả bốn và xuất GLB miễn phí.');
  }

  const buf = await tepQuet.arrayBuffer();

  /* Một khối lưới trần: bản quét. Không có tên răng, nên nó chỉ để nhìn. */
  if (duoi === '.stl' || duoi === '.ply') {
    const bo = duoi === '.stl'
      ? (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader
      : (await import('three/examples/jsm/loaders/PLYLoader.js')).PLYLoader;
    const hinh = new bo().parse(buf);
    if (!hinh.attributes.normal) hinh.computeVertexNormals();
    return { kieu: 'ban_quet', ...doVaCanGiua(hinh) };
  }

  /* Bộ mẫu: có thể nhiều khối, mỗi khối một răng. */
  let canh;
  if (duoi === '.obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    canh = new OBJLoader().parse(new TextDecoder().decode(buf));
  } else {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const kq = await new Promise((xong, hong) =>
      new GLTFLoader().parse(buf, '', (g) => xong(g), hong));
    canh = kq.scene;
  }

  const khoi = [];
  canh.traverse((o) => { if (o.isMesh) khoi.push(o); });
  if (!khoi.length) throw new Error('Tệp không chứa khối lưới nào.');

  const theoRang = {};
  let khongTen = 0;
  khoi.forEach((o) => {
    const ma = doanMaRang(o.name) || doanMaRang(o.parent?.name);
    if (ma) theoRang[ma] = o;
    else khongTen += 1;
  });

  const soRang = Object.keys(theoRang).length;
  return {
    kieu: soRang >= 8 ? 'bo_mau_tach_rang' : 'bo_mau_gop',
    canh, khoi, theo_rang: theoRang,
    so_khoi: khoi.length,
    so_rang_nhan_ra: soRang,
    so_khoi_khong_ten: khongTen,
    ...doVaCanGiua(gopHinhTuKhoi(khoi)),
  };
}

/** Đưa khối về giữa và tính tỉ lệ hiển thị. */
function doVaCanGiua(hinh) {
  hinh.computeBoundingBox();
  const hop = hinh.boundingBox;
  const giua = hop.getCenter(new THREE.Vector3());
  hinh.translate(-giua.x, -giua.y, -giua.z);
  const co = hop.getSize(new THREE.Vector3());
  const lon = Math.max(co.x, co.y, co.z);
  return {
    hinh,
    so_dinh: hinh.attributes.position.count,
    kich_thuoc_mm: [co.x, co.y, co.z].map((v) => Math.round(v)),
    ty_le_goi_y: lon > 0 ? 62 / lon : 1,
  };
}

function gopHinhTuKhoi(khoi) {
  const g = new THREE.BufferGeometry();
  const v = [];
  khoi.forEach((o) => {
    const a = o.geometry.attributes.position;
    for (let k = 0; k < a.count; k += 1) {
      const p = new THREE.Vector3().fromBufferAttribute(a, k);
      o.localToWorld(p);
      v.push(p.x, p.y, p.z);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

// Giữ tên cũ để chỗ gọi không phải sửa.
export const napBanQuet = (khung, tep) => napMoHinh(tep);

export function taoCanh(khung, soDoRang, khiChonRang, banQuet) {
  const canh = new THREE.Scene();
  canh.background = new THREE.Color(0x101d1b);

  const may = new THREE.PerspectiveCamera(38, 1, 1, 900);
  may.position.set(0, 26, 82);
  // PerspectiveCamera mặc định nhìn theo trục −Z từ chỗ nó đứng, KHÔNG tự
  // hướng về gốc toạ độ. Thiếu dòng này thì camera nhìn hụt qua đầu cung hàm
  // và cảnh ra một khung trống — đúng cái đã xảy ra ở bản đầu.
  may.lookAt(0, 0, -15);

  const ve = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  ve.setPixelRatio(Math.min(devicePixelRatio, 2));
  ve.shadowMap.enabled = true;
  khung.appendChild(ve.domElement);

  canh.add(new THREE.HemisphereLight(0xdfeeeb, 0x1a2b28, 1.15));
  const den = new THREE.DirectionalLight(0xffffff, 1.5);
  den.position.set(40, 90, 60);
  canh.add(den);
  const den2 = new THREE.DirectionalLight(0x9fd6cf, 0.5);
  den2.position.set(-50, 30, -40);
  canh.add(den2);

  const nhom = new THREE.Group();
  canh.add(nhom);

  /* Nướu.
   *
   * Không có nướu thì chân răng lộ hết và cung hàm trông như một dãy cọc cắm
   * xuống — người thường nhìn vào không nhận ra đó là hàm răng. Nướu che chân
   * răng, đúng như trong miệng, và chỉ tốn hai khối.
   *
   * Dựng bằng ống chạy dọc chính đường cong đã dùng để xếp răng, nên nướu ôm
   * đúng cung hàm chứ không phải một vòng tròn áp vào.
   */
  const veNuou = (hamTren) => {
    const diem = [];
    for (let b = -1; b <= 1; b += 2) {
      for (let i = 7; i >= 0; i -= 1) {
        const { x, z } = viTriTrenCung(i, b);
        if (b === -1) diem.push(new THREE.Vector3(x, 0, z));
      }
    }
    for (let i = 0; i <= 7; i += 1) {
      const { x, z } = viTriTrenCung(i, 1);
      diem.push(new THREE.Vector3(x, 0, z));
    }
    const duong = new THREE.CatmullRomCurve3(diem);
    const ong = new THREE.TubeGeometry(duong, 90, 6.5, 14, false);
    const m = new THREE.Mesh(ong, new THREE.MeshStandardMaterial({
      color: 0xc4776f, roughness: 0.82, metalness: 0,
    }));
    m.position.y = hamTren ? 15.5 : -15.5;
    return m;
  };
  /* Chỉ dựng nướu ống cho hình công thức. Mô hình nạp ngoài đã có nướu của
   * chính nó; chồng ống giả lên là che mất phần nướu thật được dựng kỹ hơn
   * nhiều — nhìn vào chỉ còn thấy hai cái vòng trơn. */
  if (!banQuet) {
    nhom.add(veNuou(true));
    nhom.add(veNuou(false));
  }

  const dsRang = [];

  /* Có bản quét thật thì hiện nó, và KHÔNG dựng răng công thức nữa.
   *
   * Hiện cả hai chồng lên nhau thì hai bộ răng lệch nhau vài milimét và bác sĩ
   * không biết đang nhìn cái nào — tệ hơn là chỉ hiện một cái. */
  /* Tự phát hiện mô hình bị lật trái–phải.
   *
   * Quy ước lâm sàng: hình nhìn như khi ĐỐI DIỆN bệnh nhân, nên phần hàm 1 và
   * 4 (bên phải bệnh nhân) phải nằm BÊN TRÁI hình. Sơ đồ 2D ngay cạnh cũng vẽ
   * như vậy.
   *
   * Không thể tin mô hình nào cũng đúng chiều. Xuất glTF từ Blender đổi trục
   * Z-up sang Y-up và lật X, còn mỗi bộ mẫu mua về lại dựng theo một hướng
   * riêng. Nên đo thay vì giả định: so toạ độ của răng 16 và 26, nếu 16 nằm
   * bên phải thì lật cả cảnh.
   *
   * Lật bằng scale âm sẽ đảo chiều mặt, nên vật liệu phải vẽ cả hai mặt —
   * không thì răng thủng lỗ chỗ khi xoay.
   */
  const canhLatNguoc = (() => {
    if (banQuet?.kieu !== 'bo_mau_tach_rang') return false;
    const a = banQuet.theo_rang['16'] || banQuet.theo_rang['46'];
    const b = banQuet.theo_rang['26'] || banQuet.theo_rang['36'];
    if (!a || !b) return false;
    const x = (o) => {
      const h = new THREE.Box3().setFromObject(o);
      return h.getCenter(new THREE.Vector3()).x;
    };
    return x(a) > x(b);
  })();

  if (banQuet?.kieu === 'bo_mau_tach_rang') {
    /* Bộ mẫu đã tách từng răng: tô màu và bấm chọn được y như hình dựng, chỉ
     * khác là hình đúng giải phẫu chuẩn. Đây là lý do điều kiện "mỗi răng một
     * khối" là bắt buộc chứ không phải mong muốn. */
    banQuet.canh.scale.setScalar(banQuet.ty_le_goi_y);
    if (canhLatNguoc) banQuet.canh.scale.x *= -1;
    nhom.add(banQuet.canh);
    Object.entries(banQuet.theo_rang).forEach(([ma, o]) => {
      const r = soDoRang[ma];
      const tt = r?.trang_thai || 'binh_thuong';
      o.material = new THREE.MeshStandardMaterial({
        color: MAU[tt === 'binh_thuong' ? 'lanh'
          : tt === 'sau' || tt === 'chi_dinh_nho' ? 'sau'
          : tt === 'tram' ? 'tram' : tt === 'noi_nha' ? 'noi'
          : tt === 'mat' || tt === 'chua_moc' ? 'mat' : 'phuc'],
        roughness: 0.45, metalness: 0.03,
        side: canhLatNguoc ? THREE.DoubleSide : THREE.FrontSide,
        transparent: ['mat', 'chua_moc'].includes(tt),
        opacity: ['mat', 'chua_moc'].includes(tt) ? 0.18 : 1,
      });
      o.userData = { ma, trang_thai: tt };
      dsRang.push(o);
    });
    // Khối không phải răng, thường là nướu: giữ màu nướu và cũng vẽ hai mặt.
    banQuet.khoi.filter((o) => !o.userData?.ma).forEach((o) => {
      o.material = new THREE.MeshStandardMaterial({
        color: 0xc4776f, roughness: 0.82, metalness: 0,
        side: canhLatNguoc ? THREE.DoubleSide : THREE.FrontSide,
      });
    });
  } else if (banQuet) {
    // Bản quét hoặc bộ mẫu gộp: một khối, chỉ để nhìn.
    const m = new THREE.Mesh(banQuet.hinh, new THREE.MeshStandardMaterial({
      color: 0xefe7dc, roughness: 0.55, metalness: 0.02,
      side: THREE.DoubleSide,
    }));
    m.scale.setScalar(banQuet.ty_le_goi_y);
    nhom.add(m);
  }

  const loai = (ma) => {
    const v = Number(String(ma)[1]);
    return v <= 2 ? (v === 1 ? 'cua_giua' : 'cua_ben')
      : v === 3 ? 'nanh' : v <= 5 ? 'ham_nho' : v === 8 ? 'khon' : 'ham_lon';
  };

  if (!banQuet) Object.values(soDoRang).forEach((r) => {
    const ma = String(r.ma);
    const phan = Number(ma[0]);
    const viTri = Number(ma[1]);
    const hamTren = phan === 1 || phan === 2;
    const ben = (phan === 1 || phan === 4) ? 1 : -1;
    const co = CO[loai(ma)];

    const { x, z, huong } = viTriTrenCung(viTri - 1, ben);
    const hinh = thanRang(co, hamTren);
    const mau = MAU[r.trang_thai === 'binh_thuong' ? 'lanh'
      : r.trang_thai === 'sau' || r.trang_thai === 'chi_dinh_nho' ? 'sau'
      : r.trang_thai === 'tram' ? 'tram'
      : r.trang_thai === 'noi_nha' ? 'noi'
      : r.trang_thai === 'mat' || r.trang_thai === 'chua_moc' ? 'mat' : 'phuc'];

    const chatLieu = new THREE.MeshStandardMaterial({
      color: mau,
      roughness: r.trang_thai === 'binh_thuong' ? 0.42 : 0.55,
      metalness: 0.04,
      transparent: ['mat', 'chua_moc'].includes(r.trang_thai),
      opacity: ['mat', 'chua_moc'].includes(r.trang_thai) ? 0.18 : 1,
    });

    const khoi = new THREE.Mesh(hinh, chatLieu);
    khoi.position.set(x, hamTren ? 9 : -9, z);
    khoi.rotation.y = huong;
    /* Độ nghiêng trục răng.
     *
     * Răng thật không cắm thẳng đứng: răng cửa hàm trên ngả ra trước, răng hàm
     * ngả nhẹ vào trong. Dựng thẳng đứng hết thì cung hàm trông như hàng rào,
     * và đó là thứ khiến ảnh 3D trông giả dù tỉ lệ đã đúng. */
    const ngaTruoc = (viTri <= 3 ? 0.14 : -0.06) * (hamTren ? 1 : -1);
    khoi.rotateOnAxis(new THREE.Vector3(1, 0, 0), ngaTruoc);
    khoi.userData = { ma, trang_thai: r.trang_thai };
    nhom.add(khoi);
    dsRang.push(khoi);
  });

  /* Xoay bằng cách kéo chuột. Tự viết thay vì kéo thêm OrbitControls: ở đây
   * chỉ cần xoay quanh hai trục và giới hạn góc dọc, mà OrbitControls là một
   * tệp riêng nữa phải tải. */
  let dangKeo = false; let truocX = 0; let truocY = 0;
  let quanhY = 0; let quanhX = -0.34;
  const dat = () => {
    quanhX = Math.max(-1.35, Math.min(1.35, quanhX));
    nhom.rotation.y = quanhY;
    nhom.rotation.x = quanhX;
  };
  dat();

  const batDau = (e) => {
    dangKeo = true;
    truocX = (e.touches ? e.touches[0] : e).clientX;
    truocY = (e.touches ? e.touches[0] : e).clientY;
  };
  const keo = (e) => {
    if (!dangKeo) return;
    const x = (e.touches ? e.touches[0] : e).clientX;
    const y = (e.touches ? e.touches[0] : e).clientY;
    quanhY += (x - truocX) * 0.008;
    quanhX += (y - truocY) * 0.008;
    truocX = x; truocY = y;
    dat();
    if (e.cancelable) e.preventDefault();
  };
  const thoi = () => { dangKeo = false; };

  ve.domElement.addEventListener('mousedown', batDau);
  window.addEventListener('mousemove', keo);
  window.addEventListener('mouseup', thoi);
  ve.domElement.addEventListener('touchstart', batDau, { passive: true });
  ve.domElement.addEventListener('touchmove', keo, { passive: false });
  ve.domElement.addEventListener('touchend', thoi);

  /* Bấm để chọn răng. Chỉ tính là bấm khi chuột gần như không di chuyển —
   * nếu không thì mỗi lần xoay xong lại chọn nhầm một cái răng. */
  const tia = new THREE.Raycaster();
  const diem = new THREE.Vector2();
  let batDauX = 0; let batDauY = 0;
  ve.domElement.addEventListener('pointerdown', (e) => { batDauX = e.clientX; batDauY = e.clientY; });
  ve.domElement.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - batDauX, e.clientY - batDauY) > 5) return;
    const o = ve.domElement.getBoundingClientRect();
    diem.x = ((e.clientX - o.left) / o.width) * 2 - 1;
    diem.y = -((e.clientY - o.top) / o.height) * 2 + 1;
    tia.setFromCamera(diem, may);
    const trung = tia.intersectObjects(dsRang, false);
    if (trung.length && khiChonRang) khiChonRang(trung[0].object.userData.ma);
  });

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

  let chay = true;
  const quay = () => {
    if (!chay) return;
    ve.render(canh, may);
    requestAnimationFrame(quay);
  };
  quay();

  return {
    // Cho chỗ gọi biết cảnh đang dựng từ nguồn nào — nhìn bằng mắt không phân
    // biệt được hình công thức với bộ mẫu khi nướu ống che mất chân răng.
    kieuNguon: banQuet?.kieu || 'cong_thuc',
    danhDauRang(ma) {
      dsRang.forEach((k) => {
        const chon = k.userData.ma === ma;
        k.material.emissive = new THREE.Color(chon ? 0x1f8f7a : 0x000000);
        k.material.emissiveIntensity = chon ? 0.8 : 0;
        k.scale.setScalar(chon ? 1.16 : 1);
      });
    },
    datGoc(ten) {
      const goc = {
        tren:  [0, -1.32], duoi: [0, 1.32],
        truoc: [0, -0.18], trai: [1.25, -0.3], phai: [-1.25, -0.3],
      }[ten];
      if (!goc) return;
      [quanhY, quanhX] = goc;
      dat();
    },
    huy() {
      chay = false;
      theoDoi.disconnect();
      window.removeEventListener('mousemove', keo);
      window.removeEventListener('mouseup', thoi);
      dsRang.forEach((k) => { k.geometry.dispose(); k.material.dispose(); });
      ve.dispose();
      ve.domElement.remove();
    },
  };
}
