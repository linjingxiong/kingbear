export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/kingbear',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  admin: {
    // 单用户模式：首次启动时如果 users 集合为空，用这组账号密码自动建管理员
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  },
  ocr: {
    // stub（不识别，走人工录入）/ qwen-vl（通义千问，阿里云 DashScope）/
    // zhipu-vl（智谱 GLM-4V，智谱 AI 开放平台，有长期免费的 glm-4v-flash）
    provider: process.env.OCR_PROVIDER ?? 'stub',
    apiKey: process.env.OCR_API_KEY ?? '',
    // 通义千问 VL 的模型名，如 qwen-vl-plus（性价比高）/ qwen-vl-max（更准）；
    // 换成智谱就填 glm-4v-flash（免费）/ glm-4v-plus（更准，收费）
    model: process.env.OCR_MODEL ?? 'qwen-vl-plus',
  },
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
});
