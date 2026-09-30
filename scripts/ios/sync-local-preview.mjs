import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const localConfigPath = '.capacitor-preview.local'

if (!existsSync(localConfigPath)) {
  console.error(`找不到 ${localConfigPath}。請建立未提交檔案，例如：\n{\n  "serverUrl": "http://127.0.0.1:5173"\n}`)
  process.exit(1)
}

let serverUrl
try {
  ({ serverUrl } = JSON.parse(readFileSync(localConfigPath, 'utf8')))
  const parsed = new URL(serverUrl)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error('網址必須是 http://127.0.0.1 或 http://localhost')
  }
} catch (error) {
  console.error(`${localConfigPath} 格式錯誤：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const result = spawnSync('npx', ['cap', 'sync', 'ios'], {
  env: { ...process.env, CAPACITOR_SERVER_URL: serverUrl },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
