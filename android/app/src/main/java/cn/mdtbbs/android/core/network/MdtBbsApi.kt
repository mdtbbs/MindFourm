package cn.mdtbbs.android.core.network
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.DELETE
import retrofit2.http.Body
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Multipart
import retrofit2.http.Part
import okhttp3.MultipartBody
import okhttp3.RequestBody
import kotlinx.serialization.json.JsonObject
interface MdtBbsApi {
 @GET("api/v1/client/config") suspend fun clientConfig(@Query("platform") platform: String = "android", @Query("version_code") versionCode: Int = 100): V1Envelope<ClientConfigDto>
 /**
  * An empty cursor is intentional for the first cursor page. The server uses
  * the presence of the parameter to select its Android cursor response shape.
  */
 @GET("api/v1/threads") suspend fun threads(@Query("limit") limit: Int = 20, @Query("cursor") cursor: String = "", @Query("category_id") categoryId: String? = null): V1Envelope<ThreadPageDto>
 @GET("api/v1/threads/{id}") suspend fun thread(@Path("id") id: String): V1Envelope<ThreadDto>
 @GET("api/v1/categories") suspend fun categories(): V1Envelope<List<CategoryDto>>
 @GET("api/v1/tags") suspend fun tags(): V1Envelope<List<TagDto>>
 @GET("api/v1/search/posts") suspend fun search(@Query("q") query: String, @Query("page") page: Int = 1, @Query("limit") limit: Int = 20): V1Envelope<SearchPageDto>
 @GET("api/v1/me") suspend fun me(): V1Envelope<MeDto>
 @GET("api/v1/me/bookmarks") suspend fun bookmarks(@Query("page") page: Int = 1, @Query("limit") limit: Int = 20): V1Envelope<ThreadCollectionPageDto>
 @GET("api/v1/lanlink/rooms") suspend fun lanLinkRooms(): V1Envelope<LanLinkRoomsDto>
 @GET("api/v1/notices") suspend fun notices(@Query("limit") limit: Int = 20, @Query("offset") offset: Int = 0): V1Envelope<NoticeListDto>
 @GET("api/v1/notices/{id}") suspend fun notice(@Path("id") id: String): V1Envelope<NoticeDetailDto>
 @GET("api/v1/resources") suspend fun resources(@Query("limit") limit: Int = 20, @Query("offset") offset: Int = 0, @Query("q") query: String? = null): V1Envelope<ResourceListDto>
 @GET("api/v1/resources/{id}") suspend fun resource(@Path("id") id: Long): V1Envelope<ResourceDetailDto>
 @GET("api/v1/users/{id}") suspend fun publicUser(@Path("id") id: Long): V1Envelope<PublicUserDto>
 @PUT("api/v1/me/profile") suspend fun updateProfile(@Body request: UpdateProfileRequest): V1Envelope<MeDto>
 @Multipart @POST("api/v1/me/avatar") suspend fun uploadAvatar(@Part avatar: MultipartBody.Part): V1Envelope<MeDto>
 @Multipart @POST("api/v1/uploads/images") suspend fun uploadInlineImage(@Part image: MultipartBody.Part): V1Envelope<UploadImageDto>
 @Multipart @POST("api/attachments/upload") suspend fun uploadPostAttachments(@Part files: List<MultipartBody.Part>, @Part("post_id") postId: RequestBody): AttachmentUploadResponse
 @POST("api/v1/feedback") suspend fun submitFeedback(@Body request: FeedbackRequest): V1Envelope<JsonObject>
 @POST("api/v1/reports") suspend fun createReport(@Body request: ReportRequest): V1Envelope<JsonObject>
 @GET("api/v1/reports/mine") suspend fun myReports(@Query("page") page: Int = 1): V1Envelope<ReportPageDto>
 @PUT("api/v1/threads/{id}/like") suspend fun like(@Path("id") id: String): V1Envelope<InteractionDto>
 @DELETE("api/v1/threads/{id}/like") suspend fun unlike(@Path("id") id: String): V1Envelope<InteractionDto>
 @PUT("api/v1/threads/{id}/bookmark") suspend fun bookmark(@Path("id") id: String): V1Envelope<InteractionDto>
 @DELETE("api/v1/threads/{id}/bookmark") suspend fun removeBookmark(@Path("id") id: String): V1Envelope<InteractionDto>
 @POST("api/v1/threads") suspend fun createThread(@Body request: CreateThreadRequest): V1Envelope<ThreadWriteDto>
 @PUT("api/v1/threads/{id}") suspend fun updateThread(@Path("id") id: String, @Body request: UpdateThreadRequest): V1Envelope<ThreadWriteDto>
 @DELETE("api/v1/threads/{id}") suspend fun deleteThread(@Path("id") id: String): V1Envelope<DeleteDto>
 @POST("api/v1/threads/{id}/replies") suspend fun createReply(@Path("id") id: String, @Body request: CreateReplyRequest): V1Envelope<ReplyWriteDto>
 @PUT("api/v1/threads/{threadId}/replies/{replyId}") suspend fun updateReply(@Path("threadId") threadId: String, @Path("replyId") replyId: Long, @Body request: UpdateReplyRequest): V1Envelope<ReplyWriteDto>
 @DELETE("api/v1/threads/{threadId}/replies/{replyId}") suspend fun deleteReply(@Path("threadId") threadId: String, @Path("replyId") replyId: Long): V1Envelope<DeleteDto>
 @GET("api/v1/notifications") suspend fun notifications(@Query("page") page: Int = 1, @Query("limit") limit: Int = 20): V1Envelope<NotificationPageDto>
 @GET("api/v1/notifications/unread-count") suspend fun unreadNotificationCount(): V1Envelope<UnreadCountDto>
 @PUT("api/v1/notifications/{id}/read") suspend fun markNotificationRead(@Path("id") id: Long): V1Envelope<ReadDto>
 @PUT("api/v1/notifications/read-all") suspend fun markAllNotificationsRead(): V1Envelope<ReadDto>
}
@Serializable data class ClientConfigDto(@SerialName("minimum_version_code") val minimumVersionCode: Int, @SerialName("latest_version_code") val latestVersionCode: Int, @SerialName("force_update") val forceUpdate: Boolean, val maintenance: Boolean, val features: FeaturesDto)
@Serializable data class FeaturesDto(val posting: Boolean, @SerialName("image_upload") val imageUpload: Boolean = false, @SerialName("notifications_sse") val notificationsSse: Boolean = false)
@Serializable data class ThreadPageDto(val items: List<ThreadDto>, val has_more: Boolean, val next_cursor: String? = null)
@Serializable data class SearchPageDto(val items: List<ThreadDto>)
@Serializable data class ThreadCollectionPageDto(val items: List<ThreadDto>, val pagination: PaginationDto)
@Serializable data class MeDto(val id: Long, val username: String, @SerialName("avatar_url") val avatarUrl: String? = null, val bio: String? = null, val role: String, @SerialName("phone_verified") val phoneVerified: Boolean)
@Serializable data class InteractionDto(val liked: Boolean? = null, val bookmarked: Boolean? = null)
@Serializable data class CreateThreadRequest(val title: String, val content: String, @SerialName("category_id") val categoryId: Long? = null, val tags: List<String> = emptyList())
@Serializable data class UpdateThreadRequest(val title: String? = null, val content: String? = null, @SerialName("category_id") val categoryId: Long? = null, val tags: List<String>? = null)
@Serializable data class CreateReplyRequest(val content: String, @SerialName("parent_reply_id") val parentReplyId: Long? = null)
@Serializable data class UpdateReplyRequest(val content: String)
@Serializable data class DeleteDto(val deleted: Boolean)
@Serializable data class ThreadWriteDto(val id: Long, @SerialName("public_id") val publicId: String? = null, val title: String, val status: String, @SerialName("created_at") val createdAt: String? = null, @SerialName("updated_at") val updatedAt: String? = null)
@Serializable data class ReplyWriteDto(val id: Long, @SerialName("post_id") val postId: Long, @SerialName("parent_reply_id") val parentReplyId: Long? = null, val content: String, @SerialName("content_html") val contentHtml: String? = null, val status: String, @SerialName("created_at") val createdAt: String? = null, @SerialName("updated_at") val updatedAt: String? = null)
@Serializable data class NotificationPageDto(val items: List<NotificationDto>, val pagination: PaginationDto)
@Serializable data class PaginationDto(val page: Int, val limit: Int, val total: Int, @SerialName("total_pages") val totalPages: Int)
@Serializable data class NotificationDto(val id: Long, val type: String, @SerialName("actor_name") val actorName: String? = null, @SerialName("post_id") val postId: Long? = null, @SerialName("post_title") val postTitle: String? = null, val content: String? = null, @SerialName("is_read") val isRead: Boolean, @SerialName("created_at") val createdAt: String)
@Serializable data class UnreadCountDto(val count: Int)
@Serializable data class ReadDto(val read: Boolean)
@Serializable data class NoticeListDto(val data: List<NoticeDto>, val pagination: OffsetPaginationDto)
@Serializable data class OffsetPaginationDto(val limit: Int, val offset: Int, @SerialName("next_offset") val nextOffset: Int? = null, @SerialName("has_more") val hasMore: Boolean = false)
@Serializable data class NoticeDto(val id: Long, @SerialName("public_id") val publicId: String? = null, val title: String, val excerpt: String? = null, @SerialName("notice_type") val noticeType: String, @SerialName("is_pinned") val isPinned: Boolean, @SerialName("published_at") val publishedAt: String? = null, @SerialName("view_count") val viewCount: Int = 0)
@Serializable data class NoticeDetailDto(val id: Long, @SerialName("public_id") val publicId: String? = null, val title: String, @SerialName("content_markdown") val contentMarkdown: String, @SerialName("published_at") val publishedAt: String? = null)
@Serializable data class ResourceListDto(val items: List<ResourceSummaryDto>, val pagination: OffsetPaginationDto)
@Serializable data class ResourceSummaryDto(val id: Long, val title: String, val summary: String = "", @SerialName("resource_kind") val resourceKind: String? = null, @SerialName("download_count") val downloadCount: Int = 0)
@Serializable data class ResourceDetailDto(val id: Long, val title: String, val summary: String = "", @SerialName("resource_kind") val resourceKind: String? = null, @SerialName("download_count") val downloadCount: Int = 0, @SerialName("latest_version") val latestVersion: ResourceVersionDto? = null)
@Serializable data class ResourceVersionDto(val version: String, @SerialName("display_version") val displayVersion: String, @SerialName("file_count") val fileCount: Int)
@Serializable data class PublicUserDto(val id: Long, val username: String, @SerialName("avatar_url") val avatarUrl: String? = null, @SerialName("avatar_status") val avatarStatus: String, val bio: String? = null, val role: String, @SerialName("post_count") val postCount: Int = 0, @SerialName("reply_count") val replyCount: Int = 0, @SerialName("created_at") val createdAt: String)
@Serializable data class UpdateProfileRequest(val username: String? = null, val bio: String? = null)
@Serializable data class UploadImageDto(val url: String)
@Serializable data class AttachmentUploadResponse(val message: String, val attachments: List<AttachmentDto> = emptyList())
@Serializable data class AttachmentDto(val id: Long, @SerialName("file_name") val fileName: String, val status: String, @SerialName("file_size") val fileSize: Long = 0)
@Serializable data class FeedbackRequest(val type: String, val title: String, val description: String, @SerialName("contact_email") val contactEmail: String? = null)
@Serializable data class ReportRequest(@SerialName("target_type") val targetType: String, @SerialName("target_id") val targetId: Long, val reason: String, val detail: String? = null)
@Serializable data class ReportPageDto(val data: List<ReportDto>, val pagination: PaginationDto)
@Serializable data class ReportDto(val id: Long, @SerialName("target_type") val targetType: String, @SerialName("target_id") val targetId: Long, val reason: String, val status: String, @SerialName("resolution_note") val resolutionNote: String? = null, @SerialName("created_at") val createdAt: String)
@Serializable data class LanLinkRoomsDto(val rooms: List<LanLinkRoomDto>)
@Serializable data class LanLinkRoomDto(
 val code: String,
 val name: String = "",
 @SerialName("display_name") val displayName: String = "",
 val owner: LanLinkRoomOwnerDto,
 val node: LanLinkRoomNodeDto,
)
@Serializable data class LanLinkRoomOwnerDto(@SerialName("display_name") val displayName: String = "匿名房主")
@Serializable data class LanLinkRoomNodeDto(val id: String = "", val name: String = "未知节点")
@Serializable data class ViewerDto(val liked: Boolean, val bookmarked: Boolean)
@Serializable data class ReplyDto(
 @SerialName("id") val id: Long,
 @SerialName("post_id") val postId: Long,
 @SerialName("user_id") val userId: Long,
 @SerialName("parent_reply_id") val parentReplyId: Long? = null,
 val content: String,
 @SerialName("content_html") val contentHtml: String? = null,
 @SerialName("like_count") val likeCount: Int = 0,
 @SerialName("author_name") val authorName: String? = null,
 @SerialName("author_avatar_url") val authorAvatarUrl: String? = null,
 @SerialName("is_owner") val isOwner: Boolean = false,
 @SerialName("created_at") val createdAt: String,
 @SerialName("updated_at") val updatedAt: String,
)
/**
 * Wire representation only. `id` is currently a legacy numeric id, so the
 * mapper, rather than the UI, turns it into the public String identifier used
 * by the app domain.
 */
@Serializable data class ThreadDto(
 val id: Long,
 val title: String,
 val excerpt: String? = null,
 @SerialName("user_id") val userId: Long,
 @SerialName("author_name") val authorName: String? = null,
 @SerialName("author_avatar_url") val authorAvatarUrl: String? = null,
 @SerialName("category_id") val categoryId: Long? = null,
 @SerialName("category_name") val categoryName: String? = null,
 @SerialName("category_slug") val categorySlug: String? = null,
 @SerialName("reply_count") val replyCount: Int = 0,
 @SerialName("view_count") val viewCount: Int = 0,
 @SerialName("created_at") val createdAt: String,
 @SerialName("updated_at") val updatedAt: String,
 val tags: List<TagDto> = emptyList(),
 val content: String? = null,
 @SerialName("content_html") val contentHtml: String? = null,
 @SerialName("like_count") val likeCount: Int = 0,
 @SerialName("edited_at") val editedAt: String? = null,
 @SerialName("public_id") val publicId: String? = null,
 val viewer: ViewerDto? = null,
 @SerialName("is_locked") val isLocked: Boolean = false,
 @SerialName("is_owner") val isOwner: Boolean = false,
 val replies: List<ReplyDto> = emptyList(),
)
/** The current V1 contract exposes legacy database identifiers as numbers. */
@Serializable data class CategoryDto(val id: Long, val name: String, val slug: String)
@Serializable data class TagDto(val id: Long, val name: String, val slug: String)
