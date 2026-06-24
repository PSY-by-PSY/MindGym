#!/bin/sh

# ci_post_clone.sh — Xcode Cloud post-clone setup for the Capacitor iOS shell.
#
# 為什麼需要這支：
#   Xcode Cloud 只是 clone repo 後直接跑 `xcodebuild archive`，但本 repo 刻意
#   「不」commit 這些（都被 .gitignore）：
#       - node_modules
#       - dist                      (webDir，cap copy 來源)
#       - ios/App/Pods              (CocoaPods 產物)
#       - ios/App/App/public        (Capacitor 複製進去的 web 資產)
#   而 Capacitor 的 Podfile 是用相對路徑指向 node_modules（如
#   ../../node_modules/@capacitor/ios），workspace 也依賴 Pods 專案與 public 資料夾。
#   若不在這裡重新產生，archive 就會以 exit code 65 失敗（雲端是乾淨 clone，
#   不像本機 Xcode 已經有 Pods/node_modules）。
#
# 放在 repo 根目錄的 ci_scripts/ 下，Xcode Cloud 會自動於 clone 後執行。

set -e

echo "===== ci_post_clone: start ====="

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# --- Node 20（Xcode Cloud 映像未預裝 Node）---
echo "----- Installing Node 20 via Homebrew -----"
brew install node@20
# node@20 是 keg-only，需手動加進 PATH
export PATH="$(brew --prefix node@20)/bin:$PATH"
echo "node $(node --version), npm $(npm --version)"

# --- CocoaPods（映像若已預裝就略過）---
if ! command -v pod >/dev/null 2>&1; then
  echo "----- Installing CocoaPods via Homebrew -----"
  brew install cocoapods
fi
echo "pod $(pod --version)"

# --- JS 依賴 + 前端建置 + 同步原生 ---
cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "----- npm ci -----"
npm ci

# 產生 dist/（cap copy 的來源；執行期實際載入 server.url 遠端，dist 只是離線 fallback，
# 但 cap sync 仍要求 webDir 存在且 build 必須成功）
echo "----- npm run build -----"
npm run build

# 把 web 資產複製進 ios/App/App/public、更新原生設定，並執行 pod install
echo "----- npx cap sync ios -----"
npx cap sync ios

echo "===== ci_post_clone: done ====="
