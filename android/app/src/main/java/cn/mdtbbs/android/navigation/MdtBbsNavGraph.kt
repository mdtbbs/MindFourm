package cn.mdtbbs.android.navigation

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import cn.mdtbbs.android.feature.post.ThreadDetailRoute
import cn.mdtbbs.android.feature.home.HomeRoute
import cn.mdtbbs.android.feature.category.CategoryRoute
import cn.mdtbbs.android.feature.category.CategoryThreadRoute
import cn.mdtbbs.android.feature.search.SearchRoute
import cn.mdtbbs.android.feature.profile.ProfileRoute
import cn.mdtbbs.android.feature.auth.LoginRoute
import cn.mdtbbs.android.feature.post.ThreadComposerRoute
import cn.mdtbbs.android.feature.notification.NotificationsRoute

object MdtBbsDestination {
    const val HOME = "home"
    const val CATEGORIES = "categories"
    const val SEARCH = "search"
    const val PROFILE = "profile"
    const val CATEGORY_THREADS_PATTERN = "category/{categoryId}"
    const val THREAD_PATTERN = "thread/{threadId}"
    const val LOGIN_PATTERN = "login?destination={destination}"
    const val REGISTER = "register"
    const val PHONE_VERIFY = "phone-verify"
    const val COMPOSE_THREAD = "compose-thread"
    const val NOTIFICATIONS = "notifications"

    fun thread(id: String) = "thread/${Uri.encode(id)}"
    fun categoryThreads(id: String) = "category/${Uri.encode(id)}"
    fun login(destination: String? = null) = "login?destination=${Uri.encode(destination.orEmpty())}"
}

/**
 * One graph owns navigation state. Feature routes get navigation callbacks and
 * never build or parse route strings themselves.
 */
@Composable
fun MdtBbsNavHost(
    navController: NavHostController = rememberNavController(),
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    Scaffold(bottomBar = {
        NavigationBar {
            listOf(MdtBbsDestination.HOME to "首页", MdtBbsDestination.CATEGORIES to "分类", MdtBbsDestination.SEARCH to "搜索", MdtBbsDestination.PROFILE to "我的").forEach { (route, label) ->
                NavigationBarItem(
                    selected = backStackEntry?.destination?.route == route,
                    onClick = { navController.navigate(route) { launchSingleTop = true; restoreState = true; popUpTo(MdtBbsDestination.HOME) { saveState = true } } },
                    icon = { Text(label.take(1)) }, label = { Text(label) },
                )
            }
        }
    }, floatingActionButton = {
        if (backStackEntry?.destination?.route == MdtBbsDestination.HOME) {
            FloatingActionButton(onClick = { navController.navigate(MdtBbsDestination.COMPOSE_THREAD) }) { Text("发帖") }
        }
    }) { padding ->
        NavHost(navController = navController, startDestination = MdtBbsDestination.HOME, modifier = Modifier.padding(padding)) {
            composable(MdtBbsDestination.HOME) { HomeRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.CATEGORIES) { CategoryRoute(onCategoryClick = { id -> navController.navigate(MdtBbsDestination.categoryThreads(id)) }) }
            composable(MdtBbsDestination.CATEGORY_THREADS_PATTERN) { CategoryThreadRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.SEARCH) { SearchRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.PROFILE) { ProfileRoute(onLogin = { navController.navigate(MdtBbsDestination.login("profile")) }, onVerifyPhone = { navController.navigate(MdtBbsDestination.PHONE_VERIFY) }, onNotifications = { navController.navigate(MdtBbsDestination.NOTIFICATIONS) }) }
            composable(MdtBbsDestination.NOTIFICATIONS) { NotificationsRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.NOTIFICATIONS)) }, onThread = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.LOGIN_PATTERN) { entry -> LoginRoute(entry.arguments?.getString("destination")?.ifBlank { null }, onComplete = { destination ->
                navController.popBackStack(); destination?.takeIf { it.startsWith("thread/") }?.removePrefix("thread/")?.let { navController.navigate(MdtBbsDestination.thread(it)) }
            }, onRegister = { navController.navigate(MdtBbsDestination.REGISTER) }, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.REGISTER) { cn.mdtbbs.android.feature.auth.RegisterRoute(onComplete = { navController.popBackStack(MdtBbsDestination.HOME, false) }, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.PHONE_VERIFY) { cn.mdtbbs.android.feature.auth.PhoneVerifyRoute(onComplete = { navController.popBackStack() }) }
            composable(MdtBbsDestination.COMPOSE_THREAD) { ThreadComposerRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.COMPOSE_THREAD)) }, onCreated = { id, status ->
                if (status == "published") navController.navigate(MdtBbsDestination.thread(id.toString())) { popUpTo(MdtBbsDestination.HOME) }
                else navController.popBackStack(MdtBbsDestination.HOME, false)
            }) }
            composable(MdtBbsDestination.THREAD_PATTERN) { ThreadDetailRoute(onBack = { navController.popBackStack() }, onLogin = { id -> navController.navigate(MdtBbsDestination.login("thread/$id")) }) }
        }
    }
}
