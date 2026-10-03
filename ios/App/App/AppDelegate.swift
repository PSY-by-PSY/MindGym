import UIKit
import Capacitor

// 讓 WKWebView 支援「邊緣滑動返回上一頁」的原生手勢（等同 Safari 的體驗）。
// Capacitor 預設不會開啟這個手勢；開啟後，SPA 內以 History API（pushState／popstate）
// 記錄的每一步（例如練習內部的分頁）都能被滑動手勢正確地一層層退回。
// SceneDelegate 建立此子類別，保留原生返回手勢與捲動設定。
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
        // 保險用：Capacitor 在 prepareWebView 裡就已經設過 bounces = false
        // （CAPBridgeViewController.swift），這行其實是重複設定，留著只防 Capacitor
        // 日後改預設值。
        //
        // ⚠️ 別誤以為它能解決「滑到最上/最下出現淡藍空白」——那個症狀跟回彈無關
        //    （這行早在 2026-07 就存在，build 2 已上架仍會發生）。真正的原因是
        //    contentInset: 'always' 造成的 safe-area 內縮，解法見 capacitor.config.ts。
        webView?.scrollView.bounces = false
    }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default Configuration",
                                                sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    // ─────────────────────────────────────────────────────────────────────
    // 遠端推播（APNs）的 token 回呼 —— @capacitor/push-notifications 必需。
    //
    // 插件的 PushNotifications.register() 只做一件事：呼叫
    // UIApplication.shared.registerForRemoteNotifications()。真正的 device token
    // 由 iOS 回呼到「AppDelegate 的這兩個方法」，插件則是在 load() 時掛
    // NotificationCenter 的 observer 等 .capacitorDidRegisterForRemoteNotifications。
    // 少了下面這段轉發，token 就停在 AppDelegate 沒人接：JS 的 'registration' 與
    // 'registrationError' 事件都不會觸發，device_tokens 永遠是空的，
    // 而且「完全不會報錯」——推播就是靜默地永遠不來。
    // 見 node_modules/@capacitor/push-notifications/README.md 的 iOS 章節。
    // ⚠️ 不要在 cap sync／升級殼時弄丟這兩個方法。
    // ─────────────────────────────────────────────────────────────────────
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
