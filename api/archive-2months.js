import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || '');
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    return res.status(503).json({ error: 'Database service is not configured' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    // 60 days ago cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    const cutoffISO = cutoffDate.toISOString();

    // 1. Fetch leave requests older than 60 days
    const { data: oldLeaves, error: leaveErr } = await admin
      .from('leave_requests')
      .select('*')
      .lt('created_at', cutoffISO);

    if (leaveErr) throw leaveErr;

    // 2. Fetch attendance records older than 60 days
    const { data: oldAttendance, error: attErr } = await admin
      .from('attendance_records')
      .select('*')
      .lt('created_at', cutoffISO);

    if (attErr) throw attErr;

    const totalLeavesCount = oldLeaves?.length || 0;
    const totalAttendanceCount = oldAttendance?.length || 0;

    if (totalLeavesCount === 0 && totalAttendanceCount === 0) {
      return res.status(200).json({
        success: true,
        archivedLeaves: 0,
        archivedAttendance: 0,
        purged: false,
        message: 'Hiện chưa có dữ liệu đơn từ hoặc chấm công nào vượt quá 60 ngày (2 tháng) để lưu trữ.',
      });
    }

    // Fetch employee names mapping
    const { data: employees } = await admin.from('employees').select('code,full_name,department');
    const empMap = Object.fromEntries((employees || []).map(e => [e.code, e]));

    // Format archive summary payload for Google Drive / Sheets Outbox
    const archivePayload = {
      archive_date: new Date().toISOString(),
      cutoff_date: cutoffISO,
      total_leaves: totalLeavesCount,
      total_attendance: totalAttendanceCount,
      leave_records: (oldLeaves || []).map(item => ({
        id: item.id,
        employee_code: item.employee_code,
        employee_name: empMap[item.employee_code]?.full_name || item.employee_code,
        department: empMap[item.employee_code]?.department || '',
        type: item.request_type,
        from_date: item.from_date,
        to_date: item.to_date,
        reason: item.reason,
        status: item.status,
        reviewer_code: item.reviewer_code,
        created_at: item.created_at,
      })),
      attendance_records: (oldAttendance || []).map(item => ({
        id: item.id,
        employee_code: item.employee_code,
        employee_name: empMap[item.employee_code]?.full_name || item.employee_code,
        type: item.type,
        time: item.timestamp || item.created_at,
        branch_id: item.branch_id,
        verified_by_gps: item.gps_verified || true,
      })),
    };

    // Queue archive summary in integration_outbox for Google Drive Export
    await admin.from('integration_outbox').insert({
      entity_type: 'archive_2months_excel',
      entity_id: `archive_${Date.now()}`,
      status: 'pending',
      payload: archivePayload,
      attempts: 0,
    });

    // 3. Purge (hard delete) records older than 60 days from main database
    let leavesPurged = false;
    let attPurged = false;

    if (totalLeavesCount > 0) {
      const { error: delLeaveErr } = await admin
        .from('leave_requests')
        .delete()
        .lt('created_at', cutoffISO);
      if (!delLeaveErr) leavesPurged = true;
    }

    if (totalAttendanceCount > 0) {
      const { error: delAttErr } = await admin
        .from('attendance_records')
        .delete()
        .lt('created_at', cutoffISO);
      if (!delAttErr) attPurged = true;
    }

    return res.status(200).json({
      success: true,
      archivedLeaves: totalLeavesCount,
      archivedAttendance: totalAttendanceCount,
      purged: leavesPurged || attPurged,
      message: `Đã đóng gói ${totalLeavesCount} đơn từ & ${totalAttendanceCount} bản ghi chấm công > 60 ngày sang Google Drive và dọn dẹp cơ sở dữ liệu.`,
    });
  } catch (err) {
    console.error('[Archive 2 Months API Error]:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}
