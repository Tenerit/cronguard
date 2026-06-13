import { Router } from 'express'
import { z }      from 'zod'
import { db }     from '../../db'
import { asyncHandler } from '../middleware/async-handler'
import { requireRole }  from '../middleware/ownership'

export const teamRouter = Router()

const VALID_INVITE_ROLES = ['admin', 'member', 'viewer'] as const

// ─── GET /team/members ────────────────────────────────────────────────────────

teamRouter.get('/members', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, email, role, invited_by, created_at
    FROM team_members
    WHERE client_id = $1
    ORDER BY created_at ASC
  `, [res.locals.clientId])
  res.json(rows)
}))

// ─── GET /team/invitations ────────────────────────────────────────────────────

teamRouter.get('/invitations', requireRole('owner'), asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, email, role, invited_by, expires_at, accepted_at, created_at
    FROM invitations
    WHERE client_id = $1
    ORDER BY created_at DESC
  `, [res.locals.clientId])
  res.json(rows)
}))

// ─── POST /team/invite ────────────────────────────────────────────────────────

teamRouter.post('/invite', requireRole('owner'), asyncHandler(async (req, res) => {
  const Schema = z.object({
    email: z.string().email(),
    role:  z.enum(VALID_INVITE_ROLES).default('member'),
  })
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { email, role } = parsed.data

  // Déjà membre ?
  const { rowCount: alreadyMember } = await db.query(
    `SELECT 1 FROM team_members WHERE client_id = $1 AND email = $2`,
    [res.locals.clientId, email]
  )
  if (alreadyMember) return res.status(409).json({ error: 'already_member' })

  // Invitation existante non expirée ?
  const { rowCount: pending } = await db.query(`
    SELECT 1 FROM invitations
    WHERE client_id = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > NOW()
  `, [res.locals.clientId, email])
  if (pending) return res.status(409).json({ error: 'invitation_pending' })

  // Récupère l'email de l'owner pour invited_by
  const { rows: [owner] } = await db.query(
    `SELECT email FROM clients WHERE id = $1`, [res.locals.clientId]
  )

  const { rows: [inv] } = await db.query(`
    INSERT INTO invitations (client_id, email, role, invited_by)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, role, token, expires_at, created_at
  `, [res.locals.clientId, email, role, owner?.email ?? 'unknown'])

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  res.status(201).json({
    ...inv,
    accept_url: `${appUrl}/team/invite/accept?token=${inv.token}`,
  })
}))

// ─── GET /team/invite/accept?token= ──────────────────────────────────────────
// Public — pas de requireApiKey. Valide le token, crée le membre, retourne sa clé.

teamRouter.get('/invite/accept', asyncHandler(async (req, res) => {
  const token = req.query.token as string
  if (!token) return res.status(400).json({ error: 'missing_token' })

  const { rows: [inv] } = await db.query(`
    SELECT id, client_id, email, role
    FROM invitations
    WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()
  `, [token])
  if (!inv) return res.status(410).json({ error: 'invalid_or_expired_token' })

  // Upsert membre (ré-invitation possible si rôle change)
  const { rows: [member] } = await db.query(`
    INSERT INTO team_members (client_id, email, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (client_id, email) DO UPDATE SET role = EXCLUDED.role
    RETURNING id, email, role, api_key
  `, [inv.client_id, inv.email, inv.role])

  // Marque l'invitation comme acceptée
  await db.query(
    `UPDATE invitations SET accepted_at = NOW() WHERE id = $1`, [inv.id]
  )

  res.json({
    message:   'Invitation accepted',
    email:     member.email,
    role:      member.role,
    api_key:   member.api_key,
  })
}))

// ─── DELETE /team/members/:id ────────────────────────────────────────────────

teamRouter.delete('/members/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM team_members WHERE id = $1 AND client_id = $2`,
    [req.params.id, res.locals.clientId]
  )
  if (!rowCount) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
}))

// ─── DELETE /team/invitations/:id — annule une invitation en attente ──────────

teamRouter.delete('/invitations/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query(`
    DELETE FROM invitations
    WHERE id = $1 AND client_id = $2 AND accepted_at IS NULL
  `, [req.params.id, res.locals.clientId])
  if (!rowCount) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
}))
