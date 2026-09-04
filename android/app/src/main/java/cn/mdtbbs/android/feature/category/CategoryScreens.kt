package cn.mdtbbs.android.feature.category

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import cn.mdtbbs.android.ui.theme.MdtLime
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
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { CategoryHeader() }
                if (content.categories.isEmpty()) item { EmptyCategories() }
                items(content.categories, key = { it.id }) { category ->
                    Surface(
                        modifier = Modifier.fillMaxWidth().clickable { onCategoryClick(category.id) },
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(16.dp),
                        tonalElevation = 1.dp,
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(42.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                                Text(category.name.take(1), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(category.name, style = MaterialTheme.typography.titleMedium)
                                Text(category.slug, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp))
                            }
                            Text("›", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryHeader() = Surface(
    color = MaterialTheme.colorScheme.surfaceVariant,
    shape = RoundedCornerShape(18.dp),
    modifier = Modifier.fillMaxWidth(),
) {
    Column(Modifier.padding(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(9.dp).background(MdtLime, RoundedCornerShape(2.dp)))
            Spacer(Modifier.width(8.dp))
            Text("找到你的阵地", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
        }
        Spacer(Modifier.height(8.dp))
        Text("浏览分类", style = MaterialTheme.typography.headlineSmall)
        Text("按主题进入更专注的讨论。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun EmptyCategories() = Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("分类正在整理中", style = MaterialTheme.typography.titleMedium)
        Text("稍后再来看看新的讨论板块。", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
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
