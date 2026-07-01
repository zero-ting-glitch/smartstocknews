/**
 * 清除被截断的翻译（以省略号结尾且长度不足），让管线重新处理
 * 用法: npx tsx scripts/clear-truncated.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 查找所有有翻译的条目
  const items = await prisma.item.findMany({
    where: {
      isRelevant: true,
      translationZh: { not: null },
    },
    select: { id: true, titleEn: true, translationZh: true },
  });

  let cleared = 0;
  for (const item of items) {
    const t = item.translationZh || '';
    // 判断是否被截断：以省略号结尾且长度不足
    const isTruncated = (t.endsWith('......') || t.endsWith('……')) && t.length < 200;

    if (isTruncated) {
      console.log(`  清除: ${item.titleEn?.slice(0, 60)}... (${t.length} chars)`);
      await prisma.item.update({
        where: { id: item.id },
        data: { translationZh: null },
      });
      cleared++;
    }
  }

  console.log(`\n共清除 ${cleared} 条被截断的翻译`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
