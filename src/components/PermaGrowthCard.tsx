import fertilizerIcon from '../assets/ui/花肥.png'

export interface PermaGrowthItem {
  key: string
  label: string
  delta: number
  bar: string
  description: string
}

/**
 * 完成頁通用的「練習後 PERMA 幸福力成長」卡片。
 * 所有訓練模組的紀錄完成頁都應該用這個共用元件呈現 PERMA 加分，
 * 而不是各自複製一份 markup——之後新增模組只要接上 items 就好。
 */
export function PermaGrowthCard({ title, items }: { title: string; items: readonly PermaGrowthItem[] }) {
  return (
    <div className="mb-6 w-full rounded-3xl bg-card p-6 shadow-soft">
      <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.25em] text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-col gap-5">
        {items.map(({ key, label, delta, bar, description }, i) => (
          <div
            key={key}
            className="celebrate-row flex flex-col gap-2"
            style={{ animationDelay: `${0.15 + i * 0.18}s` }}
          >
            <div className="flex items-center gap-3">
              <img src={fertilizerIcon} alt="" className="h-[35px] w-[40px] shrink-0" />
              <span className="shrink-0 text-sm font-extrabold text-foreground">
                {label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${bar} celebrate-bar`}
                  style={{ width: `${(delta / 3) * 100}%`, animationDelay: `${0.25 + i * 0.18}s` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-extrabold text-primary">
                +{delta}
              </span>
            </div>
            <p className="pl-[52px] text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
