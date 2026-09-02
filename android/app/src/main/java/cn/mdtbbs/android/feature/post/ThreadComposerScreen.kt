package cn.mdtbbs.android.feature.post

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.data.ThreadDetailRepository
import cn.mdtbbs.android.core.network.CategoryDto
import cn.mdtbbs.android.core.network.MdtBbsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ThreadComposerUiState(
    val categories: List<CategoryDto> = emptyList(),
    val loadingCategories: Boolean = true,
    val submitting: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ThreadComposerViewModel @Inject constructor(
    private val api: MdtBbsApi,
    private val threads: ThreadDetailRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow(ThreadComposerUiState())
    val state: StateFlow<ThreadComposerUiState> = mutableState.asStateFlow()
    val authenticated: Boolean get() = auth.state.value is AuthState.Authenticated

    init {
        viewModelScope.launch {
            runCatching { api.categories().data }
                .onSuccess { mutableState.value = mutableState.value.copy(categories = it, loadingCategories = false) }
                .onFailure { mutableState.value = mutableState.value.copy(loadingCategories = false, error = "分类加载失败，请重试") }
        }
    }

    fun submit(title: String, content: String, categoryId: Long?, onCreated: (Long, String) -> Unit) {
        if (title.isBlank() || content.isBlank()) {
            mutableState.value = mutableState.value.copy(error = "标题和正文不能为空")
            return
        }
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(submitting = true, error = null)
            runCatching { threads.createThread(title.trim(), content.trim(), categoryId, emptyList()) }
                .onSuccess { onCreated(it.id, it.status) }
                .onFailure { mutableState.value = mutableState.value.copy(submitting = false, error = "发布失败，请确认已登录、手机号已验证且网络正常") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadComposerRoute(
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onCreated: (Long, String) -> Unit,
    viewModel: ThreadComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<CategoryDto?>(null) }
    var categoryMenu by remember { mutableStateOf(false) }
    Scaffold(topBar = { TopAppBar(title = { Text("发布主题") }, navigationIcon = { TextButton(onClick = onBack) { Text("返回") } }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!viewModel.authenticated) {
                Text("登录后才能发布主题")
                Button(onClick = onLogin) { Text("去登录") }
                return@Column
            }
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("标题") }, singleLine = true)
            OutlinedTextField(content, { content = it }, Modifier.fillMaxWidth().height(260.dp), label = { Text("正文（支持 Markdown）") }, minLines = 8)
            Column {
                TextButton(onClick = { categoryMenu = true }, enabled = !state.loadingCategories) { Text(selected?.name ?: "选择分类（可选）") }
                DropdownMenu(expanded = categoryMenu, onDismissRequest = { categoryMenu = false }) {
                    DropdownMenuItem(text = { Text("不选择分类") }, onClick = { selected = null; categoryMenu = false })
                    state.categories.forEach { category -> DropdownMenuItem(text = { Text(category.name) }, onClick = { selected = category; categoryMenu = false }) }
                }
            }
            state.error?.let { Text(it) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (state.submitting) CircularProgressIndicator(Modifier.width(28.dp).height(28.dp))
                Spacer(Modifier.width(12.dp))
                Button(onClick = { viewModel.submit(title, content, selected?.id, onCreated) }, enabled = !state.submitting) { Text("发布") }
            }
        }
    }
}
