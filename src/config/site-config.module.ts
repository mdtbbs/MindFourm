import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SiteConfigService } from './site-profile';

@Global()
@Module({ imports: [ConfigModule], providers: [SiteConfigService], exports: [SiteConfigService] })
export class SiteConfigModule {}
