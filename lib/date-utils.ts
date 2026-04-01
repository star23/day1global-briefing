// 获取北京时间（UTC+8）的日期字符串 YYYY-MM-DD
// 用于音频文件命名、数据库记录等，确保日期与用户视角一致
export function getTodayBeijing(): string {
  const now = new Date();
  // 加 8 小时偏移得到北京时间
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}
