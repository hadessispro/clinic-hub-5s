import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private cachedAccessToken = '';
  private tokenExpiresAt = 0;
  private readonly folderCache = new Map<string, string>(); // `${parentId}:${folderName}` -> folderId

  private readonly clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '';
  private readonly clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || '';
  private readonly refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || '';
  readonly rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';

  async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.cachedAccessToken;
    }

    if (!this.refreshToken) {
      throw new Error('GOOGLE_DRIVE_REFRESH_TOKEN chưa được cấu hình.');
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Lỗi refresh Google access token (${res.status}): ${errText}`);
      throw new Error(`Google Drive auth error: ${errText}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    return this.cachedAccessToken;
  }

  async getOrCreateFolder(folderName: string, parentFolderId: string): Promise<string> {
    const cleanName = folderName.trim().replace(/'/g, "\\'");
    const cacheKey = `${parentFolderId}:${cleanName}`;
    if (this.folderCache.has(cacheKey)) {
      return this.folderCache.get(cacheKey)!;
    }

    const token = await this.getAccessToken();

    // 1. Tìm kiếm thư mục đã có
    const q = `'${parentFolderId}' in parents and name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const data = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
      if (data.files && data.files.length > 0) {
        const foundId = data.files[0].id;
        this.folderCache.set(cacheKey, foundId);
        return foundId;
      }
    }

    // 2. Chưa có thì tạo mới
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Không thể tạo thư mục '${folderName}' trên Google Drive: ${err}`);
    }

    const created = (await createRes.json()) as { id: string };
    this.folderCache.set(cacheKey, created.id);
    return created.id;
  }

  async uploadFile(opts: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    parentFolderId: string;
  }): Promise<{ fileId: string; webViewLink?: string; size: number }> {
    const token = await this.getAccessToken();
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: opts.fileName,
      parents: [opts.parentFolderId],
      mimeType: opts.mimeType,
    };

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${opts.mimeType}\r\n\r\n`,
      ),
      opts.buffer,
      Buffer.from(closeDelimiter),
    ]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,size',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartRequestBody.length),
        },
        body: multipartRequestBody,
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Lỗi upload ảnh lên Google Drive: ${err}`);
    }

    const data = (await res.json()) as { id: string; webViewLink?: string; size?: string };
    return {
      fileId: data.id,
      webViewLink: data.webViewLink,
      size: Number(data.size) || opts.buffer.length,
    };
  }

  async getFileStream(fileId: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    mimeType: string;
    fileName: string;
    size?: number;
  }> {
    const token = await this.getAccessToken();

    // Lấy metadata
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    let mimeType = 'image/jpeg';
    let fileName = 'image.jpg';
    let size: number | undefined;

    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { name?: string; mimeType?: string; size?: string };
      if (meta.mimeType) mimeType = meta.mimeType;
      if (meta.name) fileName = meta.name;
      if (meta.size) size = Number(meta.size);
    }

    // Lấy media stream
    const mediaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!mediaRes.ok || !mediaRes.body) {
      throw new Error(`Không thể đọc tệp từ Google Drive (Status: ${mediaRes.status})`);
    }

    return {
      stream: mediaRes.body,
      mimeType,
      fileName,
      size,
    };
  }

  async deleteFileOrFolder(fileOrFolderId: string): Promise<boolean> {
    if (!fileOrFolderId) return false;
    try {
      const token = await this.getAccessToken();
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileOrFolderId)}?supportsAllDrives=true`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 404) {
        const errText = await res.text();
        this.logger.warn(`Lỗi xóa tệp/thư mục ${fileOrFolderId} trên Google Drive (${res.status}): ${errText}`);
        return false;
      }
      this.logger.log(`Đã xóa thành công tệp/thư mục ${fileOrFolderId} trên Google Drive.`);
      return true;
    } catch (err: any) {
      this.logger.error(`Exception khi xóa tệp/thư mục ${fileOrFolderId} trên Google Drive: ${err?.message || err}`);
      return false;
    }
  }

  async getDriveStatus(): Promise<{
    connected: boolean;
    userEmail?: string;
    userName?: string;
    storageQuota?: {
      limit?: string;
      usage?: string;
      usageInDrive?: string;
      usageInDriveTrash?: string;
    };
    rootFolderId: string;
  }> {
    try {
      const token = await this.getAccessToken();
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        return { connected: false, rootFolderId: this.rootFolderId };
      }
      const data = (await res.json()) as {
        user?: { displayName?: string; emailAddress?: string };
        storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string };
      };
      return {
        connected: true,
        userEmail: data.user?.emailAddress,
        userName: data.user?.displayName,
        storageQuota: data.storageQuota,
        rootFolderId: this.rootFolderId,
      };
    } catch (error: any) {
      this.logger.error(`Error checking Google Drive status: ${error?.message || error}`);
      return { connected: false, rootFolderId: this.rootFolderId };
    }
  }
}

