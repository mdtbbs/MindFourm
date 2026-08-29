package cn.mdtbbs.android.feature.post

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.data.ThreadDetailRepository
import cn.mdtbbs.android.core.model.ThreadDetail
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
}
