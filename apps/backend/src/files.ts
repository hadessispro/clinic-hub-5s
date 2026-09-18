import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthGuard } from './auth';
import { GoogleDriveService } from './google-drive.service';

const uploadDir = process.env.UPLOAD_DIR || '/data/uploads';
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

@Controller('/api/v2/files')
export class FilesController {
  constructor(private readonly drive: GoogleDriveService) {}

  @Post('/upload')
  @UseGuards(AuthGuard)
  async upload(@Body() body: { name?: string; type?: string; data?: string }) {
    const type = String(body.type || 'application/octet-stream');
    if (!allowedTypes.has(type)) throw new BadRequestException('Loại tệp không được hỗ trợ.');
    const buffer = Buffer.from(String(body.data || ''), 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new BadRequestException('Tệp phải có dung lượng từ 1 byte đến 10 MB.');
    const originalExtension = extname(String(body.name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const id = `${randomUUID()}${originalExtension}`;
    await mkdir(uploadDir, { recursive: true });

    let driveFileId: string | undefined;
    let driveWebLink: string | undefined;

    // Tải lên Google Drive nếu đã cấu hình
    try {
      const folderId = await this.drive.getOrCreateFolder('Clinic Hub Uploads', this.drive.rootFolderId);
      const uploaded = await this.drive.uploadFile({
        fileName: String(body.name || id),
        mimeType: type,
        buffer,
        parentFolderId: folderId,
      });
      driveFileId = uploaded.fileId;
      driveWebLink = uploaded.webViewLink;
    } catch (driveErr) {
      console.error('[FilesController] Lỗi tải lên Google Drive, chuyển sang lưu VPS cục bộ:', driveErr);
    }

    // Nếu không lên được Google Drive thì bắt buộc lưu nhị phân trên VPS
    if (!driveFileId) {
      await writeFile(join(uploadDir, id), buffer, { flag: 'wx' });
    }

    // Ghi metadata (kèm driveFileId nếu có)
    await writeFile(join(uploadDir, `${id}.meta`), JSON.stringify({
      type,
      name: String(body.name || id),
      driveFileId,
      driveWebLink,
      uploadedAt: new Date().toISOString(),
    }), { flag: 'wx' });

    return { path: id, publicUrl: `/api/v2/files/${encodeURIComponent(id)}`, driveWebLink };
  }

  @Get('/:id')
  async download(@Param('id') idInput: string, @Res() response: FastifyReply) {
    const id = String(idInput || '');
    if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,9})?$/.test(id)) throw new NotFoundException();
    try {
      const metadataStr = await readFile(join(uploadDir, `${id}.meta`), 'utf8');
      const meta = JSON.parse(metadataStr) as { type?: string; name?: string; driveFileId?: string };

      // 1. Nếu file nhị phân có sẵn trên local disk, phục vụ ngay
      try {
        const file = await readFile(join(uploadDir, id));
        response.header('Content-Type', meta.type || 'application/octet-stream');
        response.header('Cache-Control', 'private, max-age=86400');
        return response.send(file);
      } catch {
        // 2. Nếu không có trên local disk, tải stream từ Google Drive
        if (meta.driveFileId) {
          const { stream, mimeType } = await this.drive.getFileStream(meta.driveFileId);
          response.header('Content-Type', meta.type || mimeType || 'application/octet-stream');
          response.header('Cache-Control', 'private, max-age=86400');
          return response.send(Readable.fromWeb(stream as any));
        }
        throw new NotFoundException('Không tìm thấy tệp.');
      }
    } catch {
      throw new NotFoundException('Không tìm thấy tệp.');
    }
  }
}
