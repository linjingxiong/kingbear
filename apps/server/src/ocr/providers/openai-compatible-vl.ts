// 通义千问 VL（DashScope）、智谱 GLM-4V 这些视觉模型都兼容 OpenAI 的 chat/completions
// 接口格式（图片用 image_url，文本用 text，结果在 choices[0].message.content）——调用这部分
// 跟具体是哪个厂商无关，共用这一份，各 provider 只需要传各自的 endpoint/apiKey/model

import { Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { extname } from 'path';

interface CallOpenAiCompatibleVlOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userText: string;
  imagePath: string;
  /** 打日志用，比如"通义千问 VL"/"智谱 GLM-4V"，方便看出是哪个 provider 调用失败了 */
  providerLabel: string;
  logger: Logger;
}

/** 调一次 OpenAI 兼容格式的视觉模型，返回模型输出的文本；出错返回 null */
export async function callOpenAiCompatibleVl(options: CallOpenAiCompatibleVlOptions): Promise<string | null> {
  const { endpoint, apiKey, model, systemPrompt, userText, imagePath, providerLabel, logger } = options;
  try {
    const imageDataUri = await toDataUri(imagePath);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUri } },
              { type: 'text', text: userText },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      logger.error(`${providerLabel} 调用失败 (HTTP ${response.status}): ${errText}`);
      return null;
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    logger.error(`${providerLabel} 调用异常: ${(err as Error).message}`);
    return null;
  }
}

async function toDataUri(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const mime = mimeFromExt(extname(filePath));
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}
