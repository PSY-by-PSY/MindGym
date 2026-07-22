/* ═══════════════════════════════════════════════════════════
   大鵬 AI 賦能平台 · 教練旅程 MVP
   純前端單頁應用：資料存 localStorage，AI 直連 Anthropic API
   （直連僅供開發測試；正式產品必須改為後端代理）
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ───────── State ───────── */
const STORE_KEY = 'dapeng_mvp_v1';

const DEFAULT_STATE = {
  settings: { apiKey: '', model: 'claude-sonnet-5', coachName: '' },
  bot: { desc: '', prompt: '', chat: [], summary: '' },
  assess: { scaleId: 'perma', customScale: null, questions: null, t0: { answers: null, report: null, date: null }, t1: { answers: null, report: null, date: null } },
  transcripts: [],
  diary: { template: 'gratitude', style: '溫暖肯定', title: '', fields: null, entries: [], overall: null, weekly: null },
  review: { report: null, date: null },
  consent: { text: null, agreedAt: null }
};

/* 教練署名：顯示在所有個案看到的介面 */
function coachName() { return (state.settings.coachName || '').trim() || '你的教練'; }

/* ───────── 知情同意書 ─────────
   text 為 null 時使用預設範本（動態帶入教練署名）；教練一編輯就存為自訂版本 */
function defaultConsent() {
  const c = coachName();
  return `AI 輔助人生教練服務 · 知情同意書

歡迎你！在我們開始之前，請先花幾分鐘閱讀以下說明。

一、服務性質
${c} 提供的是人生教練服務，目的是陪伴你釐清目標、探索行動、支持改變。教練服務並非醫療行為，亦不執行《心理師法》所定之心理師業務，不進行任何診斷。

二、AI 工具的使用
本服務使用 AI 工具輔助，包括：初談對話的整理、評估問題與回顧報告的生成、晤談紀錄的分析、日記的即時回饋。所有發送給你的報告都會先經過 ${c} 確認。AI 生成的內容僅供參考，可能不完全準確。

三、資料的收集與使用
你的對話、評估回答與日記會被記錄，僅用於 ${c} 了解你的狀態、以及生成屬於你的回顧報告。資料處理過程會傳送至 AI 服務供應商（Anthropic）。你可以隨時要求查看、匯出或刪除你的資料。

四、保密與例外
${c} 會對你的所有資料保密。但在以下情況，依法律或專業倫理需要打破保密：你或他人面臨立即的人身安全危險、或法律要求揭露時。

五、這不是危機服務
如果你出現傷害自己或他人的念頭，請立即聯繫：安心專線 1925、生命線 1995，或撥打 119。AI 與教練服務都無法取代即時的專業協助。

六、自願參與
你的參與完全自願，可以隨時暫停或終止服務，不需要任何理由，也不會影響你未來尋求其他協助的權利。

七、服務期程與費用
【請教練填寫：服務週期與晤談次數、頻率、費用與付款方式、請假與取消政策】

點選「我已閱讀並同意」即表示你已理解上述內容，並同意開始這段合作。

教練：${c}
版本日期：${today()}`;
}
function consentText() { return (state.consent && state.consent.text) || defaultConsent(); }

function renderConsentStatus() {
  const el = $('consent-status');
  if (!el) return;
  if (state.consent.agreedAt) {
    el.textContent = '個案已於 ' + state.consent.agreedAt + ' 簽署';
    el.style.cssText = 'background:var(--green-bg);border-color:var(--green-border);color:var(--green-text)';
  } else {
    el.textContent = '個案尚未簽署';
    el.style.cssText = '';
  }
}
function consentReset() {
  state.consent.text = null;
  save();
  $('consent-text').value = defaultConsent();
  toast('已還原為預設範本（含你目前的教練署名）');
}
function consentPreview() {
  switchView('bot');
  botGo(3);
  renderConsentGate();
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STATE)), JSON.parse(raw));
  } catch (e) { console.warn('state load failed', e); }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); renderJourney(); }

/* ───────── Utilities ───────── */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', isErr ? 6000 : 3000);
}

function md2html(md) {
  const lines = String(md || '').split('\n');
  let html = '', inList = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const line of lines) {
    const l = line.trim();
    if (/^[-*•] /.test(l)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inline(l.slice(2)) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,3} /.test(l)) html += '<h3>' + inline(l.replace(/^#+ /, '')) + '</h3>';
    else if (l) html += '<p>' + inline(l) + '</p>';
  }
  if (inList) html += '</ul>';
  return html;
}

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const CRISIS_WORDS = ['自殺', '想死', '不想活', '自傷', '活不下去', '傷害自己', '結束生命', '輕生'];
function crisisCheck(text) { return CRISIS_WORDS.some(w => text.includes(w)); }

async function withLoading(btn, fn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> AI 處理中…';
  try { await fn(); }
  catch (e) { console.error(e); toast('發生錯誤：' + e.message, true); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

/* ───────── Claude API ───────── */
/* 注意：新款模型（Sonnet 5 起）已棄用 temperature 參數，一律不傳 */
async function callClaude({ system, messages, maxTokens = 2500, tools }) {
  const { apiKey, model } = state.settings;
  if (!apiKey) { openSettings(); throw new Error('請先在「設定」輸入 Anthropic API Key'); }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...(tools ? { tools } : {}) })
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const err = await res.json(); msg = err.error?.message || msg; } catch (_) {}
    if (res.status === 401) msg = 'API Key 無效或已過期（' + msg + '）';
    throw new Error(msg);
  }
  const data = await res.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

function parseJSONLoose(text) {
  let t = text.replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  const c = t.indexOf('['), d = t.lastIndexOf(']');
  let candidate = null;
  if (a !== -1 && (c === -1 || a < c)) candidate = t.slice(a, b + 1);
  else if (c !== -1) candidate = t.slice(c, d + 1);
  if (!candidate) throw new Error('AI 回傳的內容不是有效的 JSON，請再試一次');
  try { return JSON.parse(candidate); }
  catch (e) { throw new Error('AI 回傳的 JSON 解析失敗，請再試一次'); }
}

const LANG_RULE = '所有輸出使用繁體中文（台灣用語）。';

/* ───────── Settings ───────── */
function openSettings() {
  $('set-coach').value = state.settings.coachName || '';
  $('set-key').value = state.settings.apiKey;
  $('set-model').value = state.settings.model;
  $('settings-modal').classList.add('on');
}
function saveSettings() {
  state.settings.coachName = $('set-coach').value.trim();
  state.settings.apiKey = $('set-key').value.trim();
  state.settings.model = $('set-model').value;
  save();
  $('settings-modal').classList.remove('on');
  updateSettingsBadge();
  updateBylines();
  toast('設定已儲存');
}
async function testConnection() {
  const btn = $('test-conn-btn');
  state.settings.coachName = $('set-coach').value.trim();
  state.settings.apiKey = $('set-key').value.trim();
  state.settings.model = $('set-model').value;
  save();
  await withLoading(btn, async () => {
    const out = await callClaude({ system: '你是連線測試助手。', messages: [{ role: 'user', content: '請只回覆：連線成功' }], maxTokens: 20 });
    toast('✅ ' + out.trim() + '（模型：' + state.settings.model + '）');
    updateSettingsBadge();
  });
}
function updateSettingsBadge() {
  const btn = $('btn-settings');
  if (!state.settings.apiKey) { btn.classList.add('warn'); $('settings-label').textContent = '設定 API Key'; }
  else { btn.classList.remove('warn'); $('settings-label').textContent = '設定'; }
}
function updateBylines() {
  $('bot-byline').textContent = `由 ${coachName()} 邀請 · 正式合作前先聊聊你的狀態`;
  renderDiaryByline();
}
function renderDiaryByline() {
  const el = $('di-byline');
  if (el) el.innerHTML = `<i class="ti ti-signature"></i> 「${esc(state.diary.title || '每日日記')}」由 ${esc(coachName())} 為你設計 · 寫完會收到 AI 即時回饋`;
}
function clearAll() {
  if (!confirm('確定要清除所有資料（含 API Key、對話、評估、日記）嗎？此動作無法復原。')) return;
  localStorage.removeItem(STORE_KEY);
  location.reload();
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'psybypsy-mvp-export.json';
  a.click();
  toast('已匯出 JSON（含 API Key，請小心保管）');
}
$('settings-modal').addEventListener('click', e => { if (e.target === $('settings-modal')) $('settings-modal').classList.remove('on'); });

/* ───────── View switching ───────── */
function switchView(name, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('on', n.dataset.view === name));
  $('view-' + name).classList.add('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'home') renderJourney();
  if (name === 'assess') renderScales();
  if (name === 'transcript') renderTrHistory();
  if (name === 'diary') { renderDiaryTemplates(); renderDiaryEditor(); renderStreak(); renderDiaryFields(); renderEntries(); }
  if (name === 'review') renderChecklist();
}

function stepGo(prefix, n) {
  document.querySelectorAll(`#view-${prefix === 'as' ? 'assess' : prefix === 'tr' ? 'transcript' : prefix === 'di' ? 'diary' : prefix === 'rv' ? 'review' : 'bot'} .stp`).forEach(s => s.classList.toggle('on', +s.dataset.step === n));
  document.querySelectorAll(`[id^="${prefix}-p"]`).forEach(p => {
    if (/^\w+-p\d$/.test(p.id)) p.classList.toggle('on', p.id === `${prefix}-p${n}`);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const botGo = n => stepGo('bot', n);
const asGo = n => stepGo('as', n);
const trGo = n => stepGo('tr', n);
const diGo = n => { stepGo('di', n); if (n === 2) { renderStreak(); renderDiaryFields(); } if (n === 3) { renderEntries(); } };
const rvGo = n => { stepGo('rv', n); if (n === 1) renderChecklist(); };

/* ───────── Journey overview ───────── */
function renderJourney() {
  const S = state;
  const rows = [
    { icon: 'ti-message-chatbot', view: 'bot', title: '前期接觸 · 初談機器人', desc: '教練自建聊天機器人，在正式合作前替你收集個案的初談資訊', done: !!S.bot.summary, status: S.bot.summary ? '已完成初談摘要' : (S.bot.chat.length ? '對話進行中' : '未開始') },
    { icon: 'ti-transform', view: 'assess', title: '初始評估 T0 · 量表轉譯質性評估', desc: '量化問卷轉譯成開放式問題，AI 生成教練版＋個案版雙報告，建立基準線', done: !!S.assess.t0.report, status: S.assess.t0.report ? 'T0 基準線已建立（' + (S.assess.t0.date || '') + '）' : '未開始' },
    { icon: 'ti-file-analytics', view: 'transcript', title: '定期晤談 · 逐字稿 AI 分析', desc: '每次晤談後上傳逐字稿，AI 產出教練反思版與個案溫暖版', done: S.transcripts.length > 0, status: S.transcripts.length ? `已分析 ${S.transcripts.length} 次晤談` : '未開始' },
    { icon: 'ti-notebook', view: 'diary', title: '每日覺察 · 日記＋AI 回饋', desc: '晤談之間的陪伴層：每日書寫即時回饋，累積解鎖整體回饋與週報', done: S.diary.entries.length >= 7, status: S.diary.entries.length ? `已累積 ${S.diary.entries.length} 則紀錄` : '未開始' },
    { icon: 'ti-chart-arrows-vertical', view: 'review', title: '結案回顧 · T1 再測＋整體成長報告', desc: '同量表再測比較前後差異，整合晤談與日記，生成一個月的成長報告', done: !!S.review.report, status: S.review.report ? '成長報告已生成' : (S.assess.t0.report ? '可以開始' : '需先完成 T0 評估') }
  ];
  $('journey-list').innerHTML = rows.map((r, i) => `
    <div class="jrow ${r.done ? 'done' : ''}">
      <div class="jico"><i class="ti ${r.done ? 'ti-check' : r.icon}"></i></div>
      <div class="jmeta">
        <div class="jt">第 ${i + 1} 站 · ${esc(r.title)} <span class="jstatus">${esc(r.status)}</span></div>
        <div class="js">${esc(r.desc)}</div>
        <div class="jgo" onclick="switchView('${r.view}')">前往 <i class="ti ti-arrow-right"></i></div>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   Module 1 · 前期接觸聊天機器人
   ═══════════════════════════════════════════ */
const BOT_EXAMPLES = {
  career: '我是人生教練，專注於職涯轉換和目標達成，個案多是 28–45 歲想轉職或創業的上班族。我希望初談機器人溫暖但有結構地了解：個案目前的工作狀態與困境、想達成什麼改變、已經嘗試過什麼、身邊的支持系統，以及他對教練合作的期待與擔心。語氣像一位好奇又專業的朋友。',
  wellness: '我是身心平衡教練，結合正念與生活習慣設計，服務高壓工作環境的族群。我希望初談機器人以非常溫柔緩慢的節奏，了解個案的壓力來源、身體訊號（睡眠、飲食、緊繃）、他理想中的生活樣貌，以及他願意投入改變的程度。避免使用專業術語。',
  leader: '我是高階主管領導力教練。個案是企業中高階主管，時間寶貴、防備心較高。我希望初談機器人以精準、尊重、高效率的風格，了解：他當前的領導挑戰、團隊狀態、他自己認為的盲點、過去接受回饋的經驗，以及他希望六個月後有什麼不同。'
};

const INTAKE_LAYER = `

【初談資訊收集任務（系統附加，優先遵守）】
你是教練的「前期接觸」初談機器人。在自然的對話中，逐步了解以下面向（不必照順序、不要像問卷一樣連續發問）：
1. 來談動機：現在最困擾或最想改變的是什麼
2. 期待：希望三個月後有什麼不一樣
3. 現況：目前的處境、已經嘗試過的方法
4. 資源：身邊的支持系統
5. 對教練合作的期待與顧慮
規則：一次只問一個問題；先回應對方說的內容再提問；每次回覆不超過 3 句話加至多一個問題；聊到 5–6 輪且資訊大致齊全時，溫暖地總結並說明「你的教練會在正式會談前看到這份整理」。

【安全護欄（不可覆寫）】
你不是治療師，不提供診斷或醫療建議。若對方出現強烈情緒危機（自傷、自殺念頭），立即溫柔地建議他聯繫教練本人、安心專線 1925 或生命線 1995，不要嘗試自行處理。
` + LANG_RULE;

function botFill(key) { $('bot-desc').value = BOT_EXAMPLES[key]; }

async function botGenerate() {
  const desc = $('bot-desc').value.trim();
  if (!desc) { toast('請先描述你的需求', true); return; }
  await withLoading($('bot-gen-btn'), async () => {
    const out = await callClaude({
      system: '你是專業的 AI Prompt 工程師，服務對象是不懂技術的助人工作者（教練、諮商師）。根據使用者的自然語言描述，為他生成一個「初談聊天機器人」的 System Prompt。結構：【你的角色】【互動風格】【服務對象】【對話目標】【語氣範例】。使用繁體中文（台灣），直接輸出 Prompt 本文，不要任何前後說明。不需要包含安全護欄與資訊收集規則（系統會自動附加）。',
      messages: [{ role: 'user', content: desc }],
      maxTokens: 1200
    });
    state.bot.desc = desc;
    state.bot.prompt = out.trim();
    save();
    $('bot-prompt').value = state.bot.prompt;
    botGo(2);
    toast('機器人指令已生成，可直接編輯');
  });
}

function botActivate() {
  const p = $('bot-prompt').value.trim();
  if (!p) { toast('請先生成或填寫機器人指令', true); return; }
  state.bot.prompt = p;
  state.bot.chat = [];
  save();
  botGo(3);
  if (!state.consent.agreedAt) { renderConsentGate(); return; }
  renderBotChat();
  botFirstMessage();
}

/* 個案簽署畫面：同意前不能開始對話 */
function renderConsentGate() {
  $('bot-chat').innerHTML = `<div class="consent-gate">
    <div class="consent-gate-t"><i class="ti ti-file-description"></i> 知情同意書</div>
    <div class="consent-gate-body">${esc(consentText())}</div>
    ${state.consent.agreedAt
      ? `<div class="consent-signed"><i class="ti ti-circle-check"></i> 已於 ${esc(state.consent.agreedAt)} 閱讀並同意</div>`
      : `<button class="btn btn-p" style="width:100%;justify-content:center" onclick="consentAgree()"><i class="ti ti-signature"></i> 我已閱讀並同意，開始對話</button>`}
  </div>`;
  $('bot-input').disabled = !state.consent.agreedAt;
  $('bot-send').disabled = !state.consent.agreedAt;
}
function consentAgree() {
  state.consent.agreedAt = today();
  save();
  renderConsentStatus();
  $('bot-input').disabled = false;
  $('bot-send').disabled = false;
  renderBotChat();
  botFirstMessage();
  toast('個案已簽署知情同意書');
}

async function botFirstMessage() {
  try {
    appendTyping('bot-chat');
    const out = await callClaude({
      system: state.bot.prompt + INTAKE_LAYER,
      messages: [{ role: 'user', content: '（個案剛打開對話視窗。請以機器人身份先打招呼、簡短說明這段對話的目的，並開始第一個問題。）' }],
      maxTokens: 400
    });
    removeTyping('bot-chat');
    state.bot.chat.push({ role: 'assistant', content: out.trim() });
    save();
    renderBotChat();
  } catch (e) { removeTyping('bot-chat'); toast('發生錯誤：' + e.message, true); }
}

function renderBotChat() {
  const box = $('bot-chat');
  box.innerHTML = state.bot.chat.map(m => `<div class="msg ${m.role === 'assistant' ? 'bot' : 'me'}">${esc(m.content)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
function appendTyping(boxId) {
  const box = $(boxId);
  const d = document.createElement('div');
  d.className = 'msg bot typing'; d.id = boxId + '-typing'; d.textContent = '正在輸入…';
  box.appendChild(d); box.scrollTop = box.scrollHeight;
}
function removeTyping(boxId) { const d = $(boxId + '-typing'); if (d) d.remove(); }

async function botSend() {
  const input = $('bot-input');
  const text = input.value.trim();
  if (!text) return;
  if (crisisCheck(text)) $('bot-crisis').classList.add('on');
  input.value = '';
  state.bot.chat.push({ role: 'user', content: text });
  save(); renderBotChat();
  $('bot-send').disabled = true;
  try {
    appendTyping('bot-chat');
    const out = await callClaude({
      system: state.bot.prompt + INTAKE_LAYER,
      messages: state.bot.chat.map(m => ({ role: m.role, content: m.content })),
      maxTokens: 400
    });
    removeTyping('bot-chat');
    state.bot.chat.push({ role: 'assistant', content: out.trim() });
    save(); renderBotChat();
  } catch (e) { removeTyping('bot-chat'); toast('發生錯誤：' + e.message, true); }
  $('bot-send').disabled = false;
}

const DEMO_CHAT = [
  { role: 'assistant', content: '嗨，很高興你來！我是你未來教練的初談小助手。在正式會談前，想先輕鬆地聊聊你的近況，讓教練更了解你。可以說說最近是什麼讓你想找教練聊聊嗎？' },
  { role: 'user', content: '主要是工作吧，我在現在的公司待了六年，最近一年越來越沒動力，一直在想要不要轉職，但又不敢動' },
  { role: 'assistant', content: '六年是一段很長的投入，「想動又不敢動」的拉扯一定很消耗。可以多說一點嗎——如果三個月後情況有一點不一樣，你希望是什麼樣的不一樣？' },
  { role: 'user', content: '我希望至少知道自己要去哪吧，現在連想做什麼都不確定。有想過去上設計課，也開始改履歷，但都是改幾個字就關掉' },
  { role: 'assistant', content: '你其實已經在行動了：報名的念頭、打開履歷——只是每次都停在門口。這些「停下來」的時刻，往往藏著重要的訊息。身邊有人知道你在考慮轉職嗎？' },
  { role: 'user', content: '有跟太太提過，她說支持我，但我怕收入不穩定會拖累家裡。朋友的話…好像很久沒跟朋友聊這些了' },
  { role: 'assistant', content: '謝謝你的坦誠。聽起來太太是你重要的後盾，而「怕拖累家裡」是此刻最大的煞車。最後想了解：對於接下來的教練合作，你有什麼期待，或者有什麼擔心的地方嗎？' },
  { role: 'user', content: '期待是有人可以幫我理清楚吧，不要再原地打轉。擔心的話…怕自己又半途而廢，浪費錢也浪費教練的時間' },
  { role: 'assistant', content: '「怕半途而廢」這個擔心本身，就說明你有多在乎這次改變。我把今天聊的整理給你的教練：轉職的拉扯、對方向的渴望、家庭的考量、還有你已經嘗試過的行動。正式會談時，教練會從這裡接手。期待你們的第一次會談！' }
];

function botDemo() {
  state.bot.chat = JSON.parse(JSON.stringify(DEMO_CHAT));
  if (!state.bot.prompt) state.bot.prompt = '（示例）你是一位溫暖、專業的職涯轉換教練初談助手。';
  if (!state.consent.agreedAt) { state.consent.agreedAt = today(); renderConsentStatus(); }
  save(); renderBotChat();
  $('bot-input').disabled = false;
  $('bot-send').disabled = false;
  toast('已填入示例對話（含知情同意簽署），可直接生成教練摘要');
}

async function botSummary() {
  if (state.bot.chat.length < 4) { toast('請先進行至少兩輪對話（或點「填入示例對話」）', true); return; }
  const btn = document.querySelector('#bot-p3 .btn-p');
  await withLoading(btn, async () => {
    const convo = state.bot.chat.map(m => (m.role === 'assistant' ? '機器人' : '個案') + '：' + m.content).join('\n');
    const out = await callClaude({
      system: '你是人生教練的專業助理。根據初談機器人與個案的對話，為教練整理一份初談摘要。使用 Markdown，包含以下段落：## 來談議題、## 期待的改變、## 現況與已嘗試的方法、## 支持系統與資源、## 情緒狀態觀察、## 風險註記（無則寫「未觀察到」）、## 建議的教練切入點（2–3 點）。忠於對話內容，不過度推論；推論處標明「推測」。' + LANG_RULE,
      messages: [{ role: 'user', content: convo }],
      maxTokens: 1500
    });
    state.bot.summary = out.trim();
    save();
    renderBotSummary();
    botGo(4);
    toast('初談摘要已生成');
  });
}

function renderBotSummary() {
  if (state.bot.summary) {
    $('bot-summary').style.display = 'block';
    $('bot-summary-empty').style.display = 'none';
    $('bot-summary-body').innerHTML = md2html(state.bot.summary);
  } else {
    $('bot-summary').style.display = 'none';
    $('bot-summary-empty').style.display = 'block';
  }
}

/* ═══════════════════════════════════════════
   Module 2 · 量表轉譯質性評估（T0 / T1 共用引擎）
   ═══════════════════════════════════════════ */
const SCALES = {
  perma: {
    name: 'PERMA-Profiler（精簡版）', icon: 'ti-flower', desc: '幸福五元素 · 10 題 · 適合教練與正向心理情境', max: 10,
    items: [
      { id: 'P1', dim: 'P 正向情緒', text: '你多常感到快樂？（0–10）' },
      { id: 'P2', dim: 'P 正向情緒', text: '整體而言，你多常感到平靜與滿足？（0–10）' },
      { id: 'E1', dim: 'E 投入', text: '你多常全神貫注於正在做的事情？（0–10）' },
      { id: 'E2', dim: 'E 投入', text: '做事時你多常感到興奮和投入？（0–10）' },
      { id: 'R1', dim: 'R 人際關係', text: '需要時，你能獲得他人的幫助與支持嗎？（0–10）' },
      { id: 'R2', dim: 'R 人際關係', text: '你對自己的人際關係感到滿意嗎？（0–10）' },
      { id: 'M1', dim: 'M 意義', text: '你覺得自己的生活有目標和意義嗎？（0–10）' },
      { id: 'M2', dim: 'M 意義', text: '你覺得自己做的事情有價值、值得做嗎？（0–10）' },
      { id: 'A1', dim: 'A 成就', text: '你多常覺得自己正朝著目標前進？（0–10）' },
      { id: 'A2', dim: 'A 成就', text: '你多常能完成自己設定的重要目標？（0–10）' }
    ]
  },
  wheel: {
    name: '生命之輪 Wheel of Life', icon: 'ti-chart-pie', desc: '8 大生活領域滿意度 · 教練經典評估工具', max: 10,
    items: ['職涯工作', '財務金錢', '身體健康', '家庭', '親密關係', '朋友人際', '學習成長', '休閒娛樂'].map((d, i) => ({ id: 'W' + (i + 1), dim: d, text: `你對「${d}」領域目前的滿意度？（0–10）` }))
  },
  scs: {
    name: '自我慈悲量表 SCS（精簡版）', icon: 'ti-heart-handshake', desc: '自我關懷 · 6 題 · 適合自我批評議題個案', max: 5,
    items: [
      { id: 'S1', dim: '自我友善', text: '遇到困難時，我會善待自己而不是苛責自己。（1–5）' },
      { id: 'S2', dim: '自我友善', text: '痛苦時，我會給自己需要的關懷與溫柔。（1–5）' },
      { id: 'S3', dim: '普遍人性', text: '我會提醒自己，感到不足是大多數人共有的經驗。（1–5）' },
      { id: 'S4', dim: '普遍人性', text: '低潮時，我知道世界上也有很多人跟我有一樣的感受。（1–5）' },
      { id: 'S5', dim: '正念平衡', text: '心情不好時，我能以平衡的角度看待情況。（1–5）' },
      { id: 'S6', dim: '正念平衡', text: '失敗時，我能把情緒保持在適當的範圍，不被淹沒。（1–5）' }
    ]
  }
};

/* 目前選用的量表（內建或 AI 搜尋生成的自訂量表）*/
function getScale() {
  return state.assess.scaleId === 'custom' ? state.assess.customScale : SCALES[state.assess.scaleId];
}

function renderScales() {
  let html = Object.entries(SCALES).map(([id, s]) => `
    <div class="scard ${state.assess.scaleId === id ? 'on' : ''}" onclick="pickScale('${id}',this)">
      <div class="scard-ico"><i class="ti ${s.icon}"></i></div>
      <div class="scard-meta"><div class="scard-t">${esc(s.name)}</div><div class="scard-s">${esc(s.desc)}</div></div>
    </div>`).join('');
  const cs = state.assess.customScale;
  if (cs) {
    html += `
    <div class="scard ${state.assess.scaleId === 'custom' ? 'on' : ''}" onclick="pickScale('custom',this)">
      <div class="scard-ico"><i class="ti ti-world-search"></i></div>
      <div class="scard-meta">
        <div class="scard-t">${esc(cs.name)} <span class="tag-mini">AI 搜尋生成</span></div>
        <div class="scard-s">${esc(cs.desc)}</div>
        ${cs.note ? `<div class="scard-s" style="color:var(--amber-text);margin-top:2px"><i class="ti ti-copyright" style="font-size:10px"></i> ${esc(cs.note)}</div>` : ''}
      </div>
    </div>`;
  }
  $('as-scales').innerHTML = html;
  $('as-phase-tag').textContent = state.assess.t0.report ? 'T0 已完成 · 再測請至結案回顧' : 'T0 · 初始評估';
}
function pickScale(id, el) {
  state.assess.scaleId = id; save();
  document.querySelectorAll('#as-scales .scard').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
}

/* AI 網路搜尋：描述主題 → 找出已驗證的專業量表 → 生成教練情境的改寫版 */
async function asSearchScale() {
  const q = $('as-search-input').value.trim();
  if (!q) { toast('請先描述你想測量的主題', true); return; }
  await withLoading($('as-search-btn'), async () => {
    const sys = `你是心理測量與量表設計專家，為人生教練服務。使用者會描述想測量的主題，請優先使用網路搜尋，找出心理學文獻中對應且已被驗證的專業量表（例如「完美主義」→ Frost 多維完美主義量表 FMPS；「職場倦怠」→ MBI 或 OLBI），再產出適合教練情境的精簡改寫版。
規則：
- 題項必須是改寫（paraphrase），不可逐字複製受版權保護的原量表題目
- 保留原量表的維度結構：每個維度 2–3 題，總題數 6–12 題
- 全部題目使用同一個計分範圍，並在題目文字末尾標示（如（0–10））
- note 一句話說明原量表出處與版權注意
- 若找到多個候選量表，選擇心理計量品質最佳、最常被引用者
${LANG_RULE}
只輸出 JSON（不要其他文字）：
{"name":"改寫版名稱（含「精簡版」字樣）","basis":"原量表名稱與出處（作者, 年份）","desc":"一行描述適用情境","max":計分上限數字,"items":[{"id":"題號","dim":"維度名","text":"題目文字（含計分範圍）"}],"note":"版權與使用注意"}`;
    let out;
    try {
      out = await callClaude({
        system: sys,
        messages: [{ role: 'user', content: q }],
        maxTokens: 3500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
      });
    } catch (e) {
      if (/api key|401/i.test(e.message)) throw e;
      /* 組織未開通網路搜尋等情況：退回模型既有知識 */
      out = await callClaude({
        system: sys + '\n（此環境無法使用網路搜尋，請直接根據你的專業知識，選擇最相符的已驗證量表。）',
        messages: [{ role: 'user', content: q }],
        maxTokens: 3500
      });
    }
    const s = parseJSONLoose(out);
    if (!Array.isArray(s.items) || !s.items.length) throw new Error('量表生成失敗，請換個描述再試一次');
    state.assess.customScale = {
      name: s.name || '自訂量表',
      basis: s.basis || '',
      desc: `${s.items.length} 題 · 計分 0–${+s.max || 10}${s.basis ? ' · 改寫自 ' + s.basis : ''}`,
      icon: 'ti-world-search',
      max: +s.max || 10,
      items: s.items.map((it, i) => ({ id: it.id || 'Q' + (i + 1), dim: it.dim || '整體', text: it.text || '' })),
      note: s.note || '改寫版僅供概念驗證，正式使用前請確認原量表授權'
    };
    state.assess.scaleId = 'custom';
    save();
    renderScales();
    document.querySelector('#as-scales .scard.on')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast(`已生成「${state.assess.customScale.name}」（${state.assess.customScale.items.length} 題），可直接進行 AI 轉譯`);
  });
}

async function asTranslate() {
  const scale = getScale();
  if (!scale) { toast('請先選擇量表', true); return; }
  await withLoading($('as-translate-btn'), async () => {
    const itemsTxt = scale.items.map(it => `${it.id}｜${it.dim}｜${it.text}`).join('\n');
    const out = await callClaude({
      system: `你是心理測量與質性訪談設計專家。把量化量表題項轉譯成溫暖、生活化、開放式的質性問題，供 AI 之後從回答中推估原維度分數。
規則：
- 每題對應一個開放式問題，保留原題的維度歸屬
- 問題要具體、邀請故事與例子（「最近一週有沒有…的時刻？當時發生了什麼？」），避免抽象自評
- 語氣溫暖不施壓，繁體中文（台灣）
- 只輸出 JSON 陣列：[{"id":"原題號","dim":"維度","orig":"原題文字","q":"轉譯後的質性問題"}]`,
      messages: [{ role: 'user', content: `量表：${scale.name}\n題項：\n${itemsTxt}` }],
      maxTokens: 2500
    });
    const questions = parseJSONLoose(out);
    if (!Array.isArray(questions) || !questions.length) throw new Error('轉譯結果格式不正確，請再試一次');
    state.assess.questions = questions;
    state.assess.t0 = { answers: null, report: null, date: null };
    save();
    renderPairs(); renderAssessForm('as-form', 't0');
    asGo(2);
    toast(`已轉譯 ${questions.length} 題質性問題`);
  });
}

function renderPairs() {
  const qs = state.assess.questions || [];
  $('as-pairs').innerHTML = qs.map(q => `
    <div class="pair" style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;overflow:hidden">
      <div style="padding:10px 14px;background:var(--surface2);font-size:11.5px;color:var(--text2);display:flex;gap:8px;border-bottom:1px solid var(--border)"><span class="tag-mini">原題 ${esc(q.id)} · ${esc(q.dim)}</span><span style="flex:1">${esc(q.orig)}</span></div>
      <div style="padding:11px 14px;font-size:12.5px;line-height:1.65;display:flex;gap:8px"><span class="tag-mini" style="background:var(--green-bg);border-color:var(--green-border);color:var(--green-text)">轉譯</span><span style="flex:1">${esc(q.q)}</span></div>
    </div>`).join('') || '<div class="empty"><i class="ti ti-transform"></i>尚未轉譯。請回上一步選擇量表後點「AI 轉譯」。</div>';
}

function renderAssessForm(containerId, phase) {
  const qs = state.assess.questions || [];
  const saved = state.assess[phase].answers || [];
  const byline = qs.length ? `<div class="byline"><i class="ti ti-signature"></i> 由 ${esc(coachName())} 為你準備 · 共 ${qs.length} 題 · 回答僅 ${esc(coachName())} 可見</div>` : '';
  $(containerId).innerHTML = byline + (qs.length ? qs.map((q, i) => `
    <div class="fq">
      <div class="fq-num">第 ${i + 1} 題 · ${esc(q.dim)}</div>
      <div class="fq-t">${esc(q.q)}</div>
      <textarea data-idx="${i}" rows="3" placeholder="想到什麼寫什麼，沒有標準答案...">${esc(saved[i] || '')}</textarea>
    </div>`).join('') : '<div class="empty"><i class="ti ti-forms"></i>尚未有轉譯題目。</div>');
}

function collectAnswers(containerId) {
  return [...document.querySelectorAll(`#${containerId} textarea`)].map(t => t.value.trim());
}

/* 示例回答（PERMA 情境：職涯轉換個案） */
const DEMO_T0 = [
  '上週五跟同事吃午餐，有人講了一個很冷的笑話大家笑翻了。不過想想，那好像是最近唯一一次笑得那麼開心。',
  '平靜喔…好像很少。晚上躺在床上常常在想工作的事，腦子停不下來。',
  '改簡報的時候會比較專注吧，但常常改到一半就開始滑手機，回過神來半小時過去了。',
  '興奮？想不太起來。以前剛進公司做新專案會有那種感覺，最近一兩年沒有了。',
  '應該有吧，太太都會聽我說。大學室友以前什麼都能聊，但很久沒聯絡了。',
  '跟太太關係很好。同事就是同事，下班不會聯絡。整體來說朋友越來越少。',
  '這題好難。我知道我不想要現在這樣，但要說有什麼目標…我想做出一點讓人記得的東西吧。',
  '老實說覺得現在做的事情就是在重複，報表做完沒有人真的看。價值感很低。',
  '目標的話，轉職算嗎？有在朝那個方向想，但行動很少，履歷打開三次都只改幾個字。',
  '以前設的目標大多有完成，所以我才更困惑，明明以前做得到，現在連開始都很難。'
];
const DEMO_T1 = [
  '這個月笑的次數變多了，上週跟大學室友吃飯，聊到以前的蠢事笑到流眼淚。',
  '睡前寫日記之後，好像比較能把腦子裡的事情放下來，平靜的時刻變多了一點。',
  '我發現我在研究設計課程的時候超專注，可以連續看兩個小時都不會想滑手機。',
  '報名了週末的 UI 設計入門課！繳費那一刻有點久違的興奮感，雖然也很緊張。',
  '跟室友重新聯絡上了，他自己也轉過職，給了我很多實際的建議。太太還是最大的後盾。',
  '這個月主動約了兩次朋友，發現大家其實都很願意聊，是我以前自己關起來。',
  '方向清楚一點了：我想往產品設計走。不確定能不能成，但至少知道要往哪邊試。',
  '上課做的第一個小作品放上網，有陌生人留言說喜歡，那天我開心了一整天。這比做十份報表有感覺。',
  '有進度：課程上了三週、作品集開了頭、跟兩個業內的人聊過。速度不快，但每週都有動。',
  '我學到把目標切小：這週只要完成一個練習就算贏。目前連續四週都有達成。'
];

function asDemoAnswers() {
  const qs = state.assess.questions || [];
  [...document.querySelectorAll('#as-form textarea')].forEach((t, i) => {
    t.value = DEMO_T0[i] || `關於「${qs[i]?.dim || ''}」：最近這方面普普通通，有好有壞，比較多時候覺得卡卡的，說不上滿意。`;
  });
  toast('已填入示例回答（職涯轉換個案 · T0）');
}

const ASSESS_REPORT_SCHEMA = `只輸出 JSON：
{
 "dims":[{"name":"維度名","score":數字,"conf":"hi或mid","evidence":"引用個案原文的關鍵句與解讀（50字內）"}],
 "alerts":["需要人工確認的事項，無則空陣列"],
 "reflections":["給教練的反思問題，3題"],
 "directions":["下次晤談的可能方向，2-3點"],
 "client":{
   "kicker":"快照標語（8字內）","emoji":"一個emoji","title":"給個案的正向角色命名（6-10字）","subtitle":"一句溫暖的狀態描述（30字內）",
   "sparks":[{"emoji":"emoji","title":"亮點標題（10字內）","text":"根據個案原文的優勢描述（60字內）"}],
   "quote":{"text":"從個案回答中摘出最有力量的一句原話","src":"出處說明"},
   "hope":"一段有科學根據的希望訊息（80字內）",
   "mission":{"title":"本週小任務標題","text":"根據回答設計的具體可行小任務（50字內）"}
 }
}`;

async function asAnalyze() {
  const answers = collectAnswers('as-form');
  if (answers.filter(a => a).length < Math.ceil(answers.length / 2)) { toast('請至少回答一半以上的題目（或點「填入示例回答」）', true); return; }
  await withLoading($('as-analyze-btn'), async () => {
    const scale = getScale();
    const qa = state.assess.questions.map((q, i) => `【${q.dim}】問：${q.q}\n答：${answers[i] || '（未回答）'}`).join('\n\n');
    const bg = state.bot.summary ? `\n\n【初談背景摘要（供參考）】\n${state.bot.summary}` : '';
    const out = await callClaude({
      system: `你是結合心理測量與正向心理學的評估分析師，為人生教練服務。根據個案對質性問題的回答，推估原量表「${scale.name}」各維度分數（計分範圍 0–${scale.max || 10}），並生成雙版本報告。
規則：
- 推估分數必須附上個案原文證據；證據不足的維度 conf 填 "mid"
- 教練版專業誠實，可指出低分與風險；個案版絕對不出現分數、風險語言、臨床詞彙，只用優勢框架
- sparks 恰好 3 個；所有引用必須來自個案原文，不可捏造
- 若回答出現自傷/自殺相關內容，必須寫入 alerts 第一條
${LANG_RULE}
${ASSESS_REPORT_SCHEMA}`,
      messages: [{ role: 'user', content: qa + bg }],
      maxTokens: 3000
    });
    const report = parseJSONLoose(out);
    state.assess.t0 = { answers, report, date: today() };
    save();
    renderAssessReport('as-rv-coach', 'as-rv-client', report, null, 'T0 · 初始評估');
    asGo(4);
    toast('T0 評估報告已生成');
  });
}

function scaleMax() { return (getScale() && getScale().max) || 10; }

function renderAssessReport(coachId, clientId, report, compareT0, phaseLabel) {
  const max = scaleMax();
  /* 教練版 */
  const dims = (report.dims || []).map(d => {
    const pct = Math.min(100, Math.round((d.score / max) * 100));
    let ghost = '';
    if (compareT0) {
      const t0d = (compareT0.dims || []).find(x => x.name === d.name);
      if (t0d) ghost = `<div class="dim-fill ghost" style="width:${Math.min(100, Math.round((t0d.score / max) * 100))}%"></div>`;
    }
    return `<div class="dim">
      <div class="dim-hd"><span class="dim-name">${esc(d.name)}</span><span class="conf ${d.conf === 'hi' ? 'hi' : 'mid'}">${d.conf === 'hi' ? '證據充分' : '證據中等'}</span><span style="font-size:11px;color:var(--text3)">${esc(String(d.score))} / ${max}</span></div>
      <div class="dim-bar">${ghost}<div class="dim-fill" style="width:${pct}%"></div></div>
      <div class="evi">${esc(d.evidence)}</div>
    </div>`;
  }).join('');
  const alerts = (report.alerts || []).length
    ? `<div class="rsec red"><div class="rsec-hd"><i class="ti ti-alert-triangle"></i> 需要人工確認（個案版不顯示此區塊）</div><div class="rsec-body">${(report.alerts).map(a => '· ' + esc(a)).join('<br>')}</div></div>` : '';
  const refl = (report.reflections || []).map((r, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtxt">${esc(r)}</div></div>`).join('');
  const dirs = (report.directions || []).map(d => '· ' + esc(d)).join('<br>');
  $(coachId).innerHTML = `
    <div class="rsec green"><div class="rsec-hd"><i class="ti ti-chart-bar"></i> 量化側寫 ${esc(phaseLabel || '')}（推估分數＋信心度＋原文證據）</div><div class="rsec-body">${dims}
      <div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.6">注意：推估分數來自質性回答的語意映射，不可等同標準化施測分數或用於臨床切截判斷。</div></div></div>
    ${alerts}
    <div class="rsec purple"><div class="rsec-hd"><i class="ti ti-bulb"></i> 給教練的反思與方向</div><div class="rsec-body">${refl}</div></div>
    <div class="rsec amber"><div class="rsec-hd"><i class="ti ti-route"></i> 下次晤談的可能方向</div><div class="rsec-body">${dirs}</div></div>`;
  /* 個案版 */
  $(clientId).innerHTML = renderClientCard(report.client, phaseLabel);
}

function renderClientCard(c, phaseLabel) {
  if (!c) return '<div class="empty">個案版生成失敗，請重新分析。</div>';
  const sparks = (c.sparks || []).map(s => `
    <div class="spark"><span class="spark-emoji">${esc(s.emoji)}</span><div class="spark-body"><div class="spark-t">${esc(s.title)}</div><div class="spark-s">${esc(s.text)}</div></div></div>`).join('');
  return `<div class="cphone">
    <div class="chero">
      <div class="chero-kicker">${esc(c.kicker || '你的心靈快照')} · ${esc(today())}</div>
      <div class="chero-emoji">${esc(c.emoji || '🌱')}</div>
      <div class="chero-title">${esc(c.title || '')}</div>
      <div class="chero-sub">${esc(c.subtitle || '')}</div>
    </div>
    <div class="cbody">
      <div class="csec"><div class="csec-t"><i class="ti ti-flame"></i> 這次書寫裡發現的亮點</div>${sparks}</div>
      <div class="csec"><div class="csec-t"><i class="ti ti-quote"></i> 你自己寫下的、最有力量的一句話</div>
        <div class="quote"><div class="quote-mark">❝</div><div class="quote-txt">${esc(c.quote?.text || '')}</div><div class="quote-src">${esc(c.quote?.src || '')} · 我們幫你留下來了</div></div></div>
      <div class="csec"><div class="csec-t"><i class="ti ti-sunrise"></i> 一件值得知道的事</div><div class="hope">${esc(c.hope || '')}</div></div>
      <div class="csec"><div class="csec-t"><i class="ti ti-target"></i> 本週小任務（可做可不做）</div>
        <div class="mission"><div class="mission-t"><i class="ti ti-flag"></i> ${esc(c.mission?.title || '')}</div><div class="mission-s">${esc(c.mission?.text || '')}</div></div></div>
    </div>
    <div class="cfooter"><div class="cfoot-note">這份報告由 AI 根據你的書寫生成，經 ${esc(coachName())} 確認後發送<br>它不是測驗結果，是一面溫柔的鏡子 · 有任何感覺都歡迎帶到下次會談聊</div></div>
  </div>`;
}

function asSwitch(el, v) {
  document.querySelectorAll('#as-p4 .rsw').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
  $('as-rv-coach').classList.toggle('on', v === 'coach');
  $('as-rv-client').classList.toggle('on', v === 'client');
}

/* ═══════════════════════════════════════════
   Module 3 · 逐字稿 AI 分析
   ═══════════════════════════════════════════ */
const DEMO_TRANSCRIPT = `教練：上次我們談到你想在三個月內完成轉職準備，這兩週有什麼進展嗎？
個案：嗯...其實有一點。我終於把履歷改完一個版本了，雖然還是覺得不夠好。
教練：「終於改完了」——這是我們合作以來你第一次把履歷改完。那個「還是覺得不夠好」的聲音，想多聊聊嗎？
個案：就是看著履歷會覺得，我這六年好像沒做出什麼值得寫的東西。同事都升遷了，我還在原地。
教練：如果請你只看事實，不做評價——這六年你的履歷上實際寫了哪些事？
個案：帶過三個專案吧，其中一個幫公司省了不少成本。喔對，我還自學了資料分析，部門的報表系統是我建的。
教練：你剛剛講這段的時候，語速快了一些，聲音也亮了。你有注意到嗎？
個案：哈，有嗎？講到報表系統的時候確實有點得意，那個東西到現在整個部門都還在用。
教練：「整個部門都還在用」。所以「沒做出值得寫的東西」這句話，和你剛剛說的事實之間，好像有個落差？
個案：……好像是。我好像習慣先把自己打個折再說。
教練：這個發現很重要。那接下來兩週，你想為轉職準備做點什麼？
個案：我想把那個報表系統的成果整理成作品集的一頁。然後……可能把履歷投出去一兩家看看？講出來有點緊張。
教練：緊張很正常，那代表這件事對你重要。我們把它變具體：投哪兩家？什麼時候投？
個案：這週五之前選好公司，下週三之前投出去。嗯，說出來反而覺得可以做到。
教練：好，我記下來了，下次會談我們從這裡開始。今天你自己會怎麼總結這一小時？
個案：大概是……發現我其實有料，只是習慣自己看不見。`;

function trDemo() { $('tr-text').value = DEMO_TRANSCRIPT; toast('已填入示例逐字稿'); }

document.querySelectorAll('#tr-p2 .fcard').forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));

async function trAnalyze() {
  const text = $('tr-text').value.trim();
  if (text.length < 50) { toast('請先貼上逐字稿（或點「填入示例逐字稿」）', true); return; }
  const frameworks = [...document.querySelectorAll('#tr-p2 .fcard.on')].map(c => c.dataset.fw);
  const custom = $('tr-custom').value.trim();
  if (!frameworks.length && !custom) { toast('請至少選擇一個分析框架', true); return; }
  await withLoading($('tr-analyze-btn'), async () => {
    const out = await callClaude({
      system: `你是資深教練督導與晤談歷程分析師。分析教練晤談逐字稿，依指定框架生成教練版與個案版報告。
規則：
- 每個框架一個獨立分析區塊，內容必須引用逐字稿原文作為證據
- 教練版包含對教練介入的誠實觀察（可以指出錯過的時機）
- 個案版是晤談後發給個案的溫暖回顧：不含專業術語、不含分析、只有肯定與具體的下一步
- 出現自傷/危機語言時寫入 alerts
${LANG_RULE}
只輸出 JSON：
{
 "title":"本次晤談主題（15字內）",
 "sections":[{"title":"框架名","body":"分析內文（可用\\n分段，150-250字）"}],
 "alerts":["需人工確認事項，無則空陣列"],
 "reflections":["給教練的反思問題，恰好3題，須具體引用晤談中的時刻"],
 "directions":["下次晤談的可能方向，2-3點"],
 "client":{"summary":"給個案的晤談回顧（80字內，第二人稱，溫暖）",
   "highlights":[{"emoji":"emoji","title":"亮點（10字內）","text":"具體描述（50字內）"}],
   "quote":{"text":"個案在晤談中說過最有力量的一句原話","src":"情境說明"},
   "task":{"title":"行動承諾標題","text":"個案自己承諾的行動，具體重述（50字內）"}}
}`,
      messages: [{ role: 'user', content: `分析框架：${frameworks.join('、')}${custom ? '\n自訂視角：' + custom : ''}\n\n逐字稿：\n${text}` }],
      maxTokens: 3500
    });
    const report = parseJSONLoose(out);
    state.transcripts.push({ date: today(), frameworks, custom, text, report });
    save();
    renderTrReport(report);
    renderTrHistory();
    trGo(3);
    toast('晤談分析完成');
  });
}

function renderTrReport(r) {
  $('tr-result-sub').textContent = `${r.title || '晤談分析'} · 已套用 ${(r.sections || []).length} 個分析框架。以下內容為輔助參考，最終判斷請以你的專業評估為準。`;
  const secs = (r.sections || []).map((s, i) => {
    const colors = ['green', 'blue', 'purple', 'amber'];
    return `<div class="rsec ${colors[i % 4]}"><div class="rsec-hd"><i class="ti ti-layout-grid"></i> ${esc(s.title)}</div><div class="rsec-body" style="white-space:pre-wrap">${esc(s.body)}</div></div>`;
  }).join('');
  const alerts = (r.alerts || []).length
    ? `<div class="rsec red"><div class="rsec-hd"><i class="ti ti-alert-triangle"></i> 需要人工確認</div><div class="rsec-body">${r.alerts.map(a => '· ' + esc(a)).join('<br>')}</div></div>` : '';
  const refl = (r.reflections || []).map((q, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtxt">${esc(q)}</div></div>`).join('');
  const dirs = (r.directions || []).map(d => '· ' + esc(d)).join('<br>');
  $('tr-rv-coach').innerHTML = secs + alerts +
    `<div class="rsec purple"><div class="rsec-hd"><i class="ti ti-bulb"></i> 給教練的反思題目</div><div class="rsec-body">${refl}</div></div>
     <div class="rsec amber"><div class="rsec-hd"><i class="ti ti-route"></i> 下次晤談的可能方向</div><div class="rsec-body">${dirs}</div></div>`;
  const c = r.client || {};
  const hl = (c.highlights || []).map(h => `<div class="spark"><span class="spark-emoji">${esc(h.emoji)}</span><div class="spark-body"><div class="spark-t">${esc(h.title)}</div><div class="spark-s">${esc(h.text)}</div></div></div>`).join('');
  $('tr-rv-client').innerHTML = `<div class="cphone">
    <div class="chero"><div class="chero-kicker">晤談回顧 · ${esc(today())}</div><div class="chero-emoji">💬</div><div class="chero-title">${esc(r.title || '這次我們聊了')}</div><div class="chero-sub">${esc(c.summary || '')}</div></div>
    <div class="cbody">
      <div class="csec"><div class="csec-t"><i class="ti ti-flame"></i> 這次晤談的亮點</div>${hl}</div>
      <div class="csec"><div class="csec-t"><i class="ti ti-quote"></i> 你說過最有力量的一句話</div>
        <div class="quote"><div class="quote-mark">❝</div><div class="quote-txt">${esc(c.quote?.text || '')}</div><div class="quote-src">${esc(c.quote?.src || '')}</div></div></div>
      <div class="csec"><div class="csec-t"><i class="ti ti-target"></i> 你為自己承諾的行動</div>
        <div class="mission"><div class="mission-t"><i class="ti ti-flag"></i> ${esc(c.task?.title || '')}</div><div class="mission-s">${esc(c.task?.text || '')}</div></div></div>
    </div>
    <div class="cfooter"><div class="cfoot-note">這份回顧由 AI 整理、${esc(coachName())} 確認後發送<br>下次會談我們會從你的行動承諾接著聊</div></div>
  </div>`;
}

function trSwitch(el, v) {
  document.querySelectorAll('#tr-p3 .rsw').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
  $('tr-rv-coach').classList.toggle('on', v === 'coach');
  $('tr-rv-client').classList.toggle('on', v === 'client');
}

function renderTrHistory() {
  const list = state.transcripts;
  $('tr-history-card').style.display = list.length ? 'block' : 'none';
  $('tr-history').innerHTML = list.map((t, i) => `
    <div class="scard" onclick="trView(${i})">
      <div class="scard-ico"><i class="ti ti-file-text"></i></div>
      <div class="scard-meta"><div class="scard-t">第 ${i + 1} 次晤談 · ${esc(t.report?.title || '')}</div><div class="scard-s">${esc(t.date)} · ${t.frameworks.map(esc).join('、')}</div></div>
      <i class="ti ti-chevron-right" style="color:var(--text3)"></i>
    </div>`).join('');
}
function trView(i) { renderTrReport(state.transcripts[i].report); trGo(3); }

/* ═══════════════════════════════════════════
   Module 4 · 每日日記＋三層 AI 回饋
   ═══════════════════════════════════════════ */
const DIARY_TEMPLATES = {
  gratitude: { name: '🙏 感恩日記', desc: '每天記錄好事，培養正向注意力', fields: [
    { type: 'text', label: '今天發生的一件好事是什麼？' },
    { type: 'text', label: '它為什麼會發生？（你的功勞是什麼）' },
    { type: 'scale', label: '此刻的感恩程度（1–7）' }] },
  action: { name: '🎯 目標行動日記', desc: '追蹤承諾的行動項目與阻礙探索', fields: [
    { type: 'text', label: '今天為你的目標做了什麼？（再小都算）' },
    { type: 'text', label: '遇到什麼阻礙？它在告訴你什麼？' },
    { type: 'scale', label: '今天的行動能量（1–7）' }] },
  mood: { name: '🌤️ 情緒天氣日記', desc: '用天氣比喻情緒，低門檻高覺察', fields: [
    { type: 'text', label: '今天你內心的天氣是什麼？（晴、陰、雷陣雨…）' },
    { type: 'text', label: '這個天氣是什麼時候出現的？當時發生了什麼？' },
    { type: 'scale', label: '今天整體的心情（1–7）' }] },
  selfcomp: { name: '🌱 自我慈悲日記', desc: '練習善待自己，重寫內在批評的聲音', fields: [
    { type: 'text', label: '今天有沒有對自己苛刻的時刻？你對自己說了什麼？' },
    { type: 'text', label: '如果是好朋友遇到同樣的事，你會對他說什麼？' },
    { type: 'scale', label: '今天對自己的溫柔程度（1–7）' }] }
};

function renderDiaryTemplates() {
  $('di-templates').innerHTML = Object.entries(DIARY_TEMPLATES).map(([id, t]) => `
    <div class="fcard ${state.diary.template === id ? 'on' : ''}" onclick="pickDiary('${id}')">
      <div class="fcard-t">${esc(t.name)}</div><div class="fcard-s">${esc(t.desc)}</div>
    </div>`).join('');
}

/* 教練可自訂日記名稱與欄位；模板只是起點 */
function ensureDiaryFields() {
  if (!Array.isArray(state.diary.fields) || !state.diary.fields.length) {
    const t = DIARY_TEMPLATES[state.diary.template];
    state.diary.title = state.diary.title || t.name;
    state.diary.fields = JSON.parse(JSON.stringify(t.fields));
  }
}
function pickDiary(id) {
  const t = DIARY_TEMPLATES[id];
  state.diary.template = id;
  state.diary.title = t.name;
  state.diary.fields = JSON.parse(JSON.stringify(t.fields));
  save();
  renderDiaryTemplates();
  renderDiaryEditor();
}
function renderDiaryEditor() {
  ensureDiaryFields();
  $('di-title').value = state.diary.title;
  $('di-field-editor').innerHTML = state.diary.fields.map((f, i) => `
    <div class="frow">
      <span class="ftype">${f.type === 'text' ? '文字' : '量表 1–7'}</span>
      <input type="text" value="${esc(f.label)}" data-fei="${i}" placeholder="輸入題目文字...">
      <i class="ti ti-x del" onclick="diDelField(${i})" title="刪除此欄位"></i>
    </div>`).join('') || '<div class="empty" style="padding:14px"><i class="ti ti-forms"></i>還沒有欄位，點下方按鈕新增。</div>';
  [...document.querySelectorAll('#di-field-editor input')].forEach(inp => {
    inp.addEventListener('input', () => { state.diary.fields[+inp.dataset.fei].label = inp.value; save(); });
  });
}
function diAddField(type) {
  ensureDiaryFields();
  state.diary.fields.push({ type, label: type === 'text' ? '新的問題（點擊編輯文字）' : '今天的感受程度（1–7）' });
  save();
  renderDiaryEditor();
}
function diDelField(i) {
  state.diary.fields.splice(i, 1);
  save();
  renderDiaryEditor();
}

document.querySelectorAll('#di-styles .chip').forEach(c => c.addEventListener('click', function () {
  document.querySelectorAll('#di-styles .chip').forEach(x => x.classList.remove('on'));
  this.classList.add('on');
  state.diary.style = this.textContent.trim();
  save();
}));

function renderDiaryFields() {
  ensureDiaryFields();
  $('di-entry-title').textContent = state.diary.title + ' · 第 ' + (state.diary.entries.length + 1) + ' 天';
  renderDiaryByline();
  $('di-fields').innerHTML = state.diary.fields.map((f, i) => f.type === 'text'
    ? `<div class="fq"><div class="fq-t">${esc(f.label)}</div><textarea data-fi="${i}" rows="2" placeholder="寫多寫少都可以..."></textarea></div>`
    : `<div class="fq"><div class="fq-t">${esc(f.label)}</div><div class="pv-scale" data-fi="${i}">${[1,2,3,4,5,6,7].map(n => `<div class="pv-dot" data-v="${n}" onclick="pickDot(this)">${n}</div>`).join('')}</div></div>`
  ).join('');
  $('di-feedback').innerHTML = '';
}
function pickDot(el) {
  el.parentElement.querySelectorAll('.pv-dot').forEach(d => d.classList.remove('on'));
  el.classList.add('on');
}
function renderStreak() {
  const n = state.diary.entries.length;
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  $('di-streak').innerHTML = days.map((d, i) => `<div class="pv-sday ${i < Math.min(n, 7) ? 'done' : ''}">${d}</div>`).join('') +
    (n > 7 ? `<span style="font-size:11px;color:var(--text3);align-self:center;margin-left:6px">＋${n - 7} 天</span>` : '');
}

async function diSave() {
  ensureDiaryFields();
  const answers = [];
  let scaleVal = null, hasText = false;
  state.diary.fields.forEach((f, i) => {
    if (f.type === 'text') {
      const v = document.querySelector(`#di-fields textarea[data-fi="${i}"]`).value.trim();
      answers.push({ label: f.label, value: v });
      if (v) hasText = true;
    } else {
      const on = document.querySelector(`#di-fields .pv-scale[data-fi="${i}"] .pv-dot.on`);
      scaleVal = on ? +on.dataset.v : null;
      answers.push({ label: f.label, value: scaleVal });
    }
  });
  if (!hasText) { toast('請至少寫一點文字內容', true); return; }
  const fullText = answers.filter(a => typeof a.value === 'string' && a.value).map(a => a.value).join('\n');
  const flagged = crisisCheck(fullText);
  if (flagged) $('di-crisis').classList.add('on');
  await withLoading($('di-save-btn'), async () => {
    const recent = state.diary.entries.slice(-3).map(e => `（${e.date}）${e.answers.filter(a => typeof a.value === 'string').map(a => a.value).join('／')}`).join('\n');
    const feedback = await callClaude({
      system: `你是「${state.diary.title}」的 AI 陪伴者，由個案的人生教練${state.settings.coachName ? `「${state.settings.coachName}」` : ''}部署。個案剛寫完今天的日記，請給一段即時回饋。
回饋風格：${state.diary.style}。
規則：肯定書寫行為本身；針對內容中具體的細節回應（引用他的字句）；最多 3 句話；不說教、不給建議清單；不用「加油」這類空泛詞。${flagged ? '個案內容出現高風險語彙：請溫柔地表達關心，並明確建議他聯繫教練本人或安心專線 1925。' : ''}${LANG_RULE}`,
      messages: [{ role: 'user', content: (recent ? `最近幾天的紀錄：\n${recent}\n\n` : '') + `今天的日記：\n${answers.map(a => a.label + '：' + (a.value ?? '（未填）')).join('\n')}` }],
      maxTokens: 300
    });
    state.diary.entries.push({ date: today(), answers, scale: scaleVal, feedback: feedback.trim(), flagged });
    save();
    renderStreak();
    const n = state.diary.entries.length;
    let extra = '';
    if (n === 3) extra = `<div class="pv-overall" style="margin-top:8px"><div class="pv-overall-hd"><i class="ti ti-lock-open"></i> 整體回饋已解鎖！</div><div class="pv-overall-txt">你已累積 3 則紀錄，到「紀錄與回饋」頁生成 AI 的跨日觀察。</div></div>`;
    if (n === 7) extra = `<div class="pv-overall" style="margin-top:8px"><div class="pv-overall-hd"><i class="ti ti-lock-open"></i> 一週成長報告已解鎖！</div><div class="pv-overall-txt">你完成了 7 天紀錄，到「紀錄與回饋」頁生成完整週報。</div></div>`;
    $('di-feedback').innerHTML = `<div class="pv-ai"><div class="pv-ai-hd"><i class="ti ti-sparkles"></i> AI 即時回饋</div><div class="pv-ai-txt">${esc(feedback.trim())}</div></div>` + extra;
    document.querySelectorAll('#di-fields textarea').forEach(x => x.value = '');
    document.querySelectorAll('#di-fields .pv-dot').forEach(x => x.classList.remove('on'));
    $('di-entry-title').textContent = state.diary.title + ' · 第 ' + (n + 1) + ' 天';
    toast(`第 ${n} 則紀錄已儲存`);
  });
}

const DEMO_DIARY = [
  { a: ['下班路上看到很美的夕陽，停下來看了五分鐘', '因為我最近提醒自己走路不要一直看手機'], s: 5, f: '「停下來」這個動作本身就很珍貴——你不只是遇見了美好，你選擇了讓自己在場。' },
  { a: ['中午自己去吃了一直想吃的那家拉麵', '我主動決定不揪同事，想給自己一點獨處時間'], s: 5, f: '為自己安排一段獨處的午餐，這是很成熟的自我照顧。你開始把自己放回優先順序裡了。' },
  { a: ['把設計課的第一份作業做完了，比想像中好玩', '我把作業切成三小塊，每天做一塊，是我自己想的方法'], s: 6, f: '「切成三小塊」是你自己發明的策略，而且它成功了——記住這個方法，它以後還會幫到你。' },
  { a: ['同事誇我做的報表救了他一命', '六年來累積的技術真的有價值，只是我以前不覺得'], s: 6, f: '你寫下了「只是我以前不覺得」——能看見這個轉變的人，是已經改變了的人。' },
  { a: ['跟太太散步聊了未來的計畫，她說看到我最近不一樣了', '因為我願意把心裡的想法說出來了'], s: 7, f: '被最親近的人看見改變，是最真實的鏡子。而這一切從你「願意說出來」開始。' },
  { a: ['有點累，今天只想到一件好事：晚餐的湯很好喝', '大概是我有好好坐下來吃飯吧'], s: 3, f: '累的日子還願意打開日記，寫下一碗湯的溫度——這就夠了。低潮的日子，小事就是大事。' },
  { a: ['重新聯絡上大學室友，約了下週吃飯', '是我主動傳訊息的！以前都等別人約'], s: 6, f: '「是我主動傳的」——你自己都聽見這句話裡的能量了吧。從等待到主動，這是很大的一步。' }
];

function diDemoWeek() {
  ensureDiaryFields();
  state.diary.entries = DEMO_DIARY.map((d, i) => ({
    date: today(i - 6),
    answers: state.diary.fields.map((f, fi) => f.type === 'scale'
      ? { label: f.label, value: d.s }
      : { label: f.label, value: d.a[fi] || d.a[0] }),
    scale: d.s,
    feedback: d.f,
    flagged: false
  }));
  save();
  renderStreak(); renderEntries();
  diGo(3);
  toast('已產生 7 天示例紀錄（即時回饋為預置示例；整體回饋與週報將由 AI 真實生成）');
}

function entriesAsText() {
  return state.diary.entries.map((e, i) =>
    `第 ${i + 1} 天（${e.date}）${e.scale != null ? ' 量表：' + e.scale + '/7' : ''}\n` +
    e.answers.filter(a => typeof a.value === 'string' && a.value).map(a => a.label + '：' + a.value).join('\n')
  ).join('\n\n');
}

async function diOverall() {
  if (state.diary.entries.length < 3) { toast('需累積至少 3 則紀錄才能生成整體回饋', true); return; }
  await withLoading($('di-overall-btn'), async () => {
    const out = await callClaude({
      system: `你是日記的 AI 陪伴者。綜觀個案至今的所有日記紀錄，指出「他自己可能沒發現」的跨日模式與變化。
規則：聚焦 1–2 個模式即可，不要條列一堆；引用他不同天的原話作為證據；語氣像溫柔的發現（「你可能沒發現，但…」）；100–150字；結尾留一個輕輕的觀察邀請，不是作業。${LANG_RULE}`,
      messages: [{ role: 'user', content: entriesAsText() }],
      maxTokens: 500
    });
    state.diary.overall = { date: today(), text: out.trim() };
    save();
    renderEntries();
    toast('整體回饋已生成');
  });
}

async function diWeekly() {
  if (state.diary.entries.length < 7) { toast('需累積至少 7 則紀錄才能生成週報', true); return; }
  await withLoading($('di-week-btn'), async () => {
    const out = await callClaude({
      system: `你是日記週報生成器，為人生教練的個案服務。根據 7 天以上的日記，生成一週成長報告。
${LANG_RULE}
只輸出 JSON：
{"summary":"本週整體觀察（100字內，第二人稱，溫暖但具體）",
 "themes":[{"emoji":"emoji","title":"主題（8字內）","text":"跨日證據描述（50字內）"}],
 "quote":{"text":"個案本週寫過最有力量的一句原話","src":"第幾天"},
 "challenge":{"title":"下週小挑戰標題","text":"根據本週內容設計的延伸練習（50字內）"},
 "coachNote":"給教練的一句摘要（本週個案狀態，專業視角，40字內）"}`,
      messages: [{ role: 'user', content: entriesAsText() }],
      maxTokens: 1200
    });
    state.diary.weekly = { date: today(), data: parseJSONLoose(out) };
    save();
    renderEntries();
    toast('一週成長報告已生成');
  });
}

function renderEntries() {
  const n = state.diary.entries.length;
  $('di-progress-sub').textContent = `已累積 ${n} 則紀錄。整體回饋${n >= 3 ? '已解鎖' : `還差 ${3 - n} 則`}，一週成長報告${n >= 7 ? '已解鎖' : `還差 ${7 - n} 則`}。`;
  $('di-overall-btn').disabled = n < 3;
  $('di-week-btn').disabled = n < 7;
  $('di-overall-out').innerHTML = state.diary.overall
    ? `<div class="pv-overall"><div class="pv-overall-hd"><i class="ti ti-stack-2"></i> 整體回饋 · ${esc(state.diary.overall.date)} · 累積 ${n} 則</div><div class="pv-overall-txt">${esc(state.diary.overall.text)}</div></div>` : '';
  const w = state.diary.weekly?.data;
  if (w) {
    const scales = state.diary.entries.slice(-7).map(e => e.scale).filter(v => v != null);
    const trend = scales.length ? `<div style="display:flex;align-items:flex-end;gap:5px;height:60px;margin:10px 0">${scales.map(v => `<div style="flex:1;background:var(--green);opacity:${.35 + v / 10};border-radius:4px 4px 0 0;height:${(v / 7) * 100}%" title="${v}/7"></div>`).join('')}</div><div style="font-size:10px;color:var(--text3);text-align:center;margin-bottom:8px">最近 7 天量表趨勢（1–7）</div>` : '';
    $('di-week-out').innerHTML = `<div class="pv-week" style="background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:10px;padding:13px;margin-top:10px">
      <div style="font-size:10.5px;font-weight:500;color:var(--amber-text);display:flex;align-items:center;gap:5px;margin-bottom:8px"><i class="ti ti-calendar-star"></i> 一週成長報告 · ${esc(state.diary.weekly.date)}</div>
      ${trend}
      <div style="font-size:12px;line-height:1.75;margin-bottom:10px">${esc(w.summary || '')}</div>
      ${(w.themes || []).map(t => `<div class="spark" style="background:var(--surface)"><span class="spark-emoji">${esc(t.emoji)}</span><div class="spark-body"><div class="spark-t">${esc(t.title)}</div><div class="spark-s">${esc(t.text)}</div></div></div>`).join('')}
      <div class="quote" style="margin:10px 0"><div class="quote-mark">❝</div><div class="quote-txt">${esc(w.quote?.text || '')}</div><div class="quote-src">${esc(w.quote?.src || '')}</div></div>
      <div class="mission"><div class="mission-t"><i class="ti ti-flag"></i> ${esc(w.challenge?.title || '')}</div><div class="mission-s">${esc(w.challenge?.text || '')}</div></div>
      <div class="note" style="margin-top:10px"><i class="ti ti-stethoscope"></i><span><strong>同步給 ${esc(coachName())}：</strong>${esc(w.coachNote || '')}</span></div>
    </div>`;
  } else $('di-week-out').innerHTML = '';
  $('di-entries').innerHTML = state.diary.entries.length ? state.diary.entries.map((e, i) => `
    <div class="entry">
      <div class="entry-hd"><i class="ti ti-calendar"></i> 第 ${i + 1} 天 · ${esc(e.date)} ${e.scale != null ? `· 量表 ${e.scale}/7` : ''} ${e.flagged ? '<span class="tag-mini" style="background:var(--red-bg);border-color:var(--red-border);color:var(--red-text)">已通知教練</span>' : ''}</div>
      <div class="entry-txt">${e.answers.filter(a => typeof a.value === 'string' && a.value).map(a => esc(a.value)).join('<br>')}</div>
      <div class="pv-ai" style="margin-top:8px"><div class="pv-ai-hd"><i class="ti ti-sparkles"></i> AI 即時回饋</div><div class="pv-ai-txt">${esc(e.feedback)}</div></div>
    </div>`).reverse().join('') : '<div class="empty"><i class="ti ti-notebook"></i>還沒有紀錄。回到「今日書寫」開始第一天。</div>';
}

/* ═══════════════════════════════════════════
   Module 5 · 結案回顧（T1 再測＋整體成長報告）
   ═══════════════════════════════════════════ */
function renderChecklist() {
  const S = state;
  const items = [
    { ok: !!S.assess.t0.report, label: '初始評估 T0 基準線', detail: S.assess.t0.report ? `${(getScale() || {}).name || ''} · ${S.assess.t0.date}` : '尚未完成 — 請先到「2 初始評估」', required: true },
    { ok: S.transcripts.length > 0, label: '晤談逐字稿分析', detail: S.transcripts.length ? `${S.transcripts.length} 次晤談將納入整合` : '沒有也可以，但報告會缺少晤談視角', required: false },
    { ok: S.diary.entries.length >= 3, label: '每日日記紀錄', detail: S.diary.entries.length ? `${S.diary.entries.length} 則紀錄將納入整合` : '沒有也可以，但報告會缺少日常軌跡', required: false }
  ];
  $('rv-checklist').innerHTML = items.map(it => `
    <div class="jrow ${it.ok ? 'done' : ''}">
      <div class="jico"><i class="ti ${it.ok ? 'ti-check' : 'ti-minus'}"></i></div>
      <div class="jmeta"><div class="jt">${esc(it.label)} ${it.required ? '<span class="tag-mini">必要</span>' : '<span class="tag-mini">選配</span>'}</div><div class="js">${esc(it.detail)}</div></div>
    </div>`).join('');
  $('rv-start-btn').disabled = !S.assess.t0.report;
}

function rvStartT1() {
  if (!state.assess.t0.report) { toast('請先完成 T0 初始評估', true); return; }
  renderAssessForm('rv-form', 't1');
  rvGo(2);
}

function rvDemoAnswers() {
  const qs = state.assess.questions || [];
  [...document.querySelectorAll('#rv-form textarea')].forEach((t, i) => {
    t.value = DEMO_T1[i] || `關於「${qs[i]?.dim || ''}」：這個月有些新的嘗試，感覺比一個月前踏實了一點，雖然還在路上。`;
  });
  toast('已填入示例回答（同一個案 · 一個月後）');
}

async function rvAnalyze() {
  const answers = collectAnswers('rv-form');
  if (answers.filter(a => a).length < Math.ceil(answers.length / 2)) { toast('請至少回答一半以上的題目（或點「填入示例回答」）', true); return; }
  await withLoading($('rv-analyze-btn'), async () => {
    const scale = getScale();
    const max = scaleMax();
    const t0 = state.assess.t0;
    const qaT1 = state.assess.questions.map((q, i) => `【${q.dim}】問：${q.q}\n答：${answers[i] || '（未回答）'}`).join('\n\n');
    const t0Summary = (t0.report.dims || []).map(d => `${d.name}：${d.score}/${max}（${d.evidence}）`).join('\n');
    const trSummary = state.transcripts.map((t, i) => `第 ${i + 1} 次（${t.date}）主題：${t.report?.title}；教練反思重點：${(t.report?.reflections || []).join('；')}`).join('\n') || '（無晤談紀錄）';
    const diaryTxt = state.diary.entries.length ? entriesAsText() : '（無日記紀錄）';
    const out = await callClaude({
      system: `你是人生教練的結案分析師。個案完成了一個月的教練週期，現在進行 T1 再測。請整合四種資料生成「整體成長報告」：
1. T0 基準線（推估分數與證據）
2. T1 再測回答（需重新推估各維度分數，依原量表計分範圍 0–${max}）
3. 晤談分析摘要
4. 每日日記全紀錄
分析重點：前後分數比較與語言變化（例如從「不得不」到「我選擇」）、跨資料源相互印證的成長證據、尚未完成的功課。教練版誠實專業；個案版是溫暖的「畢業快照」，不含分數與風險語言，並附結案後的自主練習計畫（教練結案的核心是讓個案成為自己的教練）。
${LANG_RULE}
只輸出 JSON：
{
 "dims":[{"name":"維度名","t0":數字,"t1":數字,"note":"變化解讀與 T1 原文證據（60字內）"}],
 "langShifts":[{"title":"語言變化標題（10字內）","before":"T0 原話","after":"T1 原話","meaning":"這個轉變的意義（40字內）"}],
 "coach":{"observations":["整合三種資料的專業觀察，3-4點"],"unfinished":["尚未完成的功課，1-2點"],"closing":["結案晤談建議聚焦的方向，2-3點"]},
 "client":{
  "kicker":"畢業快照標語（8字內）","emoji":"emoji","title":"這一個月的角色命名（6-10字）","subtitle":"一句溫暖的總結（35字內）",
  "sparks":[{"emoji":"emoji","title":"成長亮點（10字內）","text":"跨資料的具體證據（60字內）"}],
  "quote":{"text":"個案這個月寫過/說過最有力量的一句原話","src":"出處"},
  "hope":"回顧起點到現在的鼓舞訊息（80字內）",
  "plan":[{"title":"自主練習（8字內）","text":"結案後可自己持續的具體練習（40字內）"}]
 }
}`,
      messages: [{ role: 'user', content: `【T0 基準線（${t0.date}）】\n${t0Summary}\n\n【T1 再測回答（${today()}）】\n${qaT1}\n\n【晤談分析摘要】\n${trSummary}\n\n【日記紀錄】\n${diaryTxt}` }],
      maxTokens: 4000
    });
    const report = parseJSONLoose(out);
    state.assess.t1 = { answers, report: null, date: today() };
    state.review = { report, date: today() };
    save();
    renderReviewReport(report);
    rvGo(3);
    toast('整體成長報告已生成');
  });
}

function renderReviewReport(r) {
  const max = scaleMax();
  const dims = (r.dims || []).map(d => {
    const p0 = Math.min(100, Math.round((d.t0 / max) * 100));
    const p1 = Math.min(100, Math.round((d.t1 / max) * 100));
    const delta = (d.t1 - d.t0);
    const deltaTxt = delta > 0 ? `▲ +${delta.toFixed(1)}` : delta < 0 ? `▼ ${delta.toFixed(1)}` : '—';
    const deltaColor = delta > 0 ? 'var(--green-text)' : delta < 0 ? 'var(--red-text)' : 'var(--text3)';
    return `<div class="dim">
      <div class="dim-hd"><span class="dim-name">${esc(d.name)}</span><span style="font-size:11px;color:${deltaColor};font-weight:600">${deltaTxt}</span><span style="font-size:11px;color:var(--text3)">${d.t0} → ${d.t1} / ${max}</span></div>
      <div class="dim-bar"><div class="dim-fill ghost" style="width:${p0}%"></div><div class="dim-fill" style="width:${p1}%"></div></div>
      <div class="evi">${esc(d.note)}</div>
    </div>`;
  }).join('');
  const shifts = (r.langShifts || []).map(s => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:8px;background:var(--surface)">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">${esc(s.title)}</div>
      <div style="font-size:11.5px;color:var(--text3);line-height:1.7">T0：「${esc(s.before)}」</div>
      <div style="font-size:11.5px;color:var(--green-text);line-height:1.7">T1：「${esc(s.after)}」</div>
      <div style="font-size:11px;color:var(--text2);margin-top:5px">${esc(s.meaning)}</div>
    </div>`).join('');
  const co = r.coach || {};
  $('rv-rv-coach').innerHTML = `
    <div class="rsec green"><div class="rsec-hd"><i class="ti ti-chart-arrows-vertical"></i> T0 → T1 維度比較（灰＝T0，綠＝T1）</div><div class="rsec-body">${dims}
      <div style="font-size:11px;color:var(--text3);margin-top:8px">推估分數僅供回顧成長使用，不可等同標準化施測。</div></div></div>
    <div class="rsec blue"><div class="rsec-hd"><i class="ti ti-language"></i> 語言變化偵測</div><div class="rsec-body">${shifts || '（未偵測到明顯語言轉變）'}</div></div>
    <div class="rsec purple"><div class="rsec-hd"><i class="ti ti-bulb"></i> 整合觀察（評估 × 晤談 × 日記）</div><div class="rsec-body">${(co.observations || []).map((o, i) => `<div class="qitem"><div class="qnum">${i + 1}</div><div class="qtxt">${esc(o)}</div></div>`).join('')}</div></div>
    <div class="rsec amber"><div class="rsec-hd"><i class="ti ti-route"></i> 尚未完成的功課 & 結案晤談方向</div><div class="rsec-body">
      <strong style="font-size:12px">尚未完成的功課</strong><br>${(co.unfinished || []).map(u => '· ' + esc(u)).join('<br>')}<br><br>
      <strong style="font-size:12px">結案晤談建議聚焦</strong><br>${(co.closing || []).map(c => '· ' + esc(c)).join('<br>')}</div></div>`;
  const c = r.client || {};
  const sparks = (c.sparks || []).map(s => `<div class="spark"><span class="spark-emoji">${esc(s.emoji)}</span><div class="spark-body"><div class="spark-t">${esc(s.title)}</div><div class="spark-s">${esc(s.text)}</div></div></div>`).join('');
  const plan = (c.plan || []).map(p => `<div class="mission" style="margin-bottom:8px"><div class="mission-t"><i class="ti ti-repeat"></i> ${esc(p.title)}</div><div class="mission-s">${esc(p.text)}</div></div>`).join('');
  $('rv-rv-client').innerHTML = `<div class="cphone">
    <div class="chero"><div class="chero-kicker">${esc(c.kicker || '畢業快照')} · ${esc(today())}</div><div class="chero-emoji">${esc(c.emoji || '🎓')}</div><div class="chero-title">${esc(c.title || '')}</div><div class="chero-sub">${esc(c.subtitle || '')}</div></div>
    <div class="cbody">
      <div class="csec"><div class="csec-t"><i class="ti ti-flame"></i> 這一個月的成長亮點</div>${sparks}</div>
      <div class="csec"><div class="csec-t"><i class="ti ti-quote"></i> 這個月你最有力量的一句話</div>
        <div class="quote"><div class="quote-mark">❝</div><div class="quote-txt">${esc(c.quote?.text || '')}</div><div class="quote-src">${esc(c.quote?.src || '')} · 我們幫你留下來了</div></div></div>
      <div class="csec"><div class="csec-t"><i class="ti ti-sunrise"></i> 回頭看看起點</div><div class="hope">${esc(c.hope || '')}</div></div>
      <div class="csec"><div class="csec-t"><i class="ti ti-compass"></i> 畢業後的自主練習 · 你已經是自己的教練</div>${plan}</div>
    </div>
    <div class="cfooter"><div class="cfoot-note">這份畢業快照由 AI 整合你一個月的書寫與對話生成，經 ${esc(coachName())} 確認後發送<br>${esc(coachName())} 的門永遠開著 · 隨時歡迎回來聊聊</div></div>
  </div>`;
}

function rvSwitch(el, v) {
  document.querySelectorAll('#rv-p3 .rsw').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
  $('rv-rv-coach').classList.toggle('on', v === 'coach');
  $('rv-rv-client').classList.toggle('on', v === 'client');
}

/* ───────── Init：還原已儲存的進度 ───────── */
(function init() {
  updateSettingsBadge();
  renderJourney();
  renderScales();
  ensureDiaryFields();
  renderDiaryTemplates();
  renderDiaryEditor();
  updateBylines();
  $('di-title').addEventListener('input', () => {
    state.diary.title = $('di-title').value;
    save();
    renderDiaryByline();
  });
  $('consent-text').value = consentText();
  $('consent-text').addEventListener('input', () => {
    state.consent.text = $('consent-text').value;
    save();
  });
  renderConsentStatus();
  if (state.bot.desc) $('bot-desc').value = state.bot.desc;
  if (state.bot.prompt) $('bot-prompt').value = state.bot.prompt;
  if (state.bot.chat.length) renderBotChat();
  renderBotSummary();
  if (state.assess.questions) { renderPairs(); renderAssessForm('as-form', 't0'); }
  if (state.assess.t0.report) renderAssessReport('as-rv-coach', 'as-rv-client', state.assess.t0.report, null, 'T0 · 初始評估');
  if (state.transcripts.length) { renderTrReport(state.transcripts[state.transcripts.length - 1].report); renderTrHistory(); }
  document.querySelectorAll('#di-styles .chip').forEach(c => c.classList.toggle('on', c.textContent.trim() === state.diary.style));
  renderStreak(); renderDiaryFields(); renderEntries();
  if (state.review.report) renderReviewReport(state.review.report);
  if (!state.settings.apiKey) setTimeout(() => toast('提示：點右上角「設定」貼上 Anthropic API Key 即可開始測試'), 800);
})();
