import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { itemId, rating } = body;

    if (!itemId || !rating || !['up', 'down'].includes(rating)) {
      return NextResponse.json(
        { error: 'Invalid request: itemId and rating (up/down) required' },
        { status: 400 }
      );
    }

    // 检查 item 是否存在
    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // 创建反馈
    const feedback = await db.feedback.create({
      data: {
        itemId,
        rating,
      },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error('[API] Failed to create feedback:', error);
    return NextResponse.json(
      { error: 'Failed to create feedback' },
      { status: 500 }
    );
  }
}
