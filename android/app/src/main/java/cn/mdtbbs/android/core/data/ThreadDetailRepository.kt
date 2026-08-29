package cn.mdtbbs.android.core.data

import cn.mdtbbs.android.core.model.ThreadDetail
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.mapper.toDetail
import javax.inject.Inject
import javax.inject.Singleton

/** Read-only detail boundary for the anonymous M1 reader. */
@Singleton
class ThreadDetailRepository @Inject constructor(
    private val api: MdtBbsApi,
) {
    suspend fun getThread(id: String): ThreadDetail = api.thread(id).data.toDetail()
}
