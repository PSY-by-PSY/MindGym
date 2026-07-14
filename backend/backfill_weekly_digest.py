#!/usr/bin/env python3
"""
補做過去週日的 AI 週分析（每週日一筆）。
使用方式：
  python backfill_weekly_digest.py <user_id> <access_token> [start_date]
例如：
  python backfill_weekly_digest.py user123 eyJhbGc... 2026-06-15

會為以下周日各生成一次分析：6/15, 6/22, 6/29, 7/6, 7/12（如果有足夠的感恩日記）。
"""

import asyncio
import sys
from datetime import datetime, timedelta
import httpx

API_BASE = "http://localhost:8000"  # 改成正式站網址時替換為實際後端


async def backfill_sunday(user_id: str, access_token: str, sunday_date: str):
    """為指定的周日（期間的週一）生成一次 AI 週分析。"""
    # sunday_date 是該週的周日日期，但後端期望週一日期（period_start）
    # 例如 7/12（周日），對應週一是 7/6
    sunday = datetime.strptime(sunday_date, "%Y-%m-%d").date()
    monday = sunday - timedelta(days=6)  # 往前推 6 天得到週一

    period_start = monday.isoformat()

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{API_BASE}/api/reviews/weekly-digest",
                json={"period_start": period_start},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30,
            )

            if resp.status_code == 200:
                result = resp.json()
                print(f"✓ {sunday_date} ({period_start}～{sunday}): AI 分析已生成")
                return True
            elif resp.status_code == 409:
                detail = resp.json().get("detail", "")
                print(f"⚠ {sunday_date} ({period_start}～{sunday}): {detail}")
                return False
            else:
                print(f"✗ {sunday_date}: 錯誤 {resp.status_code} - {resp.text[:200]}")
                return False
        except Exception as e:
            print(f"✗ {sunday_date}: 異常 - {type(e).__name__}: {e}")
            return False


async def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    user_id = sys.argv[1]
    access_token = sys.argv[2]
    start_date = sys.argv[3] if len(sys.argv) > 3 else "2026-06-15"

    # 預設補做的所有周日
    sundays = ["2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-12"]

    # 如果指定了起始日期，只補做從該日期開始的周日
    if start_date:
        sundays = [d for d in sundays if d >= start_date]

    print(f"補做 {len(sundays)} 個周日的 AI 週分析...")
    print(f"User ID: {user_id}\n")

    results = []
    for sunday in sundays:
        result = await backfill_sunday(user_id, access_token, sunday)
        results.append(result)
        await asyncio.sleep(0.5)  # 避免 rate limit

    print(f"\n完成：{sum(results)}/{len(results)} 成功")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
