// github3 — moitié TEST : affiche les issues qui contiennent un script et la discussion, SANS lancer l'analyseur.
// Sert à écrire les étiquettes (eval/script-lint-labels.json) avant la mesure.   npx tsx eval/script-lint-test-view.ts
import { readFileSync } from 'fs'
import { join } from 'path'

const raw: Array<{ url: string; title: string; body: string; comments: Array<{ by: string; body: string }> }> =
  JSON.parse(readFileSync(join(__dirname, 'github3-raw.json'), 'utf8'))
const { test } = JSON.parse(readFileSync(join(__dirname, 'github3-split.json'), 'utf8')) as { test: string[] }
const blocks = (body: string) => [...body.replace(/\r\n/g, '\n').matchAll(/```(\w*)\n([\s\S]*?)```/g)]
  .map(m => ({ lang: m[1], text: m[2] }))
  .filter(b => /^#!|^\s*(import |from \w+ import|def )/m.test(b.text) || /^(bash|sh|shell|python|py)$/.test(b.lang))
test.forEach((u, i) => {
  const x = raw.find(r => r.url === u)!
  const b = blocks(x.body)
  if (!b.length) return
  console.log(`\n=== T${i} ${x.title}\n${u}\n--- SCRIPT(S)\n${b.map(y => y.text.slice(0, 900)).join('\n~~~\n')}\n--- DISCUSSION\n${x.comments.map(c => `[${c.by}] ${c.body.replace(/\s+/g, ' ').slice(0, 450)}`).join('\n')}`)
})
