import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { PortalAuthService } from './portal-auth.service';

interface PortalRequest extends Request {
  portalClientId?: string;
}

/**
 * Guards portal data routes. Applied per-controller (not globally); accepts
 * only portal-audience tokens — an owner JWT fails by signature.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly auth: PortalAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PortalRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const clientId = token ? this.auth.verify(token) : null;
    if (!clientId) throw new UnauthorizedException('Portal sign-in required.');
    request.portalClientId = clientId;
    return true;
  }
}

/** The authenticated client's id, set by PortalGuard. */
export const PortalClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<PortalRequest>();
    return request.portalClientId!;
  },
);
