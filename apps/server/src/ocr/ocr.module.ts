import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StubOcrProvider } from './providers/stub-ocr.provider';
import { QwenVlOcrProvider } from './providers/qwen-vl-ocr.provider';

export const OCR_PROVIDER = 'OCR_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    StubOcrProvider,
    QwenVlOcrProvider,
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService, StubOcrProvider, QwenVlOcrProvider],
      useFactory: (config: ConfigService, stub: StubOcrProvider, qwenVl: QwenVlOcrProvider) => {
        const provider = config.get<string>('ocr.provider');
        // TODO: 以后要接 Claude / GPT-4V 的话，照 qwen-vl-ocr.provider.ts 的样子加个实现，这里加一个 case
        switch (provider) {
          case 'qwen-vl':
            return qwenVl;
          default:
            return stub;
        }
      },
    },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}
