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

    @Test fun `parses lanlink public room display fields`() {
        val value = json.decodeFromString<V1Envelope<LanLinkRoomsDto>>("""{
          "data":{"rooms":[{"code":"LL-ABCD-1234","name":"公开房间","display_name":"周末生存","owner":{"display_name":"房主"},"node":{"id":"node-1","name":"华东节点"}}]},
          "meta":{"request_id":"request-2"}
        }""")
        assertEquals("LL-ABCD-1234", value.data.rooms.single().code)
        assertEquals("房主", value.data.rooms.single().owner.displayName)
    }

    @Test fun `parses community lists and V1 report pagination`() {
        val resources = json.decodeFromString<V1Envelope<ResourceListDto>>("""{
          "data":{"items":[{"id":8,"title":"客户端资源","resource_kind":"mod","download_count":12}],"pagination":{"limit":20,"offset":0,"next_offset":null,"has_more":false}},
          "meta":{"request_id":"request-3"}
        }""")
        val reports = json.decodeFromString<V1Envelope<ReportPageDto>>("""{
          "data":{"data":[{"id":4,"target_type":"post","target_id":8,"reason":"spam","status":"pending","created_at":"2026-09-03T00:00:00Z"}],"pagination":{"page":1,"limit":20,"total":1,"total_pages":1}},
          "meta":{"request_id":"request-4"}
        }""")
        assertEquals("客户端资源", resources.data.items.single().title)
        assertEquals(1, reports.data.pagination.totalPages)
    }
}
