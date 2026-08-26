import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

/** 入库单图片：本地磁盘存储，按年/月分目录，见 architecture.md 第八节 */
export function inboundImageMulterOptions(uploadDir: string) {
  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const now = new Date();
        const dir = join(
          uploadDir,
          'inbound',
          String(now.getFullYear()),
          String(now.getMonth() + 1).padStart(2, '0'),
        );
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
      if (!/^image\/(jpeg|png|webp|jpg)$/.test(file.mimetype)) {
        cb(new BadRequestException('只支持上传图片（jpg/png/webp）'), false);
        return;
      }
      cb(null, true);
    },
    limits: { fileSize: 15 * 1024 * 1024 },
  };
}

/** 相对 uploadDir 的存储路径 → 对外可访问的 URL（main.ts 里把 uploadDir 静态暴露在 /uploads） */
export function toPublicUploadUrl(uploadDir: string, absoluteFilePath: string) {
  const relative = absoluteFilePath.split(uploadDir).pop()!.replace(/\\/g, '/');
  return `/uploads${relative}`;
}

/** toPublicUploadUrl 的反向操作：对外 URL（/uploads/xxx）→ 磁盘上的真实路径，旋转图片这类需要读写原文件的场景要用 */
export function toDiskPath(uploadDir: string, publicUrl: string) {
  const relative = publicUrl.replace(/^\/uploads/, '');
  return join(uploadDir, relative);
}
