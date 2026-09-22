import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { AuthGuard, AuthService, AuthUser } from './auth';
import { GoogleDriveService } from './google-drive.service';
import { InfrastructureService } from './infrastructure';
import { TelegramService } from './telegram';

type UploadFilePayload = {
  name: string;
  type: string;
  data: string; // base64
};

@Controller('/api/v2/media')
export class MediaController {
  constructor(
    private readonly drive: GoogleDriveService,
    private readonly infrastructure: InfrastructureService,
    private readonly auth: AuthService,
    private readonly telegram: TelegramService,
  ) {}

  private async notifyTelegram(text: string) {
    try {
      await this.telegram.broadcast(text, 'HTML');
    } catch {
      // Bỏ qua lỗi telegram để không chặn giao dịch chính
    }
  }

  private async checkBulkAccessAnomaly(
    actorCode: string,
    actorName: string,
    actorRole: string,
    branchId: string | null,
    clientIp: string,
    action: string,
  ) {
    if (!actorCode || actorCode === 'anonymous') return;
    try {
      const res = await this.infrastructure.postgres.query<{ count: string }>(
        `select count(*) from app.media_audit_log
         where actor_code = $1 and action in ('download', 'view') and created_at > now() - interval '5 minutes'`,
        [actorCode],
      );
      const count = Number(res.rows[0]?.count || 0);
      if (count >= 30) {
        const shouldAlert = await this.telegram.shouldNotify('bulk_media_access', true);
        if (shouldAlert) {
          void this.telegram.sendSecurityAlert({
            eventType: 'bulk_media_access',
            severity: 'warning',
            actorCode,
            actorName,
            actorRole,
            branchId: branchId || undefined,
            clientIp,
            details: {
              canhBao: 'Phát hiện truy xuất hoặc tải ảnh lâm sàng số lượng lớn trong 5 phút (nguy cơ rò rỉ dữ liệu)',
              soLuong5Phut: count,
              thaoTacCuoi: action,
            },
          });
        }
      }
    } catch {
      // Safe fail
    }
  }

  @Post('/upload')
  @UseGuards(AuthGuard)
  async uploadMedia(
    @Req() req: FastifyRequest & { user: AuthUser },
    @Body()
    body: {
      patientCode: string;
      patientName: string;
      encounterId?: string;
      assistantName?: string;
      doctorName?: string;
      category?: string;
      notes?: string;
      files: UploadFilePayload[];
    },
  ) {
    const actor = req.user;
    if (!body.patientCode || !body.patientName) {
      throw new BadRequestException('Mã bệnh nhân và tên bệnh nhân là bắt buộc.');
    }
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một tệp ảnh.');
    }

    const patientCode = body.patientCode.trim();
    const patientName = body.patientName.trim();
    const assistantName = (body.assistantName || actor.profile?.full_name || 'Phụ tá chung').toString().trim();
    const doctorName = (body.doctorName || '').trim();
    const category = body.category || 'trong_mieng';
    const notes = (body.notes || '').trim();
    const branchId = actor.branchId || 'le_van_tho';

    // 1. Kiểm tra thư mục khách hàng đã tồn tại trong hệ thống chưa
    const existingFolderRes = await this.infrastructure.postgres.query<{
      id: string;
      assistant_code: string;
      assistant_name: string;
      branch_id: string;
      google_drive_folder_id: string;
    }>(
      `select id, assistant_code, assistant_name, branch_id, google_drive_folder_id
       from app.patient_media_folders
       where lower(trim(patient_code)) = lower(trim($1))
       order by updated_at desc limit 1`,
      [patientCode],
    );
    const existingFolder = existingFolderRes.rows[0];

    let patientFolderId = existingFolder?.google_drive_folder_id;
    const finalBranchId = existingFolder?.branch_id || branchId;
    const finalAssistantName = existingFolder?.assistant_name || assistantName;

    // Nếu chưa có, tạo cây thư mục trên Google Drive: Gốc -> Phụ tá -> Bệnh nhân
    if (!patientFolderId) {
      const assistantFolderName = finalAssistantName.toLowerCase().startsWith('phụ tá')
        ? finalAssistantName
        : `Phụ tá ${finalAssistantName}`;
      const assistantFolderId = await this.drive.getOrCreateFolder(
        assistantFolderName,
        this.drive.rootFolderId,
      );

      const patientFolderName = `[${patientCode}] ${patientName}`;
      patientFolderId = await this.drive.getOrCreateFolder(
        patientFolderName,
        assistantFolderId,
      );
    }

    // 2. Upload từng file
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const userAgent = (req.headers['user-agent'] || '').toString();
    const uploadedRecords = [];

    for (const file of body.files) {
      if (!file.data) continue;
      const buffer = Buffer.from(file.data, 'base64');
      if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
        throw new BadRequestException(`Tệp '${file.name}' vượt quá kích thước 25MB cho phép.`);
      }

      const mimeType = file.type || 'image/jpeg';
      const cleanFileName = (file.name || `anh_${Date.now()}.jpg`).replace(/[^\w.-]/gi, '_');

      const uploaded = await this.drive.uploadFile({
        fileName: cleanFileName,
        mimeType,
        buffer,
        parentFolderId: patientFolderId,
      });

      // Lưu DB
      const insertResult = await this.infrastructure.postgres.query<{ id: string }>(
        `insert into app.patient_media
           (patient_code, patient_name, encounter_id, branch_id, assistant_name, doctor_name,
            file_name, mime_type, file_size, google_drive_file_id, google_drive_folder_id,
            google_drive_web_link, category, notes, created_by, created_by_name)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         returning id`,
        [
          patientCode,
          patientName,
          body.encounterId || null,
          finalBranchId,
          finalAssistantName,
          doctorName,
          cleanFileName,
          mimeType,
          uploaded.size,
          uploaded.fileId,
          patientFolderId,
          uploaded.webViewLink || null,
          category,
          notes,
          actor.employeeCode,
          String(actor.profile?.full_name || actor.employeeCode),
        ],
      );

      const mediaId = insertResult.rows[0].id;

      // Ghi nhật ký kiểm toán (Audit Log)
      await this.infrastructure.postgres.query(
        `insert into app.media_audit_log
           (media_id, patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, user_agent, details)
         values ($1, $2, 'upload', $3, $4, $5, $6, $7, $8, $9)`,
        [
          mediaId,
          patientCode,
          actor.employeeCode,
          String(actor.profile?.full_name || actor.employeeCode),
          actor.role,
          finalBranchId,
          clientIp,
          userAgent,
          JSON.stringify({
            fileName: cleanFileName,
            fileSize: uploaded.size,
            driveFileId: uploaded.fileId,
            assistant: finalAssistantName,
            doctor: doctorName,
          }),
        ],
      );

      uploadedRecords.push({
        id: mediaId,
        fileName: cleanFileName,
        fileSize: uploaded.size,
        driveFileId: uploaded.fileId,
        category,
      });
    }

    if (uploadedRecords.length > 0) {
      // 3. Tự động đồng bộ / cập nhật thư mục khách hàng
      try {
        if (existingFolder) {
          await this.infrastructure.postgres.query(
            `update app.patient_media_folders
             set updated_at = now(),
                 google_drive_folder_id = coalesce(nullif(app.patient_media_folders.google_drive_folder_id, ''), $1),
                 google_drive_web_link = coalesce(nullif(app.patient_media_folders.google_drive_web_link, ''), $2)
             where id = $3`,
            [
              patientFolderId,
              `https://drive.google.com/drive/folders/${patientFolderId}`,
              existingFolder.id,
            ],
          );
        } else {
          await this.infrastructure.postgres.query(
            `insert into app.patient_media_folders
               (assistant_code, assistant_name, patient_code, patient_name, branch_id,
                google_drive_folder_id, google_drive_web_link, created_by, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, now())
             on conflict (lower(trim(assistant_code)), lower(trim(patient_code)))
             do update set
               assistant_name = excluded.assistant_name,
               patient_name = excluded.patient_name,
               google_drive_folder_id = excluded.google_drive_folder_id,
               google_drive_web_link = excluded.google_drive_web_link,
               updated_at = now()`,
            [
              actor.employeeCode,
              finalAssistantName,
              patientCode,
              patientName,
              finalBranchId,
              patientFolderId,
              `https://drive.google.com/drive/folders/${patientFolderId}`,
              actor.employeeCode,
            ],
          );
        }
      } catch (err) {
        // Không để lỗi bảng thư mục làm hỏng kết quả upload
      }

      // 4. Bắn thông báo Telegram lưu vết
      const totalBytes = uploadedRecords.reduce((acc, cur) => acc + (cur.fileSize || 0), 0);
      const timeStr = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date());

      const shouldSendTele = await this.telegram.shouldNotify('upload_image', false);
      if (shouldSendTele) {
        const loaiLabel: Record<string, string> = {
          trong_mieng: 'Ảnh trong miệng',
          ngoai_mat: 'Ảnh ngoài mặt',
          can_canh: 'Ảnh cận cảnh',
          xquang: 'Phim X-Quang',
          khac: 'Ảnh khác',
        };

        const teleUploadMsg = [
          `📸 <b>LƯU TRỮ ẢNH LÂM SÀNG MỚI</b>`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `👤 <b>Phụ tá:</b> ${assistantName} (<code>${actor.employeeCode}</code>)`,
          `🗂️ <b>Khách hàng:</b> [${patientCode}] ${patientName}`,
          `🖼️ <b>Số lượng:</b> ${uploadedRecords.length} tệp (${(totalBytes / 1024).toFixed(1)} KB)`,
          `🏷️ <b>Danh mục:</b> ${loaiLabel[category] || category}`,
          doctorName ? `👨‍⚕️ <b>Bác sĩ:</b> ${doctorName}` : '',
          notes ? `📝 <b>Ghi chú:</b> ${notes}` : '',
          `🔗 <b>Kho hồ sơ:</b> <a href="https://drive.google.com/drive/folders/${patientFolderId}">Mở thư mục lưu trữ</a>`,
          `🕒 <b>Thời gian:</b> ${timeStr}`,
        ].filter(Boolean).join('\n');
        await this.notifyTelegram(teleUploadMsg);
      }
    }

    return {
      success: true,
      count: uploadedRecords.length,
      items: uploadedRecords,
    };
  }

  @Post('/folders')
  @UseGuards(AuthGuard)
  async createFolder(
    @Req() req: FastifyRequest & { user: AuthUser },
    @Body()
    body: {
      patientCode: string;
      patientName: string;
      notes?: string;
      branchId?: string;
    },
  ) {
    const actor = req.user;
    if (!body.patientCode || !body.patientName) {
      throw new BadRequestException('Mã khách hàng và tên khách hàng là bắt buộc.');
    }
    const patientCode = body.patientCode.trim();
    const patientName = body.patientName.trim();
    const assistantName = String(actor.profile?.full_name || actor.employeeCode || 'Phụ tá').trim();
    const branchId = body.branchId || actor.branchId || 'le_van_tho';
    const notes = (body.notes || '').trim();

    // 1. Tạo hoặc lấy thư mục Phụ tá trong Root Folder
    const assistantFolderName = assistantName.toLowerCase().startsWith('phụ tá')
      ? assistantName
      : `Phụ tá ${assistantName}`;
    const assistantFolderId = await this.drive.getOrCreateFolder(
      assistantFolderName,
      this.drive.rootFolderId,
    );

    // 2. Tạo hoặc lấy thư mục Khách hàng bên trong thư mục Phụ tá
    const patientFolderName = `[${patientCode}] ${patientName}`;
    const patientFolderId = await this.drive.getOrCreateFolder(
      patientFolderName,
      assistantFolderId,
    );
    const driveWebLink = `https://drive.google.com/drive/folders/${patientFolderId}`;

    // 3. Lưu vào DB app.patient_media_folders
    const folderRes = await this.infrastructure.postgres.query(
      `insert into app.patient_media_folders
         (assistant_code, assistant_name, patient_code, patient_name, branch_id,
          google_drive_folder_id, google_drive_web_link, notes, created_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (lower(trim(assistant_code)), lower(trim(patient_code)))
       do update set
         assistant_name = excluded.assistant_name,
         patient_name = excluded.patient_name,
         google_drive_folder_id = excluded.google_drive_folder_id,
         google_drive_web_link = excluded.google_drive_web_link,
         notes = coalesce(nullif(excluded.notes, ''), app.patient_media_folders.notes),
         updated_at = now()
       returning *`,
      [
        actor.employeeCode,
        assistantName,
        patientCode,
        patientName,
        branchId,
        patientFolderId,
        driveWebLink,
        notes,
        actor.employeeCode,
      ],
    );

    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const userAgent = (req.headers['user-agent'] || '').toString();

    // 4. Ghi nhật ký kiểm toán (Audit Log)
    await this.infrastructure.postgres.query(
      `insert into app.media_audit_log
         (patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, user_agent, details)
       values ($1, 'create_folder', $2, $3, $4, $5, $6, $7, $8)`,
      [
        patientCode,
        actor.employeeCode,
        assistantName,
        actor.role,
        branchId,
        clientIp,
        userAgent,
        JSON.stringify({
          assistantName,
          patientName,
          folderId: patientFolderId,
          folderName: patientFolderName,
          driveWebLink,
          notes,
        }),
      ],
    );

    // 5. Gửi thông báo Telegram (nếu được bật trong quy tắc)
    const shouldSendTele = await this.telegram.shouldNotify('create_folder', false);
    if (shouldSendTele) {
      const timeStr = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(new Date());

      const teleMsg = [
        `📁 <b>ĐỒNG BỘ HỒ SƠ LÂM SÀNG PHỤ TÁ</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `👤 <b>Phụ tá:</b> ${assistantName} (<code>${actor.employeeCode}</code>)`,
        `🗂️ <b>Khách hàng:</b> [${patientCode}] ${patientName}`,
        `🏢 <b>Chi nhánh:</b> ${branchId === 'le_van_tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu'}`,
        notes ? `📝 <b>Ghi chú:</b> ${notes}` : '',
        `🔗 <b>Kho hồ sơ:</b> <a href="${driveWebLink}">Mở thư mục lưu trữ</a>`,
        `🕒 <b>Thời gian:</b> ${timeStr}`,
      ].filter(Boolean).join('\n');
      await this.notifyTelegram(teleMsg);
    }

    return {
      success: true,
      folder: folderRes.rows[0],
    };
  }

  @Get('/folders')
  @UseGuards(AuthGuard)
  async getFolders(
    @Req() req: FastifyRequest & { user: AuthUser },
    @Query('assistantCode') queryAssistantCode?: string,
    @Query('branchId') queryBranchId?: string,
    @Query('search') search?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const actor = req.user;
    // Cho phép Phụ tá, Bác sĩ, Admin, IT xem ảnh lâm sàng toàn diện của cả hai chi nhánh
    const targetAssistant = queryAssistantCode;

    const page = Math.max(1, parseInt(pageStr || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(pageSizeStr || '50', 10)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (targetAssistant && targetAssistant.trim()) {
      params.push(targetAssistant.trim());
      conditions.push(`lower(trim(f.assistant_code)) = lower(trim($${params.length}))`);
    }

    if (queryBranchId && queryBranchId.trim()) {
      params.push(queryBranchId.trim());
      conditions.push(`f.branch_id = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(f.patient_code ilike $${params.length} or f.patient_name ilike $${params.length} or f.assistant_name ilike $${params.length})`);
    }

    const whereClause = conditions.join(' and ');

    const countRes = await this.infrastructure.postgres.query<{ count: string }>(
      `select count(*) from app.patient_media_folders f where ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const listQuery = `
      select f.*,
             count(m.id)::int as media_count,
             coalesce(sum(m.file_size), 0)::bigint as total_size,
             max(m.created_at) as last_media_at
      from app.patient_media_folders f
      left join app.patient_media m
        on ((f.google_drive_folder_id is not null and f.google_drive_folder_id <> '' and m.google_drive_folder_id = f.google_drive_folder_id)
            or ((f.google_drive_folder_id is null or f.google_drive_folder_id = '') and lower(trim(m.patient_code)) = lower(trim(f.patient_code))))
        and not m.is_deleted
      where ${whereClause}
      group by f.id
      order by f.updated_at desc
      limit $${params.length + 1} offset $${params.length + 2}
    `;

    const listRes = await this.infrastructure.postgres.query(listQuery, [...params, pageSize, offset]);

    return {
      success: true,
      folders: listRes.rows,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  @Get('/assistants')
  @UseGuards(AuthGuard)
  async getAssistants(@Req() req: FastifyRequest & { user: AuthUser }) {
    try {
      const query = `
        with from_folders as (
          select distinct assistant_code as code, assistant_name as name, branch_id
          from app.patient_media_folders
          where assistant_code is not null and assistant_code <> ''
        ),
        from_employees as (
          select payload->>'code' as code, payload->>'full_name' as name, payload->>'branch_id' as branch_id
          from app.records
          where entity_type = 'employees' and deleted_at is null
            and (
              payload->>'department' in ('phuta', 'phu_ta')
              or payload->>'department' ilike '%phuta%'
              or payload->>'department' ilike '%phụ tá%'
              or payload->>'department' ilike '%điều dưỡng%'
              or payload->>'title' ilike '%phụ tá%'
            )
        )
        select distinct on (lower(code)) code, name, branch_id
        from (
          select * from from_folders
          union all
          select * from from_employees
        ) combined
        where code is not null and code <> ''
        order by lower(code), name;
      `;
      const res = await this.infrastructure.postgres.query(query);
      return {
        success: true,
        assistants: res.rows,
      };
    } catch (err: any) {
      const fallback = await this.infrastructure.postgres.query(
        'select distinct assistant_code as code, assistant_name as name, branch_id from app.patient_media_folders order by name',
      );
      return { success: true, assistants: fallback.rows };
    }
  }

  @Delete('/folders/:id')
  @UseGuards(AuthGuard)
  async deleteFolder(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { user: AuthUser },
  ) {
    const actor = req.user;
    const isItOrAdmin = ['admin', 'admin_it', 'superadmin'].includes(actor.role);
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();

    const folderRes = await this.infrastructure.postgres.query<{
      id: string;
      assistant_code: string;
      assistant_name: string;
      patient_code: string;
      patient_name: string;
      google_drive_folder_id: string;
      branch_id: string;
    }>('select * from app.patient_media_folders where id = $1 limit 1', [id]);

    const folder = folderRes.rows[0];
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục hồ sơ bệnh nhân.');

    const isAuthorized =
      isItOrAdmin ||
      ['phu_ta_truong', 'bac_si'].includes(actor.role) ||
      folder.assistant_code.toLowerCase() === actor.employeeCode.toLowerCase();
    if (!isAuthorized) {
      throw new BadRequestException('Bạn không có quyền xóa thư mục do nhân sự khác phụ trách.');
    }

    // 1. Đồng bộ xóa thư mục trực tiếp trên Google Drive
    if (folder.google_drive_folder_id) {
      try {
        await this.drive.deleteFileOrFolder(folder.google_drive_folder_id);
      } catch (driveErr) {
        // Log và tiếp tục xóa database
      }
    }

    // 2. Đánh dấu xóa các tệp ảnh thuộc hồ sơ bệnh nhân này trong database
    try {
      await this.infrastructure.postgres.query(
        `update app.patient_media
            set is_deleted = true,
                deleted_by = $1,
                deleted_at = now()
          where lower(trim(patient_code)) = lower(trim($2))
            and not is_deleted`,
        [actor.employeeCode, folder.patient_code],
      );
    } catch {
      // Safe fail
    }

    // 3. Xóa bản ghi thư mục
    await this.infrastructure.postgres.query('delete from app.patient_media_folders where id = $1', [id]);

    // 4. Ghi nhật ký kiểm toán bất biến
    try {
      await this.infrastructure.postgres.query(
        `insert into app.media_audit_log
           (patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, details)
         values ($1, 'delete_folder', $2, $3, $4, $5, $6, $7)`,
        [
          folder.patient_code,
          actor.employeeCode,
          String(actor.profile?.full_name || actor.employeeCode),
          actor.role,
          folder.branch_id || actor.branchId,
          clientIp,
          JSON.stringify({
            folderId: folder.id,
            patientName: folder.patient_name,
            assistantCode: folder.assistant_code,
            assistantName: folder.assistant_name,
            driveFolderId: folder.google_drive_folder_id,
          }),
        ],
      );
    } catch {
      // Safe fail
    }

    // 5. Gửi thông báo Telegram lưu vết
    const timeStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());

    const teleMsg = [
      `🗑️ <b>XÓA THƯ MỤC HỒ SƠ LÂM SÀNG</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Người xóa:</b> ${actor.profile?.full_name || actor.employeeCode} (<code>${actor.employeeCode}</code> · ${actor.role})`,
      `🗂️ <b>Hồ sơ đã xóa:</b> [${folder.patient_code}] ${folder.patient_name}`,
      `👩‍⚕️ <b>Phụ trách:</b> ${folder.assistant_name} (<code>${folder.assistant_code}</code>)`,
      `🏢 <b>Chi nhánh:</b> ${folder.branch_id === 'le_van_tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu'}`,
      `☁️ <b>Đồng bộ Drive:</b> Đã xóa thư mục trên Google Drive`,
      `🕒 <b>Thời gian:</b> ${timeStr}`,
    ].join('\n');
    const shouldSendTele = await this.telegram.shouldNotify('delete_folder', true);
    if (shouldSendTele) {
      await this.notifyTelegram(teleMsg);
    }

    return {
      success: true,
      message: `Đã xóa thư mục hồ sơ bệnh nhân [${folder.patient_code}] thành công.`,
    };
  }

  @Get('/audit-logs')
  @UseGuards(AuthGuard)
  async getAuditLogs(
    @Req() req: FastifyRequest & { user: AuthUser },
    @Query('assistantCode') assistantCode?: string,
    @Query('patientCode') patientCode?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const actor = req.user;
    const isMedicalOrAdmin = ['admin', 'admin_it', 'superadmin', 'phu_ta', 'phu_ta_truong', 'bac_si'].includes(actor.role);

    const page = Math.max(1, parseInt(pageStr || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(pageSizeStr || '25', 10)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // Nếu không phải Quản trị viên hoặc Nhân sự y tế, chỉ xem logs của chính mình
    if (!isMedicalOrAdmin) {
      params.push(actor.employeeCode);
      conditions.push(`lower(trim(l.actor_code)) = lower(trim($${params.length}))`);
    } else if (assistantCode && assistantCode.trim()) {
      params.push(assistantCode.trim());
      conditions.push(`lower(trim(l.actor_code)) = lower(trim($${params.length}))`);
    }

    if (patientCode && patientCode.trim()) {
      params.push(`%${patientCode.trim()}%`);
      conditions.push(`l.patient_code ilike $${params.length}`);
    }

    if (action && action.trim()) {
      params.push(action.trim());
      conditions.push(`l.action = $${params.length}`);
    }

    if (dateFrom && dateFrom.trim()) {
      params.push(dateFrom.trim());
      conditions.push(`l.created_at >= $${params.length}::timestamptz`);
    }

    if (dateTo && dateTo.trim()) {
      params.push(dateTo.trim());
      conditions.push(`l.created_at <= ($${params.length}::date + 1)::timestamptz`);
    }

    const whereClause = conditions.join(' and ');

    const countRes = await this.infrastructure.postgres.query<{ count: string }>(
      `select count(*) from app.media_audit_log l where ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const listRes = await this.infrastructure.postgres.query(
      `select l.*, m.file_name, m.category, m.file_size
       from app.media_audit_log l
       left join app.patient_media m on m.id = l.media_id
       where ${whereClause}
       order by l.created_at desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return {
      success: true,
      logs: listRes.rows,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  @Get('/admin/status')
  @UseGuards(AuthGuard)
  async getAdminStatus(@Req() req: FastifyRequest & { user: AuthUser }) {
    const actor = req.user;
    if (!['admin', 'admin_it', 'superadmin'].includes(actor.role)) {
      throw new BadRequestException('Chỉ dành cho Quản trị viên IT.');
    }

    const driveStatus = await this.drive.getDriveStatus();

    const statsRes = await this.infrastructure.postgres.query<{
      total_folders: string;
      total_files: string;
      total_size: string;
    }>(
      `select
         (select count(*) from app.patient_media_folders) as total_folders,
         (select count(*) from app.patient_media where not is_deleted) as total_files,
         (select coalesce(sum(file_size), 0) from app.patient_media where not is_deleted) as total_size`,
    );

    const stats = statsRes.rows[0] || { total_folders: '0', total_files: '0', total_size: '0' };

    return {
      success: true,
      drive: driveStatus,
      stats: {
        totalFolders: parseInt(stats.total_folders, 10),
        totalFiles: parseInt(stats.total_files, 10),
        totalSize: parseInt(stats.total_size, 10),
      },
    };
  }

  @Get('/patient/:patientCode')
  @UseGuards(AuthGuard)
  async getPatientMedia(@Param('patientCode') patientCode: string) {
    const result = await this.infrastructure.postgres.query(
      `select id, patient_code, patient_name, encounter_id, branch_id, assistant_name, doctor_name,
              file_name, mime_type, file_size, google_drive_file_id, category, notes,
              created_by, created_by_name, created_at
       from app.patient_media
       where lower(trim(patient_code)) = lower(trim($1)) and not is_deleted
       order by created_at desc`,
      [patientCode],
    );

    return {
      success: true,
      media: result.rows.map((row) => ({
        ...row,
        viewUrl: `/api/v2/media/view/${row.id}`,
        downloadUrl: `/api/v2/media/download/${row.id}`,
      })),
    };
  }

  @Get('/view/:id')
  async viewMedia(
    @Param('id') id: string,
    @Query('token') tokenQuery: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const actor = await this.resolveActor(req, tokenQuery);

    const result = await this.infrastructure.postgres.query<{
      id: string;
      patient_code: string;
      file_name: string;
      mime_type: string;
      google_drive_file_id: string;
      is_deleted: boolean;
    }>('select * from app.patient_media where id = $1 limit 1', [id]);

    const media = result.rows[0];
    if (!media || media.is_deleted) {
      throw new NotFoundException('Không tìm thấy hình ảnh này.');
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const userAgent = (req.headers['user-agent'] || '').toString();

    // Ghi nhận nhật ký kiểm toán người vào xem
    await this.infrastructure.postgres.query(
      `insert into app.media_audit_log
         (media_id, patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, user_agent, details)
       values ($1, $2, 'view', $3, $4, $5, $6, $7, $8, $9)`,
      [
        media.id,
        media.patient_code,
        actor?.employeeCode || 'anonymous',
        String(actor?.profile?.full_name || actor?.employeeCode || 'Khách'),
        actor?.role || 'guest',
        actor?.branchId || null,
        clientIp,
        userAgent,
        JSON.stringify({ file_name: media.file_name }),
      ],
    );

    void this.checkBulkAccessAnomaly(
      actor?.employeeCode || '',
      String(actor?.profile?.full_name || actor?.employeeCode || ''),
      actor?.role || '',
      actor?.branchId || null,
      clientIp,
      'view',
    );

    const { stream, mimeType } = await this.drive.getFileStream(media.google_drive_file_id);

    res.header('Content-Type', mimeType || media.mime_type || 'image/jpeg');
    res.header('Cache-Control', 'private, max-age=3600');

    // Chuyển đổi Web ReadableStream sang Node Readable
    const nodeStream = Readable.fromWeb(stream as any);
    return res.send(nodeStream);
  }

  @Get('/download/:id')
  async downloadMedia(
    @Param('id') id: string,
    @Query('token') tokenQuery: string,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const actor = await this.resolveActor(req, tokenQuery);

    const result = await this.infrastructure.postgres.query<{
      id: string;
      patient_code: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      google_drive_file_id: string;
      is_deleted: boolean;
    }>('select * from app.patient_media where id = $1 limit 1', [id]);

    const media = result.rows[0];
    if (!media || media.is_deleted) {
      throw new NotFoundException('Không tìm thấy hình ảnh này.');
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const userAgent = (req.headers['user-agent'] || '').toString();

    // Ghi nhận nhật ký kiểm toán người tải ảnh
    await this.infrastructure.postgres.query(
      `insert into app.media_audit_log
         (media_id, patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, user_agent, details)
       values ($1, $2, 'download', $3, $4, $5, $6, $7, $8, $9)`,
      [
        media.id,
        media.patient_code,
        actor?.employeeCode || 'anonymous',
        String(actor?.profile?.full_name || actor?.employeeCode || 'Khách'),
        actor?.role || 'guest',
        actor?.branchId || null,
        clientIp,
        userAgent,
        JSON.stringify({ file_name: media.file_name, size: media.file_size }),
      ],
    );

    void this.checkBulkAccessAnomaly(
      actor?.employeeCode || '',
      String(actor?.profile?.full_name || actor?.employeeCode || ''),
      actor?.role || '',
      actor?.branchId || null,
      clientIp,
      'download',
    );

    const { stream, mimeType, fileName } = await this.drive.getFileStream(media.google_drive_file_id);

    res.header('Content-Type', mimeType || media.mime_type || 'application/octet-stream');
    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(media.file_name || fileName)}"`);

    const nodeStream = Readable.fromWeb(stream as any);
    return res.send(nodeStream);
  }

  @Get('/audit/:mediaId')
  @UseGuards(AuthGuard)
  async getMediaAudit(@Param('mediaId') mediaId: string) {
    const result = await this.infrastructure.postgres.query(
      `select id, media_id, patient_code, action, actor_code, actor_name, actor_role,
              branch_id, client_ip, details, created_at
       from app.media_audit_log
       where media_id = $1
       order by created_at desc
       limit 100`,
      [mediaId],
    );

    return {
      success: true,
      logs: result.rows,
    };
  }

  @Patch('/:id')
  @UseGuards(AuthGuard)
  async updateMedia(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { user: AuthUser },
    @Body() body: { category?: string; notes?: string },
  ) {
    const actor = req.user;
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();

    const currentRes = await this.infrastructure.postgres.query<{
      patient_code: string;
      category: string;
      notes: string;
    }>('select patient_code, category, notes from app.patient_media where id = $1 limit 1', [id]);
    const current = currentRes.rows[0];
    if (!current) throw new NotFoundException('Không tìm thấy ảnh.');

    await this.infrastructure.postgres.query(
      `update app.patient_media
       set category = coalesce($2, category),
           notes = coalesce($3, notes)
       where id = $1`,
      [id, body.category || null, body.notes !== undefined ? body.notes : null],
    );

    // Ghi nhật ký sửa đổi
    await this.infrastructure.postgres.query(
      `insert into app.media_audit_log
         (media_id, patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, details)
       values ($1, $2, 'update_note', $3, $4, $5, $6, $7, $8)`,
      [
        id,
        current.patient_code,
        actor.employeeCode,
        String(actor.profile?.full_name || actor.employeeCode),
        actor.role,
        actor.branchId,
        clientIp,
        JSON.stringify({ old: { category: current.category, notes: current.notes }, new: body }),
      ],
    );

    return { success: true };
  }

  @Delete('/:id')
  @UseGuards(AuthGuard)
  async deleteMedia(
    @Param('id') id: string,
    @Req() req: FastifyRequest & { user: AuthUser },
  ) {
    const actor = req.user;
    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').toString();

    const currentRes = await this.infrastructure.postgres.query<{
      patient_code: string;
      patient_name?: string;
      file_name: string;
      drive_file_id?: string;
      file_size?: number;
      created_by?: string;
    }>(
      'select patient_code, patient_name, file_name, drive_file_id, file_size, created_by from app.patient_media where id = $1 limit 1',
      [id],
    );
    const current = currentRes.rows[0];
    if (!current) throw new NotFoundException('Không tìm thấy ảnh.');

    // 1. Đồng bộ xóa tệp trực tiếp trên Google Drive
    if (current.drive_file_id) {
      try {
        await this.drive.deleteFileOrFolder(current.drive_file_id);
      } catch (driveErr) {
        // Safe fail, tiếp tục đánh dấu xóa trong DB
      }
    }

    // 2. Đánh dấu xóa trong DB
    await this.infrastructure.postgres.query(
      `update app.patient_media
       set is_deleted = true,
           deleted_by = $2,
           deleted_at = now()
       where id = $1`,
      [id, actor.employeeCode],
    );

    // 3. Ghi nhật ký xóa ảnh bất biến
    try {
      await this.infrastructure.postgres.query(
        `insert into app.media_audit_log
           (media_id, patient_code, action, actor_code, actor_name, actor_role, branch_id, client_ip, details)
         values ($1, $2, 'delete', $3, $4, $5, $6, $7, $8)`,
        [
          id,
          current.patient_code,
          actor.employeeCode,
          String(actor.profile?.full_name || actor.employeeCode),
          actor.role,
          actor.branchId,
          clientIp,
          JSON.stringify({
            file_name: current.file_name,
            drive_file_id: current.drive_file_id,
            file_size: current.file_size,
          }),
        ],
      );
    } catch {
      // Safe fail
    }

    // 4. Bắn thông báo Telegram lưu vết
    const timeStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());

    const fileSizeStr = current.file_size
      ? `(${((Number(current.file_size) || 0) / 1024).toFixed(1)} KB)`
      : '';

    const teleMsg = [
      `🗑️ <b>XÓA ẢNH LÂM SÀNG</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Người xóa:</b> ${actor.profile?.full_name || actor.employeeCode} (<code>${actor.employeeCode}</code> · ${actor.role})`,
      `🗂️ <b>Khách hàng:</b> [${current.patient_code}] ${current.patient_name || ''}`,
      `🖼️ <b>Tệp đã xóa:</b> ${current.file_name} ${fileSizeStr}`,
      `☁️ <b>Đồng bộ Drive:</b> Đã xóa tệp vĩnh viễn trên Google Drive`,
      `🕒 <b>Thời gian:</b> ${timeStr}`,
    ].filter(Boolean).join('\n');
    const shouldSendTele = await this.telegram.shouldNotify('delete_image', true);
    if (shouldSendTele) {
      await this.notifyTelegram(teleMsg);
    }

    return { success: true };
  }

  private async resolveActor(req: FastifyRequest, tokenQuery?: string): Promise<AuthUser | null> {
    const authHeader = (req.headers.authorization || '').toString();
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : tokenQuery;
    if (!token) return null;
    try {
      return await this.auth.userFromToken(token);
    } catch {
      return null;
    }
  }
}
