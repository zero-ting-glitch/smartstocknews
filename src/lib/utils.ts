/**
 * 相对时间格式化
 */
export function timeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;
  return `${Math.floor(seconds / 604800)}周前`;
}

/**
 * 日期格式化（中文）
 */
export function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[date.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

/**
 * 判断是否是今天
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * 判断是否是昨天
 */
export function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * 获取日期标签（今天/昨天/具体日期）
 */
export function getDateLabel(date: Date): { main: string; sub: string } {
  if (isToday(date)) {
    return { main: '今天', sub: formatDate(date) };
  }
  if (isYesterday(date)) {
    return { main: '昨天', sub: formatDate(date) };
  }
  return { main: formatDate(date), sub: '' };
}

/**
 * 物种标签颜色映射
 */
export const speciesColors: Record<string, string> = {
  pig: '#f472b6',      // 粉
  poultry: '#a78bfa',  // 紫
  cattle: '#34d399',   // 绿
  sheep: '#fbbf24',    // 黄
};

/**
 * 物种中文名映射
 */
export const speciesNames: Record<string, string> = {
  pig: '猪',
  poultry: '禽',
  cattle: '牛',
  sheep: '羊',
};

/**
 * 信源等级标签颜色
 */
export const tierColors: Record<string, string> = {
  'T1': '#34d399',
  'T1.5': '#22d3ee',
  'T2': '#94a3b8',
};
