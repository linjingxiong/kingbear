import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

/** 图片上传：本地磁盘存储，按 分类/年/月 分目录，见 architecture.md 第八节。
 * subdir 区分不同业务的图片放在哪个子目录下（入库单、资产凭证……），互不混在一起 */
function imageMulterOptions(uploadDir: string, subdir: string) {
  return {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const now = new Date();
        const dir = join(
          uploadDir,
          subdir,
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

export function inboundImageMulterOptions(uploadDir: string) {
  return imageMulterOptions(uploadDir, 'inbound');
}

/** 资产领用凭证图片（收据、签字单等） */
export function assetImageMulterOptions(uploadDir: string) {
  return imageMulterOptions(uploadDir, 'assets');
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
