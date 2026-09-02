package cn.mdtbbs.android.core.model
import java.time.Instant
data class Author(val id: String, val name: String, val avatarUrl: String?)
data class Category(val id: String, val name: String, val slug: String)
data class Tag(val id: String, val name: String, val slug: String)
data class ThreadViewer(val liked: Boolean, val bookmarked: Boolean)
data class ThreadReply(val id: Long, val userId: Long, val parentReplyId: Long?, val content: String, val author: Author, val createdAt: Instant, val updatedAt: Instant)
data class ThreadSummary(val id: String, val title: String, val excerpt: String?, val author: Author, val category: Category?, val tags: List<Tag>, val replyCount: Int, val viewCount: Int, val createdAt: Instant, val updatedAt: Instant)
data class ThreadDetail(val summary: ThreadSummary, val content: String, val contentHtml: String?, val viewer: ThreadViewer?, val replies: List<ThreadReply> = emptyList(), val locked: Boolean = false, val isOwner: Boolean = false)
data class ClientConfig(val minimumVersionCode: Int, val latestVersionCode: Int, val forceUpdate: Boolean, val maintenance: Boolean, val postingEnabled: Boolean)
