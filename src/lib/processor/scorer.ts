import OpenAI from 'openai';
import { AIScores } from './calculator';

/**
 * AI 评分 Prompt（精简到200行以内）
 */
const SCORING_PROMPT = `你是智慧畜牧行业资深编辑。对以下新闻打5个维度的分：

维度说明：
1. 相关性(0-100)：与"智慧畜牧"（IoT/AI/自动化/机器人等技术在养殖业的应用）的关联度
2. 重要性(0-100)：对畜牧行业的影响程度（官方发布>媒体报道>个人转发）
3. 新颖性(0-100)：是否是新东西（全新技术>迭代升级>旧闻重炒）
4. 可读性(0-100)：内容质量（深度分析>简讯报道>水文）
5. 可操作性(0-100)：能否指导实践（有案例>有观点>纯新闻）

注意：
- 官方发布权重高于媒体转载
- 同一事件被多家报道，取权重最高的来源
- 营销软文降到50以下
- 纯行情价格信息直接给0分

返回JSON：{ relevance, importance, novelty, readability, actionability }`;

/**
 * DeepSeek 客户端
 */
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
});

/**
 * AI 五维评分（使用 DeepSeek V4 Pro）
 */
export async function scoreItem(title: string, summary?: string): Promise<AIScores> {
  const content = summary ? `${title}\n\n${summary}` : title;

  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SCORING_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    let text = response.choices[0]?.message?.content || '';
    console.log('[Scorer] Raw response:', text);

    // 处理 markdown 代码块包裹的 JSON
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const scores = JSON.parse(text);

    return {
      relevance: Math.min(100, Math.max(0, scores.relevance || 0)),
      importance: Math.min(100, Math.max(0, scores.importance || 0)),
      novelty: Math.min(100, Math.max(0, scores.novelty || 0)),
      readability: Math.min(100, Math.max(0, scores.readability || 0)),
      actionability: Math.min(100, Math.max(0, scores.actionability || 0)),
    };
  } catch (error) {
    console.error('[Scorer] AI scoring failed:', error);
    // 返回默认分数
    return {
      relevance: 50,
      importance: 50,
      novelty: 50,
      readability: 50,
      actionability: 50,
    };
  }
}
