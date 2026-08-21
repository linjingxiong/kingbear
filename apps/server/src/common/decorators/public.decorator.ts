import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记某个路由不需要登录（目前只有 POST /api/auth/login 用到） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
