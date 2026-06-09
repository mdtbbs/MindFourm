import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { VerifySessionDto } from './dto/verify-session.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    check(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    callback(code: string, state: string, req: Request, res: Response): Promise<void>;
    verifySession(body: VerifySessionDto, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    testLogin(userType: string | undefined, req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    logout(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
