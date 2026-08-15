import type { NextFunction, Request, Response } from 'express';
import { getClientIp, getClientIpSource, getClientRegion } from '../utils/client-context.util';

export function clientContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.clientIp = getClientIp(req);
  req.clientIpSource = getClientIpSource(req);
  req.clientRegion = getClientRegion(req);
  next();
}
