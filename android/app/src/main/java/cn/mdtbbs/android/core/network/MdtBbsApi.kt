package cn.mdtbbs.android.core.network
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
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
}
@Serializable data class ClientConfigDto(@SerialName("minimum_version_code") val minimumVersionCode: Int, @SerialName("latest_version_code") val latestVersionCode: Int, @SerialName("force_update") val forceUpdate: Boolean, val maintenance: Boolean, val features: FeaturesDto)
@Serializable data class FeaturesDto(val posting: Boolean, @SerialName("image_upload") val imageUpload: Boolean = false, @SerialName("notifications_sse") val notificationsSse: Boolean = false)
@Serializable data class ThreadPageDto(val items: List<ThreadDto>, val has_more: Boolean, val next_cursor: String? = null)
@Serializable data class SearchPageDto(val items: List<ThreadDto>)
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
)
/** The current V1 contract exposes legacy database identifiers as numbers. */
@Serializable data class CategoryDto(val id: Long, val name: String, val slug: String)
@Serializable data class TagDto(val id: Long, val name: String, val slug: String)
