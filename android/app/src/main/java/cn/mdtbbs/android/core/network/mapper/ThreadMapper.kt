package cn.mdtbbs.android.core.network.mapper

import cn.mdtbbs.android.core.model.Author
import cn.mdtbbs.android.core.model.Category
import cn.mdtbbs.android.core.model.Tag
import cn.mdtbbs.android.core.model.ThreadDetail
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.core.model.ThreadViewer
import cn.mdtbbs.android.core.model.ThreadReply
import cn.mdtbbs.android.core.network.ThreadDto
import java.time.Instant

/** Maps the V1 wire type at the data boundary; UI never receives a DTO. */
fun ThreadDto.toSummary() = ThreadSummary(
    id = publicId ?: id.toString(),
    title = title,
    excerpt = excerpt,
    author = Author(userId.toString(), authorName ?: "Unknown", authorAvatarUrl),
    category = categoryId?.let { Category(it.toString(), categoryName ?: "", categorySlug ?: "") },
    tags = tags.map { Tag(it.id.toString(), it.name, it.slug) },
    replyCount = replyCount,
    viewCount = viewCount,
    createdAt = Instant.parse(createdAt),
    updatedAt = Instant.parse(updatedAt),
)

fun ThreadDto.toDetail(): ThreadDetail = ThreadDetail(
    summary = toSummary(),
    content = content.orEmpty(),
    contentHtml = contentHtml,
    viewer = viewer?.let { ThreadViewer(it.liked, it.bookmarked) },
    replies = replies.map { reply -> ThreadReply(reply.id, reply.userId, reply.parentReplyId, reply.content, Author(reply.userId.toString(), reply.authorName ?: "Unknown", reply.authorAvatarUrl), Instant.parse(reply.createdAt), Instant.parse(reply.updatedAt)) },
    locked = isLocked,
    isOwner = isOwner,
)
