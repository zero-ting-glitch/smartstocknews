import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [sourceCount, itemCount, featuredCount, hotCount] = await Promise.all([
      db.source.count({ where: { isActive: true } }),
      db.item.count({ where: { isRelevant: true } }),
      db.item.count({ where: { isRelevant: true, qualityScore: { gte: 60 } } }),
      db.item.count({ where: { isHot: true } }),
    ]);

    return NextResponse.json({
      sources: sourceCount,
      items: itemCount,
      featured: featuredCount,
      hot: hotCount,
    });
  } catch (error) {
    console.error('[API] Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
