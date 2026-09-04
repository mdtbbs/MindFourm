package cn.mdtbbs.android.feature.post

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.data.ThreadDetailRepository
import cn.mdtbbs.android.core.model.ThreadDetail
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.ReportRequest
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ThreadDetailUiState {
    data object Loading : ThreadDetailUiState
    data class Content(
        val thread: ThreadDetail,
        val actionInProgress: Boolean = false,
        val actionError: String? = null,
        val actionMessage: String? = null,
    ) : ThreadDetailUiState
    data class Error(val cause: Throwable) : ThreadDetailUiState
}

data class PendingAttachment(val name: String, val mimeType: String, val bytes: ByteArray)

@HiltViewModel
class ThreadDetailViewModel @Inject constructor(
    private val repository: ThreadDetailRepository,
    private val authRepository: AuthRepository,
    private val api: MdtBbsApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val threadId: String = checkNotNull(savedStateHandle["threadId"])
    private val mutableState = MutableStateFlow<ThreadDetailUiState>(ThreadDetailUiState.Loading)
    val state: StateFlow<ThreadDetailUiState> = mutableState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            mutableState.value = ThreadDetailUiState.Loading
            mutableState.value = runCatching { repository.getThread(threadId) }
                .fold(
                    onSuccess = { ThreadDetailUiState.Content(it) },
                    onFailure = { ThreadDetailUiState.Error(it) },
                )
        }
    }

    fun toggleLike(onLogin: (String) -> Unit) = interact(onLogin) { thread ->
        val viewer = thread.viewer ?: return@interact
        repository.setLiked(thread.summary.id, !viewer.liked)
    }

    fun toggleBookmark(onLogin: (String) -> Unit) = interact(onLogin) { thread ->
        val viewer = thread.viewer ?: return@interact
        repository.setBookmarked(thread.summary.id, !viewer.bookmarked)
    }

    fun reply(onLogin: (String) -> Unit, content: String, parentReplyId: Long? = null) = mutate(
        onLogin = onLogin,
        failureMessage = "回复失败，请确认手机号已验证后重试",
    ) { thread ->
        repository.createReply(thread.summary.id, content, parentReplyId)
    }

    fun updateThread(onLogin: (String) -> Unit, title: String, content: String) = mutate(
        onLogin = onLogin,
        failureMessage = "主题保存失败，请稍后重试",
    ) { thread ->
        repository.updateThread(thread.summary.id, title.trim(), content.trim(), null, null)
    }

    fun deleteThread(onLogin: (String) -> Unit, onDeleted: () -> Unit) = mutate(
        onLogin = onLogin,
        failureMessage = "主题删除失败，请稍后重试",
        onSuccess = onDeleted,
    ) { thread ->
        repository.deleteThread(thread.summary.id)
    }

    fun updateReply(onLogin: (String) -> Unit, replyId: Long, content: String) = mutate(
        onLogin = onLogin,
        failureMessage = "回复保存失败，请稍后重试",
    ) { thread ->
        repository.updateReply(thread.summary.id, replyId, content.trim())
    }

    fun deleteReply(onLogin: (String) -> Unit, replyId: Long) = mutate(
        onLogin = onLogin,
        failureMessage = "回复删除失败，请稍后重试",
    ) { thread ->
        repository.deleteReply(thread.summary.id, replyId)
    }

    fun startLoginForInteraction(onLogin: (String) -> Unit) = onLogin(threadId)

    fun report(onLogin: (String) -> Unit, reason: String, detail: String?) {
        if (authRepository.state.value !is AuthState.Authenticated) { onLogin(threadId); return }
        val content = mutableState.value as? ThreadDetailUiState.Content ?: return
        viewModelScope.launch {
            mutableState.value = content.copy(actionInProgress = true, actionError = null)
            runCatching { api.createReport(ReportRequest("post", content.thread.summary.id.toLong(), reason, detail?.trim()?.takeIf { it.isNotEmpty() })) }
                .onSuccess { mutableState.value = content.copy(actionMessage = "举报已提交") }
                .onFailure { mutableState.value = content.copy(actionError = "举报提交失败，请稍后重试") }
        }
    }

    fun uploadAttachments(onLogin: (String) -> Unit, files: List<PendingAttachment>) {
        if (authRepository.state.value !is AuthState.Authenticated) { onLogin(threadId); return }
        val content = mutableState.value as? ThreadDetailUiState.Content ?: return
        if (!content.thread.isOwner) return
        if (files.isEmpty() || files.size > 5 || files.any { it.bytes.isEmpty() || it.bytes.size > 10 * 1024 * 1024 }) {
            mutableState.value = content.copy(actionError = "最多上传 5 个附件，单个文件不得超过 10MB")
            return
        }
        viewModelScope.launch {
            mutableState.value = content.copy(actionInProgress = true, actionError = null, actionMessage = null)
            runCatching {
                val parts = files.map { file ->
                    MultipartBody.Part.createFormData("files", file.name, file.bytes.toRequestBody(file.mimeType.toMediaTypeOrNull()))
                }
                api.uploadPostAttachments(parts, content.thread.summary.id.toRequestBody("text/plain".toMediaTypeOrNull()))
            }.onSuccess { result ->
                mutableState.value = content.copy(actionMessage = "已提交 ${result.attachments.size} 个附件，审核通过后会对外显示")
            }.onFailure {
                mutableState.value = content.copy(actionError = "附件上传失败，请检查文件格式、验证状态和网络")
            }
        }
    }

    private fun interact(onLogin: (String) -> Unit, action: suspend (ThreadDetail) -> Unit) = mutate(
        onLogin = onLogin,
        failureMessage = "操作失败，请稍后重试",
        action = action,
    )

    private fun mutate(
        onLogin: (String) -> Unit,
        failureMessage: String,
        onSuccess: () -> Unit = ::load,
        action: suspend (ThreadDetail) -> Unit,
    ) {
        val content = mutableState.value as? ThreadDetailUiState.Content ?: return
        val thread = content.thread
        if (thread.viewer == null || authRepository.state.value !is AuthState.Authenticated) {
            startLoginForInteraction(onLogin); return
        }
        mutableState.value = content.copy(actionInProgress = true, actionError = null)
        viewModelScope.launch {
            runCatching { action(thread) }
                .onSuccess { onSuccess() }
                .onFailure {
                    // Never display server responses directly: they may carry implementation detail.
                    mutableState.value = content.copy(actionInProgress = false, actionError = failureMessage)
                }
        }
    }
}
