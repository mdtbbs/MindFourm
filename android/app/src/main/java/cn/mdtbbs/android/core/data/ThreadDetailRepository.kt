package cn.mdtbbs.android.core.data

import cn.mdtbbs.android.core.model.ThreadDetail
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.mapper.toDetail
import cn.mdtbbs.android.core.network.CreateReplyRequest
import cn.mdtbbs.android.core.network.CreateThreadRequest
import cn.mdtbbs.android.core.network.UpdateReplyRequest
import cn.mdtbbs.android.core.network.UpdateThreadRequest
import javax.inject.Inject
import javax.inject.Singleton

/** Read-only detail boundary for the anonymous M1 reader. */
@Singleton
class ThreadDetailRepository @Inject constructor(
    private val api: MdtBbsApi,
) {
    suspend fun getThread(id: String): ThreadDetail = api.thread(id).data.toDetail()
    suspend fun setLiked(id: String, liked: Boolean) {
        if (liked) api.like(id) else api.unlike(id)
    }
    suspend fun setBookmarked(id: String, bookmarked: Boolean) {
        if (bookmarked) api.bookmark(id) else api.removeBookmark(id)
    }
    suspend fun createThread(title: String, content: String, categoryId: Long?, tags: List<String>) = api.createThread(CreateThreadRequest(title, content, categoryId, tags)).data
    suspend fun updateThread(id: String, title: String?, content: String?, categoryId: Long?, tags: List<String>?) = api.updateThread(id, UpdateThreadRequest(title, content, categoryId, tags)).data
    suspend fun deleteThread(id: String) = api.deleteThread(id).data
    suspend fun createReply(threadId: String, content: String, parentReplyId: Long? = null) = api.createReply(threadId, CreateReplyRequest(content, parentReplyId)).data
    suspend fun updateReply(threadId: String, replyId: Long, content: String) = api.updateReply(threadId, replyId, UpdateReplyRequest(content)).data
    suspend fun deleteReply(threadId: String, replyId: Long) = api.deleteReply(threadId, replyId).data
}
