import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const message = err?.message || 'Internal Server Error';
  const status = err?.status || 500;
  const code = err?.code || (status === 500 ? 'InternalServerError' : 'Error');
  res.status(status).json({ error: { code, message } });
}
