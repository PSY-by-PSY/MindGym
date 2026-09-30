import UIKit
import Capacitor

// 讓 WKWebView 支援「邊緣滑動返回上一頁」的原生手勢（等同 Safari 的體驗）。
// Capacitor 預設不會開啟這個手勢；開啟後，SPA 內以 History API（pushState／popstate）
// 記錄的每一步（例如練習內部的分頁）都能被滑動手勢正確地一層層退回。
// Main.storyboard 的 customClass 需指向這裡（見該檔案內 customClass="MainViewController"）。
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

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
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

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
