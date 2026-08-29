package cn.mdtbbs.android.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import cn.mdtbbs.android.core.data.ThreadRepository
import cn.mdtbbs.android.core.model.ThreadSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * Owns the home stream only. Cursor and cache state stay in Paging/Room rather
 * than leaking into the screen state.
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    repository: ThreadRepository,
) : ViewModel() {
    val threads: Flow<PagingData<ThreadSummary>> = repository
        .streamThreads(queryKey = HOME_QUERY_KEY)
        .cachedIn(viewModelScope)

    companion object {
        const val HOME_QUERY_KEY = "home:latest"
    }
}
