import { Injectable, Logger } from '@nestjs/common';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { randomUUID } from 'node:crypto';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromName?: string;
  fromEmail?: string;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function encodeUtf8Header(text: string): string {
  if (!text) return '';
  // RFC 2047 Base64 MIME header encoding
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/tr>|<\/div>|<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<td[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

class SmtpSession {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private waitResolve: ((res: { code: number; message: string }) => void) | null = null;
  private waitReject: ((err: Error) => void) | null = null;

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.checkBuffer();
    });

    this.socket.on('error', (err: Error) => {
      if (this.waitReject) {
        this.waitReject(err);
        this.waitResolve = null;
        this.waitReject = null;
      }
    });

    this.socket.on('close', () => {
      if (this.waitReject) {
        this.waitReject(new Error('Kết nối máy chủ SMTP bị đóng bất ngờ.'));
        this.waitResolve = null;
        this.waitReject = null;
      }
    });
  }

  private checkBuffer() {
    // SMTP responses end with \r\n and the last line format is "XYZ message\r\n"
    // Multi-line responses have format "XYZ-message\r\n"
    const lines = this.buffer.split(/\r?\n/);
    if (lines.length <= 1) return;

    // Check if the latest complete line is a terminal line
    for (let i = lines.length - 2; i >= 0; i--) {
      const line = lines[i];
      const match = line.match(/^(\d{3})(?: (.*))?$/);
      if (match) {
        const code = Number(match[1]);
        const fullMsg = this.buffer;
        this.buffer = lines.slice(i + 1).join('\r\n');
        if (this.waitResolve) {
          const resolve = this.waitResolve;
          this.waitResolve = null;
          this.waitReject = null;
          resolve({ code, message: fullMsg.trim() });
        }
        return;
      }
    }
  }

  readResponse(timeoutMs = 15_000): Promise<{ code: number; message: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waitReject) {
          this.waitReject(new Error('Hết thời gian chờ phản hồi từ máy chủ SMTP (Timeout).'));
          this.waitResolve = null;
          this.waitReject = null;
        }
      }, timeoutMs);

      this.waitResolve = (res) => {
        clearTimeout(timer);
        resolve(res);
      };
      this.waitReject = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      this.checkBuffer();
    });
  }

  write(cmd: string): void {
    this.socket.write(cmd + '\r\n');
  }

  upgradeToTls(host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners('data');
      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('close');

      const tlsSocket = tls.connect({
        socket: this.socket,
        host,
        rejectUnauthorized: false,
      });

      tlsSocket.once('secureConnect', () => {
        this.socket = tlsSocket;
        this.setupListeners();
        resolve();
      });

      tlsSocket.once('error', (err) => {
        reject(err);
      });
    });
  }

  close(): void {
    try {
      this.socket.end();
      this.socket.destroy();
    } catch {
      // ignore
    }
  }
}

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  private async connect(config: SmtpConfig): Promise<SmtpSession> {
    const isDirectSsl = config.port === 465 || config.secure === true;
    const timeoutMs = 12_000;

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Không thể kết nối đến máy chủ SMTP ${config.host}:${config.port} (Timeout).`));
        }
      }, timeoutMs);

      if (isDirectSsl) {
        const socket = tls.connect(
          {
            host: config.host,
            port: config.port,
            rejectUnauthorized: false,
          },
          () => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(new SmtpSession(socket));
            }
          },
        );
        socket.once('error', (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`Lỗi kết nối SSL tới máy chủ SMTP: ${err.message}`));
          }
        });
      } else {
        const socket = net.connect(
          {
            host: config.host,
            port: config.port,
          },
          () => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(new SmtpSession(socket));
            }
          },
        );
        socket.once('error', (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error(`Lỗi kết nối tới máy chủ SMTP: ${err.message}`));
          }
        });
      }
    });
  }

  /**
   * Verify SMTP credentials and connectivity
   */
  async verify(config: SmtpConfig): Promise<{ success: boolean; message: string }> {
    let session: SmtpSession | null = null;
    try {
      session = await this.connect(config);

      // 1. Initial greeting
      const greet = await session.readResponse();
      if (greet.code !== 220) {
        throw new Error(`Máy chủ từ chối kết nối (${greet.code}: ${greet.message})`);
      }

      // 2. EHLO
      const ehloDomain = config.host.includes('gmail') ? 'mail.gmail.com' : (config.host || 'localhost');
      session.write(`EHLO ${ehloDomain}`);
      let ehlo = await session.readResponse();
      if (ehlo.code !== 250) {
        throw new Error(`Lỗi lệnh EHLO (${ehlo.code}: ${ehlo.message})`);
      }

      // 3. STARTTLS if port 587 and not SSL
      const isDirectSsl = config.port === 465 || config.secure === true;
      if (!isDirectSsl) {
        session.write('STARTTLS');
        const starttls = await session.readResponse();
        if (starttls.code !== 220) {
          throw new Error(`Máy chủ không hỗ trợ STARTTLS (${starttls.code}: ${starttls.message})`);
        }
        await session.upgradeToTls(config.host);
        session.write(`EHLO ${ehloDomain}`);
        ehlo = await session.readResponse();
        if (ehlo.code !== 250) {
          throw new Error(`Lỗi lệnh EHLO sau STARTTLS (${ehlo.code})`);
        }
      }

      // 4. AUTH LOGIN
      session.write('AUTH LOGIN');
      const authPrompt = await session.readResponse();
      if (authPrompt.code !== 334) {
        throw new Error(`Máy chủ không chấp nhận AUTH LOGIN (${authPrompt.code}: ${authPrompt.message})`);
      }

      // 5. Send Username
      session.write(Buffer.from(config.user.trim()).toString('base64'));
      const userPrompt = await session.readResponse();
      if (userPrompt.code !== 334) {
        throw new Error(`Tên đăng nhập SMTP không được chấp nhận (${userPrompt.code}: ${userPrompt.message})`);
      }

      // 6. Send Password
      session.write(Buffer.from(config.pass.trim()).toString('base64'));
      const authRes = await session.readResponse();
      if (authRes.code !== 235) {
        throw new Error(`Đăng nhập SMTP thất bại (${authRes.code}). Vui lòng kiểm tra lại mật khẩu ứng dụng / app password.`);
      }

      // 7. QUIT
      session.write('QUIT');
      await session.readResponse(3000).catch(() => null);

      return {
        success: true,
        message: 'Kết nối và xác thực SMTP thành công!',
      };
    } catch (err: any) {
      this.logger.warn(`SMTP verify failed: ${err.message}`);
      return {
        success: false,
        message: err.message || 'Lỗi kết nối SMTP không xác định.',
      };
    } finally {
      session?.close();
    }
  }

  /**
   * Send a single payslip email via SMTP
   */
  async sendMail(config: SmtpConfig, options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    let session: SmtpSession | null = null;
    try {
      session = await this.connect(config);

      // 1. Initial greeting
      const greet = await session.readResponse();
      if (greet.code !== 220) {
        throw new Error(`Máy chủ từ chối kết nối (${greet.code}: ${greet.message})`);
      }

      // 2. EHLO
      const ehloDomain = config.host.includes('gmail') ? 'mail.gmail.com' : (config.host || 'localhost');
      session.write(`EHLO ${ehloDomain}`);
      let ehlo = await session.readResponse();
      if (ehlo.code !== 250) {
        throw new Error(`Lỗi lệnh EHLO (${ehlo.code})`);
      }

      // 3. STARTTLS if needed
      const isDirectSsl = config.port === 465 || config.secure === true;
      if (!isDirectSsl) {
        session.write('STARTTLS');
        const starttls = await session.readResponse();
        if (starttls.code !== 220) {
          throw new Error(`Lỗi STARTTLS (${starttls.code})`);
        }
        await session.upgradeToTls(config.host);
        session.write(`EHLO ${ehloDomain}`);
        ehlo = await session.readResponse();
        if (ehlo.code !== 250) {
          throw new Error(`Lỗi lệnh EHLO sau STARTTLS (${ehlo.code})`);
        }
      }

      // 4. AUTH LOGIN
      session.write('AUTH LOGIN');
      const authPrompt = await session.readResponse();
      if (authPrompt.code !== 334) {
        throw new Error(`Máy chủ không chấp nhận AUTH LOGIN (${authPrompt.code})`);
      }

      session.write(Buffer.from(config.user.trim()).toString('base64'));
      const userPrompt = await session.readResponse();
      if (userPrompt.code !== 334) {
        throw new Error(`Tên đăng nhập SMTP sai (${userPrompt.code})`);
      }

      session.write(Buffer.from(config.pass.trim()).toString('base64'));
      const authRes = await session.readResponse();
      if (authRes.code !== 235) {
        throw new Error(`Mật khẩu ứng dụng SMTP không chính xác (${authRes.code})`);
      }

      // 5. MAIL FROM
      const senderEmail = config.fromEmail || config.user;
      session.write(`MAIL FROM:<${senderEmail}>`);
      const mailFrom = await session.readResponse();
      if (mailFrom.code !== 250) {
        throw new Error(`MAIL FROM bị từ chối (${mailFrom.code}: ${mailFrom.message})`);
      }

      // 6. RCPT TO
      session.write(`RCPT TO:<${options.to.trim()}>`);
      const rcptTo = await session.readResponse();
      if (rcptTo.code !== 250 && rcptTo.code !== 251) {
        throw new Error(`Địa chỉ người nhận "${options.to}" bị từ chối (${rcptTo.code}: ${rcptTo.message})`);
      }

      // 7. DATA
      session.write('DATA');
      const dataPrompt = await session.readResponse();
      if (dataPrompt.code !== 354) {
        throw new Error(`Máy chủ không nhận dữ liệu (${dataPrompt.code})`);
      }

      // 8. Build RFC 2822 Message (Anti-Spam hardened: multipart/alternative, clean Message-ID, unquoted encoded From)
      const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : 'gmail.com';
      const messageId = `<${Date.now()}.${randomUUID().replace(/-/g, '').slice(0, 16)}@${senderDomain}>`;
      const senderName = config.fromName || 'Nha Khoa 5S - Phòng Nhân Sự';
      // RFC 2047: DO NOT wrap encoded words in quotation marks!
      const encodedFrom = senderName
        ? `${encodeUtf8Header(senderName)} <${senderEmail}>`
        : `<${senderEmail}>`;
      const encodedSubject = encodeUtf8Header(options.subject);
      const dateStr = new Date().toUTCString();

      const plainText = options.text?.trim() || stripHtmlToPlainText(options.html);
      const boundary = `----=_Part_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

      const base64Plain = Buffer.from(plainText, 'utf8').toString('base64');
      const chunkedPlain = base64Plain.match(/.{1,76}/g)?.join('\r\n') || base64Plain;

      const base64Html = Buffer.from(options.html, 'utf8').toString('base64');
      const chunkedHtml = base64Html.match(/.{1,76}/g)?.join('\r\n') || base64Html;

      const messageHeaders = [
        `From: ${encodedFrom}`,
        `To: <${options.to.trim()}>`,
        `Reply-To: <${senderEmail}>`,
        `Subject: ${encodedSubject}`,
        `Date: ${dateStr}`,
        `Message-ID: ${messageId}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        `X-Mailer: ClinicHub-Payroll-Dispatcher/2.0`,
        `Auto-Submitted: auto-generated`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        chunkedPlain,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: base64`,
        ``,
        chunkedHtml,
        ``,
        `--${boundary}--`,
        `.`,
      ].join('\r\n');

      session.write(messageHeaders);
      const sendRes = await session.readResponse(25_000);
      if (sendRes.code !== 250) {
        throw new Error(`Lỗi gửi thư (${sendRes.code}: ${sendRes.message})`);
      }

      // 9. QUIT
      session.write('QUIT');
      await session.readResponse(3000).catch(() => null);

      return {
        success: true,
        messageId,
      };
    } catch (err: any) {
      this.logger.error(`Send mail error to ${options.to}: ${err.message}`);
      return {
        success: false,
        error: err.message || 'Lỗi gửi thư không xác định',
      };
    } finally {
      session?.close();
    }
  }
}
