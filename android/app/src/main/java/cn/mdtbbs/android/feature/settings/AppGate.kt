package cn.mdtbbs.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cn.mdtbbs.android.BuildConfig
import cn.mdtbbs.android.core.model.ClientConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AppGateState {
    data object Loading : AppGateState
    data class Ready(val config: ClientConfig) : AppGateState
    data object Maintenance : AppGateState
    data object UpdateRequired : AppGateState
    data class Error(val error: Throwable) : AppGateState
}

@HiltViewModel
class AppGateViewModel @Inject constructor(private val repository: ClientConfigRepository) : ViewModel() {
    private val mutableState = MutableStateFlow<AppGateState>(AppGateState.Loading)
    val state: StateFlow<AppGateState> = mutableState
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        mutableState.value = AppGateState.Loading
        mutableState.value = runCatching { repository.load() }.fold({ config ->
            when {
                config.maintenance -> AppGateState.Maintenance
                config.forceUpdate && BuildConfig.VERSION_CODE < config.minimumVersionCode -> AppGateState.UpdateRequired
                else -> AppGateState.Ready(config)
            }
        }, { AppGateState.Error(it) })
    }
}

@Composable
fun AppGate(content: @Composable () -> Unit, viewModel: AppGateViewModel = androidx.hilt.navigation.compose.hiltViewModel()) {
    when (viewModel.state.collectAsState().value) {
        is AppGateState.Ready -> content()
        AppGateState.Loading -> GateMessage("正在检查服务状态…", true)
        AppGateState.Maintenance -> GateMessage("论坛正在维护中，请稍后再试")
        AppGateState.UpdateRequired -> GateMessage("此版本已不再受支持，请更新客户端")
        is AppGateState.Error -> GateMessage("暂时无法获取服务配置", retry = viewModel::refresh)
    }
}

@Composable
private fun GateMessage(text: String, loading: Boolean = false, retry: (() -> Unit)? = null) = Column(
    modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
) { if (loading) CircularProgressIndicator(); Text(text, style = MaterialTheme.typography.titleMedium); if (retry != null) Button(onClick = retry) { Text("重试") } }
