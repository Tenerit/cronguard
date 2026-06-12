import { Request, Response, NextFunction, RequestHandler } from 'express'

// ─── asyncHandler ─────────────────────────────────────────────────────────────
// Express 4 ne capture pas les erreurs des handlers async.
// Sans ce wrapper, une erreur DB dans un handler laisse la requête suspendue.
//
// Usage :
//   router.get('/path', asyncHandler(async (req, res) => { ... }))

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next)
}
