@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package cn.mdtbbs.android.feature.community

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.network.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject

data class ListState<T>(val loading: Boolean = false, val items: List<T> = emptyList(), val error: Boolean = false)

@HiltViewModel class ResourcesViewModel @Inject constructor(private val api: MdtBbsApi) : ViewModel() {
    private val mutable = MutableStateFlow(ListState<ResourceSummaryDto>())
    val state = mutable.asStateFlow()
    fun load() = viewModelScope.launch { mutable.value = ListState(loading = true); runCatching { api.resources().data.items }.onSuccess { mutable.value = ListState(items = it) }.onFailure { mutable.value = ListState(error = true) } }
}
@HiltViewModel class NoticesViewModel @Inject constructor(private val api: MdtBbsApi) : ViewModel() {
    private val mutable = MutableStateFlow(ListState<NoticeDto>())
    val state = mutable.asStateFlow()
    fun load() = viewModelScope.launch { mutable.value = ListState(loading = true); runCatching { api.notices().data.data }.onSuccess { mutable.value = ListState(items = it) }.onFailure { mutable.value = ListState(error = true) } }
}
@HiltViewModel class DetailViewModel @Inject constructor(private val api: MdtBbsApi) : ViewModel() {
    val resource = MutableStateFlow<ResourceDetailDto?>(null); val notice = MutableStateFlow<NoticeDetailDto?>(null); val error = MutableStateFlow(false)
    fun resource(id: Long) = viewModelScope.launch { runCatching { api.resource(id).data }.onSuccess { resource.value = it }.onFailure { error.value = true } }
    fun notice(id: String) = viewModelScope.launch { runCatching { api.notice(id).data }.onSuccess { notice.value = it }.onFailure { error.value = true } }
}

@Composable fun ResourcesRoute(onBack: () -> Unit, onResource: (Long) -> Unit, viewModel: ResourcesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState(); LaunchedEffect(Unit) { viewModel.load() }
    ListScaffold("资源中心", onBack, state.loading, state.error, state.items, { it.id }, viewModel::load, empty = "暂无可见资源") { item ->
        Card(Modifier.fillMaxWidth().clickable { onResource(item.id) }) { Column(Modifier.padding(16.dp)) { Text(item.title, style = MaterialTheme.typography.titleMedium); Text(item.summary, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant); Text("${item.resourceKind ?: "资源"} · ${item.downloadCount} 下载", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp)) } }
    }
}
@Composable fun NoticesRoute(onBack: () -> Unit, onNotice: (String) -> Unit, viewModel: NoticesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState(); LaunchedEffect(Unit) { viewModel.load() }
    ListScaffold("公告", onBack, state.loading, state.error, state.items, { it.id }, viewModel::load, empty = "暂无公告") { item ->
        Card(Modifier.fillMaxWidth().clickable { onNotice(item.publicId ?: item.id.toString()) }) { Column(Modifier.padding(16.dp)) { Text(item.title, style = MaterialTheme.typography.titleMedium); item.excerpt?.let { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Text(if (item.isPinned) "置顶公告" else item.noticeType, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp)) } }
    }
}
@Composable private fun <T> ListScaffold(title: String, onBack: () -> Unit, loading: Boolean, error: Boolean, items: List<T>, key: (T) -> Any, retry: () -> Unit, empty: String, card: @Composable (T) -> Unit) {
    Scaffold(topBar = { TopAppBar(title = { Text(title) }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") } }) }) { padding ->
        when { loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error -> CenterRetry(Modifier.fillMaxSize().padding(padding), "加载失败", retry)
            items.isEmpty() -> CenterRetry(Modifier.fillMaxSize().padding(padding), empty, retry)
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(items, key = key) { card(it) } }
        }
    }
}
@Composable fun ResourceDetailRoute(id: Long, onBack: () -> Unit, viewModel: DetailViewModel = hiltViewModel()) { val value by viewModel.resource.collectAsState(); val error by viewModel.error.collectAsState(); LaunchedEffect(id) { viewModel.resource(id) }; Scaffold(topBar={TopAppBar(title={Text("资源详情")},navigationIcon={IconButton(onClick=onBack){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"返回")}})}){p->when{value!=null->Column(Modifier.fillMaxSize().padding(p).padding(20.dp)){Text(value!!.title,style=MaterialTheme.typography.headlineSmall);Spacer(Modifier.height(12.dp));Text(value!!.summary);Spacer(Modifier.height(16.dp));value!!.latestVersion?.let{Text("最新版本 ${it.displayVersion} · ${it.fileCount} 个文件",style=MaterialTheme.typography.labelLarge)};Text("${value!!.downloadCount} 次下载",color=MaterialTheme.colorScheme.onSurfaceVariant,modifier=Modifier.padding(top=12.dp))};error->CenterRetry(Modifier.fillMaxSize().padding(p),"内容加载失败"){viewModel.resource(id)};else->Box(Modifier.fillMaxSize().padding(p),contentAlignment=Alignment.Center){CircularProgressIndicator()}}} }
@Composable fun NoticeDetailRoute(id: String, onBack: () -> Unit, viewModel: DetailViewModel = hiltViewModel()) { val value by viewModel.notice.collectAsState(); val error by viewModel.error.collectAsState(); LaunchedEffect(id) { viewModel.notice(id) }; Scaffold(topBar={TopAppBar(title={Text("公告详情")},navigationIcon={IconButton(onClick=onBack){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"返回")}})}){p->when{value!=null->Column(Modifier.fillMaxSize().padding(p).padding(20.dp)){Text(value!!.title,style=MaterialTheme.typography.headlineSmall);Spacer(Modifier.height(14.dp));Text(value!!.contentMarkdown)};error->CenterRetry(Modifier.fillMaxSize().padding(p),"内容加载失败"){viewModel.notice(id)};else->Box(Modifier.fillMaxSize().padding(p),contentAlignment=Alignment.Center){CircularProgressIndicator()}}} }

@HiltViewModel class FeedbackViewModel @Inject constructor(private val api: MdtBbsApi, private val auth: AuthRepository) : ViewModel() { val submitting = MutableStateFlow(false); val result = MutableStateFlow<String?>(null); val authenticated get() = auth.state.value is AuthState.Authenticated; fun submit(type: String, title: String, detail: String) = viewModelScope.launch { if(!authenticated) { result.value = "请先登录后再提交反馈"; return@launch }; if(title.isBlank() || detail.isBlank()) { result.value = "请填写标题和内容"; return@launch }; submitting.value=true; runCatching { api.submitFeedback(FeedbackRequest(type,title,detail)) }.onSuccess { result.value="已提交，感谢反馈" }.onFailure { result.value="提交失败，请稍后重试" }; submitting.value=false } }
@Composable fun FeedbackRoute(onBack: () -> Unit, onLogin: () -> Unit, viewModel: FeedbackViewModel = hiltViewModel()) { var type by remember { mutableStateOf("suggestion") }; var title by remember { mutableStateOf("") }; var detail by remember { mutableStateOf("") }; val submitting by viewModel.submitting.collectAsState(); val result by viewModel.result.collectAsState(); Scaffold(topBar={ TopAppBar(title={Text("意见反馈")},navigationIcon={IconButton(onClick=onBack){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"返回")}})}) { p -> Column(Modifier.fillMaxSize().padding(p).padding(20.dp), verticalArrangement=Arrangement.spacedBy(12.dp)) { Text("帮助我们改进社区",style=MaterialTheme.typography.titleLarge); if(!viewModel.authenticated) { Text("登录后可提交建议、问题和使用反馈。",color=MaterialTheme.colorScheme.onSurfaceVariant); Button(onClick=onLogin,modifier=Modifier.fillMaxWidth()){Text("去登录")}; return@Column }; SingleChoiceSegmentedButtonRow { listOf("suggestion" to "建议","bug" to "问题","other" to "其他").forEachIndexed { i,(v,l) -> SegmentedButton(selected=type==v,onClick={type=v},shape=SegmentedButtonDefaults.itemShape(i,3)){Text(l)} } }; OutlinedTextField(title,{title=it},Modifier.fillMaxWidth(),label={Text("标题")}); OutlinedTextField(detail,{detail=it},Modifier.fillMaxWidth().weight(1f),label={Text("详细说明")}); result?.let{Text(it,color=MaterialTheme.colorScheme.primary)}; Button(onClick={viewModel.submit(type,title,detail)},enabled=!submitting,modifier=Modifier.fillMaxWidth()){Text(if(submitting)"提交中…" else "提交反馈")} } } }

@HiltViewModel class ProfileSettingsViewModel @Inject constructor(private val api: MdtBbsApi, private val auth: AuthRepository) : ViewModel() { val me=MutableStateFlow<MeDto?>(null); val message=MutableStateFlow<String?>(null); fun load()=viewModelScope.launch { if(auth.state.value is AuthState.Authenticated) me.value=runCatching{api.me().data}.getOrNull() }; fun save(username:String,bio:String)=viewModelScope.launch { runCatching{api.updateProfile(UpdateProfileRequest(username.takeIf{it.isNotBlank()},bio)).data}.onSuccess{me.value=it;message.value="资料已保存"}.onFailure{message.value="保存失败，请检查昵称和网络"} }; fun avatar(name:String,mime:String,bytes:ByteArray)=viewModelScope.launch { if(bytes.size>2*1024*1024){message.value="头像需小于 2MB";return@launch}; val part=MultipartBody.Part.createFormData("avatar",name,bytes.toRequestBody(mime.toMediaTypeOrNull())); runCatching{api.uploadAvatar(part).data}.onSuccess{me.value=it;message.value="头像已提交审核"}.onFailure{message.value="头像上传失败，请确认登录、验证状态和图片格式"} }; fun showMessage(value:String){message.value=value} }
@Composable fun ProfileSettingsRoute(onBack:()->Unit, viewModel:ProfileSettingsViewModel=hiltViewModel()) { val me by viewModel.me.collectAsState(); val msg by viewModel.message.collectAsState(); var username by remember(me){mutableStateOf(me?.username.orEmpty())}; var bio by remember(me){mutableStateOf(me?.bio.orEmpty())}; val context=LocalContext.current; val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null) runCatching{val b=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("无法读取图片");val mime=context.contentResolver.getType(uri)?:"image/jpeg";val extension=imageExtensionForProfile(mime)?:error("仅支持 JPG、PNG、GIF 或 WebP 图片");viewModel.avatar("avatar.$extension",mime,b)}.onFailure{viewModel.showMessage(it.message?:"头像读取失败")}}; LaunchedEffect(Unit){viewModel.load()}; Scaffold(topBar={TopAppBar(title={Text("账号设置")},navigationIcon={IconButton(onClick=onBack){Icon(Icons.AutoMirrored.Outlined.ArrowBack,"返回")}})}){p->Column(Modifier.fillMaxSize().padding(p).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("个人资料",style=MaterialTheme.typography.titleLarge); Text("头像修改可能需要管理员审核。",color=MaterialTheme.colorScheme.onSurfaceVariant); OutlinedTextField(username,{username=it},Modifier.fillMaxWidth(),label={Text("昵称")});OutlinedTextField(bio,{bio=it},Modifier.fillMaxWidth().height(150.dp),label={Text("个人简介")});msg?.let{Text(it,color=MaterialTheme.colorScheme.primary)};Button(onClick={picker.launch("image/*")},modifier=Modifier.fillMaxWidth()){Text("更换头像")};Button(onClick={viewModel.save(username,bio)},modifier=Modifier.fillMaxWidth()){Text("保存资料")}}} }

private fun imageExtensionForProfile(mimeType: String): String? = when (mimeType.lowercase()) {
    "image/jpeg", "image/jpg" -> "jpg"
    "image/png" -> "png"
    "image/gif" -> "gif"
    "image/webp" -> "webp"
    else -> null
}

@HiltViewModel class PublicUserViewModel @Inject constructor(private val api:MdtBbsApi):ViewModel(){val user=MutableStateFlow<PublicUserDto?>(null);fun load(id:Long)=viewModelScope.launch{user.value=runCatching{api.publicUser(id).data}.getOrNull()}}
@Composable
fun PublicUserRoute(id: Long, onBack: () -> Unit, viewModel: PublicUserViewModel = hiltViewModel()) {
    val user by viewModel.user.collectAsState()
    LaunchedEffect(id) { viewModel.load(id) }
    Scaffold(topBar = { TopAppBar(title = { Text("用户主页") }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") } }) }) { padding ->
        val current = user
        if (current == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (current.avatarUrl != null) AsyncImage(model = current.avatarUrl, contentDescription = "${current.username} 的头像", modifier = Modifier.size(72.dp).clip(CircleShape)) else Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(72.dp)) { Box(contentAlignment = Alignment.Center) { Text(current.username.take(1), style = MaterialTheme.typography.headlineMedium) } }
                Text(current.username, style = MaterialTheme.typography.headlineSmall)
                Text(current.bio ?: "这个用户还没有简介", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${current.postCount} 主题 · ${current.replyCount} 回复", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable private fun CenterRetry(modifier:Modifier,text:String,retry:()->Unit={})=Column(modifier,verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){Text(text);TextButton(onClick=retry){Text("重试")}}
