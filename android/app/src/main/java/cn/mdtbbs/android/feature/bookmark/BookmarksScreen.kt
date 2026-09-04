package cn.mdtbbs.android.feature.bookmark

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.mapper.toSummary
import cn.mdtbbs.android.feature.home.ThreadCard
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BookmarksUiState(
    val loading: Boolean = true,
    val loadingMore: Boolean = false,
    val items: List<ThreadSummary> = emptyList(),
    val page: Int = 0,
    val totalPages: Int = 0,
    val error: Boolean = false,
) {
    val canLoadMore get() = page < totalPages
}

@HiltViewModel
class BookmarksViewModel @Inject constructor(
    private val api: MdtBbsApi,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(BookmarksUiState())
    val state: StateFlow<BookmarksUiState> = mutableState.asStateFlow()
    val authenticated get() = auth.state.value is AuthState.Authenticated

    fun load() = requestPage(page = 1, append = false)
    fun loadMore() {
        val current = mutableState.value
        if (!current.canLoadMore || current.loading || current.loadingMore) return
        requestPage(current.page + 1, append = true)
    }

    private fun requestPage(page: Int, append: Boolean) {
        if (!authenticated) {
            mutableState.value = BookmarksUiState(loading = false)
            return
        }
        val before = mutableState.value
        mutableState.value = if (append) before.copy(loadingMore = true, error = false) else BookmarksUiState(loading = true)
        viewModelScope.launch {
            runCatching { api.bookmarks(page).data }
                .onSuccess { response ->
                    val incoming = response.items.map { it.toSummary() }
                    mutableState.value = BookmarksUiState(
                        loading = false,
                        items = if (append) before.items + incoming else incoming,
                        page = response.pagination.page,
                        totalPages = response.pagination.totalPages,
                    )
                }
                .onFailure {
                    mutableState.value = if (append) before.copy(loadingMore = false, error = true) else BookmarksUiState(loading = false, error = true)
                }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookmarksRoute(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onThread: (String) -> Unit,
    viewModel: BookmarksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }
    Scaffold(topBar = {
        TopAppBar(title = { Text("我的收藏") }, navigationIcon = { TextButton(onClick = onBack) { Text("返回") } })
    }) { padding ->
        when {
            !viewModel.authenticated -> EmptyBookmarks(
                modifier = Modifier.fillMaxSize().padding(padding),
                title = "登录后查看收藏",
                action = "去登录",
                onAction = onLogin,
            )
            state.loading -> Column(Modifier.fillMaxSize().padding(padding), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            state.error && state.items.isEmpty() -> EmptyBookmarks(
                modifier = Modifier.fillMaxSize().padding(padding),
                title = "收藏加载失败",
                action = "重试",
                onAction = viewModel::load,
            )
            state.items.isEmpty() -> EmptyBookmarks(
                modifier = Modifier.fillMaxSize().padding(padding),
                title = "还没有收藏主题",
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.items, key = { it.id }) { thread ->
                    ThreadCard(thread = thread, onClick = { onThread(thread.id) }, modifier = Modifier.padding(horizontal = 12.dp))
                }
                item {
                    when {
                        state.loadingMore -> Column(Modifier.padding(18.dp).fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
                        state.error -> TextButton(onClick = viewModel::loadMore, modifier = Modifier.padding(12.dp)) { Text("加载更多失败，重试") }
                        state.canLoadMore -> TextButton(onClick = viewModel::loadMore, modifier = Modifier.padding(12.dp)) { Text("加载更多") }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyBookmarks(modifier: Modifier, title: String, action: String? = null, onAction: (() -> Unit)? = null) = Column(
    modifier = modifier.padding(24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
) {
    Text(title, style = MaterialTheme.typography.titleMedium)
    if (action != null && onAction != null) Button(onClick = onAction, modifier = Modifier.padding(top = 12.dp)) { Text(action) }
}
