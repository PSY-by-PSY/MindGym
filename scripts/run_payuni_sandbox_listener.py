"""Live PAYUNi Sandbox E2E Listener & Checkout Launcher.

Runs a local FastAPI server on port 8001 connected to the ngrok public tunnel.
Serves a one-click checkout test page, receives browser return, and intercepts
the real PAYUNi server-to-server callback webhook.
"""

import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, PlainTextResponse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.payuni import PayUniSettings, PayUniUppProvider

PAYUNI_FILE = ROOT.parent / "payuni.txt"
if not PAYUNI_FILE.exists():
    raise FileNotFoundError(f"payuni.txt not found at {PAYUNI_FILE}")

with open(PAYUNI_FILE, encoding="utf-8") as f:
    text = f.read()

mer_id = re.search(r"商店代號：\s*(\S+)", text).group(1)
hash_key = re.search(r"Hash Key:\s*(\S+)", text).group(1)
hash_iv = re.search(r"IV KEY:\s*(\S+)", text).group(1)

# ⚠️ Sandbox 測試專用：這是開發者本機的 ngrok 臨時通道，只承接 PAYUNi 測試環境的回呼。
#    不是正式環境設定，也不接觸任何正式使用者資料。正式環境的回呼網址由
#    BILLING_PAYUNI_CALLBACK_URL 環境變數提供（Render 後端），不會使用 ngrok。
NGROK_HOST = "https://unnymphean-intrapsychic-mitchell.ngrok-free.dev"

settings = PayUniSettings(
    merchant_id=mer_id,
    hash_key=hash_key,
    hash_iv=hash_iv,
    return_url=f"{NGROK_HOST}/checkout/return",
    sandbox=True,
)
provider = PayUniUppProvider(settings)

app = FastAPI(title="PAYUNi Sandbox E2E Test Server")


@app.get("/", response_class=HTMLResponse)
async def checkout_index():
    order_no = f"MG{int(time.time())}"
    amount = 100
    payload = {
        "MerID": mer_id,
        "Timestamp": str(int(time.time())),
        "MerTradeNo": order_no,
        "TradeAmt": str(amount),
        "ProdDesc": "MindGym Pro 月度方案 (Sandbox 實測)",
        "ReturnURL": f"{NGROK_HOST}/checkout/return",
        "NotifyURL": f"{NGROK_HOST}/v1/billing/payuni/callback",
    }
    encrypted = provider.encrypt_info(payload)
    hash_info = provider.hash_info(encrypted)

    html = f"""
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MindGym - PAYUNi 沙盒結帳測試</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0f172a;
                color: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
            }}
            .card {{
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 16px;
                padding: 32px;
                max-width: 520px;
                width: 90%;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
            }}
            h1 {{ font-size: 24px; margin-top: 0; color: #38bdf8; }}
            .info-row {{
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #334155;
                font-size: 14px;
            }}
            .label {{ color: #94a3b8; }}
            .value {{ font-weight: 600; color: #f1f5f9; }}
            .test-cards {{
                margin-top: 20px;
                background: #0f172a;
                border: 1px dashed #475569;
                border-radius: 8px;
                padding: 16px;
                font-size: 13px;
                line-height: 1.7;
            }}
            .test-cards code {{
                background: #334155;
                padding: 2px 6px;
                border-radius: 4px;
                color: #facc15;
            }}
            button {{
                margin-top: 24px;
                width: 100%;
                padding: 14px;
                background: #2563eb;
                color: #fff;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            }}
            button:hover {{ background: #1d4ed8; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>MindGym 金流真實驗收</h1>
            <p style="color: #94a3b8; font-size: 14px;">即將導向 PAYUNi 官方 Sandbox 支付頁進行真實授權。</p>
            
            <div class="info-row">
                <span class="label">訂單編號:</span>
                <span class="value">{order_no}</span>
            </div>
            <div class="info-row">
                <span class="label">測試商品:</span>
                <span class="value">MindGym Pro 月度方案</span>
            </div>
            <div class="info-row">
                <span class="label">結帳金額:</span>
                <span class="value">NT$ {amount}</span>
            </div>
            <div class="info-row">
                <span class="label">NotifyURL:</span>
                <span class="value" style="font-size: 11px;">{NGROK_HOST}/v1/billing/payuni/callback</span>
            </div>

            <div class="test-cards">
                <strong>💳 PAYUNi 官方沙盒測試卡號：</strong><br>
                1. <strong>VISA 測試卡</strong>：<code>4147631000000001</code><br>
                2. <strong>JCB / 國外測試卡</strong>：<code>3560511000000001</code><br>
                • 有效月年：任意未來月年 (例: <code>12/28</code>)<br>
                • 安全碼 (CVV)：任意 3 碼 (例: <code>123</code>)<br>
                • 簡訊驗證碼 (OTP)：任意 6 碼 (例: <code>123456</code>)<br>
                <small style="color: #f87171; display: block; margin-top: 6px;">💡 若 VISA 提示「不提供國內卡交易」，請改用 JCB 測試卡 <code>3560511000000001</code> 嘗試！</small>
            </div>

            <form method="POST" action="{provider.endpoint}">
                <input type="hidden" name="MerID" value="{mer_id}">
                <input type="hidden" name="Version" value="2.0">
                <input type="hidden" name="EncryptInfo" value="{encrypted}">
                <input type="hidden" name="HashInfo" value="{hash_info}">
                <button type="submit">前往 PAYUNi 刷卡測試 ➔</button>
            </form>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.post("/v1/billing/payuni/callback")
async def payuni_callback(request: Request):
    form_data = await request.form()
    fields = {k: v for k, v in form_data.items() if isinstance(v, str)}

    print("\n" + "=" * 60)
    print("🔔 [PAYUNi Webhook Received] 收到來自 PAYUNi 官方伺服器回呼！")
    print(f"Version: {fields.get('Version')}")
    print(f"HashInfo: {fields.get('HashInfo')}")

    encrypted = fields.get("EncryptInfo", "")
    hash_valid = provider.verify_hash(encrypted, fields.get("HashInfo", ""))
    print(f"Signature Verified: {'✅ VALID' if hash_valid else '❌ INVALID'}")

    if hash_valid:
        dec = provider.decrypt_info(encrypted)
        safe_keys = [
            "MerTradeNo", "TradeNo", "Status", "Message", "TradeAmt",
            "TradeStatus", "PaymentType", "PayTime", "Card6No", "Card4No",
            "CreditHash", "CreditLife"
        ]
        print("Decrypted Payload:")
        for k in safe_keys:
            if k in dec:
                print(f"  • {k}: {dec[k]}")
    print("=" * 60 + "\n")

    return PlainTextResponse("1|OK")


@app.api_route("/checkout/return", methods=["GET", "POST"], response_class=HTMLResponse)
async def checkout_return(request: Request):
    params = {}
    if request.method == "POST":
        form = await request.form()
        params = {k: v for k, v in form.items() if isinstance(v, str)}
    else:
        params = dict(request.query_params)

    status_code = params.get("Status", "UNKNOWN")
    message = "付款完成"
    mer_trade_no = ""
    trade_no = ""
    trade_amt = ""

    if "EncryptInfo" in params:
        try:
            dec = provider.decrypt_info(params["EncryptInfo"])
            message = dec.get("Message", message)
            mer_trade_no = dec.get("MerTradeNo", "")
            trade_no = dec.get("TradeNo", "")
            trade_amt = dec.get("TradeAmt", "")
        except Exception:
            pass

    html = f"""
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <title>MindGym - 付款完成</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #0f172a;
                color: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
            }}
            .card {{
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 16px;
                padding: 32px;
                max-width: 500px;
                width: 90%;
                text-align: center;
            }}
            .icon {{ font-size: 48px; margin-bottom: 16px; }}
            h1 {{ color: #4ade80; margin: 0 0 16px; }}
            .details {{ text-align: left; background: #0f172a; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 14px; line-height: 1.8; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">🎉</div>
            <h1>{message}</h1>
            <p style="color: #94a3b8;">PAYUNi 沙盒授權流程已順利完成！</p>
            <div class="details">
                <div><strong>訂單編號：</strong> {mer_trade_no}</div>
                <div><strong>PAYUNi 交易序號：</strong> {trade_no}</div>
                <div><strong>交易金額：</strong> NT$ {trade_amt}</div>
                <div><strong>狀態碼：</strong> {status_code}</div>
            </div>
            <p style="color: #64748b; font-size: 13px;">請查看本機終端機紀錄，確認背景 Webhook 是否成功接收。</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


if __name__ == "__main__":
    print(f"🚀 Starting PAYUNi Sandbox Test Server on http://127.0.0.1:8001")
    print(f"🌐 Public ngrok endpoint: {NGROK_HOST}")
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
