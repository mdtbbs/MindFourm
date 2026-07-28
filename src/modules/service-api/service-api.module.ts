import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@entities/user.entity';
import { ExternalApiKey } from '@entities/external-api-key.entity';
import { ExternalApiAuditLog } from '@entities/external-api-audit-log.entity';
import { PostsModule } from '../posts/posts.module';
import { RepliesModule } from '../replies/replies.module';
import { ResourcesModule } from '../resources/resources.module';
import { AdminModule } from '../admin/admin.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { LogsModule } from '../logs/logs.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ExternalApiKeyGuard } from '../../common/guards/external-api-key.guard';
import { ServiceApiController } from './service-api.controller';
import { ExternalApiController } from './external-api.controller';
import { AdminExternalApiController } from './admin-external-api.controller';
import { ExternalApiKeyService } from './external-api-key.service';
import { ExternalApiAuditService } from './external-api-audit.service';
import { ExternalActorResolverService } from './external-actor-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ExternalApiKey, ExternalApiAuditLog]),
    PostsModule,
    RepliesModule,
    ResourcesModule,
    AdminModule,
    CategoriesModule,
    TagsModule,
    LogsModule,
    UploadsModule,
  ],
  controllers: [ServiceApiController, ExternalApiController, AdminExternalApiController],
  providers: [
    ExternalApiKeyGuard,
    ExternalApiKeyService,
    ExternalApiAuditService,
    ExternalActorResolverService,
  ],
  exports: [ExternalApiKeyService, ExternalApiAuditService, ExternalActorResolverService],
})
export class ServiceApiModule {}
