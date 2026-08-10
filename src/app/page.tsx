import { ListPageClient } from '@/components/ListPageClient';
import { getFeaturedItems, getHotItems, getStats } from '@/lib/static-data';
import { BASE_PATH } from '@/lib/config';

export default function Home() {
  return (
    <ListPageClient
      title="精选"
      subtitle="智慧农业的高价值内容"
      initialItems={getFeaturedItems()}
      initialHotItems={getHotItems()}
      initialStats={getStats()}
      itemsUrl={`${BASE_PATH}/data/items.json`}
      hotItemsUrl={`${BASE_PATH}/data/hot-items.json`}
      filterFeatured
    />
  );
}
