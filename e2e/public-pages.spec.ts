import { expect, test } from '@playwright/test'

const publicRoutes = [
  ['/pricing', '方案與價格'],
  ['/refund', '退款政策'],
  ['/terms', '使用者條款'],
  ['/privacy', '隱私政策'],
  ['/support', '支援與聯絡我們'],
] as const

test.describe('公開付款資訊頁', () => {
  for (const [path, heading] of publicRoutes) {
    test(`${path} 可在手機尺寸公開閱讀並含完整 Footer`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: '方案與價格' })).toBeVisible()
      await expect(page.getByRole('link', { name: '服務條款' })).toBeVisible()
      await expect(page.getByRole('link', { name: '隱私權政策' })).toBeVisible()
      await expect(page.getByRole('link', { name: '退款政策' })).toBeVisible()
      await expect(page.getByRole('link', { name: '客服中心' })).toBeVisible()

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect(page.getByText('本服務非醫療行為。', { exact: false })).toBeVisible()
    })
  }

  test('/pricing 沒有尚未實作的付款導購入口', async ({ page }) => {
    await page.goto('/pricing')

    await expect(page.getByText('收費功能準備中')).toBeVisible()
    await expect(page.getByRole('link', { name: /付款|購買|立即訂閱|開始訂閱/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /付款|購買|立即訂閱|開始訂閱/ })).toHaveCount(0)
  })
})
