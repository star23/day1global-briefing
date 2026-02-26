// ========== 初始化数据库 ==========
// 一次性调用，创建 btc_metrics_daily 表
// GET /api/init-db?secret=YOUR_CRON_SECRET

import { NextRequest, NextResponse } from "next/server";
import { ensureTable } from "@/lib/db";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    await ensureTable();
    return NextResponse.json({ success: true, message: "表已创建/已存在" });
  } catch (err) {
    console.error("[InitDB] 建表失败:", err);
    return NextResponse.json(
      { error: "建表失败", details: String(err) },
      { status: 500 }
    );
  }
}
