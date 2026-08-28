#!/usr/bin/env bash
#
# Báo cáo tình trạng hệ thống, in ra dạng Markdown.
#
# Dùng được hai chỗ: chạy tay ở máy để xem nhanh, và chạy trong GitHub Actions
# để đổ vào phần tóm tắt của lần chạy, nơi GitHub tự dựng bảng.
#
#   ./scripts/bao-cao-he-thong.sh                  in ra màn hình
#   ./scripts/bao-cao-he-thong.sh >> $GITHUB_STEP_SUMMARY
#
# ─────────────────────────────────────────────────────────────────────────────
# BÁO CÁO NÀY TRẢ LỜI BA CÂU
# ─────────────────────────────────────────────────────────────────────────────
#
#   Hệ thống có đang sống không    dịch vụ, độ trễ, tài nguyên
#   Luồng nghiệp vụ chạy ra sao    lead vào, PG chấm công, kế toán ghi sổ
#   Chức năng nào đang được dùng   ai mở màn nào, bao nhiêu lần
#
# Câu thứ ba là câu ít hệ thống nào trả lời được, mà lại quan trọng nhất khi
# quyết định làm tiếp cái gì. Một màn hình dựng công phu mà ba tuần không ai
# mở thì đó là công đổ đi, và chỉ số liệu mới nói ra điều đó.
#
# Nguồn: finance.access_log ghi mọi lần mở sổ kế toán, có sẵn từ đầu vì lý do
# bảo mật. Ở đây nó kiêm luôn việc đo mức sử dụng.

set -uo pipefail

VPS_HOST="${VPS_HOST:-root@31.97.191.177}"
VPS_KEY="${VPS_KEY:-/c/Users/thaibao/Documents/Codex/2026-08-13/https-github-com-hadessispro-clinic-hub/work/clinic-hub-vps-ed25519-v2}"
VPS_DIR="/opt/clinic-hub-5s"
URL="${URL:-https://srv1892344.hstgr.cloud}"

# Đếm chỗ hỏng ngay tại nơi phát hiện, thay vì bóc tách lại bảng Markdown
# để tìm dấu đỏ. Dấu đỏ còn xuất hiện ở mục đăng nhập thất bại, vốn là
# chuyện bình thường, nên đếm theo dấu là báo động nhầm.
DEM_HONG="$(mktemp)"
trap 'rm -f "$DEM_HONG"' EXIT

ssh_() { ssh -i "$VPS_KEY" -o BatchMode=yes -o ConnectTimeout=20 "$VPS_HOST" "$@"; }

# Ký tự phân tách cột.
#
# KHÔNG dùng dấu gạch chéo cộng chữ t: chuỗi đó đi qua hai lớp shell, bash rồi
# shell trên VPS, và không lớp nào diễn giải nó, nên psql nhận đúng hai ký tự
# đó làm dấu phân tách. Kết quả là mọi cột dính liền nhau và bảng Markdown
# hỏng hết mà không báo lỗi gì.
#
# Cũng KHÔNG dùng ký tự nhiều byte như ¦: IFS của bash tách theo byte, nên
# một ký tự UTF-8 hai byte làm nó tách sai mà vẫn không báo lỗi. Dùng dấu
# ngã, một byte, và không xuất hiện trong tên tài khoản hay tên đối tác.
#
# Chạy một file SQL trên VPS, trả về kết quả phân tách bằng ký tự ~.
sql() {
  local q="$1"
  printf '%s\n' "$q" | ssh_ "cat > /tmp/bc.sql
    cd $VPS_DIR
    docker compose --env-file .env.vps cp /tmp/bc.sql postgres:/tmp/bc.sql >/dev/null 2>&1
    docker compose --env-file .env.vps exec -T postgres sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tA -F\"~\" -f /tmp/bc.sql' < /dev/null
    rm -f /tmp/bc.sql" 2>/dev/null
}

echo "# Tình trạng hệ thống · $(date '+%d/%m/%Y %H:%M')"
echo

# ── 1 · Dịch vụ ──────────────────────────────────────────────────────────────

echo "## 1 · Dịch vụ"
echo
echo "| Dịch vụ | Trạng thái | Chạy được bao lâu |"
echo "|---|---|---|"
ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps ps --format '{{.Service}}|{{.State}}|{{.Status}}'" 2>/dev/null \
  | while IFS='|' read -r ten tt lau; do
      [ -n "$ten" ] || continue
      if [ "$tt" = "running" ]; then dau="🟢"; else dau="🔴"; echo x >> "$DEM_HONG"; fi
      echo "| $dau \`$ten\` | $tt | ${lau#Up } |"
    done
echo

echo "### Đường vào và độ trễ"
echo
echo "| Đường | Mã trả về | Mong đợi | Độ trễ |"
echo "|---|---|---|---|"
kiem() {
  local ten="$1" duong="$2" mong="$3" them="${4:-}"
  local kq ma tre
  # shellcheck disable=SC2086
  kq="$(ssh_ "curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 15 $them '$URL$duong'" 2>/dev/null || echo "000 0")"
  ma="${kq%% *}"; tre="${kq##* }"
  local dau="🟢"; [ "$ma" = "$mong" ] || { dau="🔴"; echo x >> "$DEM_HONG"; }
  printf '| %s `%s` | %s | %s | %ss |\n' "$dau" "$ten" "$ma" "$mong" "$tre"
}
kiem "/healthz"        "/healthz"        200
kiem "/ · PWA vận hành" "/"              200
kiem "/vault/ · Két kế toán" "/vault/"   200
kiem "/vault/healthz"  "/vault/healthz"  200
kiem "/api/v2/auth/login" "/api/v2/auth/login" 401 "-X POST -H 'Content-Type: application/json' -d '{\"identifier\":\"x\",\"password\":\"x\"}'"
echo

# ── 2 · Tài nguyên ───────────────────────────────────────────────────────────

echo "## 2 · Tài nguyên máy chủ"
echo
ssh_ "
  printf '| Chỉ số | Giá trị |\n|---|---|\n'
  printf '| CPU | %s luồng, tải %s |\n' \"\$(nproc)\" \"\$(uptime | sed 's/.*load average: //' | cut -d, -f1)\"
  free -m | awk '/Mem:/{printf \"| RAM | %d MB dùng trên %d MB, còn trống %d MB |\n\",\$3,\$2,\$7}'
  df -h /opt | tail -1 | awk '{printf \"| Đĩa | %s dùng trên %s (%s) |\n\",\$3,\$2,\$5}'
  printf '| Chạy liên tục | %s |\n' \"\$(uptime -p)\"
" 2>/dev/null
echo

echo "### Bộ nhớ từng container"
echo
echo "| Container | CPU | RAM |"
echo "|---|---|---|"
ssh_ "docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'" 2>/dev/null \
  | sed 's/clinic-hub-5s-//' \
  | while IFS='|' read -r a b c; do [ -n "$a" ] && echo "| \`$a\` | $b | ${c%% /*} |"; done
echo

# ── 3 · Luồng nghiệp vụ ──────────────────────────────────────────────────────

echo "## 3 · Luồng nghiệp vụ · bảy ngày gần nhất"
echo
echo "Đây là nhịp sống thật của hệ thống. Một cột về 0 nghĩa là luồng đó đứng,"
echo "và đứng thì phải biết ngay chứ không đợi ai báo."
echo
echo "| Ngày | Lead mới | Chấm công PG | Cuộc gọi | Bút toán |"
echo "|---|---:|---:|---:|---:|"
sql "
with ngay as (select generate_series(current_date - 6, current_date, '1 day')::date d)
select to_char(n.d, 'DD/MM'),
       (select count(*) from marketing.leads          where created_at::date = n.d),
       (select count(*) from marketing.pg_attendance  where created_at::date = n.d),
       (select count(*) from marketing.call_logs      where created_at::date = n.d),
       (select count(*) from finance.journal_lines    where created_at::date = n.d)
from ngay n order by n.d;" \
  | while IFS="~" read -r d a b c e; do
      [ -n "$d" ] && echo "| $d | $a | $b | $c | $e |"
    done
echo

echo "### Tổng tích lũy"
echo
echo "| Bảng | Số dòng |"
echo "|---|---:|"
sql "
select 'Lead marketing',        to_char(count(*), 'FM999,999,999') from marketing.leads
union all select 'Chấm công PG',        to_char(count(*), 'FM999,999,999') from marketing.pg_attendance
union all select 'Bản ghi vận hành',    to_char(count(*), 'FM999,999,999') from app.records
union all select 'Bút toán kế toán',    to_char(count(*), 'FM999,999,999') from finance.journal_lines
union all select 'Chứng từ kế toán',    to_char(count(*), 'FM999,999,999') from finance.vouchers
union all select 'Đối tượng công nợ',   to_char(count(*), 'FM999,999,999') from finance.partners;" \
  | while IFS="~" read -r a b; do [ -n "$a" ] && echo "| $a | $b |"; done
echo

echo "### Bất biến kế toán"
echo
sql "
select case when abs(sum(debit) - sum(credit)) < 0.005
            then '🟢 **Sổ cân.** Tổng Nợ bằng tổng Có: ' || to_char(sum(debit), 'FM999,999,999,999') || ' đồng.'
            else '🔴 **SỔ LỆCH ' || to_char(sum(debit) - sum(credit), 'FM999,999,999,999') || ' đồng.** Cần xử lý ngay.'
       end
from finance.journal_lines;"
echo

# ── 4 · Biên độ hiệu quả từng chức năng ──────────────────────────────────────

echo "## 4 · Chức năng nào đang được dùng"
echo
echo "Lấy từ \`finance.access_log\`, bảng vốn có để truy vết bảo mật. Cột số lần"
echo "cho biết màn nào thật sự được dùng, và màn nào dựng ra rồi bỏ đó."
echo
echo "| Chức năng | Số lần mở | Người dùng | Lần gần nhất |"
echo "|---|---:|---:|---|"
sql "
select action,
       count(*),
       count(distinct actor),
       to_char(max(at) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
from finance.access_log
where action not like 'dang_nhap%'
group by action order by count(*) desc limit 25;" \
  | while IFS="~" read -r a b c d; do [ -n "$a" ] && echo "| \`$a\` | $b | $c | $d |"; done
echo

echo "### Đăng nhập két kế toán"
echo
echo "| Loại | Số lần | Lần gần nhất |"
echo "|---|---:|---|"
sql "
select case action when 'dang_nhap' then '🟢 Thành công' else '🔴 ' || action end,
       count(*),
       to_char(max(at) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
from finance.access_log where action like 'dang_nhap%'
group by action order by count(*) desc;" \
  | while IFS="~" read -r a b c; do [ -n "$a" ] && echo "| $a | $b | $c |"; done
echo

# ── 5 · Những chỗ đang hỏng ──────────────────────────────────────────────────

echo "## 5 · Những chỗ đang hỏng"
echo
echo "### Hàng đợi sao lưu sang Supabase"
echo
sql "
select '| Đã xong | ' || da_xong || ' |' from app.v_suc_khoe_sao_luu
union all select '| Đang chờ | ' || dang_cho || ' |' from app.v_suc_khoe_sao_luu
union all select '| Đã bỏ cuộc | ' || da_chet || ' |' from app.v_suc_khoe_sao_luu
union all select '| Đồng bộ gần nhất | ' ||
  coalesce(to_char(lan_dong_bo_gan_nhat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI'), 'chưa bao giờ') || ' |'
from app.v_suc_khoe_sao_luu;" | sed '1i | Chỉ số | Số lượng |\n|---|---:|'
echo
# Không dựng chuỗi Markdown bên trong SQL. Dấu huyền ngược trong đó bị bash
# hiểu là thay thế lệnh, nên cột đầu tiên biến mất và giữa báo cáo mọc ra
# một dòng "command not found". Dựng bảng ở phía bash, nơi kiểm soát được.
echo "| Bảng | Nguyên nhân | Chi tiết | Số bản ghi |"
echo "|---|---|---|---:|"
sql "
select bang, nguyen_nhan, coalesce(chi_tiet,''), so_ban_ghi
from app.v_sao_luu_da_chet order by so_ban_ghi desc limit 10;" \
  | while IFS="~" read -r a b c e; do
      [ -n "$a" ] && printf '| `%s` | %s | %s | %s |\n' "$a" "$b" "$c" "$e"
    done
echo

echo "### Lỗi ứng dụng chưa xử lý"
echo
sql "
select coalesce(payload->>'level','không rõ'), count(*),
       to_char(max((payload->>'created_at')::timestamptz) at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
from app.records
where entity_type = 'system_error_logs' and deleted_at is null
  and coalesce((payload->>'resolved')::boolean, false) = false
group by 1 order by 2 desc limit 8;" \
  | while IFS="~" read -r a b c; do [ -n "$a" ] && echo "| $a | $b | $c |"; done \
  | sed '1i | Mức độ | Số lỗi | Gần nhất |\n|---|---:|---|'
echo

# ── 6 · Triển khai và sao lưu ────────────────────────────────────────────────

echo "## 6 · Triển khai và sao lưu"
echo
echo "### Năm lần triển khai gần nhất"
echo
echo "| Mã lần chạy | Thời điểm | Commit | Dịch vụ |"
echo "|---|---|---|---|"
# File này là TSV thật trên đĩa nên tách bằng tab, khác ký tự của sql().
ssh_ "cd $VPS_DIR && tail -5 .deploy-state/lich-su.tsv 2>/dev/null || true" \
  | while IFS=$'	' read -r a b c d; do [ -n "$a" ] && echo "| \`$a\` | $b | \`$c\` | ${d:-—} |"; done
echo
echo "> Quay lại một bản: chạy workflow **Khôi phục** và điền mã lần chạy."
echo

echo "### Sao lưu database gần nhất"
echo
echo "| File | Kích thước | Thời điểm |"
echo "|---|---:|---|"
ssh_ "ls -lht --time-style=+'%d/%m/%Y %H:%M' /opt/backups/*.sql.gz 2>/dev/null | head -5 | awk '{printf \"| %s | %s | %s %s |\n\", \$NF, \$5, \$6, \$7}'" 2>/dev/null \
  | sed 's#/opt/backups/##'
echo

echo "---"
echo
echo
# Dòng dành cho máy. Workflow theo-doi.yml đọc đúng dòng này để quyết định
# có báo động hay không, thay vì đoán ý từ bảng Markdown bên trên.
so_hong="$(wc -l < "$DEM_HONG" | tr -d "[:space:]")"
lead_hom_qua="$(sql "select count(*) from marketing.leads where created_at::date = current_date - 1;" | tr -d "[:space:]")"
so_can="$(sql "select case when abs(sum(debit)-sum(credit)) < 0.005 then 1 else 0 end from finance.journal_lines;" | tr -d "[:space:]")"
chet="$(sql "select da_chet from app.v_suc_khoe_sao_luu;" | tr -d "[:space:]")"
printf '<!-- MAY-DOC dich_vu_hong=%s lead_hom_qua=%s so_can=%s sao_luu_chet=%s -->\n' \
  "${so_hong:-0}" "${lead_hom_qua:-0}" "${so_can:-0}" "${chet:-0}"

echo "_Báo cáo sinh bởi \`scripts/bao-cao-he-thong.sh\`._"
