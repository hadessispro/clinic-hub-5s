import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthGuard } from './auth';

const uploadDir = process.env.UPLOAD_DIR || '/data/uploads';
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

@Controller('/api/v2/files')
export class FilesController {
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
    await writeFile(join(uploadDir, id), buffer, { flag: 'wx' });
    await writeFile(join(uploadDir, `${id}.meta`), JSON.stringify({ type, name: String(body.name || id) }), { flag: 'wx' });
    return { path: id, publicUrl: `/api/v2/files/${encodeURIComponent(id)}` };
  }

  @Get('/:id')
  async download(@Param('id') idInput: string, @Res() response: FastifyReply) {
    const id = String(idInput || '');
    if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,9})?$/.test(id)) throw new NotFoundException();
    try {
      const [file, metadata] = await Promise.all([readFile(join(uploadDir, id)), readFile(join(uploadDir, `${id}.meta`), 'utf8')]);
      const meta = JSON.parse(metadata) as { type?: string; name?: string };
      response.header('Content-Type', meta.type || 'application/octet-stream');
      response.header('Cache-Control', 'private, max-age=3600');
      return response.send(file);
    } catch { throw new NotFoundException('Không tìm thấy tệp.'); }
  }
}
