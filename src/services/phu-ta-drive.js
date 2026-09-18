import { api } from '../local-client.js';

/**
 * Dịch vụ Kho Ảnh & Đồng bộ Lưu trữ Đám mây cho Phụ tá
 */

export async function taoThuMucDongBo(payload) {
  return await api('/media/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function layDanhSachThuMuc({ assistantCode = '', search = '', page = 1, pageSize = 50 } = {}) {
  const params = new URLSearchParams();
  if (assistantCode) params.set('assistantCode', assistantCode);
  if (search) params.set('search', search);
  if (page) params.set('page', String(page));
  if (pageSize) params.set('pageSize', String(pageSize));
  const query = params.toString() ? `?${params.toString()}` : '';
  return await api(`/media/folders${query}`);
}

export async function taiLenMediaPhuTa(payload) {
  return await api('/media/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function layMediaCuaKhach(patientCode) {
  const res = await api(`/media/patient/${encodeURIComponent(patientCode)}`);
  return res?.media || [];
}

export async function layNhatKyKiemToan({ assistantCode = '', patientCode = '', action = '', dateFrom = '', dateTo = '', page = 1, pageSize = 25 } = {}) {
  const params = new URLSearchParams();
  if (assistantCode) params.set('assistantCode', assistantCode);
  if (patientCode) params.set('patientCode', patientCode);
  if (action) params.set('action', action);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (page) params.set('page', String(page));
  if (pageSize) params.set('pageSize', String(pageSize));
  const query = params.toString() ? `?${params.toString()}` : '';
  return await api(`/media/audit-logs${query}`);
}

export async function layTrangThaiAdminDrive() {
  return await api('/media/admin/status');
}

export async function xoaMediaAnh(id) {
  return await api(`/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function capNhatMediaAnh(id, payload) {
  return await api(`/media/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function xoaThuMucPhuTa(folderId) {
  return await api(`/media/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
}

export async function layDanhSachPhuTa() {
  const res = await api('/media/assistants');
  return res?.assistants || [];
}

