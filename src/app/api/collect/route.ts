import { NextResponse } from 'next/server';
import { collectAll } from '@/lib/collector';
import { processItems } from '@/lib/processor';

export async function POST(request: Request) {
  // 验证 admin token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Stage 1: 采集
    console.log('[API] Starting collection...');
    const collectResult = await collectAll();
    console.log(`[API] Collected: ${collectResult.collected} raw, ${collectResult.filtered} filtered`);

    // Stage 2 & 3: AI处理 + 代码计算
    console.log('[API] Starting processing...');
    const processResult = await processItems();
    console.log(`[API] Processed: ${processResult.processed}, Featured: ${processResult.featured}`);

    return NextResponse.json({
      success: true,
      collect: collectResult,
      process: processResult,
    });
  } catch (error) {
    console.error('[API] Collection failed:', error);
    return NextResponse.json(
      { error: 'Collection failed' },
      { status: 500 }
    );
  }
}
