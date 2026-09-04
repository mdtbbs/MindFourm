package cn.mdtbbs.android.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import cn.mdtbbs.android.core.auth.AuthRepository
import cn.mdtbbs.android.core.network.MdtBbsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel class PhoneVerifyViewModel @Inject constructor(private val auth: AuthRepository, private val api: MdtBbsApi) : ViewModel() {
    var message by mutableStateOf<String?>(null); var loading by mutableStateOf(false)
    fun send(phone: String) = viewModelScope.launch { loading = true; runCatching { auth.sendPhoneVerificationSms(phone) }.onSuccess { message = "验证码已发送" }.onFailure { message = "发送失败，请稍后重试" }; loading = false }
    fun verify(code: String, complete: () -> Unit) = viewModelScope.launch { loading = true; runCatching { auth.verifyPhone(code); api.me() }.onSuccess { complete() }.onFailure { message = "验证码错误或已过期" }; loading = false }
}

@Composable fun PhoneVerifyRoute(onComplete: () -> Unit, viewModel: PhoneVerifyViewModel = hiltViewModel()) {
    var phone by rememberSaveable { mutableStateOf("") }; var code by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) { Text("验证手机号", style = MaterialTheme.typography.headlineSmall); viewModel.message?.let { Text(it) }; OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("手机号") }); OutlinedTextField(code, { code = it }, Modifier.fillMaxWidth(), label = { Text("验证码") }); Button({ viewModel.send(phone) }, enabled = !viewModel.loading && phone.isNotBlank()) { Text("获取验证码") }; Button({ viewModel.verify(code, onComplete) }, enabled = !viewModel.loading && code.isNotBlank()) { Text("确认验证") } }
}
