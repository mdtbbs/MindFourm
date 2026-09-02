package cn.mdtbbs.android
import android.app.Application
import cn.mdtbbs.android.core.auth.AuthRepository
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class MdtBbsApplication : Application() {
    @Inject lateinit var authRepository: AuthRepository

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        // Restore once for the process. Without this, AuthState remains
        // Restoring forever and the anonymous profile/login entry is blank.
        applicationScope.launch { authRepository.restoreSession() }
    }
}
