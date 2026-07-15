import type { Translation } from '../dictionary'

// 社群動態頁：貼文、按讚、留言、檢舉/封鎖、工作坊貼文區塊。
export const community: Record<string, Translation> = {
  '{date} 工作坊': { 'zh-CN': '{date} 工作坊', en: '{date} Workshop' },

  // Header
  '健身房動態': { 'zh-CN': '健身房动态', en: 'Gym Feed' },
  '大家今天感謝了什麼？': { 'zh-CN': '大家今天感恩了什么？', en: 'What is everyone grateful for today?' },

  // Loading / load more
  '載入更多…': { 'zh-CN': '加载更多…', en: 'Loading more…' },

  // Pull to refresh
  '更新中…': { 'zh-CN': '更新中…', en: 'Refreshing…' },
  '放開以重整': { 'zh-CN': '松开以刷新', en: 'Release to refresh' },
  '下拉重整': { 'zh-CN': '下拉刷新', en: 'Pull to refresh' },

  // 翻譯粉粿：貼文按需翻譯
  '翻譯粉粿': { 'zh-CN': '翻译粉粿', en: 'Translate' },
  '翻譯中…': { 'zh-CN': '翻译中…', en: 'Translating…' },
  '顯示原文': { 'zh-CN': '显示原文', en: 'Show original' },
  '翻譯失敗，請稍後再試': { 'zh-CN': '翻译失败，请稍后再试', en: 'Translation failed, please try again later' },

  // Daily modal
  '關閉': { 'zh-CN': '关闭', en: 'Close' },
  '今日社群動態': { 'zh-CN': '今日社区动态', en: "Today's Community Post" },
  '頭像': { 'zh-CN': '头像', en: 'Avatar' },
  '匿名使用者': { 'zh-CN': '匿名用户', en: 'Anonymous user' },
  '檢舉或封鎖': { 'zh-CN': '举报或封锁', en: 'Report or block' },
  '檢舉貼文': { 'zh-CN': '举报帖子', en: 'Report post' },
  '封鎖此使用者': { 'zh-CN': '封锁此用户', en: 'Block this user' },
  '這位使用者': { 'zh-CN': '这位用户', en: 'this user' },
  '按讚': { 'zh-CN': '赞', en: 'Like' },
  '留下你的鼓勵': { 'zh-CN': '留下你的鼓励', en: 'Leave some encouragement' },
  '已送出 {n} 則留言，謝謝你的鼓勵': { 'zh-CN': '已发送 {n} 条留言，谢谢你的鼓励', en: 'Sent {n} comments — thanks for the encouragement' },
  '留下鼓勵的話… (Enter 送出)': { 'zh-CN': '留下鼓励的话…（按 Enter 送出）', en: 'Leave an encouraging word… (Enter to send)' },
  '送出': { 'zh-CN': '提交', en: 'Send' },
  '請先登入才能留言': { 'zh-CN': '请先登录才能留言', en: 'Please log in to leave a comment' },

  // Feed mode toggle
  '社群貼文': { 'zh-CN': '社区帖子', en: 'Community' },
  '工作坊貼文': { 'zh-CN': '工作坊帖子', en: 'Workshop' },
  '我的貼文': { 'zh-CN': '我的帖子', en: 'My Posts' },

  // Sort select
  '排序': { 'zh-CN': '排序', en: 'Sort' },
  '最新': { 'zh-CN': '最新', en: 'Latest' },
  '最相關': { 'zh-CN': '最相关', en: 'Most Relevant' },

  // Empty states
  '還沒有打卡紀錄，快按下訓練中心，開始第一次訓練！': {
    'zh-CN': '还没有打卡记录，快按下训练中心，开始第一次训练吧！',
    en: 'No check-ins yet — tap Training Center to start your first session!',
  },
  '已經看完所有打卡紀錄囉！': { 'zh-CN': '已经看完所有打卡记录啦！', en: "You've seen all the check-ins!" },
  '還沒有人分享，快去寫感恩日記吧！': {
    'zh-CN': '还没有人分享，快去写感恩日记吧！',
    en: 'No one has shared yet — go write a gratitude journal entry!',
  },
  '感恩文字雲': { 'zh-CN': '感恩文字云', en: 'Gratitude word cloud' },

  // Workshop tab
  '請先登入，並完成工作坊練習後，即可在此看到你參加過的工作坊貼文。': {
    'zh-CN': '请先登录，并完成工作坊练习后，即可在此看到你参加过的工作坊帖子。',
    en: 'Please log in and complete a workshop exercise to see the workshop posts you’ve joined here.',
  },
  '工作坊列表': { 'zh-CN': '工作坊列表', en: 'Workshop List' },
  '這個工作坊還沒有公開的貼文。': { 'zh-CN': '这个工作坊还没有公开的帖子。', en: 'No public posts in this workshop yet.' },
  '已經看完所有貼文囉！': { 'zh-CN': '已经看完所有帖子啦！', en: "You've seen all the posts!" },
  '完成並發佈工作坊練習後，這裡會出現你參加過的工作坊。': {
    'zh-CN': '完成并发布工作坊练习后，这里会出现你参加过的工作坊。',
    en: 'Once you complete and publish a workshop exercise, the workshops you’ve joined will appear here.',
  },
  '{n} 則貼文': { 'zh-CN': '{n} 条帖子', en: '{n} posts' },

  // Scroll end modal
  '看完所有貼文囉！': { 'zh-CN': '已经看完所有帖子啦！', en: "You've seen all the posts!" },
  '請回到原本的頁面繼續進行活動。': { 'zh-CN': '请回到原本的页面继续进行活动。', en: 'Please go back to continue the activity.' },
  '我知道了': { 'zh-CN': '我知道了', en: 'Got it' },

  // Gratitude target tags
  '身邊他人': { 'zh-CN': '身边他人', en: 'People Around Me' },
  '自己': { 'zh-CN': '自己', en: 'Myself' },
  '環境': { 'zh-CN': '环境', en: 'Environment' },
  '體驗': { 'zh-CN': '体验', en: 'Experience' },
  '自訂': { 'zh-CN': '自定义', en: 'Custom' },

  // Practice tags
  '過程目標覺察': { 'zh-CN': '过程目标觉察', en: 'Process Goal Awareness' },
  '找尋真實自我': { 'zh-CN': '寻找真实自我', en: 'Finding Your Authentic Self' },
  '生命最後一天': { 'zh-CN': '生命最后一天', en: 'Last Day of Life' },
  'WOOP 目標實踐地圖': { 'zh-CN': 'WOOP 目标实践地图', en: 'WOOP Goal Action Map' },
  '專業模組': { 'zh-CN': '专业模块', en: 'Practitioner Module' },
  '感恩日記': { 'zh-CN': '感恩日记', en: 'Gratitude Journal' },

  // Practice body labels
  '我遇到的困境': { 'zh-CN': '我遇到的困境', en: 'The challenge I faced' },
  'Bouba 專注錦囊': { 'zh-CN': 'Bouba 专注锦囊', en: 'Bouba Focus Tips' },
  '最讓我感到專注的': { 'zh-CN': '最让我感到专注的', en: 'What made me feel most focused' },
  '我通常在這樣的條件下完成': { 'zh-CN': '我通常在这样的条件下完成', en: 'I usually get this done under these conditions' },
  'Bouba 回饋': { 'zh-CN': 'Bouba 反馈', en: 'Bouba Feedback' },
  '人': { 'zh-CN': '人', en: 'Who' },
  '時': { 'zh-CN': '时', en: 'When' },
  '地': { 'zh-CN': '地', en: 'Where' },
  '工作中最重要的事件': { 'zh-CN': '工作中最重要的事件', en: 'The most important event at work' },
  '生活中最重要的事件': { 'zh-CN': '生活中最重要的事件', en: 'The most important event in life' },
  '原因：{reason}': { 'zh-CN': '原因：{reason}', en: 'Reason: {reason}' },
  '我的自我敘事': { 'zh-CN': '我的自我叙事', en: 'My Self-Narrative' },
  '我希望被記得的樣子': { 'zh-CN': '我希望被记得的样子', en: 'How I want to be remembered' },
  '一個「{description}」的人': { 'zh-CN': '一个「{description}」的人', en: 'Someone who is "{description}"' },
  '接下來一個月，我想要': { 'zh-CN': '接下来一个月，我想要', en: 'Over the next month, I want to' },
  'W・設定目標': { 'zh-CN': 'W・设定目标', en: 'W · Wish' },
  'O・看見結果': { 'zh-CN': 'O・看见结果', en: 'O · Outcome' },
  'O・覺察阻礙': { 'zh-CN': 'O・觉察阻碍', en: 'O · Obstacle' },
  'P・If-Then 執行計畫': { 'zh-CN': 'P・If-Then 执行计划', en: 'P · If-Then Plan' },
  '如果{obstacle}，那麼我就{plan}。': { 'zh-CN': '如果{obstacle}，那么我就{plan}。', en: 'If {obstacle}, then I will {plan}.' },
  '練習摘要': { 'zh-CN': '练习摘要', en: 'Practice Summary' },

  // Report / block sheets
  '檢舉這則{targetLabel}': { 'zh-CN': '举报这条{targetLabel}', en: 'Report this {targetLabel}' },
  '貼文': { 'zh-CN': '帖子', en: 'post' },
  '留言': { 'zh-CN': '留言', en: 'comment' },
  '請選擇檢舉原因（可複選），我們會盡快審核。系統不會通知對方。': {
    'zh-CN': '请选择举报原因（可复选），我们会尽快审核。系统不会通知对方。',
    en: 'Select the reason(s) for reporting (multiple choice allowed). We’ll review it soon — the other person won’t be notified.',
  },
  '補充說明（選填）': { 'zh-CN': '补充说明（选填）', en: 'Additional notes (optional)' },
  '送出失敗，請稍後再試。': { 'zh-CN': '提交失败，请稍后再试。', en: 'Failed to submit — please try again later.' },
  '送出中…': { 'zh-CN': '提交中…', en: 'Submitting…' },
  '送出檢舉': { 'zh-CN': '提交举报', en: 'Submit Report' },
  '封鎖 {label}？': { 'zh-CN': '封锁 {label}？', en: 'Block {label}?' },
  '封鎖後，你將不會再看到這位使用者的貼文與留言。你可以隨時到「個人檔案」解除封鎖。': {
    'zh-CN': '封锁后，你将不会再看到这位用户的帖子与留言。你可以随时到「个人档案」解除封锁。',
    en: 'Once blocked, you’ll no longer see this user’s posts or comments. You can unblock them anytime from your Profile.',
  },
  '封鎖失敗，請稍後再試。': { 'zh-CN': '封锁失败，请稍后再试。', en: 'Failed to block — please try again later.' },
  '取消': { 'zh-CN': '取消', en: 'Cancel' },
  '封鎖中…': { 'zh-CN': '封锁中…', en: 'Blocking…' },
  '封鎖': { 'zh-CN': '封锁', en: 'Block' },

  // Entry card
  '連續 {n} 天': { 'zh-CN': '连续 {n} 天', en: '{n}-day streak' },
  '僅限本人': { 'zh-CN': '仅限本人', en: 'Private' },
  '更多選項': { 'zh-CN': '更多选项', en: 'More options' },
  '隱私設定': { 'zh-CN': '隐私设置', en: 'Privacy Settings' },
  '已收到你的檢舉': { 'zh-CN': '已收到你的举报', en: 'Your report has been received' },
  '我們會盡快審核，感謝你協助維護社群。': {
    'zh-CN': '我们会尽快审核，感谢你协助维护社区。',
    en: 'We’ll review it soon — thank you for helping keep the community safe.',
  },
  '{n} 則留言': { 'zh-CN': '{n} 条留言', en: '{n} comments' },
  '已收到你的留言檢舉，我們會盡快審核。': {
    'zh-CN': '已收到你的留言举报，我们会尽快审核。',
    en: 'Your comment report has been received — we’ll review it soon.',
  },
  '匿': { 'zh-CN': '匿', en: 'A' },
  '回覆': { 'zh-CN': '回复', en: 'Reply' },
  '檢舉或封鎖留言': { 'zh-CN': '举报或封锁留言', en: 'Report or block comment' },
  '檢舉留言': { 'zh-CN': '举报留言', en: 'Report comment' },
  '回覆 {name}… (Enter 送出)': { 'zh-CN': '回复 {name}…（按 Enter 送出）', en: 'Reply to {name}… (Enter to send)' },
}
