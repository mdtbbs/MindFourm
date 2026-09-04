package cn.mdtbbs.android.feature.search
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.mapper.toSummary
import javax.inject.Inject
class SearchRepository @Inject constructor(private val api: MdtBbsApi) {
 suspend fun search(query: String, page: Int): Pair<List<ThreadSummary>, Boolean> { val response = api.search(query, page); return response.data.items.map { it.toSummary() } to (response.meta.pagination?.let { it.page < it.totalPages } ?: false) }
}
