"""Send a locally generated, correctly signed UPP v2 callback to a test server.

This is a development harness, not a PAYUNi substitute and not evidence that
PAYUNi has accepted a transaction.  It deliberately uses a fake CreditHash and
requires the merchant's HashKey/HashIV only to exercise MindGym's verification
boundary.  Do not point it at production.
"""

import argparse
import sys
from pathlib import Path
from time import time
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.billing.payuni import PayUniSettings, PayUniUppProvider


def _payload(*, settings: PayUniSettings, order_no: str, amount_twd: int, outcome: str) -> dict[str, str]:
    payload = {
        "MerID": settings.merchant_id,
        "MerTradeNo": order_no,
        "TradeNo": f"SIM-{int(time())}",
        "TradeAmt": str(amount_twd),
        "Gateway": "2",
        "PaymentType": "1",
    }
    if outcome == "success":
        payload.update({
            "Status": "SUCCESS", "Message": "信用卡授權成功", "TradeStatus": "1",
            # This value is intentionally fake.  It proves only that the
            # server vault/redaction path works, never a merchant token.
            "CreditHash": "simulated-credit-hash-not-usable",
            "CreditLife": "1230",
        })
    elif outcome == "unknown":
        payload.update({"Status": "UNKNOWN", "Message": "等待授權結果逾期", "TradeStatus": "8"})
    else:
        # UPP describes failures by error code; it does not guarantee the
        # literal status FAILED.  MindGym must defer this to transaction query.
        payload.update({"Status": "E101", "Message": "模擬信用卡授權失敗", "TradeStatus": "2"})
    return payload


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--merchant-order-no", required=True)
    parser.add_argument("--amount-twd", required=True, type=int)
    parser.add_argument("--outcome", choices=("success", "unknown", "declined"), default="success")
    parser.add_argument("--callback-url", default="http://127.0.0.1:8000/v1/billing/payuni/callback")
    parser.add_argument("--allow-non-loopback", action="store_true")
    args = parser.parse_args()
    if args.amount_twd <= 0:
        parser.error("--amount-twd must be positive")
    host = urlparse(args.callback_url).hostname
    if host not in {"127.0.0.1", "localhost", "::1"} and not args.allow_non_loopback:
        parser.error("refusing a non-loopback URL; pass --allow-non-loopback only for an approved test endpoint")

    settings = PayUniSettings.from_environment()
    provider = PayUniUppProvider(settings)
    encrypted = provider.encrypt_info(_payload(
        settings=settings, order_no=args.merchant_order_no, amount_twd=args.amount_twd, outcome=args.outcome,
    ))
    fields = {
        "MerID": settings.merchant_id,
        "Version": "2.0",
        "EncryptInfo": encrypted,
        "HashInfo": provider.hash_info(encrypted),
    }
    request = Request(
        args.callback_url, data=urlencode(fields).encode(), method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urlopen(request, timeout=15) as response:
            print(f"simulated {args.outcome} callback accepted: HTTP {response.status}")
    except Exception as exc:
        print(f"simulated callback failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
