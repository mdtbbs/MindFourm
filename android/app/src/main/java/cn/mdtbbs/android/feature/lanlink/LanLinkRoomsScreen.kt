package cn.mdtbbs.android.feature.lanlink

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.core.network.LanLinkRoomDto
import cn.mdtbbs.android.core.network.MdtBbsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LanLinkRoomsUiState(
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val rooms: List<LanLinkRoomDto> = emptyList(),
    val error: Boolean = false,
)

@HiltViewModel
class LanLinkRoomsViewModel @Inject constructor(private val api: MdtBbsApi) : ViewModel() {
    private val mutableState = MutableStateFlow(LanLinkRoomsUiState())
    val state: StateFlow<LanLinkRoomsUiState> = mutableState.asStateFlow()

    fun load(refresh: Boolean = false) {
        if (mutableState.value.loading || mutableState.value.refreshing) return
        val before = mutableState.value
        mutableState.value = if (refresh) before.copy(refreshing = true, error = false) else LanLinkRoomsUiState(loading = true)
        viewModelScope.launch {
            runCatching { api.lanLinkRooms().data.rooms }
                .onSuccess { rooms -> mutableState.value = LanLinkRoomsUiState(rooms = rooms) }
                .onFailure { mutableState.value = if (refresh) before.copy(error = true) else LanLinkRoomsUiState(loading = false, error = true) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanLinkRoomsRoute(onBack: () -> Unit, viewModel: LanLinkRoomsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    androidx.compose.runtime.LaunchedEffect(Unit) {
        viewModel.load()
        while (true) {
            delay(15_000)
            viewModel.load(refresh = true)
        }
    }
    Scaffold(topBar = {
        TopAppBar(
            title = { Column { Text("联机大厅"); Text("公开房间 · 每 15 秒刷新", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "返回") } },
            actions = { IconButton(onClick = { viewModel.load(refresh = true) }, enabled = !state.loading && !state.refreshing) { Icon(Icons.Outlined.Refresh, "刷新房间") } },
        )
    }) { padding ->
        when {
            state.loading -> CenterMessage(Modifier.fillMaxSize().padding(padding)) { CircularProgressIndicator() }
            state.error && state.rooms.isEmpty() -> EmptyRooms(
                modifier = Modifier.fillMaxSize().padding(padding),
                title = "联机大厅暂时不可用",
                detail = "请检查网络后重试。",
                action = "重新加载",
                onAction = { viewModel.load() },
            )
            state.rooms.isEmpty() -> EmptyRooms(
                modifier = Modifier.fillMaxSize().padding(padding),
                title = "暂无公开房间",
                detail = "房主开启公开可见后，房间会显示在这里。",
                action = "刷新",
                onAction = { viewModel.load(refresh = true) },
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { Text("${state.rooms.size} 个公开房间", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp, top = 12.dp)) }
                if (state.error) item { Text("刷新失败，显示上次加载的房间。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp)) }
                items(state.rooms, key = { it.code }) { room -> RoomCard(room, Modifier.padding(horizontal = 12.dp)) }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
}

@Composable
private fun RoomCard(room: LanLinkRoomDto, modifier: Modifier = Modifier) {
    val title = room.name.ifBlank { room.displayName }.ifBlank { "未命名房间" }
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, tonalElevation = 1.dp) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.width(42.dp).height(42.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Forum, null, tint = MaterialTheme.colorScheme.primary) }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("房主：${room.owner.displayName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.tertiaryContainer) {
                    Text("公开", color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
                }
            }
            Spacer(Modifier.height(14.dp))
            Text("房间码", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(room.code, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("节点：${room.node.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun EmptyRooms(modifier: Modifier, title: String, detail: String, action: String, onAction: () -> Unit) = Column(
    modifier = modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
) {
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.width(64.dp).height(64.dp)) { Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Forum, null, tint = MaterialTheme.colorScheme.primary) } }
    Spacer(Modifier.height(16.dp)); Text(title, style = MaterialTheme.typography.titleLarge); Spacer(Modifier.height(6.dp)); Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
    Button(onClick = onAction, modifier = Modifier.padding(top = 18.dp)) { Text(action) }
}

@Composable
private fun CenterMessage(modifier: Modifier, content: @Composable () -> Unit) = Box(modifier, contentAlignment = Alignment.Center) { content() }
