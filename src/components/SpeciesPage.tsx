import { ListPageClient } from './ListPageClient';
import { getSpeciesItems, getHotItems, getStats } from '@/lib/static-data';
import { BASE_PATH } from '@/lib/config';

interface SpeciesPageProps {
  species: string;
  speciesName: string;
  titleSuffix?: string;
}

export function SpeciesPage({ species, speciesName, titleSuffix = '智养' }: SpeciesPageProps) {
  return (
    <ListPageClient
      title={`${speciesName}业${titleSuffix}`}
      subtitle={`${speciesName}业相关资讯全量信息流`}
      initialItems={getSpeciesItems(species)}
      initialHotItems={getHotItems(species)}
      initialStats={getStats()}
      itemsUrl={`${BASE_PATH}/data/items-${species}.json`}
      hotItemsUrl={`${BASE_PATH}/data/hot-items-${species}.json`}
      initialSpecies={species}
    />
  );
}
