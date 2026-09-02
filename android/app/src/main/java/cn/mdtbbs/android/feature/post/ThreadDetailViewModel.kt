package cn.mdtbbs.android.feature.post

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.data.ThreadDetailRepository
import cn.mdtbbs.android.core.model.ThreadDetail
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ThreadDetailUiState {
    data object Loading : ThreadDetailUiState
    data class Content(val thread: ThreadDetail) : ThreadDetailUiState
    data class Error(val cause: Throwable) : ThreadDetailUiState
}

@HiltViewModel
class ThreadDetailViewModel @Inject constructor(
    private val repository: ThreadDetailRepository,
    private val authRepository: AuthRepository,
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

    fun reply(onLogin: (String) -> Unit, content: String) = interact(onLogin) { thread ->
        repository.createReply(thread.summary.id, content)
    }

    fun startLoginForInteraction(onLogin: (String) -> Unit) = onLogin(threadId)

    private fun interact(onLogin: (String) -> Unit, action: suspend (ThreadDetail) -> Unit) {
        val thread = (mutableState.value as? ThreadDetailUiState.Content)?.thread ?: return
        if (thread.viewer == null || authRepository.state.value !is AuthState.Authenticated) {
            startLoginForInteraction(onLogin); return
        }
        viewModelScope.launch { runCatching { action(thread) }.onSuccess { load() } }
    }
}
