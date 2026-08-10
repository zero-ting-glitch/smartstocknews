import { ListPageClient } from '@/components/ListPageClient';
import { getItems, getHotItems, getStats } from '@/lib/static-data';
import { BASE_PATH } from '@/lib/config';

export default function AllPage() {
  return (
    <ListPageClient
      title="全部动态"
      subtitle="智慧畜牧相关资讯全量信息流"
      initialItems={getItems()}
      initialHotItems={getHotItems()}
      initialStats={getStats()}
      itemsUrl={`${BASE_PATH}/data/items.json`}
      hotItemsUrl={`${BASE_PATH}/data/hot-items.json`}
    />
  );
}
