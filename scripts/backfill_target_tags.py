"""
一次性回填腳本：為社群（gratitude_entries）中缺少分類標籤的貼文補上 target_1/2/3。

背景：社群動態的分類標籤（身邊他人/自己/環境/體驗/自訂）由 community 頁面的
tagsFromEntry() 從 target_1/2/3 欄位產生。早期貼文沒有 target_*（有些只有舊的中文
tag_*，有些兩者皆無），因此在社群上不顯示任何標籤。

本腳本：
  1. 抓出所有 is_shared 且 target_1 IS NULL 的貼文。
  2. 若有舊的中文 tag_1/2/3 → 直接映射為 target code（免 AI、精準）。
  3. 否則 → 用與後端 /api/tag-gratitude-targets 完全相同的模型與提示詞做分類。
  4. PATCH 回 target_1/2/3。

用法：
  python3 scripts/backfill_target_tags.py            # dry-run，只印出將要寫入的內容
  python3 scripts/backfill_target_tags.py --apply    # 實際寫入資料庫
"""

import json
import os
import re
import sys

import anthropic
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # service_role
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

SUPABASE_REST = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

VALID_TARGETS = {"others", "self", "environment", "experience", "custom"}

# 舊中文標籤 → target code（與前端 TARGET_LABELS 對應）
ZH_TO_CODE = {
    "身邊他人": "others",
    "自己": "self",
    "環境": "environment",
    "體驗": "experience",
    "自訂": "custom",
}

APPLY = "--apply" in sys.argv

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def map_legacy(tag: str | None) -> str | None:
    if not tag:
        return None
    return ZH_TO_CODE.get(tag.strip())


def classify_with_claude(item_1: str, item_2: str, item_3: str) -> dict[int, str]:
    """與後端 /api/tag-gratitude-targets 相同的模型與提示詞。回傳 {item: target}。"""
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        system="你是心理學分析助手，只回傳 JSON，不要加任何前言或 markdown。",
        messages=[{
            "role": "user",
            "content": (
                "根據以下三件感恩事件，精準標記每件的感恩對象類別。\n\n"
                f"1. {item_1}\n"
                f"2. {item_2}\n"
                f"3. {item_3}\n\n"
                "規則：\n"
                "- others（身邊他人）：提及家人/朋友/伴侶/同事/陌生人/任何人名或人際關係\n"
                "- self（自己）：提及自身努力/堅持/情緒覺察/自我照顧\n"
                "- environment（環境）：提及天氣/空間/大自然/城市環境\n"
                "- experience（體驗）：提及電影/音樂/美食/旅行/活動/事物\n"
                "- custom（自訂）：其他情況\n"
                "label 填入最精簡的中文描述（2–4 字），例如「同事」「自己」「天氣」「美食」\n\n"
                "只回傳 JSON：\n"
                '{"tags":[{"item":1,"target":"others","label":"同事"},{"item":2,"target":"self","label":"自己"},{"item":3,"target":"experience","label":"體驗"}]}'
            ),
        }],
    )
    raw = msg.content[0].text if msg.content else ""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise RuntimeError(f"Claude returned non-JSON: {raw[:200]!r}")
    data = json.loads(match.group())
    out: dict[int, str] = {}
    for t in data.get("tags", []):
        item = t.get("item")
        target = t.get("target")
        if item in (1, 2, 3) and target in VALID_TARGETS:
            out[item] = target
    return out


def fetch_untagged() -> list[dict]:
    resp = httpx.get(
        f"{SUPABASE_REST}/gratitude_entries"
        "?select=id,item_1,item_2,item_3,tag_1,tag_2,tag_3"
        "&is_shared=eq.true&target_1=is.null&order=created_at.asc",
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def patch_targets(entry_id: str, targets: dict[str, str]) -> None:
    resp = httpx.patch(
        f"{SUPABASE_REST}/gratitude_entries?id=eq.{entry_id}",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=targets,
        timeout=30,
    )
    resp.raise_for_status()


def main() -> None:
    rows = fetch_untagged()
    print(f"找到 {len(rows)} 筆缺少 target 標籤的貼文\n")
    print(f"模式：{'APPLY（實際寫入）' if APPLY else 'DRY-RUN（僅預覽）'}\n")

    legacy_count = 0
    ai_count = 0
    failed: list[str] = []

    for row in rows:
        eid = row["id"]
        # 優先使用舊中文 tag_*（免 AI、精準）
        legacy = {
            1: map_legacy(row.get("tag_1")),
            2: map_legacy(row.get("tag_2")),
            3: map_legacy(row.get("tag_3")),
        }
        if any(legacy.values()):
            mapping = {k: v for k, v in legacy.items() if v}
            source = "legacy"
            legacy_count += 1
        else:
            try:
                mapping = classify_with_claude(
                    row.get("item_1") or "", row.get("item_2") or "", row.get("item_3") or ""
                )
                source = "claude"
                ai_count += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗ {eid[:8]} 分類失敗：{exc}")
                failed.append(eid)
                continue

        targets = {f"target_{i}": mapping[i] for i in (1, 2, 3) if mapping.get(i)}
        if not targets:
            print(f"  ✗ {eid[:8]} 無法產生任何 target，略過")
            failed.append(eid)
            continue

        preview = ", ".join(f"{k}={v}" for k, v in targets.items())
        print(f"  • {eid[:8]} [{source}] {preview}  ｜ {(row.get('item_1') or '')[:24]}")

        if APPLY:
            try:
                patch_targets(eid, targets)
            except Exception as exc:  # noqa: BLE001
                print(f"      ✗ 寫入失敗：{exc}")
                failed.append(eid)

    print("\n──────── 摘要 ────────")
    print(f"  legacy 映射：{legacy_count} 筆")
    print(f"  AI 分類：    {ai_count} 筆")
    print(f"  失敗：       {len(failed)} 筆  {failed if failed else ''}")
    if not APPLY:
        print("\n這是 DRY-RUN。加上 --apply 才會實際寫入。")


if __name__ == "__main__":
    main()
