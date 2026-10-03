# Capacitor 7.6.7 → 8.5.2 升級核對

日期：2026-10-03。核心、CLI、iOS 固定在 `~8.5.2`；9 個官方插件升到 8.x。維持 CocoaPods、iOS 15 最低支援版本與既有正式站 URL。

## 官方依據

- [7 → 8 升級與 breaking changes](https://capacitorjs.com/docs/updating/8-0)
- [8.5 UIScene migration](https://capacitorjs.com/docs/updating/8-5)
- [8.5.2 修正項目](https://github.com/ionic-team/capacitor/releases/tag/8.5.2)：含 scene 載入時序與 safe-area 修正。

以下「已核對」表示原始碼／設定已檢查，不等同所有功能已完成端對端測試。

## Breaking changes 與適用性

| 項目 | 專案核對及處置 |
| --- | --- |
| Node 22+、Xcode 26+、iOS 15+ | Node 最低版本、GitHub CI、兩份 Xcode Cloud scripts 均升 22；project/Podfile 原已為 iOS 15；實際使用 Xcode 27。 |
| 官方 plugins 8.x | App、Browser、Filesystem、Keyboard、Local/Push Notifications、Share、SplashScreen、StatusBar 全數升級，npm peer dependencies 與 CocoaPods 通過。 |
| iOS UIScene | 新增 SceneDelegate，manifest 與 AppDelegate configuration hook；加入 Xcode Sources。 |
| 自訂根控制器 | SceneDelegate 建立 MainViewController，保留返回手勢與禁止 bounce；移除 UIMainStoryboardFile，不設定 UISceneStoryboardFile，避免重複建立 WebView。Main.storyboard 保留為資源但不再負責建立視窗。 |
| URL／universal-link 改由 scene 回呼 | 兩者轉發 SceneDelegateProxy；AppDelegate 舊轉發移除。保留 OAuth scheme `com.mindgym.app`。目前沒有 associated-domains entitlement。 |
| AppDelegate 前後景回呼停止 | 原有方法都是空模板，移除；没有需要搬移的業務邏輯。Capacitor 處理 scene pause/resume。 |
| 推播 AppDelegate 回呼 | APNs 成功／失敗兩個轉發完整保留，Debug/Release entitlements 不變。 |
| tmpWindow／TmpViewController 移除 | App 與 Apple Sign In 編譯來源無引用；插件內附的舊 Pods 專案不是本 app 編譯來源。 |
| applicationState／通知範圍 | 自訂原生程式未使用 applicationState；App plugin 仍使用 UIApplication 通知，本 app 明確為單 scene。舊 URL 通知仍由核心轉發。 |
| CAPBridgeViewController 通知改由核心提供 | 無自訂重複發送擴充；StatusBar 8 使用核心通知。 |
| appendUserAgent 空白修正 | 沒有設定，自訂 UA 不受影響。 |
| CLI 新建 iOS 預設 SPM | 保留現有 CocoaPods；若重建 ios，須指定 `--packagemanager CocoaPods`。 |
| Android edge-to-edge／layout 變更 | 無 Android project；adjustMarginsForEdgeToEdge、bridge_layout_main.xml 不適用。 |
| Android 工具鏈／依賴／density | 無 Android project；SDK 24/36、AGP 8.13、Gradle 8.14.3、Kotlin 2.2.20 等遷移不適用。 |
| 其他官方插件改動 | 未使用 Action Sheet、Barcode Scanner、Camera、Geolocation、Google Maps、Screen Orientation；其依賴、定位 timeout、大螢幕方向限制不適用。Browser/Push/Splash 的 Android 依賴變更亦不適用。 |

## 額外相容性核對

- Apple Sign In 最新仍為 7.1.0，peer constraint `@capacitor/core >=7.0.0`。保留原 patch；`patch-package` 成功且 Xcode 27 編譯通過。iPad presentation anchor 仍取 bridge window／前景 scene。
- Filesystem 8.1.4 需要 IONFilesystemLib 2.0.0；原 lock 的 1.1.2 阻止同步，已針對該 pod 更新並提交新 lock。專案使用的 writeFile/Share 型別建置通過；分享功能仍需實際操作。
- 維持 `contentInset: never`、CSS safe-area、`Keyboard.resize: none`；登入頁已視覺確認。鍵盤／登入返回尺寸需手動回歸。
- 遠端載入策略不變：App 載入 `https://app.psybypsy.com`。已從正式站 JS 核對 Supabase endpoint 為 `https://atnyozyfsqweiayujlfn.supabase.co`；本地 Supabase JS SDK 是 2.105.4，沒有變更。未查詢資料庫伺服器版本。本地 dist 已建置同步，但本次未部署網站，不能把它視為線上 JS 已升級。登入頁與原生 App.getInfo、LocalNotifications.checkPermissions 已跨 bridge 成功。

## 驗證結果

- `npm test`：8 files、45 tests 全通過。
- `npm run build`：TypeScript 與 Vite 通過；有 bundle size 提示。
- `npm run lint`：0 errors、5 warnings，均位於此次未修改的前端檔案。
- `npx cap sync ios`：成功，10 個插件載入；Apple Sign In patch 成功。
- `plutil -lint`、兩份 CI shell syntax、`git diff --check`：通過。
- Xcode 27.0（27A266a），iOS 27.0 SDK：Debug simulator 與 Release iphoneos 均 `BUILD SUCCEEDED`。使用 `CODE_SIGNING_ALLOWED=NO`；沒有驗證簽章 archive／上傳。
- iPhone 18 Pro，iOS 27.0（24A434）：安裝、一般啟動與登入頁顯示成功。warm scheme event 已在 console 看到 `TO JS` 及 migration-smoke URL；冷啟動 scheme 可打開 App 並渲染登入頁。冷啟動的 JS event/getLaunchUrl 尚未單獨斷言。
- 初次啟動驗證沒有登入或寫入；後續已登入測試的正式環境影響見下節。

建置警告主要來自 upstream Swift capture／unused variable、AppIntents metadata 與 CocoaPods script outputs。啟動有 SplashScreen 自動隱藏提示及 simulator WebKit accessibility duplicate-class 訊息；目前未觀察到崩潰或白畫面。`npm install` 另回報 29 個依賴弱點；此次沒有做無關依賴的大範圍修正或安全審計。

## 已登入手動測試（2026-10-03）

使用者先自行登入並確認操作正常，再授權執行測試。裝置為 **iPhone 18 Pro / iOS 27.0**。

| 項目 | 結果與範圍 |
| --- | --- |
| 登入後練習導覽 | 通過；可開啟感恩練習及既有三筆 Test 草稿。登入方法由使用者操作，未重新測試三種登入／登出。 |
| 鍵盤開關／版面 | 通過；軟體鍵盤顯示時欄位可見，收起後無黑色空白區。原生 log 回傳 keyboardHeight 328 並成功 hide。 |
| 前後景／鎖定解鎖 | 通過 UI 驗證；回到原頁，草稿保持。未另外攔截並斷言 JS pause/resume 事件。 |
| 感恩預覽／完成 | 通過；回饋預覽正常，完成後顯示今日完成 1 次。此操作有正式資料影響，見下方。 |
| PNG／Filesystem／Share | 通過；Filesystem.writeFile 與 Share.share 呼叫成功，原生面板顯示 gratitude-2026-10-03 PNG（2.8 MB）。取消後回到原頁；沒有傳送給第三方。 |
| 通知授權／本地排程 | 通過；授權 granted，schedule 回傳 IDs 1001、1002。沒有等待排程實際觸發。 |
| APNs 註冊 | 未通過此環境驗證：unsigned simulator 回報缺少有效 aps-environment entitlement；原生 registrationError 轉發正常。需簽章實機驗證，不能當作正式推播已通過。 |
| 模擬推播 | simctl push 注入成功；使用者要求結束測試時，尚未驗證通知點擊導覽。不能等同真實 APNs。 |
| iPad | 使用者明確排除，不列入本次驗收。 |
| 其他未完成項目 | 登入瀏覽器返回、實際返回手勢、冷啟動 OAuth/getLaunchUrl、登入後強制重啟、問卷／麥克風、離線恢复、簽章 Release／TestFlight；依使用者要求停止後續測試。 |

### 正式環境影響與觀察

- 捲動尚未停止時，原本要點分享的操作落在「下一步」，將使用者既有三筆 `Test` 內容儲存為一筆感恩紀錄，畫面顯示今日完成 1 次。已即時告知使用者；沒有自行刪除紀錄。
- 已允許此模擬器通知，並建立每日／每週本地提醒 1001、1002。APNs 註冊未成功。
- 圖片匯出出現遠端 Google Fonts／jsDelivr CSS 讀取錯誤，但 PNG 與分享面板仍成功；字型一致性未完整比對。
- 取消分享時插件 log 有 Share canceled，畫面正常返回，未見阻斷錯誤。

### Xcode 版本證據

兩份實際產物 Info.plist 都記錄 `DTXcode=2700`、`DTXcodeBuild=27A266a`、`DTPlatformVersion=27.0`。
Debug SDK 為 `iphonesimulator27.0`，Release SDK 為 `iphoneos27.0`，SDK build 均為 `24A430`。

編譯每次明確指定 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`（Xcode 27）。系統 xcode-select 預設仍是 Xcode 26；Simulator GUI 從 Xcode 26 bundle 開啟，但運行的是 iOS 27 runtime。沒有聲稱切換系統預設或以 Xcode 27 IDE 點擊 Build。

## 重現編譯

```sh
npm ci
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx cap sync ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/mindgym-cap85-derived CODE_SIGNING_ALLOWED=NO build
```

Release 可改 `-configuration Release -sdk iphoneos -destination 'generic/platform=iOS'` 並使用獨立 derivedDataPath。

本機證據：`/tmp/mindgym-cap85-{web-build,tests,lint,sync,xcode-build,device-build,launch-final}.log`；啟動截圖 `/tmp/mindgym-cap85-launch.png`。
