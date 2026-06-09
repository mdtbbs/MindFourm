import { RoleName } from '../utils/constants';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: RoleName[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const PERMISSIONS_KEY = "permissions";
export declare const Permissions: (...permissions: string[]) => import("@nestjs/common").CustomDecorator<string>;
