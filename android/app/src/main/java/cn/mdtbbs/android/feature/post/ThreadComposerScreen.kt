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
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
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
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull

data class ThreadComposerUiState(
    val categories: List<CategoryDto> = emptyList(),
    val loadingCategories: Boolean = true,
    val submitting: Boolean = false,
    val uploadingImage: Boolean = false,
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

    fun submit(title: String, content: String, categoryId: Long?, tags: List<String>, onCreated: (Long, String) -> Unit) {
        if (title.isBlank() || content.isBlank()) {
            mutableState.value = mutableState.value.copy(error = "标题和正文不能为空")
            return
        }
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(submitting = true, error = null)
            runCatching { threads.createThread(title.trim(), content.trim(), categoryId, tags) }
                .onSuccess { onCreated(it.id, it.status) }
                .onFailure { mutableState.value = mutableState.value.copy(submitting = false, error = "发布失败，请确认已登录、手机号已验证且网络正常") }
        }
    }
    fun uploadInlineImage(name: String, mimeType: String, bytes: ByteArray, onUploaded: (String) -> Unit) = viewModelScope.launch {
        if (bytes.isEmpty() || bytes.size > 2 * 1024 * 1024) { mutableState.value = mutableState.value.copy(error = "图片需小于 2MB"); return@launch }
        mutableState.value = mutableState.value.copy(uploadingImage = true, error = null)
        val body = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
        val part = MultipartBody.Part.createFormData("image", name, body)
        runCatching { api.uploadInlineImage(part).data.url }
            .onSuccess { url -> mutableState.value = mutableState.value.copy(uploadingImage = false); onUploaded(url) }
            .onFailure { mutableState.value = mutableState.value.copy(uploadingImage = false, error = "图片上传失败，请确认登录、验证状态和网络") }
    }

    fun showError(message: String) {
        mutableState.value = mutableState.value.copy(error = message)
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
    var tags by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<CategoryDto?>(null) }
    var categoryMenu by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("无法读取图片")
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            val extension = imageExtensionFor(mime) ?: error("仅支持 JPG、PNG、GIF 或 WebP 图片")
            viewModel.uploadInlineImage("inline-image.$extension", mime, bytes) { url -> content = content.trimEnd() + "\n\n![]($url)\n" }
        }.onFailure { viewModel.showError(it.message ?: "图片读取失败") }
    }
    Scaffold(topBar = { CenterAlignedTopAppBar(title = { Text("发布主题") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") } }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!viewModel.authenticated) {
                Text("登录后才能发布主题")
                Button(onClick = onLogin) { Text("去登录") }
                return@Column
            }
            Text("把你的想法分享给社区", style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
            Text("支持 Markdown，清晰的标题更容易获得回复。", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("标题") }, placeholder = { Text("一句话概括你的主题") }, singleLine = true, shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
            OutlinedTextField(content, { content = it }, Modifier.fillMaxWidth().height(260.dp), label = { Text("正文（支持 Markdown）") }, placeholder = { Text("描述背景、问题和你的尝试…") }, minLines = 8, shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
            TextButton(onClick = { imagePicker.launch("image/*") }, enabled = !state.uploadingImage) { Text(if (state.uploadingImage) "图片上传中…" else "插入图片") }
            OutlinedTextField(
                value = tags,
                onValueChange = { tags = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("标签（可选，以逗号分隔，最多 5 个）") },
                supportingText = { Text("例如：服务器, Mod, 求助") },
                singleLine = true, shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            )
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
                Button(
                    onClick = { viewModel.submit(title, content, selected?.id, normalizeTags(tags), onCreated) },
                    enabled = !state.submitting,
                ) { Text("发布") }
            }
        }
    }
}

private fun imageExtensionFor(mimeType: String): String? = when (mimeType.lowercase()) {
    "image/jpeg", "image/jpg" -> "jpg"
    "image/png" -> "png"
    "image/gif" -> "gif"
    "image/webp" -> "webp"
    else -> null
}

/** Keep presentation-only tag parsing at the UI boundary; the API receives a clean array. */
private fun normalizeTags(raw: String): List<String> = raw
    .split(',', '，', '\n')
    .map { it.trim().removePrefix("#") }
    .filter(String::isNotBlank)
    .distinct()
    .take(5)
