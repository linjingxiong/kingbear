import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StubOcrProvider } from './providers/stub-ocr.provider';
import { OpenAiCompatibleVlOcrProvider } from './providers/openai-compatible-vl-ocr.provider';

export const OCR_PROVIDER = 'OCR_PROVIDER';

// 阿里云 DashScope 的 OpenAI 兼容模式端点，通义千问 VL 系列模型都走这个
// https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
// 智谱 AI 开放平台的 OpenAI 兼容端点，GLM-4V 系列模型都走这个
// https://open.bigmodel.cn/dev/api#glm-4v
const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

@Module({
  imports: [ConfigModule],
  providers: [
    StubOcrProvider,
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService, StubOcrProvider],
      useFactory: (config: ConfigService, stub: StubOcrProvider) => {
        const provider = config.get<string>('ocr.provider');
        // 两家都是 OpenAI 兼容接口，共用 OpenAiCompatibleVlOcrProvider——以后再接别的同类模型，
        // 照这两行的样子加一个 case 就行，不用再写一个几乎一样的 provider 类
        switch (provider) {
          case 'qwen-vl':
            return new OpenAiCompatibleVlOcrProvider(config, { endpoint: QWEN_ENDPOINT, label: '通义千问 VL', defaultModel: 'qwen-vl-plus' });
          case 'zhipu-vl':
            return new OpenAiCompatibleVlOcrProvider(config, { endpoint: ZHIPU_ENDPOINT, label: '智谱 GLM-4V', defaultModel: 'glm-4v-flash' });
          default:
            return stub;
        }
      },
    },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}
