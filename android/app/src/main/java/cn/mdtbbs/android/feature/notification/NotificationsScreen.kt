package cn.mdtbbs.android.feature.notification

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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.NotificationDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

data class NotificationsUiState(val loading: Boolean = true, val items: List<NotificationDto> = emptyList(), val error: Boolean = false)

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val api: MdtBbsApi, private val auth: AuthRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = mutableState.asStateFlow()
    val authenticated get() = auth.state.value is AuthState.Authenticated
    fun load() = viewModelScope.launch {
        if (!authenticated) { mutableState.value = NotificationsUiState(loading = false); return@launch }
        mutableState.value = mutableState.value.copy(loading = true, error = false)
        runCatching { api.notifications().data.items }.onSuccess { mutableState.value = NotificationsUiState(loading = false, items = it) }
            .onFailure { mutableState.value = NotificationsUiState(loading = false, error = true) }
    }
    fun open(item: NotificationDto, onThread: (String) -> Unit) = viewModelScope.launch {
        if (!item.isRead) runCatching { api.markNotificationRead(item.id) }
        mutableState.value = mutableState.value.copy(items = mutableState.value.items.map { if (it.id == item.id) it.copy(isRead = true) else it })
        item.postId?.let { onThread(it.toString()) }
    }
    fun markAllRead() = viewModelScope.launch {
        runCatching { api.markAllNotificationsRead() }.onSuccess { mutableState.value = mutableState.value.copy(items = mutableState.value.items.map { it.copy(isRead = true) }) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsRoute(onBack: () -> Unit, onLogin: () -> Unit, onThread: (String) -> Unit, viewModel: NotificationsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }
    Scaffold(topBar = { TopAppBar(title = { Text("通知") }, navigationIcon = { TextButton(onClick = onBack) { Text("返回") } }, actions = { if (viewModel.authenticated) TextButton(onClick = viewModel::markAllRead) { Text("全部已读") } }) }) { padding ->
        when {
            !viewModel.authenticated -> Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { Text("登录后查看通知"); Button(onClick = onLogin) { Text("去登录") } }
            state.loading -> Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            state.error -> Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { Text("通知加载失败"); Button(onClick = viewModel::load) { Text("重试") } }
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) { items(state.items, key = { it.id }) { item -> Column(Modifier.fillMaxWidth().clickable { viewModel.open(item, onThread) }.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(item.actorName?.let { "$it ${item.type}" } ?: item.type, style = MaterialTheme.typography.titleSmall); Text(item.postTitle ?: item.content.orEmpty(), style = MaterialTheme.typography.bodyMedium); Text(Instant.parse(item.createdAt).toString(), style = MaterialTheme.typography.labelSmall); if (!item.isRead) Text("未读", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall) } } }
        }
    }
}
