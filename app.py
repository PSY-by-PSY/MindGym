"""根目錄進入點轉接（給 Render 用）。

backend/ 重構後，FastAPI 實例移到 backend/app.py，但 Render 的 build/start
指令仍在 repo 根目錄執行（pip install -r requirements.txt、uvicorn app:app）。
這支 shim 讓根目錄的 `app:app` 對應到 backend/app.py 的 FastAPI 實例，
不必更動 Render 設定即可恢復部署。

實際後端程式請編輯 backend/app.py。
"""
import importlib.util
import os
import sys

_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

# 讓 backend/app.py 內的 `import usage_metering` 能正確解析
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

_spec = importlib.util.spec_from_file_location(
    "backend_app", os.path.join(_BACKEND_DIR, "app.py")
)
if _spec is None or _spec.loader is None:  # pragma: no cover
    raise ImportError("找不到 backend/app.py")

_module = importlib.util.module_from_spec(_spec)
sys.modules["backend_app"] = _module
_spec.loader.exec_module(_module)

# 對外暴露 FastAPI 實例，讓 `uvicorn app:app` 可用
app = _module.app
