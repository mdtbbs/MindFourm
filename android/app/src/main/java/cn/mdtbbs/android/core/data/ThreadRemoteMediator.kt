package cn.mdtbbs.android.core.data

import androidx.paging.ExperimentalPagingApi
import androidx.paging.LoadType
import androidx.paging.PagingState
import androidx.paging.RemoteMediator
import androidx.room.withTransaction
import cn.mdtbbs.android.core.database.MdtBbsDatabase
import cn.mdtbbs.android.core.database.RemoteKeyEntity
import cn.mdtbbs.android.core.database.ThreadEntity
import cn.mdtbbs.android.core.database.toEntity
import cn.mdtbbs.android.core.network.MdtBbsApi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException

@OptIn(ExperimentalPagingApi::class)
class ThreadRemoteMediator(
    private val queryKey: String,
    private val categoryId: String?,
    private val api: MdtBbsApi,
    private val database: MdtBbsDatabase,
) : RemoteMediator<Int, ThreadEntity>() {
    override suspend fun load(loadType: LoadType, state: PagingState<Int, ThreadEntity>): MediatorResult {
        val cursor = when (loadType) {
            LoadType.REFRESH -> FIRST_CURSOR
            LoadType.PREPEND -> return MediatorResult.Success(endOfPaginationReached = true)
            LoadType.APPEND -> {
                val key = database.keys().get(queryKey)
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
                if (!key.hasMore || key.nextCursor == null) {
                    return MediatorResult.Success(endOfPaginationReached = true)
                }
                key.nextCursor
            }
        }

        return try {
            val page = api.threads(
                limit = state.config.pageSize.coerceIn(MIN_PAGE_SIZE, MAX_PAGE_SIZE),
                cursor = cursor,
                categoryId = categoryId,
            ).data
            database.withTransaction {
                if (loadType == LoadType.REFRESH) {
                    database.threads().clearQuery(queryKey)
                    database.keys().clearQuery(queryKey)
                }
                database.threads().upsert(page.items.map { it.toEntity(queryKey) })
                database.keys().put(
                    RemoteKeyEntity(
                        queryKey = queryKey,
                        nextCursor = page.next_cursor,
                        hasMore = page.has_more,
                    ),
                )
            }
            MediatorResult.Success(endOfPaginationReached = !page.has_more)
        } catch (error: IOException) {
            MediatorResult.Error(error)
        } catch (error: HttpException) {
            MediatorResult.Error(error)
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MediatorResult.Error(error)
        }
    }

    private companion object {
        /** Empty but present query parameter requests the V1 cursor response's first page. */
        const val FIRST_CURSOR = ""
        const val MIN_PAGE_SIZE = 1
        const val MAX_PAGE_SIZE = 50
    }
}
