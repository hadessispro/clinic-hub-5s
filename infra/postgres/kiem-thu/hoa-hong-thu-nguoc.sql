-- Thử ngược bốn chốt chặn của hoa hồng PG/SUP.
--
-- Mỗi chốt chặn được cố tình vi phạm, và phép thử ĐÒI database từ chối. Một
-- ràng buộc chưa từng bị thử là một ràng buộc không ai biết còn sống hay
-- không — nó có thể đã chết từ lâu vì một migration sau đó, và mọi thứ vẫn
-- xanh cho tới ngày trả nhầm tiền.
--
-- Chạy sau khi áp toàn bộ migration. Tự dọn sạch dữ liệu thử ở cuối.

\set ON_ERROR_STOP on
\pset pager off

create temp table kq (stt int, ten text, dat boolean, chi_tiet text);

do $thu$
declare
  dot1 uuid; dot2 uuid; lead1 uuid; ok boolean;
begin
  -- Dữ liệu nền
  -- Có lịch hẹn để chạy được cả trên lược đồ trước migration 031, khi
  -- leads_check còn bắt buộc lịch hẹn. Phép thử không nên phụ thuộc vào việc
  -- ràng buộc kia đã được hợp nhất hay chưa.
  insert into marketing.leads (id, customer_name, phone, data_class, net_level,
                               created_by_pg_code, appointment_at,
                               pg_arrival_confirmed_at, pg_arrival_date, pg_commission_status)
    values (gen_random_uuid(), 'Khách thử hoa hồng', '0901234567', 'net', 'basic',
            'PG-THU', now() - interval '5 days', now(), current_date, 'eligible')
    returning id into lead1;

  insert into marketing.hoa_hong_dot (ky_code, ky_tu, ky_den, tinh_boi)
    values ('1999-01', '1999-01-01', '1999-01-31', 'ci') returning id into dot1;

  ------------------------------------------------------------------ 1
  -- Không được nhảy từ "chờ SUP" thẳng sang "đã chốt".
  begin
    update marketing.hoa_hong_dot set trang_thai = 'da_chot' where id = dot1;
    ok := false;
  exception when others then ok := true;
  end;
  insert into kq values (1, 'Chặn nhảy thẳng từ chờ SUP sang đã chốt', ok, null);

  ------------------------------------------------------------------ 2
  -- Một người không được ký cả hai vòng duyệt.
  update marketing.hoa_hong_dot
     set trang_thai = 'cho_admin', sup_luc = now(), sup_boi = 'NGUOI-A' where id = dot1;
  begin
    update marketing.hoa_hong_dot
       set trang_thai = 'admin_da_duyet', admin_luc = now(), admin_boi = 'nguoi-a'
     where id = dot1;
    ok := false;
  exception when others then ok := true;
  end;
  insert into kq values (2, 'Chặn một người ký cả hai vòng duyệt', ok, null);

  ------------------------------------------------------------------ 3
  -- Một lead không được sinh hoa hồng hai lần cho cùng vai trò, kể cả ở hai
  -- đợt khác nhau. Đây là kiểu trùng dễ xảy ra nhất: tính lại kỳ cũ.
  insert into marketing.hoa_hong_dong
    (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien, anh_pg_ma)
    values (dot1, lead1, 'DVCB', 'pg', 'PG-THU', 7000, 7000, 'PG-THU');

  insert into marketing.hoa_hong_dot (ky_code, ky_tu, ky_den, tinh_boi)
    values ('1999-02', '1999-02-01', '1999-02-28', 'ci') returning id into dot2;
  begin
    insert into marketing.hoa_hong_dong
      (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien, anh_pg_ma)
      values (dot2, lead1, 'DVCB', 'pg', 'PG-THU', 7000, 7000, 'PG-THU');
    ok := false;
  exception when unique_violation then ok := true;
  end;
  insert into kq values (3, 'Chặn trả trùng một lead qua hai đợt khác nhau', ok, null);

  ------------------------------------------------------------------ 4
  -- Đợt đã chốt thì đóng băng: không thêm sửa xóa dòng được nữa.
  update marketing.hoa_hong_dot
     set trang_thai = 'admin_da_duyet', admin_luc = now(), admin_boi = 'NGUOI-B' where id = dot1;
  update marketing.hoa_hong_dot
     set trang_thai = 'da_chot', chot_luc = now(), chot_boi = 'NGUOI-B' where id = dot1;
  begin
    update marketing.hoa_hong_dong set so_tien = 999999 where dot_id = dot1;
    ok := false;
  exception when others then ok := true;
  end;
  insert into kq values (4, 'Chặn sửa dòng sau khi đợt đã chốt', ok, null);

  ------------------------------------------------------------------ 5
  -- Biểu giá phải chia đủ: phần PG cộng phần SUP bằng đúng tổng.
  begin
    insert into marketing.hoa_hong_bieu_gia
      (ma, ten, net_level, tong_hoa_hong, don_gia_pg, don_gia_sup, hieu_luc_tu)
      values ('THU', 'Sai tổng', 'basic', 10000, 7000, 5000, '1999-01-01');
    ok := false;
  exception when check_violation then ok := true;
  end;
  insert into kq values (5, 'Chặn biểu giá chia không đủ tổng', ok, null);

  ------------------------------------------------------------------ 6
  -- Nhật ký duyệt không được sửa.
  insert into marketing.hoa_hong_nhat_ky (dot_id, den_trang_thai, boi)
    values (dot2, 'cho_sup', 'ci');
  begin
    update marketing.hoa_hong_nhat_ky set boi = 'nguoi khac' where dot_id = dot2;
    ok := false;
  exception when others then ok := true;
  end;
  insert into kq values (6, 'Chặn sửa nhật ký duyệt', ok, null);

  ------------------------------------------------------------------ 7
  -- Một kỳ chỉ có một đợt còn sống.
  begin
    insert into marketing.hoa_hong_dot (ky_code, ky_tu, ky_den, tinh_boi)
      values ('1999-02', '1999-02-01', '1999-02-28', 'ci');
    ok := false;
  exception when unique_violation then ok := true;
  end;
  insert into kq values (7, 'Chặn hai đợt còn sống trong cùng một kỳ', ok, null);

  ------------------------------------------------------------------ 8
  -- Từ chối một đợt thì các dòng của nó được đánh dấu huỷ, để lead được tính
  -- lại ở đợt sau thay vì kẹt vĩnh viễn không ai trả.
  insert into marketing.hoa_hong_dong
    (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien, anh_pg_ma)
    values (dot2, lead1, 'DVCB', 'sup', 'SUP-THU', 3000, 3000, 'PG-THU');
  update marketing.hoa_hong_dot
     set trang_thai = 'tu_choi', tu_choi_luc = now(), tu_choi_boi = 'ci',
         tu_choi_ly_do = 'thử' where id = dot2;
  select count(*) >= 1 into ok from marketing.hoa_hong_dong
   where dot_id = dot2 and huy;
  insert into kq values (8, 'Từ chối đợt thì huỷ dòng để lead được tính lại', ok, null);

  ------------------------------------------------------------------ 9
  -- Dòng không tính tiền phải mang số tiền bằng 0. Ghi dòng bị loại mà vẫn
  -- để nguyên đơn giá vào cột thành tiền là cách tạo ra một tờ trình duyệt
  -- cộng ra số lớn hơn số thật sự chi.
  begin
    insert into marketing.hoa_hong_dong
      (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien,
       tinh_tien, ly_do_loai, anh_pg_ma)
      values (dot2, lead1, 'DVCB', 'pg', 'PG-THU', 7000, 7000,
              false, 'quá hạn', 'PG-THU');
    ok := false;
  exception when check_violation then ok := true;
  end;
  insert into kq values (9, 'Chặn dòng bị loại mà vẫn mang số tiền', ok, null);

  ------------------------------------------------------------------ 10
  -- Lead bị loại vì quá hạn KHÔNG được khoá vĩnh viễn. SUP sửa lại ngày khách
  -- đến thì kỳ sau nó phải vào được. Chỉ số chống trả trùng chỉ phủ dòng thật
  -- sự tính tiền, nên dòng bị loại không chiếm chỗ.
  insert into marketing.hoa_hong_dong
    (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien,
     tinh_tien, ly_do_loai, anh_pg_ma)
    values (dot2, lead1, 'DVCS', 'sup', 'SUP-THU', 90000, 0,
            false, 'quá hạn 3 ngày', 'PG-THU');
  begin
    insert into marketing.hoa_hong_dong
      (dot_id, lead_id, loai, vai_tro, nguoi_ma, don_gia, so_tien, anh_pg_ma)
      values (dot2, lead1, 'DVCS', 'sup', 'SUP-THU', 90000, 90000, 'PG-THU');
    ok := true;
  exception when others then ok := false;
  end;
  insert into kq values (10, 'Lead bị loại vẫn tính lại được ở đợt sau', ok, null);

  ------------------------------------------------------------------ dọn
  -- Không xoá dòng của dot1 bằng lệnh thường: nó đã chốt và trigger đóng băng
  -- chặn lại, đúng như phép thử số 4 vừa chứng minh. Xoá đợt thì khoá ngoại
  -- cascade dọn giúp, và trigger bỏ qua vì lúc đó đợt cha đã biến mất.
  -- dot1 đã chốt nên không xoá được, đúng thiết kế. Đưa nó về từ chối thì
  -- cũng không được, vì đã chốt là đóng băng. Nên phép thử tự gỡ chốt chặn
  -- trong đúng giao dịch này rồi dọn, thay vì để lại rác.
  delete from marketing.hoa_hong_dong where dot_id = dot2;
  alter table marketing.hoa_hong_dot disable trigger hoa_hong_dot_chan_xoa;
  alter table marketing.hoa_hong_dong disable trigger hoa_hong_dong_guard;
  delete from marketing.hoa_hong_dot where id in (dot1, dot2);
  alter table marketing.hoa_hong_dot enable trigger hoa_hong_dot_chan_xoa;
  alter table marketing.hoa_hong_dong enable trigger hoa_hong_dong_guard;
  delete from marketing.leads where id = lead1;
exception when others then
  insert into kq values (99, 'Phép thử tự nó hỏng: ' || sqlerrm, false, null);
end
$thu$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo ' THỬ NGƯỢC CHỐT CHẶN HOA HỒNG'
\echo '════════════════════════════════════════════════════════════════'

select lpad(stt::text, 2) as "#",
       case when dat then 'ĐẠT' else 'HỎNG' end as "kết quả",
       ten as "chốt chặn"
  from kq order by stt;

do $$
declare n int;
begin
  select count(*) into n from kq where not dat;
  if n > 0 then raise exception 'HONG: % chốt chặn hoa hồng không hoạt động', n; end if;
  raise notice 'Cả % chốt chặn hoa hồng đều chặn được', (select count(*) from kq);
end $$;

drop table kq;
