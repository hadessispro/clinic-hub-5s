import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

/**
 * Sao lưu một chiều PostgreSQL trên VPS sang Supabase.
 *
 * Bản trước thử lại mọi lỗi, mãi mãi, với trần chờ một giờ. Khảo sát ngày
 * 27/08/2026 cho thấy hậu quả: 1.034 bản ghi kẹt từ 11/08, bản nhiều nhất đã
 * thử 391 lần, và không lần nào có cơ hội thành công vì lỗi là "Supabase
 * thiếu cột". Thử lại một cột không tồn tại lần thứ 392 thì nó vẫn không tồn
 * tại. Tệ hơn cả sự lãng phí: mỗi lần thử lại ghi đè last_error, nên log chỉ
 * in "Processed N backup event(s)" đều đặn như thể mọi thứ đang chạy tốt,
 * trong khi tám ngày liền không có gì được sao lưu.
 *
 * Bản này phân biệt hai loại lỗi:
 *
 *   Tạm thời  mạng, quá tải, 5xx. Thử lại có ích. Chờ tăng dần, tối đa 12 lần.
 *   Vĩnh viễn thiếu cột, sai kiểu, vướng khóa ngoại. Thử lại vô ích. Đặt sang
 *             ngăn thư chết ngay lần đầu, kèm lý do.
 *
 * Bản ghi chết không mất: payload còn nguyên, đặt lại dead_at = null là chạy
 * tiếp. Xem migration 026.
 */

type JsonMap = Record<string, unknown>;
type OutboxRow = {
  id: string; entity_type: string; record_key: string;
  operation: 'upsert' | 'delete'; payload: JsonMap | null; attempts: number;
};

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl || !supabaseUrl || !supabaseKey) throw new Error('Missing PostgreSQL or Supabase backup configuration');

const postgres = new Pool({ connectionString: databaseUrl, max: 2 });
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const intervalMs = Math.max(5_000, Number(process.env.BACKUP_INTERVAL_SECONDS || 30) * 1_000);
const batchSize = Math.min(200, Math.max(1, Number(process.env.BACKUP_BATCH_SIZE || 50)));

/** Quá số này mà lỗi tạm thời vẫn chưa hết thì coi như vĩnh viễn. */
const MAX_ATTEMPTS = Math.max(3, Number(process.env.BACKUP_MAX_ATTEMPTS || 12));

/** Bao nhiêu vòng thì in một lần tóm tắt sức khỏe hàng đợi. */
const HEALTH_EVERY = Math.max(1, Number(process.env.BACKUP_HEALTH_EVERY || 20));

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

/**
 * Lỗi nào thử lại cũng không khỏi, và tên gọi dễ hiểu cho từng loại.
 * Trả về null nghĩa là lỗi tạm thời.
 */
function permanentReason(error: unknown): string | null {
  switch (errorCode(error)) {
    // PostgREST không tìm thấy cột: lược đồ Supabase đi sau VPS.
    case 'PGRST204': return 'thieu_cot';
    // PostgREST không phân tích được yêu cầu, thường do cột lạ.
    case 'PGRST100': return 'thieu_cot';
    case '42703':    return 'thieu_cot';
    case '42P01':    return 'thieu_bang';
    // Supabase khai cột là uuid, VPS gửi khóa dạng chữ.
    case '22P02':    return 'sai_kieu';
    case '23502':    return 'thieu_gia_tri_bat_buoc';
    // Xóa bản ghi còn bị bảng khác tham chiếu.
    case '23503':    return 'vuong_khoa_ngoai';
    case '23514':    return 'vi_pham_rang_buoc';
    default: break;
  }
  if (error instanceof Error && /Invalid backup table|No stable delete key/.test(error.message)) {
    return 'du_lieu_khong_dong_bo_duoc';
  }
  return null;
}

async function syncRow(row: OutboxRow) {
  const table = row.entity_type;
  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error(`Invalid backup table: ${table}`);
  if (row.operation === 'upsert') {
    const { error } = await supabase.from(table).upsert(row.payload || {});
    if (error) throw error;
    return;
  }
  const payload = row.payload || {};
  const key = payload.id ? ['id', payload.id]
    : payload.code ? ['code', payload.code]
      : payload.client_event_id ? ['client_event_id', payload.client_event_id]
        : null;
  if (!key) throw new Error(`No stable delete key for ${table}/${row.record_key}`);
  const { error } = await supabase.from(table).delete().eq(String(key[0]), key[1]);
  if (error) throw error;
}

async function drainOnce() {
  const result = await postgres.query<OutboxRow>(
    `select id::text,entity_type,record_key,operation,payload,attempts
     from app.backup_outbox
     where completed_at is null and dead_at is null and next_attempt_at<=now()
     order by id asc limit $1`, [batchSize],
  );
  let ok = 0;
  let chet = 0;
  for (const row of result.rows) {
    try {
      await syncRow(row);
      // Xóa cả dead_at: bản ghi được chạy lại sau khi sửa lược đồ thì phải
      // sạch dấu vết lần chết trước.
      await postgres.query(
        `update app.backup_outbox
            set completed_at=now(), last_error=null, dead_at=null, dead_reason=null
          where id=$1`, [row.id],
      );
      ok += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const lyDo = permanentReason(error) ?? (attempts >= MAX_ATTEMPTS ? 'qua_nhieu_lan' : null);
      if (lyDo) {
        await postgres.query(
          `update app.backup_outbox
              set attempts=$2, last_error=$3, dead_at=now(), dead_reason=$4
            where id=$1`,
          [row.id, attempts, errorMessage(error).slice(0, 1000), lyDo],
        );
        chet += 1;
        console.error(`[sao-luu] bo cuoc ${row.entity_type}/${row.record_key}: ${lyDo} · ${errorMessage(error).slice(0, 160)}`);
      } else {
        const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(attempts, 8)));
        await postgres.query(
          `update app.backup_outbox
              set attempts=$2, last_error=$3, next_attempt_at=now()+($4 || ' seconds')::interval
            where id=$1`,
          [row.id, attempts, errorMessage(error).slice(0, 1000), delaySeconds],
        );
      }
    }
  }
  return { lay: result.rowCount || 0, ok, chet };
}

/**
 * In tóm tắt sức khỏe. Một dòng đọc là biết sao lưu có thật sự chạy hay không,
 * thay vì phải suy ra từ việc log có bận rộn hay không.
 */
async function inSucKhoe() {
  try {
    const { rows } = await postgres.query(
      `select da_xong, dang_cho, da_chet, lan_dong_bo_gan_nhat
       from app.v_suc_khoe_sao_luu`,
    );
    const h = rows[0];
    if (!h) return;
    const tre = h.lan_dong_bo_gan_nhat
      ? Math.round((Date.now() - new Date(h.lan_dong_bo_gan_nhat).getTime()) / 60000)
      : null;
    const canhBao = h.da_chet > 0 ? `  ⚠ ${h.da_chet} ban ghi da chet, xem app.v_sao_luu_da_chet` : '';
    console.log(
      `[sao-luu] xong ${h.da_xong} · dang cho ${h.dang_cho} · chet ${h.da_chet}` +
      ` · dong bo gan nhat ${tre === null ? 'chua bao gio' : `${tre} phut truoc`}${canhBao}`,
    );
  } catch (error) {
    // View chưa có nghĩa là migration 026 chưa chạy. Không phải lý do để chết.
    console.error('[sao-luu] khong doc duoc suc khoe hang doi:', errorMessage(error));
  }
}

async function main() {
  console.log('PostgreSQL -> Supabase backup worker started');
  let vong = 0;
  await inSucKhoe();
  while (true) {
    try {
      const { lay, ok, chet } = await drainOnce();
      if (lay) console.log(`Processed ${lay} backup event(s): ${ok} xong, ${chet} bo cuoc`);
    } catch (error) {
      console.error('Backup cycle failed:', errorMessage(error));
    }
    vong += 1;
    if (vong % HEALTH_EVERY === 0) await inSucKhoe();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

main().finally(() => postgres.end());
