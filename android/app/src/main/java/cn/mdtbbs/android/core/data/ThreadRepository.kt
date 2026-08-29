package cn.mdtbbs.android.core.data

import androidx.paging.ExperimentalPagingApi
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.map
import cn.mdtbbs.android.core.database.MdtBbsDatabase
import cn.mdtbbs.android.core.database.toDomain
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.core.network.MdtBbsApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

interface ThreadRepository {
    /** queryKey must identify one immutable list shape, e.g. home:latest or category:42:latest. */
    fun streamThreads(queryKey: String, categoryId: String? = null): Flow<PagingData<ThreadSummary>>
}

@Singleton
class OfflineFirstThreadRepository @Inject constructor(
    private val api: MdtBbsApi,
    private val database: MdtBbsDatabase,
) : ThreadRepository {
    @OptIn(ExperimentalPagingApi::class)
    override fun streamThreads(
        queryKey: String,
        categoryId: String?,
    ): Flow<PagingData<ThreadSummary>> = Pager(
        config = PagingConfig(pageSize = PAGE_SIZE, enablePlaceholders = false),
        remoteMediator = ThreadRemoteMediator(queryKey, categoryId, api, database),
        pagingSourceFactory = { database.threads().paging(queryKey) },
    ).flow.map { pagingData -> pagingData.map { it.toDomain() } }

    private companion object { const val PAGE_SIZE = 20 }
}
