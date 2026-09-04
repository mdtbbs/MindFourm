package cn.mdtbbs.android
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import cn.mdtbbs.android.navigation.MdtBbsNavHost
import cn.mdtbbs.android.feature.settings.AppGate
import cn.mdtbbs.android.ui.theme.MdtBbsTheme
import cn.mdtbbs.android.core.auth.AuthCoordinator
import dagger.hilt.android.AndroidEntryPoint
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var authCoordinator: AuthCoordinator
    override fun onCreate(state: Bundle?) { super.onCreate(state); handOffAuthIntent(intent); setContent { MdtBbsApp() } }
    override fun onNewIntent(intent: android.content.Intent) { super.onNewIntent(intent); setIntent(intent); handOffAuthIntent(intent) }
    private fun handOffAuthIntent(intent: android.content.Intent?) { lifecycleScope.launch { authCoordinator.handleIntent(intent) } }
}
@Composable private fun MdtBbsApp() { MdtBbsTheme { Surface(color = MaterialTheme.colorScheme.background) { AppGate(content = { MdtBbsNavHost() }) } } }
