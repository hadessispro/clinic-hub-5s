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

/* Kích thước gần đúng theo loại răng, đơn vị milimét thật.
 *
 * Dùng số thật thay vì số cho đẹp: răng hàm lớn rộng gấp đôi răng cửa là điều
 * bệnh nhân nhận ra ngay khi nhìn, và sai tỉ lệ thì cảnh trông như đồ chơi.
 */
const CO = {
  cua_giua: { rong: 8.5, day: 7.0, cao: 10.5, chan: 13, mui: 0 },
  cua_ben:  { rong: 6.5, day: 6.5, cao: 9.0,  chan: 13, mui: 0 },
  nanh:     { rong: 7.5, day: 8.0, cao: 11.0, chan: 17, mui: 1 },
  ham_nho:  { rong: 7.0, day: 9.0, cao: 8.5,  chan: 14, mui: 2 },
  ham_lon:  { rong: 10.5, day: 11.0, cao: 7.5, chan: 13, mui: 4 },
  khon:     { rong: 9.0, day: 10.0, cao: 6.5,  chan: 11, mui: 3 },
};

/* Một thân răng.
 *
 * Thân là khối tròn dẹt bị bóp theo chiều gần-xa, cộng các múi nhai đặt lên
 * mặt trên. Số múi là thứ phân biệt răng hàm với răng cửa khi nhìn từ trên
 * xuống, nên nó phải đúng.
 */
function thanRang(co, hamTren) {
  const cac = [];

  const than = new THREE.SphereGeometry(1, 20, 14);
  than.scale(co.rong / 2, co.cao / 2, co.day / 2);
  // Cắt bớt phần dưới của khối cầu để nó ngồi được lên cổ răng.
  than.translate(0, 0, 0);
  cac.push(than);

  if (co.mui === 1) {
    const m = new THREE.ConeGeometry(co.rong * 0.3, co.cao * 0.42, 12);
    m.translate(0, co.cao * 0.42, 0);
    cac.push(m);
  } else if (co.mui >= 2) {
    const n = co.mui;
    for (let i = 0; i < n; i += 1) {
      const goc = (i / n) * Math.PI * 2 + Math.PI / 4;
      const r = n === 2 ? co.day * 0.22 : co.rong * 0.26;
      const m = new THREE.SphereGeometry(co.rong * (n === 2 ? 0.26 : 0.22), 12, 8);
      m.translate(
        Math.cos(goc) * (n === 2 ? 0 : r),
        co.cao * 0.34,
        Math.sin(goc) * r,
      );
      cac.push(m);
    }
  }

  const chan = new THREE.CylinderGeometry(co.rong * 0.32, co.rong * 0.14, co.chan * 0.8, 12);
  chan.translate(0, -(co.cao / 2 + co.chan * 0.4) * 0.82, 0);
  cac.push(chan);

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

export function taoCanh(khung, soDoRang, khiChonRang) {
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
  nhom.add(veNuou(true));
  nhom.add(veNuou(false));

  const dsRang = [];
  const loai = (ma) => {
    const v = Number(String(ma)[1]);
    return v <= 2 ? (v === 1 ? 'cua_giua' : 'cua_ben')
      : v === 3 ? 'nanh' : v <= 5 ? 'ham_nho' : v === 8 ? 'khon' : 'ham_lon';
  };

  Object.values(soDoRang).forEach((r) => {
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
