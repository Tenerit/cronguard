// Provider promptfoo : le "prompt" rendu = les logs bruts du cas. Lancé via tsx en
// sous-process (stdin, pas argv) pour passer des logs multi-lignes sans souci de quoting Windows.
const { spawn } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(__dirname, 'analyze-once.ts')

module.exports = class CronGuardAnalyzer {
  id() { return 'cronguard-analyzer' }

  callApi(prompt) {
    return new Promise((resolve) => {
      const child = spawn(`npx tsx "${SCRIPT}"`, { cwd: ROOT, shell: true })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => { out += d })
      child.stderr.on('data', (d) => { err += d })
      child.on('close', () => {
        let parsed
        try { parsed = JSON.parse(out) } catch { return resolve({ error: `non-JSON output: ${out.slice(0, 300)} ${err.slice(0, 300)}` }) }
        if (parsed.error) return resolve({ error: parsed.error })
        resolve({ output: JSON.stringify(parsed) })
      })
      child.stdin.end(JSON.stringify({ logs: prompt }))
    })
  }
}
