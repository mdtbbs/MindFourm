import { User } from '@entities/user.entity';
export interface AuthResult {
    user: User;
    sessionToken: string;
}
