'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '精选', icon: '⚡', group: '内容' },
  { href: '/all', label: '全部动态', icon: '📋', group: '内容' },
  { href: '/pig', label: '猪', icon: '🐷', group: '🐄 畜牧业' },
  { href: '/poultry', label: '禽', icon: '🐔', group: '🐄 畜牧业' },
  { href: '/cattle', label: '牛', icon: '🐄', group: '🐄 畜牧业' },
  { href: '/sheep', label: '羊', icon: '🐑', group: '🐄 畜牧业' },
  { href: '/field', label: '大田', icon: '🌽', group: '🌾 种植业' },
  { href: '/fruit', label: '果蔬', icon: '🍎', group: '🌾 种植业' },
  { href: '/horticulture', label: '园艺', icon: '🌸', group: '🌾 种植业' },
];

const bottomItems = [
  { href: '/about', label: '关于', icon: 'ℹ️' },
];

export function Sidebar() {
  const pathname = usePathname();

  const groups = navItems.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-logo">
        <h1 className="sidebar-title">
          <span className="sidebar-title-highlight">Smart</span>Stock
        </h1>
        <p className="sidebar-subtitle">智慧农业信息聚合</p>
      </Link>

      <nav className="flex-1">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-2">
            <div className="side-group">{group}</div>
            {items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link ${pathname === item.href ? 'side-link-active' : ''}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        {bottomItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`side-link ${pathname === item.href ? 'side-link-active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
