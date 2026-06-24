import OpenAI from 'openai';

/**
 * DeepSeek 客户端
 */
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

/**
 * 翻译结果
 */
export interface TranslationResult {
  titleZh: string;
  summaryZh: string;
}

/**
 * 翻译 Prompt
 */
const TRANSLATION_PROMPT = `你是专业的农业科技翻译。请将以下英文内容翻译成中文：

要求：
1. 标题翻译要简洁准确，保留专业术语
2. 摘要翻译要流畅自然，不超过150字
3. 保留原文的关键信息和技术细节

返回JSON：{ "titleZh": "中文标题", "summaryZh": "中文摘要" }`;

/**
 * 翻译英文标题和摘要为中文（使用 DeepSeek V3.2）
 */
export async function translateItem(
  titleEn: string,
  contentHtml?: string
): Promise<TranslationResult> {
  // 从 HTML 中提取纯文本摘要
  const summary = contentHtml
    ? contentHtml.replace(/<[^>]*>/g, '').slice(0, 500)
    : '';

  const userContent = summary
    ? `标题：${titleEn}\n\n内容摘要：${summary}`
    : `标题：${titleEn}`;

  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: TRANSLATION_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    let text = response.choices[0]?.message?.content || '';
    console.log('[Translator] Raw response:', text);

    // 处理 markdown 代码块包裹的 JSON
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(text);

    return {
      titleZh: result.titleZh || titleEn,
      summaryZh: result.summaryZh || '',
    };
  } catch (error) {
    console.error('[Translator] Translation failed:', error);
    return {
      titleZh: titleEn,
      summaryZh: '',
    };
  }
}
