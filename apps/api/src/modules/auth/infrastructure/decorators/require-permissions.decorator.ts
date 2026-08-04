import { PermissionCode } from '@cieba/shared';
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...perms: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
