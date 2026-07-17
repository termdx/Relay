import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './auth.service';

export const IS_PUBLIC_KEY = 'relay:isPublic';

/**
 * Opt a route out of authentication. Used sparingly:
 *  - /health (probes)
 *  - /auth/* (you can't have a token yet)
 *  - /approve/:token (the client's magic link IS the credential — clients
 *    have no account by design)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the verified JWT payload of the authenticated caller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
