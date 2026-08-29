package cn.mdtbbs.android
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import cn.mdtbbs.android.navigation.MdtBbsNavHost
import cn.mdtbbs.android.feature.settings.AppGate
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() { override fun onCreate(state: Bundle?) { super.onCreate(state); setContent { MdtBbsApp() } } }
@Composable private fun MdtBbsApp() { MaterialTheme { Surface { AppGate(content = { MdtBbsNavHost() }) } } }
