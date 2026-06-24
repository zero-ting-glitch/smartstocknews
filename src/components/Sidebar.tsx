'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '精选', group: '内容' },
  { href: '/all', label: '全部', group: '内容' },
  { href: '/pig', label: '猪', group: '物种' },
  { href: '/poultry', label: '禽', group: '物种' },
  { href: '/cattle', label: '牛', group: '物种' },
  { href: '/sheep', label: '羊', group: '物种' },
];

const bottomItems = [
  { href: '/about', label: '关于', group: '更多' },
];

export function Sidebar() {
  const pathname = usePathname();

  // 按 group 分组
  const groups = navItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);

  return (
    <aside className="sidebar">
      <Link href="/" className="block mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
          SmartStock
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          智慧畜牧信息聚合
        </p>
      </Link>

      <nav className="flex-1">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            <div className="side-group">{group}</div>
            {items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link ${pathname === item.href ? 'side-link-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        {bottomItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`side-link ${pathname === item.href ? 'side-link-active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
