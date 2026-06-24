import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const species = searchParams.get('species');
  const limit = parseInt(searchParams.get('limit') || '100');
  const hot = searchParams.get('hot') === 'true';

  try {
    const where: Record<string, unknown> = {
      isRelevant: true,
    };

    if (species) {
      where.species = species;
    }

    if (hot) {
      where.isHot = true;
    }

    const items = await db.item.findMany({
      where,
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('[API] Failed to fetch items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}
