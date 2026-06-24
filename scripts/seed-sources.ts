import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding sources...');

  const configPath = join(process.cwd(), 'data', 'sources.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  for (const source of config.sources) {
    try {
      await prisma.source.upsert({
        where: { id: source.id },
        update: {
          name: source.name,
          nameZh: source.nameZh,
          url: source.url,
          rssUrl: source.rssUrl,
          tier: source.tier,
          species: source.species,
          category: source.category,
        },
        create: {
          id: source.id,
          name: source.name,
          nameZh: source.nameZh,
          url: source.url,
          rssUrl: source.rssUrl,
          tier: source.tier,
          species: source.species,
          category: source.category,
        },
      });
      console.log(`✓ ${source.name}`);
    } catch (error) {
      console.error(`✗ ${source.name}:`, error);
    }
  }

  const count = await prisma.source.count();
  console.log(`\nDone! ${count} sources in database.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
