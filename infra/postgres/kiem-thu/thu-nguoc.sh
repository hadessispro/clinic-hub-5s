#!/usr/bin/env bash
# Chứng minh bộ bất biến thật sự bắt được lỗi.
#
# Một phép thử chỉ từng nhìn thấy dữ liệu sạch là một phép thử có thể đã hỏng
# từ lâu mà không ai biết. Nó xanh mọi lần chạy, và nó cũng sẽ xanh đúng cái
# ngày sổ sách lệch thật. Cách duy nhất để tin nó là bắt nó thất bại theo yêu
# cầu.
#
# Với mỗi loại sai: cố tình gây ra, chạy bộ bất biến, đòi nó ĐỎ và đỏ đúng chỗ,
# rồi hoàn tác và đòi nó XANH lại. Sai chỗ nào cũng là hỏng — không bắt được là
# hỏng, mà bắt nhầm sang bất biến khác cũng là hỏng.
#
#   ./thu-nguoc.sh            dùng biến môi trường PG* sẵn có
#
set -u

THU_MUC="$(cd "$(dirname "$0")" && pwd)"
BAT_BIEN="$THU_MUC/bat-bien-du-lieu.sql"

psql_() { psql -v ON_ERROR_STOP=1 -q -t -A "$@"; }

xanh() { printf '\033[32m%s\033[0m\n' "$1"; }
do_()  { printf '\033[31m%s\033[0m\n' "$1"; }

dat=0
truot=0

# chay_bat_bien → in ra danh sách số hiệu bất biến bị hỏng, rỗng nếu sạch
chay_bat_bien() {
  psql -v ON_ERROR_STOP=1 -q -f "$BAT_BIEN" 2>&1 \
    | grep -oE '^ *[0-9]+ *\| *HỎNG' \
    | grep -oE '[0-9]+' \
    | tr '\n' ' '
}

# thu <số hiệu mong đợi> <tên> <SQL gây lỗi> <SQL hoàn tác>
thu() {
  local mong="$1" ten="$2" pha="$3" va="$4" thay

  if ! psql_ -c "$pha" >/dev/null 2>&1; then
    do_ "  ✗ $ten — không gây được lỗi để thử (SQL chèn hỏng)"
    truot=$((truot + 1)); return
  fi

  thay="$(chay_bat_bien)"

  if ! psql_ -c "$va" >/dev/null 2>&1; then
    do_ "  ✗ $ten — KHÔNG HOÀN TÁC ĐƯỢC, dữ liệu thử còn sót lại"
    truot=$((truot + 1)); return
  fi

  case " $thay " in
    *" $mong "*)
      xanh "  ✓ $ten — bất biến $mong bắt được"
      dat=$((dat + 1)) ;;
    "  ")
      do_ "  ✗ $ten — gây lỗi rồi mà mọi bất biến vẫn báo đạt"
      truot=$((truot + 1)) ;;
    *)
      do_ "  ✗ $ten — mong bất biến $mong, nhưng đỏ ở [$thay]"
      truot=$((truot + 1)) ;;
  esac
}

echo
echo "════════════════════════════════════════════════════════════════"
echo " THỬ NGƯỢC · cố tình làm sai để xem bộ kiểm có bắt không"
echo "════════════════════════════════════════════════════════════════"
echo

# Phải sạch trước đã. Không sạch thì mọi kết quả bên dưới đều vô nghĩa, vì
# không phân biệt được lỗi mình vừa gây với lỗi đã có sẵn.
truoc="$(chay_bat_bien)"
if [ -n "$truoc" ]; then
  do_ "Dữ liệu chưa sạch trước khi thử: bất biến [$truoc] đang đỏ."
  do_ "Phải sửa hết rồi mới thử ngược được."
  exit 1
fi
xanh "Điểm xuất phát sạch, cả 12 bất biến đều đạt."
echo

thu 1 "Sổ lệch Nợ Có" \
  "insert into finance.journal_lines(voucher_id, line_no, account_code, debit)
     select id, 99, '111', 7 from finance.vouchers where voucher_no = 'CI-2601-01'" \
  "delete from finance.journal_lines where line_no = 99"

thu 3 "Tài khoản đối ứng không tồn tại" \
  "update finance.journal_lines set contra_account_code = '64229'
    where line_no = 1 and voucher_id =
      (select id from finance.vouchers where voucher_no = 'CI-2601-01')" \
  "update finance.journal_lines set contra_account_code = '111'
    where line_no = 1 and voucher_id =
      (select id from finance.vouchers where voucher_no = 'CI-2601-01')"

thu 4 "Ngày chứng từ rơi ra ngoài kỳ" \
  "update finance.vouchers set posting_date = '2026-03-15'
    where voucher_no = 'CI-2601-03'" \
  "update finance.vouchers set posting_date = '2026-01-31'
    where voucher_no = 'CI-2601-03'"

thu 5 "Chứng từ không có dòng nào" \
  "insert into finance.vouchers(voucher_no, posting_date, period_code)
     values ('CI-RONG', '2026-01-10', '2026-01')" \
  "delete from finance.vouchers where voucher_no = 'CI-RONG'"

thu 6 "Dòng không ghi vế nào" \
  "insert into finance.journal_lines(voucher_id, line_no, account_code, debit, credit)
     select id, 98, '111', 0, 0 from finance.vouchers where voucher_no = 'CI-2601-01'" \
  "delete from finance.journal_lines where line_no = 98"

thu 7 "Trùng số dòng trong một chứng từ" \
  "insert into finance.journal_lines(voucher_id, line_no, account_code, debit, credit)
     select id, 1, '111', 0, 0 from finance.vouchers where voucher_no = 'CI-2601-02'" \
  "delete from finance.journal_lines
    where line_no = 1 and debit = 0 and credit = 0 and voucher_id =
      (select id from finance.vouchers where voucher_no = 'CI-2601-02')"

thu 8 "Số dư đầu kỳ lệch" \
  "update finance.opening_balances set debit = debit + 1000
    where account_code = '111' and period_code = '2026-01'" \
  "update finance.opening_balances set debit = debit - 1000
    where account_code = '111' and period_code = '2026-01'"

thu 9 "Ghi thêm vào kỳ đã khóa" \
  "insert into finance.vouchers(voucher_no, posting_date, period_code, description, created_at)
     values ('CI-MUON', '2025-12-28', '2025-12', 'ghi sau khi khóa', now())" \
  "delete from finance.vouchers where voucher_no = 'CI-MUON'"

thu 10 "Hai kỳ chồng lấn nhau" \
  "insert into finance.periods(code, start_date, end_date)
     values ('2026-01b', '2026-01-15', '2026-02-15')" \
  "delete from finance.periods where code = '2026-01b'"

thu 11 "Cây tài khoản có vòng lặp" \
  "update finance.accounts set parent_code = '6422' where code = '642'" \
  "update finance.accounts set parent_code = null where code = '642'"

thu 12 "Độ sâu tài khoản khai sai" \
  "update finance.accounts set depth = 5 where code = '6421'" \
  "update finance.accounts set depth = 2 where code = '6421'"

# Kết thúc phải sạch lại. Nếu không thì có phép thử hoàn tác không hết, và
# những phép thử chạy sau nó đã chạy trên nền bẩn.
echo
sau="$(chay_bat_bien)"
if [ -n "$sau" ]; then
  do_ "Sau khi thử xong dữ liệu không sạch lại: bất biến [$sau] còn đỏ."
  exit 1
fi

echo "────────────────────────────────────────────────────────────────"
if [ "$truot" -gt 0 ]; then
  do_ " $truot phép thử ngược THẤT BẠI · $dat đạt"
  do_ " Bộ bất biến không đáng tin cho tới khi sửa xong."
  exit 1
fi
xanh " Cả $dat phép thử ngược đều đạt. Bộ bất biến bắt được lỗi thật."
echo
