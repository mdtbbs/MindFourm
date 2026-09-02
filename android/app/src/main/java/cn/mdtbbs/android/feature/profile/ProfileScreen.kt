package cn.mdtbbs.android.feature.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
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

@Composable fun ProfileRoute(onLogin: () -> Unit, onVerifyPhone: () -> Unit = {}, onNotifications: () -> Unit = {}, viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState(); val me by viewModel.me.collectAsState()
    LaunchedEffect(state) { if (state is AuthState.Authenticated) viewModel.load() }
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        when (state) {
            is AuthState.Authenticated -> { Text(me?.username ?: "正在加载资料", style = MaterialTheme.typography.headlineSmall); me?.bio?.let { Text(it) }; Button(onClick = onNotifications) { Text("通知") }; if (me?.phoneVerified == false) Button(onClick = onVerifyPhone) { Text("验证手机号") }; Button(onClick = viewModel::logout) { Text("退出登录") } }
            AuthState.Restoring -> CircularProgressIndicator()
            else -> { Text("登录后查看我的资料"); Button(onClick = onLogin) { Text("登录") } }
        }
    }
}
