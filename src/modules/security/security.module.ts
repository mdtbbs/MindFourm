import { Module } from '@nestjs/common';
import { CspReportsService } from './csp-reports.service';
import { SecurityController } from './security.controller';

@Module({ providers: [CspReportsService], controllers: [SecurityController] })
export class SecurityModule {}
