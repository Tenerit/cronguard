// /r/<jeton> : valider ou corriger une analyse depuis l'alerte (Teams, Slack, mail), sans se connecter.
// GET n'écrit JAMAIS rien : Teams/Outlook ouvrent les liens pour en faire un aperçu, un GET qui
// validerait serait cliqué par un robot. On affiche la page ; seul un POST du formulaire enregistre.
// Page sans script (CSP stricte) ; le jeton ne donne accès qu'à cette analyse (review-links.ts).
import express, { Router, Request, Response } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/async-handler'
import { audit } from '../middleware/audit'
import { verifyReviewToken } from '../../services/review-links'
import { findAnalysis, recordFeedback, recordFix, AnalysisRef } from '../../services/analysis-feedback'
import { escapeHtml as e } from '../../services/escape'
import { db } from '../../db'
import { REVIEW_CSS } from '../page-styles'

export const reviewRouter = Router()
reviewRouter.use(express.urlencoded({ extended: false, limit: '4kb' }))

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${e(title)} — CronGuard</title><style>${REVIEW_CSS}</style></head><body><main>${body}</main></body></html>`
}

async function resolve(req: Request, res: Response): Promise<AnalysisRef | null> {
  const id = await verifyReviewToken(req.params.token)
  const a = id ? await findAnalysis(id) : null
  if (!a) res.status(404).type('html').send(page('Lien invalide', '<h1>Lien invalide ou expiré</h1><p>Ouvrez l\'analyse depuis le tableau de bord.</p>'))
  return a
}

async function analysisText(id: string): Promise<{ cause: string; action: string }> {
  const { rows: [r] } = await db.query(`SELECT cause, action FROM analyses WHERE id = $1`, [id])
  return { cause: r?.cause ?? '', action: r?.action ?? '' }
}

reviewRouter.get('/:token', asyncHandler(async (req, res) => {
  const a = await resolve(req, res)
  if (!a) return
  const { cause, action } = await analysisText(a.id)
  const wantFix = req.query.v === 'fix'
  const state = a.verified_fix ? `<div class="box done"><p class="lbl">Correction déjà enregistrée</p>${e(a.verified_fix)}</div>`
    : a.user_feedback === 'positive' ? '<div class="box done">Analyse déjà validée. Vous pouvez encore préciser la correction.</div>' : ''
  res.type('html').send(page('Votre retour', `
<h1>Cette analyse était-elle juste ?</h1><p class="job">${e(a.job_name)}</p>
<div class="box"><p class="lbl">Cause</p>${e(cause)}</div>
<div class="box"><p class="lbl">Action proposée</p>${e(action)}</div>
${state}
<form method="post" action="/r/${e(req.params.token)}/ok"><button class="ok">✅ L'analyse était juste</button></form>
<form method="post" action="/r/${e(req.params.token)}/fix" class="box" style="margin-top:14px">
  <p class="lbl">✏️ Ce qui a vraiment réglé la panne</p>
  <textarea name="fix" maxlength="500" required ${wantFix ? 'autofocus' : ''} placeholder="Ex. : ajouté --single-transaction au mysqldump"></textarea>
  <button class="fix">Enregistrer la correction</button>
  <p style="font-size:12px;color:#8b949e;margin:6px 0 0">Elle sera proposée telle quelle si la même panne revient.</p>
</form>
<form method="post" action="/r/${e(req.params.token)}/wrong"><button class="bad">❌ L'analyse était fausse</button></form>`))
}))

async function done(res: Response, a: AnalysisRef, msg: string, action: string) {
  res.locals.clientId = a.client_id
  res.locals.authVia  = 'lien signé'
  await audit(res, action, 'monitor', a.monitor_id, { analysisId: a.id })
  res.type('html').send(page('Merci', `<h1>Merci, c'est noté.</h1><p class="job">${e(a.job_name)}</p><div class="box done">${msg}</div>`))
}

reviewRouter.post('/:token/ok', asyncHandler(async (req, res) => {
  const a = await resolve(req, res)
  if (!a) return
  await recordFeedback(a, 'positive')
  await done(res, a, 'Analyse validée. Elle servira d\'exemple pour les pannes semblables.', 'analysis.validated')
}))

reviewRouter.post('/:token/wrong', asyncHandler(async (req, res) => {
  const a = await resolve(req, res)
  if (!a) return
  await recordFeedback(a, 'negative')
  await done(res, a, 'Analyse marquée fausse : elle ne sera pas resservie. Indiquez la vraie correction depuis le lien si vous la connaissez.', 'analysis.rejected')
}))

reviewRouter.post('/:token/fix', asyncHandler(async (req, res) => {
  const a = await resolve(req, res)
  if (!a) return
  const parsed = z.object({ fix: z.string().trim().min(3).max(500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).type('html').send(page('Correction trop courte', '<h1>Correction trop courte</h1><p>Entre 3 et 500 caractères. Revenez en arrière pour la compléter.</p>'))
  const fix = await recordFix(a, parsed.data.fix)
  await done(res, a, `Correction enregistrée, proposée si la même panne revient :<br><br>${e(fix)}`, 'analysis.fix_recorded')
}))
