const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, Header, Footer, PageNumber,
  ShadingType, LevelFormat
} = require('docx');
const fs = require('fs');
const path = require('path');

const SHOTS_DIR = 'C:/Users/admin/Downloads/clinic5s/doc_screenshots';
const OUTPUT_DOWNLOADS = 'C:/Users/admin/Downloads/HUONG_DAN_SU_DUNG_HE_THONG_CHAM_CONG_VA_VAN_HANH_5S.docx';
const OUTPUT_WORKSPACE = 'C:/Users/admin/Downloads/clinic5s/HUONG_DAN_SU_DUNG_HE_THONG_CHAM_CONG_VA_VAN_HANH_5S.docx';

// Colors
const COLOR_PRIMARY = '087F7B'; // Teal 5S
const COLOR_PRIMARY_DARK = '065F5B';
const COLOR_SECONDARY = '0F766E';
const COLOR_TEXT = '2D3748';
const COLOR_MUTED = '64748B';
const COLOR_BG_LIGHT = 'F1F5F9';
const COLOR_BG_CALLOUT = 'F0FDF4';
const COLOR_BORDER_CALLOUT = '10B981';
const COLOR_BG_WARN = 'FFFBEB';
const COLOR_BORDER_WARN = 'F59E0B';
const COLOR_WHITE = 'FFFFFF';

function p(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? new TextRun({ text: t, font: 'Arial', size: 21, color: COLOR_TEXT }) : t)
    : [new TextRun({ text: text || '', font: 'Arial', size: 21, color: COLOR_TEXT, ...opts })];

  return new Paragraph({
    spacing: { before: 120, after: 120, line: 300 },
    alignment: opts.alignment || AlignmentType.LEFT,
    children: runs
  });
}

function boldRun(text, opts = {}) {
  return new TextRun({ text, font: 'Arial', size: 21, bold: true, color: COLOR_TEXT, ...opts });
}

function normalRun(text, opts = {}) {
  return new TextRun({ text, font: 'Arial', size: 21, color: COLOR_TEXT, ...opts });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: 32,
        bold: true,
        color: COLOR_PRIMARY
      })
    ]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 140 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: 26,
        bold: true,
        color: COLOR_SECONDARY
      })
    ]
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 100 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: 22,
        bold: true,
        color: '1E293B'
      })
    ]
  });
}

function bullet(boldTitle, description) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 60, after: 60, line: 280 },
    children: [
      new TextRun({ text: boldTitle + ': ', bold: true, font: 'Arial', size: 21, color: COLOR_TEXT }),
      new TextRun({ text: description, font: 'Arial', size: 21, color: COLOR_TEXT })
    ]
  });
}

function subBullet(text) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { before: 40, after: 40, line: 260 },
    children: [
      new TextRun({ text, font: 'Arial', size: 20, color: COLOR_TEXT })
    ]
  });
}

function callout(title, content, isWarning = false) {
  const borderColor = isWarning ? COLOR_BORDER_WARN : COLOR_BORDER_CALLOUT;
  const bgColor = isWarning ? COLOR_BG_WARN : COLOR_BG_CALLOUT;
  const titleColor = isWarning ? 'B45309' : '047857';

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 24, color: borderColor }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            children: [
              new Paragraph({
                spacing: { before: 40, after: 60 },
                children: [
                  new TextRun({
                    text: (isWarning ? '⚠️ ' : '💡 ') + title,
                    bold: true,
                    font: 'Arial',
                    size: 21,
                    color: titleColor
                  })
                ]
              }),
              new Paragraph({
                spacing: { before: 0, after: 40, line: 280 },
                children: [
                  new TextRun({
                    text: content,
                    font: 'Arial',
                    size: 20,
                    color: COLOR_TEXT
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function imageBlock(filename, caption) {
  const fullPath = path.join(SHOTS_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    return p(`[Ảnh đính kèm: ${caption} - Chưa tìm thấy file ${filename}]`, { color: 'DC2626' });
  }

  const imgData = fs.readFileSync(fullPath);

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 80 },
      children: [
        new ImageRun({
          data: imgData,
          transformation: {
            width: 580,
            height: 370
          }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 200 },
      children: [
        new TextRun({
          text: `Hình minh họa: ${caption}`,
          italics: true,
          font: 'Arial',
          size: 18,
          color: COLOR_MUTED
        })
      ]
    })
  ];
}

function styledTable(headers, rows, colWidths = []) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      width: colWidths[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: h, bold: true, font: 'Arial', size: 20, color: COLOR_WHITE })
          ]
        })
      ]
    }))
  });

  const dataRows = rows.map((r, rIdx) => new TableRow({
    children: r.map((c, i) => new TableCell({
      shading: { fill: rIdx % 2 === 1 ? COLOR_BG_LIGHT : COLOR_WHITE, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      width: colWidths[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: c, font: 'Arial', size: 19, color: COLOR_TEXT })
          ]
        })
      ]
    }))
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows]
  });
}

async function buildWordDoc() {
  console.log('Building Word User Guide Document...');

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: 21,
            color: COLOR_TEXT
          }
        }
      }
    },
    sections: [
      // ════════════════════════════════════════════════════════════════════════
      // BÌA TÀI LIỆU (COVER PAGE)
      // ════════════════════════════════════════════════════════════════════════
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        children: [
          new Paragraph({ spacing: { before: 600, after: 200 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'HỆ THỐNG NHA KHOA 5S',
                font: 'Arial',
                size: 28,
                bold: true,
                color: COLOR_SECONDARY
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [
              new TextRun({
                text: 'CHI NHÁNH PHẠM VĂN CHIÊU & LÊ VĂN THỌ · TP. HỒ CHÍ MINH',
                font: 'Arial',
                size: 20,
                color: COLOR_MUTED
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            children: [
              new TextRun({
                text: 'TÀI LIỆU HƯỚNG DẪN SỬ DỤNG',
                font: 'Arial',
                size: 40,
                bold: true,
                color: COLOR_PRIMARY
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: 'HỆ THỐNG ĐIỀU HÀNH & CHẤM CÔNG NỘI BỘ (CLINIC HUB 5S)',
                font: 'Arial',
                size: 24,
                bold: true,
                color: '1E293B'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 800 },
            children: [
              new TextRun({
                text: 'Chấm Công GPS · Checkout · Quản Lý Đơn Từ Tăng Ca & Nghỉ Phép · Sổ Bệnh Án Điện Tử · Tiếp Đón Lễ Tân & CSKH',
                font: 'Arial',
                size: 21,
                italics: true,
                color: COLOR_MUTED
              })
            ]
          }),

          // Bảng tóm tắt thông tin tài liệu
          styledTable(
            ['THÔNG TIN TÀI LIỆU', 'CHI TIẾT'],
            [
              ['Đối tượng áp dụng', 'Bác sĩ điều trị, Phụ tá (Điều dưỡng), Nhân viên Chăm sóc khách hàng (CSKH / Lễ tân)'],
              ['Nền tảng hỗ trợ', 'Ứng dụng Web / PWA trên Điện thoại di động (iOS, Android) và Máy tính'],
              ['Đơn vị ban hành', 'Phòng Hành chính Nhân sự & Bộ phận Công nghệ Thông tin (IT) Nha Khoa 5S'],
              ['Phiên bản hệ thống', 'Clinic Hub 5S - Bản cập nhật Tháng 09/2026'],
              ['Cổng truy cập chính', 'https://srv1892344.hstgr.cloud (hoặc mạng nội bộ phòng khám)']
            ],
            [30, 70]
          ),

          new Paragraph({ spacing: { before: 1000 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'LƯU HÀNH NỘI BỘ — NHA KHOA 5S © 2026',
                font: 'Arial',
                size: 18,
                bold: true,
                color: COLOR_MUTED
              })
            ]
          })
        ]
      },

      // ════════════════════════════════════════════════════════════════════════
      // NỘI DUNG CHÍNH (MAIN BODY)
      // ════════════════════════════════════════════════════════════════════════
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Nha Khoa 5S · Clinic Hub · Sổ tay Hướng dẫn Sử dụng',
                    font: 'Arial',
                    size: 16,
                    color: COLOR_MUTED
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Trang ', font: 'Arial', size: 16, color: COLOR_MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: COLOR_MUTED }),
                  new TextRun({ text: ' / ', font: 'Arial', size: 16, color: COLOR_MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16, color: COLOR_MUTED }),
                  new TextRun({ text: ' — Lưu hành nội bộ Nha Khoa 5S', font: 'Arial', size: 16, color: COLOR_MUTED })
                ]
              })
            ]
          })
        },
        children: [
          // ──────────────────────────────────────────────────────────────────
          // PHẦN 1
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 1: GIỚI THIỆU TỔNG QUAN & QUY TẮC ĐĂNG NHẬP'),
          p([
            normalRun('Hệ thống '),
            boldRun('Clinic Hub 5S'),
            normalRun(' là nền tảng quản trị và vận hành chuyên sâu dành cho chuỗi phòng khám Nha Khoa 5S. Hệ thống tích hợp toàn diện các nghiệp vụ: Chấm công định vị GPS thời gian thực, quản lý ca trực, phê duyệt đơn từ (nghỉ phép, tăng ca, bổ sung công, tạm ứng), quản lý công việc hàng ngày, sổ bệnh án điện tử và điều phối tiếp đón khách hàng.')
          ]),

          heading2('1.1. Cài đặt và Truy cập Hệ thống'),
          bullet('Trên máy tính (Desktop / Laptop)', 'Mở trình duyệt web Google Chrome, Cốc Cốc hoặc Microsoft Edge và truy cập đường dẫn: https://srv1892344.hstgr.cloud.'),
          bullet('Trên điện thoại di động (PWA App)', 'Hệ thống hỗ trợ cài đặt dạng Progressive Web App (PWA). Khi mở trang trên Safari (iOS) bấm nút Chia sẻ -> chọn "Thêm vào Màn hình chính" (Add to Home Screen). Trên Chrome (Android) bấm menu 3 chấm -> chọn "Cài đặt ứng dụng". Biểu tượng ứng dụng Nha Khoa 5S sẽ xuất hiện ngoài màn hình điện thoại như app thông thường.'),

          heading2('1.2. Phân quyền và Tài khoản theo Từng Vai Trò'),
          p('Mỗi nhân sự tại phòng khám được cấp một tài khoản định danh gắn liền với Mã nhân viên và phân quyền chính xác theo chức danh công việc:'),

          styledTable(
            ['VAI TRÒ', 'MÃ VAI TRÒ', 'CÁC CHỨC NĂNG CHÍNH ĐƯỢC PHÂN QUYỀN'],
            [
              ['Bác sĩ điều trị', 'bac_si', 'Sổ bệnh án điện tử (xem hồ sơ, sơ đồ răng 2D/3D, ghi lượt khám, ký số), Lễ tân tiếp đón, Chấm công GPS, Lịch làm việc, Đơn từ nghỉ phép/tăng ca, Nhiệm vụ, Tin nhắn.'],
              ['Phụ tá (Điều dưỡng)', 'phu_ta', 'Chấm công GPS, Phân ca làm việc, Đơn từ tăng ca/nghỉ phép, Quản lý kho vật tư tại ghế, Nhiệm vụ chuẩn bị phòng vô trùng, Tin nhắn.'],
              ['Lễ tân & CSKH', 'le_tan', 'Tiếp đón khách hàng tại quầy, Hàng đợi tiếp đón, Điều phối lịch hẹn theo bác sĩ, Xem lưu ý dặn quầy từ bác sĩ, Chăm sóc sau điều trị, Chấm công GPS, Đơn từ.']
            ],
            [22, 18, 60]
          ),

          heading2('1.3. Quy trình Đăng nhập Hệ thống Từng Bước'),
          bullet('Bước 1 (Chọn chi nhánh)', 'Nhấp vào ô "Chi nhánh" và chọn đúng cơ sở bạn đang làm việc: "Nha Khoa 5S - Phạm Văn Chiêu" hoặc "Nha Khoa 5S - Lê Văn Thọ". Nhân sự linh hoạt có thể chọn "Chi nhánh tổng".'),
          bullet('Bước 2 (Nhập Mã nhân viên)', 'Nhập Mã nhân viên (MNV) do phòng Nhân sự cấp (ví dụ: BS01, LT-TEST, PVC005...). Bạn cũng có thể dùng địa chỉ Email công việc đã đăng ký.'),
          bullet('Bước 3 (Nhập Mật khẩu)', 'Mật khẩu ban đầu được hệ thống thiết lập mặc định chính là Số điện thoại của bạn trên hồ sơ nhân sự (viết liền các chữ số, không khoảng trắng). Nhân viên cần đổi mật khẩu ngay sau lần đăng nhập đầu tiên.'),
          bullet('Bước 4 (Tính năng Ghi nhớ tài khoản)', 'Hệ thống đã cập nhật tính năng tự động ghi nhớ tài khoản và chi nhánh gần nhất trên thiết bị. Bạn chỉ cần nhập mật khẩu cho các lần làm việc tiếp theo mà không phải gõ lại mã nhân viên.'),

          ...imageBlock('01_dang_nhap.png', 'Giao diện Đăng nhập nhân viên Nha Khoa 5S với lựa chọn chi nhánh và cơ chế ghi nhớ tài khoản'),

          callout(
            'Lưu ý Bảo mật Tài khoản',
            'Tuyệt đối không chia sẻ tài khoản đăng nhập hoặc mật khẩu cho người khác. Mọi thao tác ký số bệnh án, xác nhận chấm công và gửi đơn từ đều được ghi nhận vào nhật ký kiểm toán (Audit Log) của hệ thống gắn liền với tài khoản của bạn.',
            true
          ),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 2
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 2: HƯỚNG DẪN CHẤM CÔNG GPS, CHECK-IN & CHECK-OUT TAN CA'),
          p('Quy trình chấm công tại Nha Khoa 5S được số hóa hoàn toàn bằng định vị vệ tinh GPS kết hợp mạng nội bộ, loại bỏ hoàn toàn việc quẹt thẻ giấy hay phụ thuộc vào máy chấm công vân tay.'),

          heading2('2.1. Quy tắc Nghiệp vụ Chấm công'),
          bullet('Xác thực tọa độ GPS', 'Bạn chỉ có thể thực hiện Check-in và Check-out khi đang có mặt thực tế trong bán kính 100 mét quanh địa chỉ phòng khám (248 Phạm Văn Chiêu hoặc 60 Lê Văn Thọ).'),
          bullet('Quy tắc thời gian vào ca (Check-in)', 'Nhân sự phải bấm Check-in trước giờ bắt đầu ca làm việc ít nhất 5–10 phút để kịp chuẩn bị trang phục, phòng khám và dụng cụ trước khi đón bệnh nhân đầu tiên.'),
          bullet('Quy tắc thời gian ra ca (Check-out)', 'Khi hoàn thành toàn bộ ca làm việc và bàn giao đầy đủ, nhân sự bấm Check-out. Hệ thống sẽ tự động chốt tổng giờ làm thực tế.'),
          bullet('Cơ chế hoạt động ngoại tuyến (Offline Sync)', 'Trường hợp phòng khám tạm thời mất kết nối Internet, dữ liệu chấm công sẽ được mã hóa lưu trữ tạm thời trên bộ nhớ an toàn của thiết bị và tự động đồng bộ lên máy chủ ngay khi có mạng trở lại.'),

          heading2('2.2. Hướng dẫn Thao tác Check-in Vào Ca'),
          bullet('Bước 1', 'Mở ứng dụng Clinic Hub 5S, chọn mục "Chấm công GPS" tại thanh điều hướng bên trái (hoặc menu dưới đáy màn hình trên điện thoại).'),
          bullet('Bước 2', 'Bật quyền "Cho phép truy cập vị trí" (Location Permission) trên trình duyệt/điện thoại. Màn hình sẽ hiển thị khoảng cách hiện tại đến phòng khám kèm thẻ màu xanh lá "SẴN SÀNG CHECK-IN".'),
          bullet('Bước 3', 'Nhấn nút màu xanh đậm: "Xác nhận chấm công".'),
          bullet('Bước 4', 'Hệ thống thông báo thành công và hiển thị giờ vào ca chính xác (Ví dụ: "Đã check-in lúc 07:55"). Trạng thái cá nhân trên thanh tiêu đề chuyển sang chấm xanh "Online".'),

          heading2('2.3. Hướng dẫn Thao tác Check-out Ra Ca'),
          bullet('Bước 1', 'Cuối ca làm việc, sau khi hoàn tất công tác lâm sàng hoặc bàn giao quầy, mở lại màn hình "Chấm công GPS".'),
          bullet('Bước 2', 'Hệ thống hiển thị nút: "Check-out ra ca" (hoặc "↗ Ra ca"). Nhấn nút để ghi nhận thời điểm rời phòng khám.'),
          bullet('Bước 3', 'Hệ thống đối chiếu giờ vào và giờ ra để tính tổng số giờ công chính thức và hiển thị tóm tắt ngày công vào "Bảng công việc" cá nhân.'),

          ...imageBlock('02_cham_cong_tong_quan.png', 'Màn hình Chấm công GPS thời gian thực kèm kiểm tra bán kính 100m tại 5S Phạm Văn Chiêu'),

          callout(
            'Xử lý Tình huống Đi trễ / Quên Chấm công',
            'Nếu bạn đến trễ hơn giờ quy định hoặc quên bấm Check-in/Check-out, hệ thống sẽ ghi nhận trạng thái cảnh báo. Bạn phải vào ngay phân hệ "Đơn từ & Nghỉ phép" để gửi "Đơn bổ sung công" hoặc "Đơn giải trình đi trễ" kèm lý do rõ ràng trước 24h cùng ngày để được Trưởng ca và HR xác nhận hợp lệ.',
            true
          ),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 3
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 3: HƯỚNG DẪN QUẢN LÝ ĐƠN TỪ (NGHỈ PHÉP, TĂNG CA OT, BỔ SUNG CÔNG, TẠM ỨNG)'),
          p('Mọi đề xuất về ngày nghỉ, làm thêm giờ, sửa đổi giờ công hay xin ứng lương đều được thực hiện trực tiếp trên phân hệ "Đơn từ & Nghỉ phép", giúp loại bỏ hoàn toàn các loại đơn giấy dễ thất lạc.'),

          heading2('3.1. Các Loại Đơn và Quy định Thời hạn Nộp'),
          styledTable(
            ['LOẠI ĐƠN', 'MỤC ĐÍCH SỬ DỤNG', 'THỜI HẠN & ĐIỀU KIỆN NỘP ĐƠN'],
            [
              ['Nghỉ phép năm', 'Nghỉ giải quyết việc cá nhân, nghỉ dưỡng sức theo chế độ phép năm có lương.', 'Nộp trước ít nhất 48 giờ. Phải có người nhận bàn giao / trực thay.'],
              ['Nghỉ ốm / Việc đột xuất', 'Nghỉ do lý do sức khỏe, việc tang, việc gia đình cấp bách.', 'Thông báo trưởng ca ngay khi phát sinh và gửi đơn trên app trong vòng 12h.'],
              ['Đơn tăng ca (OT)', 'Ghi nhận giờ làm thêm khi ca điều trị kéo dài, cấp cứu nha khoa hoặc trực ngoài giờ.', 'Nộp trong ngày phát sinh tăng ca. Tính hệ số lương 1.5x.'],
              ['Bổ sung công', 'Giải trình quên check-in, quên check-out hoặc lỗi thiết bị không quét được GPS.', 'Nộp trong vòng 24 giờ kể từ ngày xảy ra sự cố công.'],
              ['Tạm ứng lương', 'Đề xuất ứng một phần tiền lương phục vụ nhu cầu tài chính giữa tháng.', 'Nộp từ ngày 10 đến ngày 15 hằng tháng theo quy chế tài chính phòng khám.']
            ],
            [22, 43, 35]
          ),

          heading2('3.2. Quy trình 5 Bước Tạo và Gửi Đơn'),
          bullet('Bước 1 (Truy cập)', 'Tại thanh điều hướng, chọn mục "Đơn từ nghỉ phép". Màn hình chia thành khung "Tạo đơn" bên trái và "Danh sách đơn" bên dưới.'),
          bullet('Bước 2 (Chọn loại đơn)', 'Tại mục "Loại đơn", bấm vào danh sách thả xuống và chọn đúng loại đơn cần gửi (Nghỉ phép năm, Đơn tăng ca, Bổ sung công, Tạm ứng lương...).'),
          bullet('Bước 3 (Chọn thời gian)', 'Chọn ngày bắt đầu ("Từ ngày") và ngày kết thúc ("Đến ngày").'),
          subBullet('Đối với Đơn tăng ca: Điền thêm khung giờ làm thêm tại "Bắt đầu tăng ca" (VD: 18:00) và "Kết thúc tăng ca" (VD: 20:30).'),
          subBullet('Đối với Đơn tạm ứng lương: Điền "Số tiền ứng" (VD: 2,000,000đ) và "Tài khoản nhận tiền" (Ngân hàng - Số tài khoản - Tên chủ thẻ).'),
          bullet('Bước 4 (Nhập lý do & Bàn giao)', 'Tại ô "Lý do", nêu rõ nguyên nhân xin nghỉ/tăng ca. ĐẶC BIỆT: Bác sĩ và Phụ tá BẮT BUỘC phải ghi rõ tên nhân sự nhận bàn giao bệnh nhân hoặc người trực thay ca.'),
          bullet('Bước 5 (Gửi đơn)', 'Bấm nút xanh "+ Gửi đơn". Đơn sẽ ngay lập tức được chuyển đến danh sách chờ duyệt của Trưởng bộ phận và HR.'),

          ...imageBlock('03_don_tu_danh_sach.png', 'Màn hình Quản lý Đơn từ, khung Tạo đơn trực quan và các thẻ chính sách nhanh của Nha Khoa 5S'),

          heading2('3.3. Quy trình Phê duyệt và Theo dõi Trạng thái Đơn'),
          p('Mỗi lá đơn gửi đi sẽ trải qua quy trình xét duyệt minh bạch và hiển thị nhãn màu trực quan:'),
          bullet('Chờ duyệt (Màu vàng)', 'Đơn vừa gửi thành công, đang chờ Bác sĩ trưởng / Trưởng bộ phận xem xét.'),
          bullet('Đã duyệt (Màu xanh lá)', 'Đơn đã được phê duyệt đầy đủ cấp quản lý và Phòng HR. Lịch làm việc và bảng công sẽ tự động cập nhật theo đơn.'),
          bullet('Đã từ chối (Màu đỏ)', 'Đơn không được chấp thuận (kèm lý do do người duyệt phản hồi, ví dụ: "Trùng lịch phẫu thuật chưa có bác sĩ trực thay").'),

          callout(
            'Chính sách Bàn giao Công việc Khi Nghỉ Phép',
            'Đối với Bác sĩ điều trị và Phụ tá, phòng khám không duyệt bất kỳ đơn nghỉ phép nào nếu danh sách bệnh nhân có lịch hẹn trong ngày hôm đó chưa được điều phối hoặc chưa có nhân sự tương đương nhận phụ trách thay!',
            true
          ),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 4
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 4: HƯỚNG DẪN TRA CỨU LỊCH LÀM VIỆC & PHÂN CA'),
          p('Lịch làm việc của toàn bộ phòng khám được cập nhật hàng tháng và phân bổ chi tiết theo tuần giúp mọi nhân sự chủ động kế hoạch làm việc cá nhân.'),

          heading2('4.1. Ký hiệu và Thời gian Các Ca Làm Việc'),
          bullet('Ca sáng (Ký hiệu: S)', 'Thời gian: 08:00 – 18:00 (Thời lượng: 9 giờ làm việc thực tế + 1 giờ nghỉ trưa).'),
          bullet('Ca chiều (Ký hiệu: C)', 'Thời gian: 10:00 – 20:00 (Thời lượng: 9 giờ làm việc thực tế + 1 giờ nghỉ chuyển giao).'),
          bullet('Ca full ngày (Ký hiệu: F)', 'Thời gian: 08:00 – 20:00 (Thời lượng: 11 giờ làm việc thực tế + các khoảng nghỉ). Áp dụng cho các ca trực chuyên môn cao điểm.'),
          bullet('Ca hành chính (Ký hiệu: HC)', 'Thời gian: 08:00 – 17:00 (Thời lượng: 8 giờ làm việc tiêu chuẩn). Dành cho khối văn phòng và hỗ trợ.'),

          heading2('4.2. Thao tác Xem và Đổi Ca'),
          bullet('Xem lịch cá nhân', 'Vào mục "Lịch làm việc". Chọn Tháng/Năm và bấm vào các nút chuyển tuần "T1 (1–7)", "T2 (8–14)", "T3 (15–21)", "T4 (22–28)" hoặc "Cuối tháng" để xem ca trực tương ứng.'),
          bullet('Đăng ký đổi ca trực', 'Khi có nhu cầu đổi ca với đồng nghiệp cùng vị trí, nhân viên trao đổi trước với đồng nghiệp, sau đó gửi "Đơn xin đổi ca" trên hệ thống trước ít nhất 24 giờ để Quản lý chi nhánh cập nhật lại bảng phân bổ.'),

          ...imageBlock('04_lich_lam_viec_phan_ca.png', 'Bảng phân bổ lịch làm việc & phân ca trực linh hoạt các phòng ban tại Nha Khoa 5S'),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 5
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 5: HƯỚNG DẪN CHUYÊN BIỆT CHO BÁC SĨ ĐIỀU TRỊ (SỔ BỆNH ÁN)'),
          p('Màn hình "Sổ bệnh án điện tử" là công cụ lâm sàng trung tâm dành cho Bác sĩ. Mọi thông tin khám, chẩn đoán, lập phác đồ và kê đơn thuốc đều tuân thủ chặt chẽ tiêu chuẩn nha khoa hiện đại.'),

          heading2('5.1. Bốn Ràng Buộc Pháp Lý của Bệnh Án Điện Tử'),
          bullet('1. Chỉ ghi thêm (Append-only)', 'Hệ thống nghiêm cấm mọi thao tác sửa đè hoặc xóa bản ghi lâm sàng. Khi cần đính chính thông tin, bác sĩ tạo một bản ghi đính chính liên kết trỏ về bản ghi cũ.'),
          bullet('2. Ký số bảo mật (Digital Signing)', 'Bác sĩ trực tiếp điều trị phải bấm Ký số sau khi hoàn tất lượt khám. Khi bản ghi đã được ký số, hệ thống khóa cứng nội dung để đảm bảo giá trị pháp lý.'),
          bullet('3. Nhật ký truy cập (Audit Log)', 'Mọi hành động mở xem hồ sơ, xem ảnh X-quang hay chỉnh sửa đều được lưu vết thời gian và người thực hiện.'),
          bullet('4. Lưu trữ dữ liệu vĩnh viễn', 'Dữ liệu lâm sàng của bệnh nhân được lưu trữ lâu dài phục vụ tra cứu tiền sử bệnh.'),

          heading2('5.2. Phân Hạng Bệnh Nhân Theo Thang L1 – L5'),
          p('Hệ thống tự động phân loại khách hàng dựa trên dữ liệu lâm sàng và giá trị điều trị đã chốt:'),
          bullet('Hạng L1 (Khách mới)', 'Bệnh nhân mới đến thăm khám lần đầu, hồ sơ nền chưa có đầy đủ thông tin hoặc chưa có phim X-quang.'),
          bullet('Hạng L2 (Hồ sơ nền đầy đủ)', 'Bệnh nhân đã chụp phim toàn cảnh (Panorex) hoặc CT Cone Beam và đã có từ 2 lần khám trở lên.'),
          bullet('Hạng L3 (Quan tâm chuyên sâu)', 'Bệnh nhân có nhu cầu và kế hoạch điều trị các kỹ thuật cao: Chỉnh nha mắc cài, niềng máng trong suốt Invisalign, cấy ghép Implant, phục hình toàn hàm.'),
          bullet('Hạng L4 (Đã chốt ≥ 50 triệu)', 'Bệnh nhân đã đồng ý thực hiện kế hoạch điều trị có giá trị từ 50.000.000đ trở lên.'),
          bullet('Hạng L5 (Đã chốt ≥ 150 triệu)', 'Khách hàng VIP đặc biệt, giá trị gói điều trị từ 150.000.000đ trở lên — áp dụng chế độ chăm sóc và phòng VIP chuyên biệt.'),

          heading2('5.3. Thao tác trên Sơ Đồ Răng và Ghi Lượt Khám'),
          bullet('Sơ đồ răng 2D & 3D', 'Hiển thị chuẩn quốc tế 32 răng vĩnh viễn (Phần hàm 1: Trên phải; Phần hàm 2: Trên trái; Phần hàm 3: Dưới trái; Phần hàm 4: Dưới phải). Bác sĩ nhấp chuột vào từng răng để cập nhật tình trạng: Sâu răng, Trám composite, Bọc sứ, Nội nha, Implant hoặc Mất răng.'),
          bullet('Ghi nhận lượt khám mới', 'Điền đầy đủ: Sinh hiệu (Huyết áp, Mạch), Khám trong miệng, Chỉ số nha chu (mảng bám, chảy máu, túi sâu), Chẩn đoán theo mã ICD (Ví dụ: K02.1 - Sâu ngà), Kê đơn thuốc và Dặn dò sau thủ thuật.'),
          bullet('Ký số lượt khám', 'Sau khi kiểm tra kỹ lưỡng, bác sĩ nhấn nút "Ký số lượt khám" để xác thực trách nhiệm chuyên môn.'),
          bullet('Dặn quầy cho Lễ tân / CSKH', 'Bác sĩ bôi đen nội dung cần lưu ý và chọn mức "Dặn quầy" (Ví dụ: "Hẹn cắt chỉ sau 7 ngày, kiêng nhai cứng bên trái 2 tuần"). Nội dung này sẽ tự động hiển thị nổi bật trên màn hình của Lễ tân khi bệnh nhân bước ra quầy thanh toán.'),

          ...imageBlock('05_so_benh_an_danh_sach.png', 'Giao diện Sổ bệnh án điện tử, bộ lọc chi nhánh, phân hạng chăm sóc L1–L5 và cảnh báo bệnh nền'),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 6
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 6: HƯỚNG DẪN CHUYÊN BIỆT CHO PHỤ TÁ (ĐIỀU DƯỠNG)'),
          p('Phụ tá nha khoa giữ vai trò mắt xích quan trọng hỗ trợ bác sĩ trong kỹ thuật điều trị 4 tay, đảm bảo an toàn kiểm soát nhiễm khuẩn và quản lý vật tư tiêu hao.'),

          heading2('6.1. Quy trình Chuẩn bị Phòng Khám Trước Ca Trực'),
          bullet('Bước 1 (Vô trùng ghế nha)', 'Lau khử khuẩn bề mặt ghế điều trị, tay khoan, đèn trám bằng dung dịch sát khuẩn chuyên dụng. Bọc màng bảo vệ các vị trí tiếp xúc.'),
          bullet('Bước 2 (Chuẩn bị mâm dụng cụ)', 'Căn cứ vào danh mục thủ thuật của bệnh nhân trong lịch hẹn, phụ tá chuẩn bị đúng mâm dụng cụ vô trùng tương ứng: Mâm khám tổng quát, Mâm cạo vôi, Mâm phẫu thuật cấy ghép Implant, Mâm gắn mắc cài chỉnh nha...'),
          bullet('Bước 3 (Kiểm tra vật tư sẵn sàng)', 'Kiểm tra đủ số lượng thuốc tê, kim tiêm, bông gòn, ống hút phẫu thuật, chất hàn tạm, keo dán nha khoa.'),

          heading2('6.2. Phối hợp trong Ca Điều trị & Kê khai Vật tư'),
          bullet('Đo sinh hiệu', 'Đo huyết áp và mạch của bệnh nhân trước khi bác sĩ tiến hành gây tê hoặc phẫu thuật, đặc biệt với khách hàng có cảnh báo bệnh nền tim mạch, huyết áp hoặc tiểu đường.'),
          bullet('Kỹ thuật hỗ trợ 4 tay', 'Hút nước bọt liên tục, giữ phẫu trường khô ráo, gắp dụng cụ và chuyển vật liệu cho bác sĩ theo đúng thao tác chuẩn.'),
          bullet('Ghi nhận vật tư tiêu hao', 'Sau khi ca khám hoàn tất, phụ tá ghi lại chính xác số lượng vật tư đặc thù đã sử dụng (Ví dụ: 01 trụ Implant Straumann, 01 lọ bột ghép xương, 02 liều Composite 3M Z250, 01 dây cung NiTi 014...) vào mục "Vật tư lượt khám" để trừ kho chính xác.'),

          heading2('6.3. Quản lý Nhiệm vụ và Kiểm soát Vô trùng'),
          p('Phụ tá truy cập mục "Công việc" (Tasks) để nhận và cập nhật các nhiệm vụ định kỳ: Vệ sinh hệ thống ống hút phẫu thuật, nạp và chạy chu trình tiệt trùng Autoclave, kiểm kê hạn sử dụng của thuốc và vật liệu trám.'),

          ...imageBlock('07_quan_ly_cong_viec.png', 'Màn hình Quản lý công việc (Tasks) giúp phân công và theo dõi các quy trình chuẩn bị phòng khám'),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 7
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 7: HƯỚNG DẪN CHUYÊN BIỆT CHO LỄ TÂN & NHÂN VIÊN CSKH'),
          p('Màn hình "Lễ tân · Tiếp đón và Chăm sóc" là trung tâm điều phối dòng bệnh nhân tại phòng khám, giúp kết nối bệnh nhân, quầy đón tiếp và các phòng điều trị.'),

          heading2('7.1. Bảng Điều khiển Hàng Đợi Tiếp Đón'),
          p('Mỗi ngày, màn hình Lễ tân tổng hợp đầy đủ số lượng lịch hẹn được phân loại theo các trạng thái rõ ràng:'),
          bullet('Chưa tới (Màu xám)', 'Khách hàng có lịch hẹn trong ngày nhưng chưa đến phòng khám.'),
          bullet('Đã đến, chờ khám (Màu xanh dương)', 'Khách hàng đã có mặt tại sảnh, lễ tân đã bấm nút "Tiếp đón" và đang chờ ghế khám sẵn sàng.'),
          bullet('Đang khám (Màu cam)', 'Khách hàng đang ngồi trên ghế điều trị với bác sĩ phụ trách.'),
          bullet('Hoàn tất (Màu xanh lá)', 'Khách hàng đã thực hiện xong thủ thuật, đã thanh toán và nhận dặn dò ra về.'),
          bullet('Không đến / Đã hủy', 'Khách hàng báo hủy lịch hoặc quá giờ hẹn không xuất hiện.'),

          heading2('7.2. Quy trình 4 Bước Tiếp Đón Khách Hàng Tại Quầy'),
          bullet('Bước 1 (Chào đón & Tra cứu)', 'Chào đón khách hàng với thái độ niềm nở, lịch sự. Hỏi tên hoặc số điện thoại của khách và tra cứu trên thanh tìm kiếm của màn hình Lễ tân.'),
          bullet('Bước 2 (Bấm nút "Tiếp đón")', 'Tìm thấy dòng thông tin của khách hàng trong danh sách lịch hẹn hôm nay, nhấn nút xanh "Tiếp đón". Trạng thái của khách hàng sẽ ngay lập tức đổi thành "Đã đến, chờ khám".'),
          bullet('Bước 3 (Hỗ trợ hồ sơ ban đầu)', 'Nếu là khách hàng mới (Hạng L1), hướng dẫn khách quét mã QR hoặc điền phiếu thông tin tiền sử y tế (dị ứng thuốc, bệnh lý tim mạch, tiểu đường, thai kỳ...).'),
          bullet('Bước 4 (Điều phối vào phòng khám)', 'Quan sát "Lịch ngày theo bác sĩ" trên màn hình. Khi phòng khám và bác sĩ sẵn sàng, mời khách vào đúng phòng điều trị (Phòng 1, Phòng 2, Phòng 3 hoặc Phòng VIP) và bàn giao cho phụ tá/bác sĩ.'),

          heading2('7.3. Đọc Lưu Ý Dặn Quầy & Chăm Sóc Sau Điều Trị'),
          bullet('Thực hiện dặn quầy', 'Khi khách khám xong bước ra bàn lễ tân, mở hồ sơ bệnh án hoặc thông báo tiếp đón để đọc ghi chú "Dặn quầy" do Bác sĩ để lại. Hướng dẫn khách kỹ lưỡng về đơn thuốc, cách chườm đá giảm sưng, kiêng khem ăn uống và chốt ngày hẹn tái khám.'),
          bullet('Chăm sóc khách hàng sau điều trị (Post-care)', 'Chuyển sang tab "Chăm sóc" trên màn hình Lễ tân. Hệ thống sẽ lọc danh sách bệnh nhân vừa thực hiện các thủ thuật lớn ngày hôm trước (nhổ răng khôn, phẫu thuật cấy implant, gắn mắc cài lần đầu). Nhân viên CSKH thực hiện cuộc gọi thăm hỏi tình trạng lành thương, mức độ đau và ghi chép lại kết quả phản hồi.'),

          ...imageBlock('08_tiep_don_le_tan_cskh.png', 'Màn hình Tiếp đón & Chăm sóc khách hàng với phân bố lịch hẹn, hàng đợi và khối điều phối bác sĩ'),

          // ──────────────────────────────────────────────────────────────────
          // PHẦN 8
          // ──────────────────────────────────────────────────────────────────
          heading1('PHẦN 8: QUY ĐỊNH KỶ LUẬT LAO ĐỘNG & XỬ LÝ SỰ CỐ'),

          heading2('8.1. Các Hành Vi Nghiêm Cấm'),
          bullet('Gian lận chấm công', 'Nghiêm cấm hành vi nhờ người khác chấm công hộ, sử dụng phần mềm giả lập định vị GPS ảo (Fake GPS). Mọi trường hợp vi phạm sẽ bị xử lý kỷ luật mức cao nhất và trừ toàn bộ ngày công trong tháng.'),
          bullet('Làm lộ thông tin bệnh án', 'Nghiêm cấm tự ý chụp ảnh màn hình bệnh án, thông tin liên lạc hay hình ảnh của khách hàng chia sẻ lên mạng xã hội hoặc tiết lộ cho bên thứ ba.'),
          bullet('Tự ý đổi ca trực không báo cáo', 'Nghiêm cấm tự ý bỏ ca trực hoặc hoán đổi ca trực mà không gửi đơn phê duyệt trên hệ thống.'),

          heading2('8.2. Kênh Hỗ Trợ Kỹ Thuật & Nhân Sự'),
          p('Khi gặp sự cố kỹ thuật (quên mật khẩu, lỗi ứng dụng, không nhận diện được định vị GPS phòng khám...), nhân sự liên hệ ngay theo thông tin sau để được hỗ trợ tức thì:'),

          styledTable(
            ['KÊNH HỖ TRỢ', 'NGƯỜI PHỤ TRÁCH', 'SỐ ĐIỆN THOẠI / EMAIL', 'PHẠM VI HỖ TRỢ'],
            [
              ['Bộ phận CNTT (IT Admin)', 'Đào Thái Bảo', '0366 013 107 / thaibaoleo123@gmail.com', 'Mở khóa tài khoản, cấp lại mật khẩu, sửa lỗi hiển thị, lỗi GPS.'],
              ['Bộ phận Nhân sự (HR)', 'Phòng HCNS Emily', '0901 223 693 / hr1.emily@gmail.com', 'Giải đáp quy chế công lương, hỗ trợ duyệt đơn gấp, chế độ nghỉ phép.'],
              ['Quản lý Cơ sở PVC', 'Trưởng Chi nhánh PVC', '248 Phạm Văn Chiêu, Gò Vấp', 'Điều phối ca trực và phân công nhân sự tại cơ sở Phạm Văn Chiêu.'],
              ['Quản lý Cơ sở LVT', 'Trưởng Chi nhánh LVT', '60 Lê Văn Thọ, Gò Vấp', 'Điều phối ca trực và phân công nhân sự tại cơ sở Lê Văn Thọ.']
            ],
            [25, 20, 25, 30]
          ),

          callout(
            'Lời Khuyên Cho Nhân Sự 5S',
            'Clinic Hub 5S được thiết kế nhằm bảo vệ tối đa quyền lợi ngày công và tính minh bạch trong thu nhập của từng y bác sĩ và nhân viên. Hãy duy trì thói quen mở app check-in đầu ngày và check-out cuối ngày để dữ liệu lao động của bạn luôn được ghi nhận đầy đủ, chuẩn xác nhất!',
            false
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUTPUT_DOWNLOADS, buffer);
  fs.writeFileSync(OUTPUT_WORKSPACE, buffer);

  console.log(`[SUCCESS] File Word created at: ${OUTPUT_DOWNLOADS}`);
  console.log(`[SUCCESS] Backup copy saved at: ${OUTPUT_WORKSPACE}`);
  console.log(`[SIZE] ${buffer.length} bytes`);
}

buildWordDoc().catch(err => {
  console.error('Error building docx:', err);
  process.exit(1);
});
