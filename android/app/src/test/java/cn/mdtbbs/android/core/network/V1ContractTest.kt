package cn.mdtbbs.android.core.network

import cn.mdtbbs.android.core.network.mapper.toSummary
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class V1ContractTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `parses v1 pagination envelope`() {
        val value = json.decodeFromString<V1Envelope<SearchPageDto>>("""{
          "data":{"items":[]},
          "meta":{"request_id":"request-1","pagination":{"page":2,"limit":20,"total":21,"total_pages":2}}
        }""")
        assertEquals("request-1", value.meta.requestId)
        assertEquals(2, value.meta.pagination?.page)
        assertEquals(2, value.meta.pagination?.totalPages)
    }

    @Test fun `maps numeric wire ids to string domain ids`() {
        val dto = ThreadDto(
            id = 42, title = "主题", userId = 9, createdAt = "2026-08-29T00:00:00Z",
            updatedAt = "2026-08-29T00:00:00Z", categoryId = 3, categoryName = "讨论",
            categorySlug = "talk", tags = listOf(TagDto(7, "java", "java")),
        )
        val domain = dto.toSummary()
        assertEquals("42", domain.id)
        assertEquals("9", domain.author.id)
        assertEquals("3", domain.category?.id)
        assertEquals("7", domain.tags.single().id)
    }
}
