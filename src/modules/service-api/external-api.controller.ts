import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "@entities/user.entity";
import { ExternalApiKeyGuard } from "@common/guards/external-api-key.guard";
import { ExternalScope } from "@common/decorators/external-scope.decorator";
import { SkipPhoneVerification } from "@common/decorators/skip-phone-verification.decorator";
import { POST_STATUS, RESOURCE_STATUS } from "@common/utils/constants";
import { PostsService } from "../posts/posts.service";
import { RepliesService } from "../replies/replies.service";
import { ResourcesService } from "../resources/resources.service";
import { ResourceCategoryService } from "../resources/resource-categories.service";
import { AdminService } from "../admin/admin.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  cleanupUploadedPublicImage,
  publicImageUploadInterceptor,
} from "../uploads/public-image-upload";
import { CategoriesService } from "../categories/categories.service";
import { TagsService } from "../tags/tags.service";
import { ExternalActorResolverService } from "./external-actor-resolver.service";
import { ExternalApiAuditService } from "./external-api-audit.service";
import { getClientIp } from "@common/utils/client-context.util";
import { hasExternalScope } from "./external-api-scopes";
import {
  ExternalCreatePostDto,
  ExternalCreateReplyDto,
  ExternalCreateResourceDto,
  ExternalModeratePostDto,
  ExternalModerateReplyDto,
  ExternalModerateResourceDto,
  ExternalUpdatePostDto,
  ExternalUpdateReplyDto,
  ExternalUpdateResourceDto,
} from "./dto/external-api.dto";

@Controller("external/v1")
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalApiController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private postsService: PostsService,
    private repliesService: RepliesService,
    private resourcesService: ResourcesService,
    private resourceCategoryService: ResourceCategoryService,
    private adminService: AdminService,
    private uploadsService: UploadsService,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private actorResolver: ExternalActorResolverService,
    private auditService: ExternalApiAuditService,
  ) {}

  @Get("me")
  async me(@Req() req: any) {
    return {
      api_key: req.externalApiKey,
      request_id: req.externalRequestId,
    };
  }

  @Post("images")
  @ExternalScope("images:write")
  @UseInterceptors(publicImageUploadInterceptor)
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException("没有收到图片");
    }

    const uploaded = this.uploadsService.toPublicImageResult(file);
    try {
      await this.auditOperation(
        req,
        "images.upload",
        "images:write",
        null,
        "image",
        null,
        {
          url: uploaded.url,
          filename: uploaded.filename,
          size: uploaded.size,
          mime_type: uploaded.mime_type,
        },
      );
      return uploaded;
    } catch (error) {
      await cleanupUploadedPublicImage(file);
      throw error;
    }
  }

  @Get("users/:id")
  @ExternalScope("users:read")
  async getUser(@Param("id", ParseIntPipe) id: number) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        mindauth_id: true,
        username: true,
        role: true,
        avatar_url: true,
        bio: true,
        total_points: true,
        created_at: true,
      },
    });
    return user;
  }

  @Get("categories")
  @ExternalScope("categories:read")
  async getCategories() {
    return this.categoriesService.getAll();
  }

  @Get("tags")
  @ExternalScope("tags:read")
  async getTags(@Query("page") page = 1, @Query("limit") limit = 50) {
    return this.tagsService.findAll(Number(page), Number(limit));
  }

  @Get("posts")
  @ExternalScope("posts:read")
  async listPosts(@Query() query: any, @Req() req: any) {
    return this.postsService.findAll(query, this.staffViewer(req));
  }

  /** Stable bot-facing activity feed; callers do not need to rely on a UI sort value. */
  @Get("posts/activity")
  @ExternalScope("posts:read")
  async listPostsByActivity(@Query() query: any, @Req() req: any) {
    return this.postsService.findAll(
      { ...query, sort: "last_activity_at" },
      this.staffViewer(req),
    );
  }

  @Post("posts")
  @ExternalScope("posts:write")
  async createPost(@Body() body: ExternalCreatePostDto, @Req() req: any) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const post = await this.postsService.create(
      {
        title: body.title,
        content: body.content,
        category_id: body.category_id,
        server_id: body.server_id,
        required_group_id: body.required_group_id,
        post_type: body.post_type,
        tags: body.tags,
        status: body.status as any,
      },
      actor.id,
      {
        ipAddress: this.getClientIp(req),
        locationLabel: req.clientRegion || null,
      },
    );

    await this.auditOperation(
      req,
      "posts.create",
      "posts:write",
      actor.id,
      "post",
      post?.id ?? null,
      {
        status: post?.status,
        title: post?.title,
      },
    );

    return {
      id: post?.id,
      type: "post",
      status: post?.status,
      actor_user_id: actor.id,
      post,
    };
  }

  @Get("posts/:id")
  @ExternalScope("posts:read")
  async getPost(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    return this.postsService.findById(id, this.staffViewer(req));
  }

  @Patch("posts/:id")
  @ExternalScope("posts:write")
  async updatePost(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalUpdatePostDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const post = await this.postsService.update(
      id,
      {
        title: body.title,
        content: body.content,
        category_id: body.category_id,
        server_id: body.server_id,
        required_group_id: body.required_group_id,
        post_type: body.post_type,
        tags: body.tags,
        status: body.status as any,
      },
      actor.id,
      "admin",
    );

    await this.auditOperation(
      req,
      "posts.update",
      "posts:write",
      actor.id,
      "post",
      id,
      {
        status: post?.status,
        title: post?.title,
      },
    );

    return {
      id,
      type: "post",
      status: post?.status,
      actor_user_id: actor.id,
      post,
    };
  }

  @Delete("posts/:id")
  @ExternalScope("posts:delete")
  async deletePost(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: any,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      query,
      req.externalApiKey,
    );
    await this.postsService.softDelete(id, actor.id, "admin");
    await this.auditOperation(
      req,
      "posts.delete",
      "posts:delete",
      actor.id,
      "post",
      id,
    );
    return { id, type: "post", deleted: true, actor_user_id: actor.id };
  }

  @Get("posts/:id/replies")
  @ExternalScope("replies:read")
  async listReplies(
    @Param("id", ParseIntPipe) id: number,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    return this.repliesService.getByPostId(id, Number(page), Number(limit));
  }

  @Post("posts/:id/replies")
  @ExternalScope("replies:write")
  async createReply(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalCreateReplyDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const reply = await this.repliesService.createReplyForPost(
      id,
      {
        content: body.content,
        parent_reply_id: body.parent_reply_id,
      },
      actor.id,
      {
        ipAddress: this.getClientIp(req),
        locationLabel: req.clientRegion || null,
      },
    );

    await this.auditOperation(
      req,
      "replies.create",
      "replies:write",
      actor.id,
      "reply",
      reply.id,
      {
        post_id: id,
        status: reply.status,
      },
    );

    return {
      id: reply.id,
      type: "reply",
      status: reply.status,
      actor_user_id: actor.id,
      reply,
    };
  }

  @Get("replies/:id")
  @ExternalScope("replies:read")
  async getReply(@Param("id", ParseIntPipe) id: number) {
    return this.repliesService.findById(id);
  }

  @Patch("replies/:id")
  @ExternalScope("replies:write")
  async updateReply(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalUpdateReplyDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const reply = await this.repliesService.update(
      id,
      body.content,
      actor.id,
      "admin",
    );
    await this.auditOperation(
      req,
      "replies.update",
      "replies:write",
      actor.id,
      "reply",
      id,
      { post_id: reply.post_id },
    );
    return {
      id,
      type: "reply",
      status: reply.status,
      actor_user_id: actor.id,
      reply,
    };
  }

  @Delete("replies/:id")
  @ExternalScope("replies:delete")
  async deleteReply(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: any,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      query,
      req.externalApiKey,
    );
    await this.repliesService.softDelete(id, actor.id, "admin");
    await this.auditOperation(
      req,
      "replies.delete",
      "replies:delete",
      actor.id,
      "reply",
      id,
    );
    return { id, type: "reply", deleted: true, actor_user_id: actor.id };
  }

  @Post("posts/:id/moderation")
  @ExternalScope("posts:moderate")
  async moderatePost(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalModeratePostDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveActor(
      body,
      req.externalApiKey,
    );
    let result: unknown = { id };

    switch (body.action) {
      case "approve":
        await this.adminService.approvePost(id);
        result = { id, status: POST_STATUS.published };
        break;
      case "reject":
        await this.adminService.rejectPost(id, body.reason);
        result = { id, status: POST_STATUS.deleted };
        break;
      case "pin":
      case "unpin":
        result = await this.postsService.pin(id, body.action === "pin" ? 1 : 0);
        break;
      case "lock":
      case "unlock":
        result = await this.postsService.setLocked(id, body.action === "lock", {
          id: actor.id,
          role: "admin",
        });
        break;
      case "move":
        result = await this.postsService.move(id, Number(body.category_id));
        break;
      case "best_reply":
        result = await this.postsService.setBestReply(
          id,
          Number(body.reply_id),
          { id: actor.id, role: "admin" },
        );
        break;
      case "clear_best_reply":
        result = await this.postsService.setBestReply(id, null, {
          id: actor.id,
          role: "admin",
        });
        break;
    }

    await this.auditOperation(
      req,
      `posts.moderation.${body.action}`,
      "posts:moderate",
      actor.id,
      "post",
      id,
      {
        action: body.action,
        reason: body.reason,
        category_id: body.category_id,
        reply_id: body.reply_id,
      },
    );

    return {
      id,
      type: "post",
      action: body.action,
      actor_user_id: actor.id,
      result,
    };
  }

  @Post("replies/:id/moderation")
  @ExternalScope("replies:delete", "posts:moderate")
  async moderateReply(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalModerateReplyDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveActor(
      body,
      req.externalApiKey,
    );
    if (body.action === "approve") {
      await this.adminService.approveReply(id);
    } else {
      await this.adminService.rejectReply(id);
    }
    await this.auditOperation(
      req,
      `replies.moderation.${body.action}`,
      "posts:moderate",
      actor.id,
      "reply",
      id,
      {
        action: body.action,
        reason: body.reason,
      },
    );
    return { id, type: "reply", action: body.action, actor_user_id: actor.id };
  }

  @Get("resources")
  @ExternalScope("resources:read")
  async listResources(@Query() query: any, @Req() req: any) {
    const scope = hasExternalScope(
      req.externalApiKey.scopes,
      "resources:moderate",
    )
      ? "admin"
      : "public";
    return this.resourcesService.getList(query, { scope });
  }

  @Get("resources/filter-options")
  @ExternalScope("resources:read")
  async getResourceFilterOptions() {
    return this.resourcesService.getFilterOptions();
  }

  @Post("resources")
  @ExternalScope("resources:write")
  async createResource(
    @Body() body: ExternalCreateResourceDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const resource = await this.resourcesService.create(
      {
        title: body.title,
        description: body.description,
        resource_type: body.resource_type,
        external_url: body.external_url,
        version: body.version,
        content: body.content,
        category_id: body.category_id as any,
        is_public: body.is_public as any,
      },
      actor.id,
    );

    await this.auditOperation(
      req,
      "resources.create",
      "resources:write",
      actor.id,
      "resource",
      resource.id,
      {
        status: resource.status,
        title: resource.title,
      },
    );

    return {
      id: resource.id,
      type: "resource",
      status: resource.status,
      actor_user_id: actor.id,
      resource,
    };
  }

  @Get("resources/categories")
  @ExternalScope("resources:read")
  async listResourceCategories() {
    return this.resourceCategoryService.list();
  }

  @Get("resources/:id")
  @ExternalScope("resources:read")
  async getResource(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    const viewer = hasExternalScope(
      req.externalApiKey.scopes,
      "resources:moderate",
    )
      ? this.staffViewer(req)
      : undefined;
    return this.resourcesService.getByIdWithVersions(id, viewer);
  }

  @Patch("resources/:id")
  @ExternalScope("resources:write")
  async updateResource(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalUpdateResourceDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      body,
      req.externalApiKey,
    );
    const resource = await this.resourcesService.update(
      id,
      actor.id,
      {
        title: body.title,
        description: body.description,
        resource_type: body.resource_type,
        external_url: body.external_url,
        version: body.version,
        content: body.content,
        category_id: body.category_id as any,
        is_public: body.is_public as any,
      },
      "admin",
    );

    await this.auditOperation(
      req,
      "resources.update",
      "resources:write",
      actor.id,
      "resource",
      id,
      {
        status: resource.status,
        title: resource.title,
      },
    );

    return {
      id,
      type: "resource",
      status: resource.status,
      actor_user_id: actor.id,
      resource,
    };
  }

  @Delete("resources/:id")
  @ExternalScope("resources:delete")
  async deleteResource(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: any,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveWritableActor(
      query,
      req.externalApiKey,
    );
    await this.resourcesService.delete(id, actor.id, "admin");
    await this.auditOperation(
      req,
      "resources.delete",
      "resources:delete",
      actor.id,
      "resource",
      id,
    );
    return { id, type: "resource", deleted: true, actor_user_id: actor.id };
  }

  @Post("resources/:id/moderation")
  @ExternalScope("resources:moderate")
  async moderateResource(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ExternalModerateResourceDto,
    @Req() req: any,
  ) {
    const actor = await this.actorResolver.resolveActor(
      body,
      req.externalApiKey,
    );
    const status =
      body.action === "approve"
        ? RESOURCE_STATUS.approved
        : body.action === "reject"
          ? RESOURCE_STATUS.rejected
          : RESOURCE_STATUS.pending;
    const resource = await this.resourcesService.updateStatus(id, status, {
      actorUsername: actor.username,
    });
    await this.auditOperation(
      req,
      `resources.moderation.${body.action}`,
      "resources:moderate",
      actor.id,
      "resource",
      id,
      {
        action: body.action,
        status,
      },
    );
    return {
      id,
      type: "resource",
      action: body.action,
      status: resource.status,
      actor_user_id: actor.id,
      resource,
    };
  }

  private staffViewer(req: any) {
    return { id: req.externalApiKey?.default_user_id ?? 0, role: "admin" };
  }

  private async auditOperation(
    req: any,
    action: string,
    scope: string,
    actorUserId: number | null,
    targetType: string,
    targetId: number | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService
      .recordOperation({
        api_key_id: req.externalApiKey?.id,
        api_key_name: req.externalApiKey?.name,
        action,
        scope,
        actor_user_id: actorUserId,
        target_type: targetType,
        target_id: targetId ?? undefined,
        request_id: req.externalRequestId,
        ip_address: this.getClientIp(req),
        user_agent: req.headers?.["user-agent"],
        details,
      })
      .catch((error) =>
        console.warn("external api audit failed:", error.message),
      );
  }

  private getClientIp(req: any): string {
    return getClientIp(req);
  }
}
