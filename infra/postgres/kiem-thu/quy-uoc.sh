#!/usr/bin/env bash
# Quy ước bắt buộc cho mọi migration, kiểm bằng máy thay vì bằng trí nhớ.
#
#   ./quy-uoc.sh          kiểm, đỏ là chặn
#   ./quy-uoc.sh --chot   ghi lại chữ ký của các migration mới
#
# Năm phép kiểm. Cả năm đều rút ra từ loại lỗi đã thật sự xảy ra ở dự án này
# hoặc suýt xảy ra, không phải quy tắc chép từ sách.
#
set -u

GOC="$(cd "$(dirname "$0")/../../.." && pwd)"
MIG="$GOC/infra/postgres/migrations"
CHU_KY="$MIG/.chu-ky"
TRUNG_CU="$MIG/.trung-so-da-biet"

do_()   { printf '\033[31m  ✗ %s\033[0m\n' "$1"; loi=$((loi + 1)); }
xanh()  { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
vang()  { printf '\033[33m  ! %s\033[0m\n' "$1"; }
loi=0

# Băm nội dung sau khi bỏ ký tự CR.
#
# Băm byte thô thì chữ ký đổi mỗi khi kiểu xuống dòng đổi, mà git đổi kiểu
# xuống dòng mỗi lần checkout trên Windows. Chốt trên máy Windows rồi kiểm
# trên Linux là cả 33 file đều bị báo "đã bị sửa" trong khi không ai chạm
# vào file nào. Cảnh báo sai kiểu đó phá hỏng cả phép kiểm, vì thứ người ta
# học được từ nó là cách phớt lờ nó.
bam() { sed 's/\r$//' "$1" | sha256sum | cut -c1-16; }

# ── chế độ chốt chữ ký ─────────────────────────────────────────────────────
if [ "${1:-}" = "--chot" ]; then
  : > "$CHU_KY"
  for f in "$MIG"/*.sql; do
    printf '%s  %s\n' "$(bam "$f")" "$(basename "$f")" >> "$CHU_KY"
  done
  echo "Đã chốt chữ ký cho $(wc -l < "$CHU_KY") migration."
  echo "Thay đổi file này sẽ hiện trong diff, và phải giải thích được khi xét duyệt."
  exit 0
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo " QUY ƯỚC MIGRATION"
echo "════════════════════════════════════════════════════════════════"

# ── 1 · Định dạng tên ──────────────────────────────────────────────────────
# Số thứ tự quyết định thứ tự chạy. Tên không đúng khuôn thì thứ tự sắp xếp
# trở nên khó đoán, mà thứ tự sai thì migration sau tham chiếu tới bảng
# migration trước chưa tạo.
n=0
for f in "$MIG"/*.sql; do
  ten="$(basename "$f")"
  n=$((n + 1))
  case "$ten" in
    [0-9][0-9][0-9]-*.sql) ;;
    *) do_ "Tên sai khuôn NNN-mo-ta.sql: $ten" ;;
  esac
  case "$ten" in
    *[A-Z]*) do_ "Tên có chữ hoa, dễ lệch thứ tự giữa máy: $ten" ;;
  esac
done
[ "$loi" -eq 0 ] && xanh "Cả $n migration đúng khuôn tên"

# ── 2 · Số thứ tự trùng ────────────────────────────────────────────────────
# Hai file cùng số thì thứ tự giữa chúng do phần chữ phía sau quyết định, tức
# là do tình cờ. Hôm nay đúng, mai thêm file thứ ba cùng số là đảo thứ tự.
# Kho hiện có sáu cặp trùng từ trước; chúng được ghi nhận trong .trung-so-da-biet
# để không chặn việc đang chạy. Trùng MỚI thì chặn.
truoc="$loi"
trung="$(ls "$MIG"/*.sql | xargs -n1 basename | cut -c1-3 | sort | uniq -d)"
for so in $trung; do
  if [ -f "$TRUNG_CU" ] && grep -qx "$so" "$TRUNG_CU"; then
    continue
  fi
  do_ "Số $so bị trùng bởi: $(ls "$MIG"/$so-*.sql | xargs -n1 basename | tr '\n' ' ')"
  do_ "   Đổi tên file mới sang số chưa dùng, đừng thêm vào danh sách bỏ qua."
done
[ "$loi" -eq "$truoc" ] && xanh "Không có số thứ tự trùng mới"

# ── 3 · DDL phá hủy ────────────────────────────────────────────────────────
# Đây là phép kiểm quan trọng nhất trong file này.
#
# Nút Khôi phục lùi được MÃ NGUỒN, không lùi được LƯỢC ĐỒ. Migration đã xóa
# một cột thì cột đó mất, và lùi mã nguồn không mang nó về. Muốn nút khôi phục
# thật sự cứu được thì migration chỉ được THÊM, không được BỎ.
#
# Cả 33 migration hiện có đều sạch, nên rào này dựng lên không cần chừa ngoại
# lệ nào. Giữ nguyên tình trạng đó rẻ hơn nhiều so với khôi phục một cột đã mất.
truoc="$loi"
for f in "$MIG"/*.sql; do
  ten="$(basename "$f")"
  # Bỏ dòng chú thích trước khi tìm, để chú thích nhắc tới lệnh không bị bắt.
  than="$(sed 's/--.*//' "$f")"

  bat() {
    local mau="$1" giai_thich="$2" dong
    dong="$(printf '%s\n' "$than" | grep -inE "$mau" | head -3)"
    if [ -n "$dong" ]; then
      do_ "$ten · $giai_thich"
      printf '%s\n' "$dong" | sed 's/^/       /'
    fi
  }

  bat '\bdrop[[:space:]]+table\b'  'xóa bảng — không lùi lại được, hãy đổi tên thành _cu'
  bat '\bdrop[[:space:]]+column\b' 'xóa cột — không lùi lại được, hãy để cột đó không dùng nữa'
  bat '\bdrop[[:space:]]+schema\b' 'xóa lược đồ — không lùi lại được'
  bat '\bdrop[[:space:]]+database\b' 'xóa database'
  bat '^[[:space:]]*truncate\b'   'xóa sạch bảng'
  bat '^[[:space:]]*delete[[:space:]]+from[[:space:]]+[a-z_."]+[[:space:]]*;' \
      'delete không có where — xóa toàn bộ bảng'
  bat '^[[:space:]]*update[[:space:]]+[a-z_."]+[[:space:]]+set\b[^;]*;[[:space:]]*$' \
      'update không có where — ghi đè toàn bộ bảng'
done
[ "$loi" -eq "$truoc" ] && xanh "Không có lệnh phá hủy dữ liệu"

# ── 4 · Chạy được dưới trình chạy thật ─────────────────────────────────────
# apps/backend/src/migrate.ts gửi TOÀN BỘ file trong MỘT câu lệnh, bọc trong
# một transaction. Đó là đường mà production đi.
#
# Một số lệnh không sống được trong đường đó: lệnh gạch chéo là của psql chứ
# không phải của server; CREATE INDEX CONCURRENTLY từ chối chạy trong
# transaction; VACUUM và ALTER SYSTEM cũng vậy. Viết ra thì psql chạy ngon lành
# trên máy lập trình viên, tới production mới hỏng.
truoc="$loi"
for f in "$MIG"/*.sql; do
  ten="$(basename "$f")"
  than="$(sed 's/--.*//' "$f")"
  d="$(printf '%s\n' "$than" | grep -nE '^[[:space:]]*\\' | head -3)"
  [ -n "$d" ] && { do_ "$ten · có lệnh gạch chéo của psql, trình chạy thật không hiểu"; printf '%s\n' "$d" | sed 's/^/       /'; }
  d="$(printf '%s\n' "$than" | grep -inE '\bconcurrently\b|^[[:space:]]*vacuum\b|^[[:space:]]*alter[[:space:]]+system\b|^[[:space:]]*create[[:space:]]+database\b' | head -3)"
  [ -n "$d" ] && { do_ "$ten · có lệnh không chạy được bên trong transaction"; printf '%s\n' "$d" | sed 's/^/       /'; }
done
[ "$loi" -eq "$truoc" ] && xanh "Mọi migration chạy được dưới trình chạy thật"

# ── 5 · Migration đã chốt không được sửa ───────────────────────────────────
# Trình chạy ghi tên file đã áp vào app.schema_migrations rồi bỏ qua file nào
# đã có tên trong đó. Nên SỬA một migration đã chạy thì nó KHÔNG chạy lại:
# database giữ nguyên trạng thái cũ trong khi file trên đĩa nói chuyện khác.
# Không có gì báo, và mọi thứ vẫn chạy — cho tới lúc dựng lại database từ đầu
# thì ra một lược đồ khác hẳn cái đang có.
truoc="$loi"
moi=0
if [ -f "$CHU_KY" ]; then
  while read -r ky ten; do
    [ -n "${ten:-}" ] || continue
    if [ ! -f "$MIG/$ten" ]; then
      do_ "$ten đã bị xóa. Migration đã áp thì không được biến mất."
      continue
    fi
    nay="$(bam "$MIG/$ten")"
    if [ "$nay" != "$ky" ]; then
      do_ "$ten đã bị SỬA sau khi chốt ($ky → $nay)"
      do_ "   File này sẽ không chạy lại trên database đã áp nó."
      do_ "   Muốn thay đổi có hiệu lực thì viết migration MỚI số lớn hơn."
    fi
  done < "$CHU_KY"
  for f in "$MIG"/*.sql; do
    grep -q " $(basename "$f")\$" "$CHU_KY" || moi=$((moi + 1))
  done
  [ "$loi" -eq "$truoc" ] && xanh "Migration đã chốt còn nguyên vẹn$([ "$moi" -gt 0 ] && echo " · $moi file mới chưa chốt")"
else
  vang "Chưa có $CHU_KY. Chạy ./quy-uoc.sh --chot để tạo."
fi

echo "────────────────────────────────────────────────────────────────"
if [ "$loi" -gt 0 ]; then
  printf '\033[31m %s vi phạm quy ước migration\033[0m\n\n' "$loi"
  exit 1
fi
printf '\033[32m Mọi quy ước migration đều đạt\033[0m\n\n'
