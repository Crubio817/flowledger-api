import { Request, Response, NextFunction } from 'express';

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ status: 'ok', data, error: null });
}

export function badRequest(res: Response, msg: string) {
  res.status(400).json({ error: { code: 'BadRequest', message: msg } });
}

export function serverError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: { code: 'InternalServerError', message } });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function getPagination(req: Request) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limitRaw = Number(req.query.limit || 50);
  const limit = Math.min(200, Math.max(1, isNaN(limitRaw) ? 50 : limitRaw));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function listOk<T>(res: Response, items: T[], meta: { page: number; limit: number; total?: number }, status = 200) {
  res.status(status).json({ status: 'ok', data: items, meta, error: null });
}

export function notFound(res: Response, msg = 'Not found') {
  res.status(404).json({ error: { code: 'NotFound', message: msg } });
}
