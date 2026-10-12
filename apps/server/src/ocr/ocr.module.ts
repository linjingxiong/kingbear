import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StubOcrProvider } from './providers/stub-ocr.provider';
import { QwenVlOcrProvider } from './providers/qwen-vl-ocr.provider';
import { ZhipuVlOcrProvider } from './providers/zhipu-vl-ocr.provider';

export const OCR_PROVIDER = 'OCR_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    StubOcrProvider,
    QwenVlOcrProvider,
    ZhipuVlOcrProvider,
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService, StubOcrProvider, QwenVlOcrProvider, ZhipuVlOcrProvider],
      useFactory: (config: ConfigService, stub: StubOcrProvider, qwenVl: QwenVlOcrProvider, zhipuVl: ZhipuVlOcrProvider) => {
        const provider = config.get<string>('ocr.provider');
        // TODO: 以后要接别的视觉模型的话，照 qwen-vl-ocr.provider.ts / zhipu-vl-ocr.provider.ts
        // 的样子加个实现，这里加一个 case——这两个共用 ocr-prompts.ts/ocr-parse.ts/
        // openai-compatible-vl.ts，只要新模型也是 OpenAI 兼容接口，新 provider 会很短
        switch (provider) {
          case 'qwen-vl':
            return qwenVl;
          case 'zhipu-vl':
            return zhipuVl;
          default:
            return stub;
        }
      },
    },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}
