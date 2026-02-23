# Day1 Global Briefing

每日全球市场投资情报仪表板 — 美股、加密货币、市场情绪一站掌握。

## 技术栈

- **Next.js 14** (App Router) + TypeScript
- **SWR** 客户端数据获取
- **Geist Sans** + **Noto Sans SC** 字体
- 深色科技感 UI 设计

## 数据源

| 数据 | 来源 | 费用 |
|------|------|------|
| 美股价格 | Yahoo Finance API | 免费 |
| 加密货币 | CoinGecko API | 免费 |
| 恐慌贪婪指数 | alternative.me | 免费 |
| VIX / 黄金 | Yahoo Finance API | 免费 |

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入项目
3. 设置环境变量 `CRON_SECRET`（任意随机字符串）
4. 部署完成

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `CRON_SECRET` | 定时任务验证密钥 | 推荐 |
