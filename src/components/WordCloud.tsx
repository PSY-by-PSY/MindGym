import { useEffect, useRef } from "react";

const wordData: [string, number][] = [
  ["自己", 100], ["朋友", 87],
  ["工作", 58], ["開心", 56], ["天氣", 52], ["好吃", 46], ["跑步", 42],
  ["論文", 42], ["咖啡廳", 38], ["家人", 36], ["心情", 35], ["幸福", 34],
  ["努力", 32], ["身體", 30], ["睡覺", 28], ["太陽", 27], ["生活", 26],
  ["感動", 24], ["教授", 23], ["伴侶", 22], ["分享", 20], ["運動", 20],
  ["早餐", 18], ["貓咪", 18], ["狗狗", 17], ["晚餐", 17], ["天空", 17],
  ["成長", 16], ["陽光", 16], ["平靜", 14], ["練習", 14], ["覺察", 14],
  ["溫暖", 14], ["美食", 13], ["能量", 13], ["下雨", 13], ["女友", 11],
  ["睡飽", 11], ["公園", 11], ["健身", 11],
];

const COLOR_MAP: Record<string, string> = {
  自己: "#3C3489", 朋友: "#D4537E", 工作: "#378ADD", 開心: "#7F77DD",
  天氣: "#639922", 好吃: "#D85A30", 跑步: "#0F6E56", 論文: "#185FA5",
  咖啡廳: "#BA7517", 家人: "#993556", 心情: "#534AB7", 幸福: "#7F77DD",
  努力: "#378ADD", 身體: "#1D9E75", 睡覺: "#993556", 太陽: "#639922",
  生活: "#534AB7", 感動: "#7F77DD", 教授: "#185FA5", 伴侶: "#D4537E",
  分享: "#1D9E75", 運動: "#0F6E56", 早餐: "#D85A30", 貓咪: "#D4537E",
  狗狗: "#BA7517", 晚餐: "#BA7517", 天空: "#185FA5", 成長: "#534AB7",
  陽光: "#639922", 平靜: "#1D9E75", 練習: "#378ADD", 覺察: "#534AB7",
  溫暖: "#D85A30", 美食: "#BA7517", 能量: "#1D9E75", 下雨: "#378ADD",
  女友: "#D4537E", 睡飽: "#993556", 公園: "#639922", 健身: "#0F6E56",
};

export default function WordCloud({ height = 520 }: { height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const W = el.offsetWidth || 660;
    const H = height;
    const cx = W / 2, cy = H / 2;
    const placed: { x: number; y: number; w: number; h: number }[] = [];

    function fits(b: { x: number; y: number; w: number; h: number }) {
      if (b.x < 6 || b.y < 6 || b.x + b.w > W - 6 || b.y + b.h > H - 6) return false;
      for (const p of placed) {
        if (b.x < p.x + p.w + 8 && b.x + b.w + 8 > p.x &&
            b.y < p.y + p.h + 6 && b.y + b.h + 6 > p.y) return false;
      }
      return true;
    }

    wordData.forEach(([text, weight]) => {
      const fs = Math.round(12 + (weight / 100) * 44);
      const tw = text.length * fs * 1.1;
      const th = fs * 1.45;

      for (let i = 0; i < 40000; i++) {
        const theta = i * 0.17;
        const r = 0.11 * theta;
        const x = cx + r * Math.cos(theta) - tw / 2;
        const y = cy + r * Math.sin(theta) - th / 2;
        const b = { x, y, w: tw, h: th };
        if (fits(b)) {
          placed.push(b);
          const span = document.createElement("span");
          span.textContent = text;
          const op = (0.55 + (weight / 100) * 0.45).toFixed(2);
          span.style.cssText = `
            position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;
            font-size:${fs}px;font-weight:${weight > 45 ? 500 : 400};
            color:${COLOR_MAP[text] ?? "#7F77DD"};opacity:${op};
            white-space:nowrap;line-height:1;cursor:default;user-select:none;
            transition:transform 0.18s,opacity 0.18s;
          `;
          span.addEventListener("mouseenter", function (this: HTMLSpanElement) {
            this.style.transform = "scale(1.14)";
            this.style.opacity = "1";
          });
          span.addEventListener("mouseleave", function (this: HTMLSpanElement) {
            this.style.transform = "";
            this.style.opacity = op;
          });
          el.appendChild(span);
          break;
        }
      }
    });
  }, [height]);

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
        共同書寫的感謝詞彙 · 字體越大代表出現越頻繁
      </p>
      <div
        ref={containerRef}
        style={{ position: "relative", width: "100%", height }}
      />
    </div>
  );
}
