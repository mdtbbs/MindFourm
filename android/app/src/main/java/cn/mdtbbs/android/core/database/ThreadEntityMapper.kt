package cn.mdtbbs.android.core.database

import cn.mdtbbs.android.core.model.Author
import cn.mdtbbs.android.core.model.Category
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.core.network.ThreadDto
import cn.mdtbbs.android.core.network.TagDto
import java.time.Instant
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

private val entityJson = Json { ignoreUnknownKeys = true }

fun ThreadDto.toEntity(queryKey: String): ThreadEntity = ThreadEntity(
    queryKey = queryKey,
    // V1 threads currently address the legacy numeric id; the domain keeps it
    // as String so a future public_id migration does not leak a Long assumption.
    id = id.toString(),
    title = title,
    excerpt = excerpt,
    authorId = userId.toString(),
    authorName = authorName ?: "Unknown",
    authorAvatarUrl = authorAvatarUrl,
    categoryId = categoryId?.toString(),
    categoryName = categoryName,
    categorySlug = categorySlug,
    tagsJson = entityJson.encodeToString(ListSerializer(TagDto.serializer()), tags),
    createdAt = createdAt,
    updatedAt = updatedAt,
    replyCount = replyCount,
    viewCount = viewCount,
)

fun ThreadEntity.toDomain(): ThreadSummary = ThreadSummary(
    id = id,
    title = title,
    excerpt = excerpt,
    author = Author(authorId, authorName, authorAvatarUrl),
    category = categoryId?.let { Category(it, categoryName.orEmpty(), categorySlug.orEmpty()) },
    tags = entityJson.decodeFromString(ListSerializer(TagDto.serializer()), tagsJson).map {
        cn.mdtbbs.android.core.model.Tag(it.id.toString(), it.name, it.slug)
    },
    replyCount = replyCount,
    viewCount = viewCount,
    createdAt = Instant.parse(createdAt),
    updatedAt = Instant.parse(updatedAt),
)
