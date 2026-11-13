// github3 — moitié ENTRAÎNEMENT : ce que la lecture des scripts (eval/../script-lint) signale, bloc par bloc.
// Sert à repérer les fausses alertes ; la moitié TEST n'est jamais lue ici.   npx tsx eval/script-lint-train.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { lintScript } from '../src/services/llm/script-lint'

const raw: Array<{ url: string; title: string; body: string }> = JSON.parse(readFileSync(join(__dirname, 'github3-raw.json'), 'utf8'))
const { train } = JSON.parse(readFileSync(join(__dirname, 'github3-split.json'), 'utf8')) as { train: string[] }
// Bloc de script : #!, code Python, ou bloc étiqueté bash/sh/python. Fins de ligne du formulaire GitHub (\r\n) retirées.
export const scriptBlocks = (body: string) => [...body.replace(/\r\n/g, '\n').matchAll(/```(\w*)\n([\s\S]*?)```/g)]
  .map(m => ({ lang: m[1], text: m[2] }))
  .filter(b => /^#!|^\s*(import |from \w+ import|def )/m.test(b.text) || /^(bash|sh|shell|python|py)$/.test(b.lang))
let n = 0
train.forEach((u, i) => {
  const x = raw.find(r => r.url === u)!
  for (const b of scriptBlocks(x.body)) {
    n++
    const f = lintScript(b.text, b.lang.startsWith('py') ? 'x.py' : '')
    if (f.length) console.log(`#${i} ${x.title.slice(0, 60)} → ${f.map(y => y.id).join(', ')}`)
  }
})
console.log('blocs de script lus :', n)
