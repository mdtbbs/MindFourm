package cn.mdtbbs.android.feature.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.model.ThreadSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SearchUiState {
    data object Idle : SearchUiState
    data object Loading : SearchUiState
    data class Content(val items: List<ThreadSummary>, val hasMore: Boolean) : SearchUiState
    data object Empty : SearchUiState
    data class Error(val error: Throwable) : SearchUiState
}

@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(private val repository: SearchRepository) : ViewModel() {
    private val queryInput = MutableStateFlow("")
    private val mutableState = MutableStateFlow<SearchUiState>(SearchUiState.Idle)
    val query: StateFlow<String> = queryInput
    val state: StateFlow<SearchUiState> = mutableState
    private var nextPage = 1
    private var activeQuery = ""

    init {
        viewModelScope.launch {
            queryInput.debounce(400).distinctUntilChanged().collectLatest { value ->
                if (value.isBlank()) {
                    activeQuery = ""; nextPage = 1; mutableState.value = SearchUiState.Idle
                } else search(value, reset = true)
            }
        }
    }

    fun updateQuery(value: String) { queryInput.value = value }
    fun retry() { if (activeQuery.isNotBlank()) viewModelScope.launch { search(activeQuery, reset = true) } }
    fun loadMore() {
        val current = mutableState.value as? SearchUiState.Content ?: return
        if (current.hasMore) viewModelScope.launch { search(activeQuery, reset = false) }
    }
    private suspend fun search(value: String, reset: Boolean) {
        if (reset) { activeQuery = value; nextPage = 1; mutableState.value = SearchUiState.Loading }
        runCatching { repository.search(value, nextPage) }.onSuccess { (items, hasMore) ->
            val combined = if (reset) items else ((mutableState.value as? SearchUiState.Content)?.items.orEmpty() + items)
            nextPage += 1
            mutableState.value = if (combined.isEmpty()) SearchUiState.Empty else SearchUiState.Content(combined, hasMore)
        }.onFailure { mutableState.value = SearchUiState.Error(it) }
    }
}

@Composable
fun SearchRoute(onThreadClick: (String) -> Unit, viewModel: SearchViewModel = androidx.hilt.navigation.compose.hiltViewModel()) {
    val query by viewModel.query.collectAsState()
    val state by viewModel.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = query, onValueChange = viewModel::updateQuery, label = { Text("搜索主题") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        when (state) {
            SearchUiState.Idle -> Message("输入关键词开始搜索")
            SearchUiState.Loading -> Message("正在搜索…", loading = true)
            SearchUiState.Empty -> Message("没有找到相关主题")
            is SearchUiState.Error -> Message("搜索失败", retry = viewModel::retry)
            is SearchUiState.Content -> {
                val content = state as SearchUiState.Content
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 12.dp)) {
                    items(content.items, key = { it.id }) { thread ->
                        Column(Modifier.fillMaxWidth().clickable { onThreadClick(thread.id) }.padding(vertical = 12.dp)) {
                            Text(thread.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            thread.excerpt?.let { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                    if (content.hasMore) item { Button(onClick = viewModel::loadMore, modifier = Modifier.fillMaxWidth()) { Text("加载更多") } }
                }
            }
        }
    }
}

@Composable
private fun Message(text: String, loading: Boolean = false, retry: (() -> Unit)? = null) = Column(
    modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
) { if (loading) CircularProgressIndicator(); Text(text); if (retry != null) Button(onClick = retry) { Text("重试") } }
