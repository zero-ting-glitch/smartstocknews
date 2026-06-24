import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    include: { source: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`\nFound ${items.length} items:\n`);

  for (const item of items) {
    console.log(`- ${item.titleEn}`);
    console.log(`  Source: ${item.source.name} (${item.source.tier})`);
    console.log(`  URL: ${item.url}`);
    console.log(`  Species: ${item.species}`);
    console.log(`  Score: ${item.qualityScore}`);
    console.log(`  Title Zh: ${item.titleZh || '(not translated)'}`);
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
