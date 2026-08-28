#!/usr/bin/env bash
#
# Triển khai lên VPS production, có lưới an toàn.
#
# ─────────────────────────────────────────────────────────────────────────────
# VÌ SAO CÓ FILE NÀY
# ─────────────────────────────────────────────────────────────────────────────
#
# Trước đây việc triển khai là gõ scp bằng tay. Hai tai nạn đã xảy ra vì thế,
# và cả hai đều tránh được bằng một bước kiểm tra máy làm giúp:
#
#   1. Ghi đè app.css lên bản đang chạy mà không so mã băm trước. Trên VPS có
#      một bản app.css chưa từng được commit, và nó biến mất. Giao diện màn
#      Support PG hỏng, phải khôi phục từ thư mục sao lưu.
#
#   2. Migration 022 tham chiếu một cột không tồn tại. Nó nằm trong giao dịch
#      nên hoàn tác sạch, nhưng đó là may chứ không phải thiết kế.
#
# Nên script này bắt buộc bốn thứ, không cho bỏ qua:
#
#   · So mã băm TỪNG file trước khi ghi đè, và từ chối nếu bản trên VPS khác
#     với bản mà lần triển khai trước đã đặt lên đó. Khác nghĩa là có ai hoặc
#     cái gì đã sửa trực tiếp trên production, và ghi đè lên nó là làm mất
#     một thứ không có trong git.
#   · Sao lưu database trước, và kiểm tra file nén có đọc được không. Một file
#     sao lưu hỏng còn tệ hơn không có, vì nó tạo cảm giác an toàn giả.
#   · Chụp số liệu trước và sau, đối chiếu.
#   · Kiểm tra sức khỏe sau khi khởi động lại. Hỏng thì TỰ ĐỘNG khôi phục.
#
# ─────────────────────────────────────────────────────────────────────────────
# CÁCH DÙNG
# ─────────────────────────────────────────────────────────────────────────────
#
#   ./scripts/deploy.sh kiem-tra          xem sẽ đổi những gì, không đụng vào
#   ./scripts/deploy.sh chay              triển khai thật
#   ./scripts/deploy.sh lich-su           danh sách các lần đã triển khai
#   ./scripts/deploy.sh khoi-phuc <mã>    quay lại một lần triển khai trước
#
# Biến môi trường:
#   VPS_KEY    đường dẫn khóa SSH riêng
#   VPS_HOST   mặc định root@31.97.191.177
#
# ─────────────────────────────────────────────────────────────────────────────
# NHỮNG VIỆC SCRIPT NÀY KHÔNG BAO GIỜ LÀM
# ─────────────────────────────────────────────────────────────────────────────
# Theo đúng quy tắc 3 và 4 của dự án:
#   · không docker compose down -v, không docker volume rm
#   · không git reset --hard, không rm -rf
#   · không đọc, in, hay ghi đè .env.vps
#   · không chép đè toàn bộ thư mục, chỉ những file thuộc lần triển khai này

set -euo pipefail

# Bật globstar. Không bật thì mẫu src/**/*.js chỉ khớp file trong thư mục con,
# và mười file ở gốc src/ như utils.js hay main.js không bao giờ được so sánh
# hay triển khai. Chúng vẫn nằm im trên VPS ở bản cũ trong khi báo cáo nói
# "148 file giống hệt", tức là im lặng bỏ sót chứ không báo lỗi.
shopt -s globstar nullglob

VPS_HOST="${VPS_HOST:-root@31.97.191.177}"
VPS_KEY="${VPS_KEY:-/c/Users/thaibao/Documents/Codex/2026-08-13/https-github-com-hadessispro-clinic-hub/work/clinic-hub-vps-ed25519-v2}"
VPS_DIR="/opt/clinic-hub-5s"
URL="https://srv1892344.hstgr.cloud"

MA_LAN="$(date +%Y%m%d-%H%M%S)"
GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GOC"

# ── Những file được phép triển khai ──────────────────────────────────────────
# Danh sách trắng, không phải danh sách đen. Thêm một loại file mới thì phải
# khai ở đây, và đó là lúc để nghĩ xem nó cần khởi động lại dịch vụ nào.
#
# Mỗi dòng: <mẫu đường dẫn> <các dịch vụ cần dựng lại, cách nhau bằng dấu phẩy>
PHAM_VI=(
  "apps/finance/src/*.js|finance"
  "apps/finance/public/*|finance"
  "apps/finance/public/fonts/*|finance"
  "apps/finance/package.json|finance"
  "apps/finance/Dockerfile|finance"
  "apps/backend/src/*.ts|backend,backup-sync"
  "apps/backend/package.json|backend,backup-sync"
  "infra/postgres/migrations/*.sql|migrate"
  "deploy/Caddyfile|web"
  "docker-compose.yml|"
  "src/*.js|web"
  "src/**/*.js|web"
  "public/*|web"
  "index.html|web"
  "app.css|web"
  "vite.config.js|web"
)

xanh()  { printf '\033[36m%s\033[0m\n' "$*"; }
vang()  { printf '\033[33m%s\033[0m\n' "$*"; }
do_()   { printf '\033[31m%s\033[0m\n' "$*"; }
luc()   { printf '\033[32m%s\033[0m\n' "$*"; }

ssh_() { ssh -i "$VPS_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$VPS_HOST" "$@"; }
scp_() { scp -i "$VPS_KEY" -o BatchMode=yes -q "$@"; }

# Mã băm bỏ qua khác biệt CRLF. Working tree trên Windows dùng CRLF còn VPS
# dùng LF, nên so mã băm thô sẽ báo mọi file đều khác nhau và cảnh báo trở
# thành tiếng ồn, mà tiếng ồn thì người ta tắt đi.
bam_cuc_bo() { tr -d '\r' < "$1" 2>/dev/null | sha256sum | cut -d' ' -f1; }

# ── Liệt kê file cần triển khai ──────────────────────────────────────────────

liet_ke() {
  local mau dich
  for muc in "${PHAM_VI[@]}"; do
    mau="${muc%%|*}"
    # shellcheck disable=SC2086
    for f in $mau; do
      [ -f "$f" ] || continue
      echo "$f"
    done
  done | sort -u
}

dich_vu_cua() {
  local f="$1" mau dv
  for muc in "${PHAM_VI[@]}"; do
    mau="${muc%%|*}"; dv="${muc##*|}"
    # shellcheck disable=SC2053
    case "$f" in $mau) [ -n "$dv" ] && echo "$dv" ;; esac
  done
}

# ── So sánh cục bộ với VPS ───────────────────────────────────────────────────

so_sanh() {
  local ds_file="$1"
  xanh "So mã băm từng file với bản đang chạy trên VPS…"

  # Lấy mã băm của mọi file trên VPS trong một lần gọi, không phải mỗi file
  # một lần ssh. 100 file nghĩa là 100 lần bắt tay SSH, mất vài phút.
  local script_bam
  script_bam="cd $VPS_DIR && while read -r f; do
      if [ -f \"\$f\" ]; then
        printf '%s %s\n' \"\$(tr -d '\\r' < \"\$f\" | sha256sum | cut -d' ' -f1)\" \"\$f\"
      else
        printf 'KHONG_CO %s\n' \"\$f\"
      fi
    done"
  ssh_ "$script_bam" < "$ds_file" > "$TAM/bam_vps.txt"

  : > "$TAM/doi.txt"; : > "$TAM/giong.txt"; : > "$TAM/moi.txt"; : > "$TAM/troi.txt"
  while read -r f; do
    local bam_v bam_c bam_ghi
    bam_v="$(awk -v k="$f" '$2==k{print $1}' "$TAM/bam_vps.txt")"
    bam_c="$(bam_cuc_bo "$f")"
    bam_ghi="$(awk -v k="$f" '$2==k{print $1}' "$TAM/manifest.txt" 2>/dev/null || true)"

    if [ "$bam_v" = "KHONG_CO" ]; then
      echo "$f" >> "$TAM/moi.txt"
    elif [ "$bam_v" = "$bam_c" ]; then
      echo "$f" >> "$TAM/giong.txt"
    elif [ -n "$bam_ghi" ] && [ "$bam_v" != "$bam_ghi" ]; then
      # Bản trên VPS khác cả bản cục bộ LẪN bản mà lần trước script đặt lên.
      # Nghĩa là có ai đó sửa thẳng trên production. Đây đúng là tình huống
      # đã làm mất app.css.
      echo "$f" >> "$TAM/troi.txt"
    else
      echo "$f" >> "$TAM/doi.txt"
    fi
  done < "$ds_file"
}

# ── Chụp số liệu ─────────────────────────────────────────────────────────────

chup_so_lieu() {
  ssh_ "cd $VPS_DIR && cat > /tmp/dem.sql <<'EOS'
select 'app.records',                    count(*)::text from app.records
union all select 'marketing.leads',      count(*)::text from marketing.leads
union all select 'marketing.pg_attendance', count(*)::text from marketing.pg_attendance
union all select 'marketing.call_logs',  count(*)::text from marketing.call_logs
union all select 'finance.journal_lines', count(*)::text from finance.journal_lines
union all select 'finance.vouchers',     count(*)::text from finance.vouchers
union all select 'finance.tong_no',      coalesce(sum(debit),0)::text from finance.journal_lines
union all select 'finance.tong_co',      coalesce(sum(credit),0)::text from finance.journal_lines
union all select 'finance.users',        count(*)::text from finance.users
union all select 'so_migration',         count(*)::text from app.schema_migrations;
EOS
docker compose --env-file .env.vps cp /tmp/dem.sql postgres:/tmp/dem.sql >/dev/null 2>&1
docker compose --env-file .env.vps exec -T postgres sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAF\" \" -f /tmp/dem.sql' < /dev/null
rm -f /tmp/dem.sql" 2>/dev/null | { grep -v '^$' || true; } | sort
}

# ── Kiểm tra sức khỏe ────────────────────────────────────────────────────────
# Trả 0 nếu mọi thứ ổn. Mỗi phép thử kiểm một tầng khác nhau: Caddy còn sống,
# backend còn nói chuyện được với database, két tiền còn mở được.

kiem_tra_suc_khoe() {
  local loi=0
  local ma

  ma="$(ssh_ "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 $URL/healthz" || echo 000)"
  if [ "$ma" = "200" ]; then luc "  ✓ /healthz $ma"; else do_ "  ✗ /healthz $ma"; loi=1; fi

  ma="$(ssh_ "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 $URL/" || echo 000)"
  if [ "$ma" = "200" ]; then luc "  ✓ PWA vận hành $ma"; else do_ "  ✗ PWA vận hành $ma"; loi=1; fi

  # 401 mới là đúng: nghĩa là backend đã truy vấn database rồi từ chối. 500
  # nghĩa là nó chết trước khi kịp từ chối, và đó mới là hỏng.
  ma="$(ssh_ "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -X POST $URL/api/v2/auth/login -H 'Content-Type: application/json' -d '{\"identifier\":\"zz\",\"password\":\"zz\"}'" || echo 000)"
  if [ "$ma" = "401" ]; then luc "  ✓ API vận hành $ma"; else do_ "  ✗ API vận hành $ma, chờ 401"; loi=1; fi

  ma="$(ssh_ "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 $URL/vault/healthz" || echo 000)"
  if [ "$ma" = "200" ]; then luc "  ✓ Két kế toán $ma"; else do_ "  ✗ Két kế toán $ma"; loi=1; fi

  local khong_khoe
  khong_khoe="$(ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps ps --format '{{.Service}} {{.State}} {{.Status}}' | grep -vE 'running' || true")"
  if [ -z "$khong_khoe" ]; then
    luc "  ✓ mọi container đang chạy"
  else
    do_ "  ✗ container có vấn đề:"; echo "$khong_khoe" | sed 's/^/      /'; loi=1
  fi

  return $loi
}

# ── Khôi phục ────────────────────────────────────────────────────────────────

khoi_phuc() {
  local ma="$1"
  vang "Khôi phục về bản lưu $ma…"
  ssh_ "cd $VPS_DIR && d=.deploy-backups/$ma/files && [ -d \"\$d\" ] || { echo 'KHONG CO ban luu'; exit 1; }
        cd \"\$d\" && find . -type f | while read -r f; do
          mkdir -p \"$VPS_DIR/\$(dirname \"\$f\")\"
          cp -p \"\$f\" \"$VPS_DIR/\$f\"
          echo \"  tra lai \$f\"
        done"
  local dv
  dv="$(ssh_ "cat $VPS_DIR/.deploy-backups/$ma/dich-vu.txt 2>/dev/null" || true)"
  if [ -n "$dv" ]; then
    vang "Dựng lại và khởi động: $dv"
    ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps build $dv < /dev/null >/dev/null 2>&1; docker compose --env-file .env.vps up -d --force-recreate $dv < /dev/null" >/dev/null 2>&1 || true
    sleep 15
  fi
  xanh "Kiểm tra lại sau khi khôi phục:"
  kiem_tra_suc_khoe || do_ "Khôi phục xong nhưng vẫn chưa khỏe. Cần vào xem tay."
}

# ── Các lệnh ─────────────────────────────────────────────────────────────────

TAM="$(mktemp -d)"
trap 'rm -rf "$TAM"' EXIT

chuan_bi() {
  liet_ke > "$TAM/ds.txt"
  ssh_ "cat $VPS_DIR/.deploy-state/manifest.txt 2>/dev/null" > "$TAM/manifest.txt" || : > "$TAM/manifest.txt"
  so_sanh "$TAM/ds.txt"
}

bao_cao_so_sanh() {
  local n_doi n_moi n_giong n_troi
  n_doi=$(wc -l < "$TAM/doi.txt"); n_moi=$(wc -l < "$TAM/moi.txt")
  n_giong=$(wc -l < "$TAM/giong.txt"); n_troi=$(wc -l < "$TAM/troi.txt")
  echo
  xanh "Kết quả so sánh với bản đang chạy"
  echo "  giống hệt, sẽ không đụng tới : $n_giong file"
  echo "  sẽ cập nhật                  : $n_doi file"
  echo "  chưa có trên VPS, sẽ tạo mới : $n_moi file"
  [ "$n_troi" -gt 0 ] && do_ "  ĐÃ BỊ SỬA TRỰC TIẾP TRÊN VPS : $n_troi file"
  echo
  [ "$n_doi" -gt 0 ] && { echo "  Cập nhật:"; sed 's/^/    /' "$TAM/doi.txt"; }
  [ "$n_moi" -gt 0 ] && { echo "  Tạo mới:"; sed 's/^/    /' "$TAM/moi.txt"; }
  if [ "$n_troi" -gt 0 ]; then
    echo
    do_ "  Những file này trên VPS khác cả bản trong git lẫn bản mà lần triển"
    do_ "  khai trước đã đặt lên. Nghĩa là có ai đó sửa thẳng trên production,"
    do_ "  và ghi đè lên chúng là làm mất một thứ không có trong git."
    sed 's/^/    /' "$TAM/troi.txt"
    echo
    do_ "  Kéo bản trên VPS về xem trước rồi hãy quyết:"
    while IFS= read -r f; do
      [ -n "$f" ] && echo "    scp -i \"\$VPS_KEY\" $VPS_HOST:$VPS_DIR/$f  /tmp/$(basename "$f").vps"
    done < "$TAM/troi.txt"
  fi
}

lenh_kiem_tra() {
  xanh "═══ CHẠY THỬ · không đụng gì vào VPS ═══"
  chuan_bi
  bao_cao_so_sanh
  echo
  local dv
  dv="$(cat "$TAM/doi.txt" "$TAM/moi.txt" 2>/dev/null | while read -r f; do dich_vu_cua "$f"; done | tr ',' '\n' | sort -u | tr '\n' ' ')"
  echo "  Dịch vụ sẽ dựng lại: ${dv:-không có}"
  # grep không tìm thấy gì thì trả về 1, và set -o pipefail biến nó thành lỗi
  # làm thoát cả script trong im lặng. Một script triển khai mà nuốt lỗi thì
  # còn nguy hiểm hơn không có script.
  local mig
  mig="$(cat "$TAM/doi.txt" "$TAM/moi.txt" 2>/dev/null | grep -c 'migrations/' || true)"
  echo "  Migration mới hoặc đổi: $mig"
  echo
  xanh "Số liệu hiện tại trên production:"
  chup_so_lieu | sed 's/^/    /'
}

# Đếm số migration đã áp trên VPS. Dùng ở hai chỗ nên tách ra hàm: một lần
# ở bước quyết định có thoát sớm hay không, một lần ở bước 5.
dem_migration_da_ap() {
    ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps exec -T postgres \
        sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*) from app.schema_migrations\"' \
        < /dev/null" 2>/dev/null | tr -d '[:space:]'
  }

lenh_chay() {
  xanh "═══ TRIỂN KHAI · mã lần chạy $MA_LAN ═══"
  chuan_bi
  bao_cao_so_sanh

  if [ -s "$TAM/troi.txt" ] && [ "${DONG_Y_GHI_DE:-0}" != "1" ]; then
    echo
    do_ "DỪNG LẠI. Có file bị sửa trực tiếp trên VPS."
    do_ "Xem xong, nếu chắc chắn muốn ghi đè thì chạy lại với:"
    do_ "  DONG_Y_GHI_DE=1 ./scripts/deploy.sh chay"
    exit 2
  fi

  # Không có file nào đổi VẪN có thể còn migration chưa áp: nó đã nằm sẵn
  # trên VPS từ một lần chạy trước bị dở dang. Kiểm bất biến trước khi thoát,
  # nếu không thì lược đồ database đứng lại mãi mà không ai biết.
  if [ ! -s "$TAM/doi.txt" ] && [ ! -s "$TAM/moi.txt" ]; then
    local tren_dia_ da_ap_
    tren_dia_="$(ls infra/postgres/migrations/*.sql 2>/dev/null | wc -l | tr -d '[:space:]')"
    da_ap_="$(dem_migration_da_ap)"
    if [ -n "$da_ap_" ] && [ "$tren_dia_" -le "$da_ap_" ]; then
      luc "Không có gì để triển khai. VPS đã khớp, và mọi migration đã áp."
      exit 0
    fi
    vang "File đã khớp, nhưng còn $((tren_dia_ - ${da_ap_:-0})) migration chưa áp. Chạy tiếp."
  fi

  local dv
  dv="$(cat "$TAM/doi.txt" "$TAM/moi.txt" 2>/dev/null | while read -r f; do dich_vu_cua "$f"; done | tr ',' '\n' | sort -u | tr '\n' ' ')"

  # Chụp danh sách migration NGAY BÂY GIỜ.
  #
  # Bước 4 chép file xong sẽ so lại mã băm để chắc chắn file tới nơi đúng, và
  # lần so đó ghi đè chính doi.txt và moi.txt. Sau khi chép thành công thì mọi
  # file đều khớp nên hai danh sách rỗng, và bước 5 kết luận "không có
  # migration nào". Lỗi này đã xảy ra thật ngày 28/08/2026: migration 029 bị
  # bỏ qua trong im lặng, deploy vẫn báo xong, mà lược đồ thì chưa đổi.
  local mig_moi mig_sua
  mig_moi="$(grep 'migrations/' "$TAM/moi.txt" 2>/dev/null || true)"
  mig_sua="$(grep 'migrations/' "$TAM/doi.txt" 2>/dev/null || true)"

  echo
  xanh "1/7 · Sao lưu database"
  local file_sl="/opt/backups/pg-$MA_LAN.sql.gz"
  ssh_ "mkdir -p /opt/backups && cd $VPS_DIR && docker compose --env-file .env.vps exec -T postgres sh -c 'pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB' < /dev/null | gzip > $file_sl && gzip -t $file_sl && echo \"  ✓ \$(du -h $file_sl | cut -f1)  $file_sl\"" \
    || { do_ "Sao lưu thất bại. Dừng, không đụng gì tới production."; exit 1; }

  echo
  xanh "2/7 · Chụp số liệu trước"
  chup_so_lieu > "$TAM/truoc.txt"
  sed 's/^/    /' "$TAM/truoc.txt"

  echo
  xanh "3/7 · Lưu bản hiện tại của từng file sắp bị ghi đè"
  ssh_ "mkdir -p $VPS_DIR/.deploy-backups/$MA_LAN/files $VPS_DIR/.deploy-state" < /dev/null

  # Gửi cả danh sách sang VPS làm một lần, để chính nó tự sao lưu từng file.
  #
  # KHÔNG lặp ssh cho từng file. ssh đọc stdin, nên gọi nó bên trong vòng lặp
  # while read là nó nuốt luôn phần còn lại của danh sách: vòng đầu chạy, các
  # vòng sau không bao giờ tới. Lỗi này đã xảy ra thật ngày 28/08/2026, chỉ 1
  # trong 9 file được chép, và lưới an toàn bắt được nhờ bước so mã băm lại
  # sau khi chép. Một lần gọi cũng nhanh hơn nhiều so với chín lần bắt tay SSH.
  ssh_ "cd $VPS_DIR && while read -r f; do
          [ -n \"\$f\" ] || continue
          mkdir -p \".deploy-backups/$MA_LAN/files/\$(dirname \"\$f\")\"
          cp -p \"\$f\" \".deploy-backups/$MA_LAN/files/\$f\"
        done" < "$TAM/doi.txt"
  echo "$dv" | ssh_ "cat > $VPS_DIR/.deploy-backups/$MA_LAN/dich-vu.txt"
  echo "  ✓ đã lưu $(wc -l < "$TAM/doi.txt") file vào .deploy-backups/$MA_LAN"

  echo
  xanh "4/7 · Chép file lên"
  # Đọc danh sách vào mảng TRƯỚC khi gọi ssh hay scp. Cùng lý do với bước 3:
  # ssh đọc stdin và nuốt mất phần còn lại của danh sách nếu nó được gọi bên
  # trong một vòng lặp đang đọc từ file.
  local -a ds_chep=()
  local f
  while IFS= read -r f; do [ -n "$f" ] && ds_chep+=("$f"); done \
    < <(cat "$TAM/doi.txt" "$TAM/moi.txt")


  # Danh sách rỗng là trường hợp thật: lần chạy này chỉ còn migration chưa áp,
  # không file nào đổi. Không chốt thì printf trên mảng rỗng đẩy một dòng trống
  # sang VPS, mkdir "" báo lỗi, và set -e kết thúc script giữa chừng.
  if [ "${#ds_chep[@]}" -eq 0 ]; then
    echo "  không có file nào cần chép"
  else
    # Tạo hết thư mục cần thiết bằng một lần gọi.
    printf '%s\n' "${ds_chep[@]}" \
      | ssh_ "cd $VPS_DIR && while read -r f; do [ -n \"\$f\" ] && mkdir -p \"\$(dirname \"\$f\")\"; done"

    local n=0
    for f in "${ds_chep[@]}"; do
      scp_ "$f" "$VPS_HOST:$VPS_DIR/$f"
      n=$((n + 1))
    done
    echo "  ✓ đã chép $n trên ${#ds_chep[@]} file"
    if [ "$n" != "${#ds_chep[@]}" ]; then
      do_ "Chép thiếu file. Khôi phục."; khoi_phuc "$MA_LAN"; exit 1
    fi
  fi

  # Xác nhận từng file đã tới nơi đúng như bản cục bộ. Chép xong mà không kiểm
  # thì vẫn là tin vào may mắn.
  so_sanh "$TAM/ds.txt"
  if [ -s "$TAM/doi.txt" ]; then
    do_ "Sau khi chép vẫn còn file khác nhau. Khôi phục ngay."
    sed 's/^/    /' "$TAM/doi.txt"
    khoi_phuc "$MA_LAN"
    exit 1
  fi
  luc "  ✓ mã băm mọi file khớp với bản cục bộ"

  echo
  xanh "5/7 · Migration"

  if [ -n "$mig_sua" ]; then
    # Service migrate ghi tên file đã áp vào app.schema_migrations rồi bỏ qua
    # những file đã có tên trong đó. Nên SỬA một migration đã chạy thì nó
    # KHÔNG chạy lại: database giữ nguyên trạng thái cũ trong khi file trên
    # đĩa nói một chuyện khác. Đây là loại lệch âm thầm khó tìm nhất.
    vang "    Có migration đã từng chạy nay bị sửa nội dung:"
    echo "$mig_sua" | sed 's/^/      /'
    vang "    Những file này KHÔNG được áp lại. Muốn thay đổi có hiệu lực"
    vang "    thì viết một migration MỚI với số thứ tự lớn hơn."
  fi

  # Quyết định chạy migration dựa trên BẤT BIẾN, không dựa trên danh sách
  # file thay đổi của lần triển khai này.
  #
  # Bất biến: mọi file trong thư mục migrations đều phải có mặt trong
  # app.schema_migrations. Dựa vào danh sách file thì hỏng ở hai trường hợp
  # thật đã gặp: migration đã nằm sẵn trên VPS từ lần chạy trước mà chưa áp,
  # và migration bị bước so mã băm lần hai xóa khỏi danh sách sau khi chép
  # thành công. Cả hai lần đều báo "không có migration nào" rồi đi tiếp.
  local tren_dia da_ap
  tren_dia="$(ls infra/postgres/migrations/*.sql 2>/dev/null | wc -l | tr -d '[:space:]')"
  da_ap="$(ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps exec -T postgres \
      sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*) from app.schema_migrations\"' \
      < /dev/null" 2>/dev/null | tr -d '[:space:]')"
  echo "    trên đĩa $tren_dia · đã áp ${da_ap:-?}"

  if [ -n "$da_ap" ] && [ "$tren_dia" -gt "$da_ap" ]; then
    echo "    còn $((tren_dia - da_ap)) migration chưa áp, đang chạy…"
    ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps build migrate < /dev/null >/dev/null 2>&1 \
          && docker compose --env-file .env.vps run --rm --no-deps migrate < /dev/null 2>&1 \
             | grep -iE 'applied|error' | sed 's/^/    /'" \
      || { do_ "Migration hỏng. Database đã sao lưu ở $file_sl."; khoi_phuc "$MA_LAN"; exit 1; }

    local sau
    sau="$(ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps exec -T postgres \
        sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*) from app.schema_migrations\"' \
        < /dev/null" 2>/dev/null | tr -d '[:space:]')"
    echo "    sau khi chạy: đã áp $sau trên $tren_dia"
    if [ "${sau:-0}" != "$tren_dia" ]; then
      do_ "Vẫn còn migration chưa áp sau khi chạy. Khôi phục."
      khoi_phuc "$MA_LAN"; exit 1
    fi
  elif [ -z "$da_ap" ]; then
    do_ "    Không đọc được app.schema_migrations. Dừng để khỏi đoán mò."
    khoi_phuc "$MA_LAN"; exit 1
  else
    echo "    mọi migration trên đĩa đều đã được áp"
  fi

  # migrate là container chạy một lần rồi thoát, bước 5 đã dựng và chạy nó.
  # Đưa nó vào "up -d" ở đây là chạy migration lần thứ hai không lý do.
  dv="$(echo "$dv" | tr ' ' '
' | grep -v '^migrate$' | tr '
' ' ' || true)"
  if [ -z "${dv// /}" ]; then
    xanh "6/7 · Không dịch vụ nào cần dựng lại"
  else
    xanh "6/7 · Dựng lại và khởi động: $dv"
  fi
  if [ -n "${dv// /}" ]; then
    ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps build $dv < /dev/null 2>&1 | grep -iE 'error|Built' | sed 's/^/    /'" \
      || { do_ "Dựng ảnh hỏng. Khôi phục."; khoi_phuc "$MA_LAN"; exit 1; }
    ssh_ "cd $VPS_DIR && docker compose --env-file .env.vps up -d --force-recreate $dv < /dev/null 2>&1 | tail -3 | sed 's/^/    /'"
    echo "    chờ dịch vụ ổn định…"
    sleep 18
  fi

  echo
  xanh "7/7 · Kiểm tra sức khỏe"
  if ! kiem_tra_suc_khoe; then
    echo
    do_ "KHÔNG ĐẠT. Tự động khôi phục về bản trước."
    khoi_phuc "$MA_LAN"
    do_ "Đã khôi phục. Database chưa bị đụng tới, bản sao lưu vẫn ở $file_sl"
    exit 1
  fi

  echo
  xanh "Đối chiếu số liệu trước và sau"
  chup_so_lieu > "$TAM/sau.txt"
  local lech=0
  while read -r ten truoc; do
    local sau
    sau="$(awk -v k="$ten" '$1==k{print $2}' "$TAM/sau.txt")"
    if [ "$truoc" = "$sau" ]; then
      printf '    %-26s %s\n' "$ten" "$sau"
    elif [ "${sau:-0}" -gt "${truoc:-0}" ] 2>/dev/null; then
      printf '    %-26s %s → %s  (tăng, lưu lượng thật)\n' "$ten" "$truoc" "$sau"
    else
      do_ "$(printf '    %-26s %s → %s  GIẢM' "$ten" "$truoc" "$sau")"
      lech=1
    fi
  done < "$TAM/truoc.txt"
  if [ "$lech" = "1" ]; then
    do_ "Có số liệu GIẢM sau khi triển khai. Kiểm tra ngay."
    do_ "Bản sao lưu database: $file_sl"
  fi

  # Ghi manifest để lần sau phát hiện được ai sửa thẳng trên VPS
  awk '{print $1, $2}' "$TAM/bam_vps.txt" | ssh_ "cat > $VPS_DIR/.deploy-state/manifest.txt"
  ssh_ "cd $VPS_DIR && printf '%s\t%s\t%s\t%s\n' '$MA_LAN' \"\$(date -Iseconds)\" '$(git rev-parse --short HEAD)' '$dv' >> .deploy-state/lich-su.tsv"

  echo
  luc "═══ XONG · mã lần chạy $MA_LAN ═══"
  echo "  quay lại bản trước : ./scripts/deploy.sh khoi-phuc $MA_LAN"
  echo "  sao lưu database   : $file_sl"
}

lenh_lich_su() {
  xanh "Các lần đã triển khai"
  ssh_ "cd $VPS_DIR && [ -f .deploy-state/lich-su.tsv ] && column -t -s\$'\t' .deploy-state/lich-su.tsv || echo '  chưa có lần nào'" | sed 's/^/  /'
  echo
  xanh "Bản lưu file còn giữ trên VPS"
  ssh_ "cd $VPS_DIR && ls -1 .deploy-backups 2>/dev/null | tail -12 || echo '  chưa có'" | sed 's/^/  /'
  echo
  xanh "Bản sao lưu database"
  ssh_ "ls -1sh /opt/backups/*.sql.gz 2>/dev/null | tail -8 || echo '  chưa có'" | sed 's/^/  /'
}

case "${1:-}" in
  kiem-tra)  lenh_kiem_tra ;;
  chay)      lenh_chay ;;
  lich-su)   lenh_lich_su ;;
  khoi-phuc)
    [ -n "${2:-}" ] || { do_ "Thiếu mã lần chạy. Xem: ./scripts/deploy.sh lich-su"; exit 1; }
    khoi_phuc "$2" ;;
  *)
    cat <<'HD'
Triển khai lên VPS production, có lưới an toàn.

  ./scripts/deploy.sh kiem-tra          xem sẽ đổi những gì, không đụng vào VPS
  ./scripts/deploy.sh chay              triển khai thật
  ./scripts/deploy.sh lich-su           danh sách các lần đã triển khai
  ./scripts/deploy.sh khoi-phuc <mã>    quay lại một lần triển khai trước

Bảy bước của lệnh chay, hỏng ở bước nào cũng tự khôi phục:
  1  sao lưu database, kiểm tra file nén đọc được
  2  chụp số liệu trước
  3  lưu bản hiện tại của từng file sắp bị ghi đè
  4  chép file, rồi so lại mã băm để chắc chắn tới nơi đúng
  5  chạy migration nếu có
  6  dựng ảnh và khởi động lại đúng những dịch vụ bị ảnh hưởng
  7  kiểm tra sức khỏe, không đạt thì tự động khôi phục

Từ chối chạy nếu phát hiện file bị sửa trực tiếp trên VPS, trừ khi đặt
DONG_Y_GHI_DE=1. Đây là bước đã thiếu hôm làm mất app.css.
HD
    ;;
esac
