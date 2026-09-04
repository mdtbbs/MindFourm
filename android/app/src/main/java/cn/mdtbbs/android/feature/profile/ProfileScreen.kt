package cn.mdtbbs.android.feature.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.auth.AuthState
import cn.mdtbbs.android.core.network.MdtBbsApi
import cn.mdtbbs.android.core.network.MeDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(private val auth: AuthRepository, private val api: MdtBbsApi) : ViewModel() {
    private val mutableMe = MutableStateFlow<MeDto?>(null)
    val me = mutableMe.asStateFlow()
    val state = auth.state
    fun load() = viewModelScope.launch { if (auth.state.value is AuthState.Authenticated) mutableMe.value = runCatching { api.me().data }.getOrNull() }
    fun logout() = viewModelScope.launch { auth.logout(); mutableMe.value = null }
}

@Composable fun ProfileRoute(onLogin: () -> Unit, onVerifyPhone: () -> Unit = {}, onNotifications: () -> Unit = {}, onBookmarks: () -> Unit = {}, onSettings: () -> Unit = {}, onFeedback: () -> Unit = {}, viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState(); val me by viewModel.me.collectAsState()
    LaunchedEffect(state) { if (state is AuthState.Authenticated) viewModel.load() }
    Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        when (state) {
            is AuthState.Authenticated -> ProfileContent(me, onNotifications, onBookmarks, onVerifyPhone, onSettings, onFeedback, viewModel::logout)
            AuthState.Restoring -> CircularProgressIndicator()
            else -> SignedOutProfile(onLogin)
        }
    }
}

@Composable
private fun ProfileContent(me: MeDto?, onNotifications: () -> Unit, onBookmarks: () -> Unit, onVerifyPhone: () -> Unit, onSettings: () -> Unit, onFeedback: () -> Unit, onLogout: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(58.dp)) {
                Box(contentAlignment = Alignment.Center) { Text(me?.username?.take(1)?.uppercase() ?: "·", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.headlineSmall) }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(me?.username ?: "正在加载资料", style = MaterialTheme.typography.titleLarge)
                Text(if (me?.phoneVerified == true) "已验证社区成员" else "完善资料，解锁发帖与回复", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = .72f), modifier = Modifier.padding(top = 3.dp))
            }
        }
    }
    me?.bio?.takeIf { it.isNotBlank() }?.let { Text(it, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    ProfileActionCard("通知", "查看回复、提及和系统消息", Icons.Outlined.NotificationsNone, onNotifications)
    ProfileActionCard("我的收藏", "快速回到保存过的主题", Icons.Outlined.BookmarkBorder, onBookmarks)
    ProfileActionCard("账号设置", "修改昵称、简介和头像", Icons.Outlined.AccountCircle, onSettings)
    ProfileActionCard("意见反馈", "向社区提交建议或问题", Icons.Outlined.NotificationsNone, onFeedback)
    if (me?.phoneVerified == false) ProfileActionCard("验证手机号", "验证后可发布主题和回复", Icons.Outlined.Phone, onVerifyPhone)
    TextButton(onClick = onLogout) { Icon(Icons.AutoMirrored.Outlined.Logout, null); Spacer(Modifier.width(6.dp)); Text("退出当前账号") }
}

@Composable
private fun ProfileActionCard(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) = Surface(
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(16.dp),
    color = MaterialTheme.colorScheme.surface,
    tonalElevation = 1.dp,
    onClick = onClick,
) {
    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.size(42.dp)) { Box(contentAlignment = Alignment.Center) { Icon(icon, null, tint = MaterialTheme.colorScheme.secondary) } }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp)) }
        Text("›", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SignedOutProfile(onLogin: () -> Unit) {
    Spacer(Modifier.height(54.dp))
    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(88.dp)) { Box(contentAlignment = Alignment.Center) { Text("M", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary) } }
    Text("登录你的社区身份", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 14.dp))
    Text("同步收藏、通知和创作记录。", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = onLogin, modifier = Modifier.padding(top = 8.dp)) { Text("登录 / 注册") }
}
