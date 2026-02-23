// ========== 定时任务接口 ==========
// Vercel Cron Job 每天定时调用此接口
// 用于触发数据更新，未来可扩展接入 AI 生成每日总结

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // 验证 CRON_SECRET，防止被随意调用
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 如果设置了 CRON_SECRET，则必须验证
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授权访问" }, { status: 401 });
  }

  try {
    // 调用市场数据 API 触发数据刷新
    // 使用绝对 URL 或相对路径
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/market-data`);
    const data = await res.json();

    console.log(`[Cron] 数据更新成功: ${data.timestamp}`);

    return NextResponse.json({
      success: true,
      timestamp: data.timestamp,
      message: "数据已更新",
    });
  } catch (err) {
    console.error("[Cron] 数据更新失败:", err);
    return NextResponse.json(
      { error: "数据更新失败", details: String(err) },
      { status: 500 }
    );
  }
}
