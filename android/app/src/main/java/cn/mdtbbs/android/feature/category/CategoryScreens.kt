package cn.mdtbbs.android.feature.category

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.data.ThreadRepository
import cn.mdtbbs.android.core.model.Category
import cn.mdtbbs.android.feature.home.HomeScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import androidx.paging.cachedIn
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface CategoryListState {
    data object Loading : CategoryListState
    data class Content(val categories: List<Category>) : CategoryListState
    data class Error(val throwable: Throwable) : CategoryListState
}

@HiltViewModel
class CategoryListViewModel @Inject constructor(private val repository: CategoryRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<CategoryListState>(CategoryListState.Loading)
    val state: StateFlow<CategoryListState> = mutableState
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        mutableState.value = CategoryListState.Loading
        mutableState.value = runCatching { repository.categories() }.fold(
            { CategoryListState.Content(it) }, { CategoryListState.Error(it) },
        )
    }
}

@Composable
fun CategoryRoute(onCategoryClick: (String) -> Unit, viewModel: CategoryListViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    when (state) {
        CategoryListState.Loading -> CenterMessage("正在加载分类…")
        is CategoryListState.Error -> CenterMessage("分类加载失败", retry = viewModel::refresh)
        is CategoryListState.Content -> {
            val content = state as CategoryListState.Content
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                item { Text("分类", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(20.dp)) }
                items(content.categories, key = { it.id }) { category ->
                    Column(
                        modifier = Modifier.fillMaxWidth().clickable { onCategoryClick(category.id) }.padding(20.dp, 14.dp),
                    ) {
                        Text(category.name, style = MaterialTheme.typography.titleMedium)
                        Text(category.slug, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@HiltViewModel
class CategoryThreadViewModel @Inject constructor(
    repository: ThreadRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val categoryId: String = checkNotNull(savedStateHandle["categoryId"])
    val threads = repository.streamThreads("category:$categoryId:latest", categoryId).cachedIn(viewModelScope)
}

@Composable
fun CategoryThreadRoute(
    onThreadClick: (String) -> Unit,
    viewModel: CategoryThreadViewModel = hiltViewModel(),
) {
    HomeScreen(threads = viewModel.threads, onThreadClick = onThreadClick)
}

@Composable
private fun CenterMessage(text: String, retry: (() -> Unit)? = null) = Column(
    modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
) {
    if (retry == null) CircularProgressIndicator() else Text(text)
    if (retry != null) TextButton(onClick = retry) { Text("重试") }
}
