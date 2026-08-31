/* Nén ảnh và băm nội dung — dùng chung cho mọi màn có tải ảnh lên.
 *
 * Nén ở MÁY TRẠM chứ không ở máy chủ: ảnh nha khoa từ máy chụp thường 3–8 MB
 * mỗi tấm, ảnh hoá đơn chụp bằng điện thoại còn nặng hơn. Gửi nguyên bản qua
 * mạng 4G ở quầy là chờ rất lâu, và đó là lúc người ta bỏ không tải ảnh nữa.
 *
 * Cạnh dài giới hạn 2000px: đủ để phóng to đọc số trên tờ hoá đơn hay xem chi
 * tiết trên phim, mà không giữ những pixel không ai nhìn tới.
 *
 * MỘT BẢN DUY NHẤT. Trước đây logic này nằm trong src/views/so-benh-an.js;
 * chép thêm một bản cho màn kho là tự tạo ra hai cách nén ảnh sẽ lệch nhau
 * ngay lần chỉnh chất lượng đầu tiên — và khi đó cùng một tấm ảnh tải lên hai
 * màn sẽ ra hai mã băm khác nhau, tức là gộp trùng hết tác dụng.
 */

const CANH_TOI_DA = 2000;
const CHAT_LUONG = 0.82;

/* Mã băm sha256 của nội dung ảnh, tính ngay trên máy trạm.
 *
 * crypto.subtle chỉ có trong ngữ cảnh an toàn — https hoặc localhost. Production
 * chạy https nên vẫn có; nếu ai đó mở qua http thuần thì báo rõ thay vì lặng lẽ
 * lưu ảnh không có mã băm. */
export async function bamNoiDung(buf) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Trình duyệt không cho tính mã băm ở kết nối này. Hãy mở bằng HTTPS.');
  }
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function doKb(n) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

export function nenWebp(tep) {
  return new Promise((xong, hong) => {
    const doc = new FileReader();
    doc.onerror = () => hong(new Error(`Không đọc được tệp ${tep.name}.`));
    doc.onload = () => {
      const anh = new Image();
      anh.onerror = () => hong(new Error(`${tep.name} không phải ảnh đọc được.`));
      anh.onload = () => {
        let { width: w, height: h } = anh;
        if (Math.max(w, h) > CANH_TOI_DA) {
          const ty = CANH_TOI_DA / Math.max(w, h);
          w = Math.round(w * ty); h = Math.round(h * ty);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(anh, 0, 0, w, h);
        c.toBlob(async (b) => {
          if (!b) { hong(new Error('Trình duyệt này không mã hoá được WebP.')); return; }
          // Băm nội dung ĐÃ NÉN, không băm tệp gốc: hai người chụp cùng một
          // tờ hoá đơn từ hai máy khác nhau sẽ ra hai tệp gốc khác nhau nhưng
          // cùng một ảnh sau khi nén, và đó mới là thứ đáng gộp.
          const bam = await bamNoiDung(await b.arrayBuffer());
          const d = new FileReader();
          d.onload = () => xong({
            tep: d.result, ten_goc: tep.name, ma_bam: bam, byte: b.size,
            kb: `${doKb(tep.size)} → ${doKb(b.size)}`,
            giam: Math.round((1 - b.size / tep.size) * 100),
          });
          d.readAsDataURL(b);
        }, 'image/webp', CHAT_LUONG);
      };
      anh.src = doc.result;
    };
    doc.readAsDataURL(tep);
  });
}
