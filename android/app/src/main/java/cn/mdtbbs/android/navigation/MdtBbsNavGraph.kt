package cn.mdtbbs.android.navigation

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Search
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
import cn.mdtbbs.android.feature.bookmark.BookmarksRoute
import cn.mdtbbs.android.feature.lanlink.LanLinkRoomsRoute
import cn.mdtbbs.android.feature.community.ResourcesRoute
import cn.mdtbbs.android.feature.community.ResourceDetailRoute
import cn.mdtbbs.android.feature.community.NoticesRoute
import cn.mdtbbs.android.feature.community.NoticeDetailRoute
import cn.mdtbbs.android.feature.community.FeedbackRoute
import cn.mdtbbs.android.feature.community.ProfileSettingsRoute
import cn.mdtbbs.android.feature.community.PublicUserRoute

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
    const val BOOKMARKS = "bookmarks"
    const val LANLINK_ROOMS = "lanlink-rooms"
    const val RESOURCES = "resources"
    const val RESOURCE_PATTERN = "resource/{resourceId}"
    const val NOTICES = "notices"
    const val NOTICE_PATTERN = "notice/{noticeId}"
    const val PROFILE_SETTINGS = "profile-settings"
    const val PUBLIC_USER_PATTERN = "user/{userId}"
    const val FEEDBACK = "feedback"

    fun thread(id: String) = "thread/${Uri.encode(id)}"
    fun categoryThreads(id: String) = "category/${Uri.encode(id)}"
    fun login(destination: String? = null) = "login?destination=${Uri.encode(destination.orEmpty())}"
    fun resource(id: Long) = "resource/$id"
    fun notice(id: String) = "notice/${Uri.encode(id)}"
    fun publicUser(id: Long) = "user/$id"
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
            listOf(
                NavigationItem(MdtBbsDestination.HOME, "首页", Icons.Outlined.Home),
                NavigationItem(MdtBbsDestination.CATEGORIES, "分类", Icons.Outlined.GridView),
                NavigationItem(MdtBbsDestination.SEARCH, "搜索", Icons.Outlined.Search),
                NavigationItem(MdtBbsDestination.PROFILE, "我的", Icons.Outlined.AccountCircle),
            ).forEach { item ->
                NavigationBarItem(
                    selected = backStackEntry?.destination?.route == item.route,
                    onClick = { navController.navigate(item.route) { launchSingleTop = true; restoreState = true; popUpTo(MdtBbsDestination.HOME) { saveState = true } } },
                    icon = { Icon(item.icon, contentDescription = item.label) }, label = { Text(item.label) },
                )
            }
        }
    }, floatingActionButton = {
        if (backStackEntry?.destination?.route == MdtBbsDestination.HOME) {
            FloatingActionButton(onClick = { navController.navigate(MdtBbsDestination.COMPOSE_THREAD) }) { Icon(Icons.Outlined.Add, contentDescription = "发布主题") }
        }
    }) { padding ->
        NavHost(navController = navController, startDestination = MdtBbsDestination.HOME, modifier = Modifier.padding(padding)) {
            composable(MdtBbsDestination.HOME) { HomeRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }, onNotifications = { navController.navigate(MdtBbsDestination.NOTIFICATIONS) }, onLanLinkRooms = { navController.navigate(MdtBbsDestination.LANLINK_ROOMS) }, onResources = { navController.navigate(MdtBbsDestination.RESOURCES) }, onNotices = { navController.navigate(MdtBbsDestination.NOTICES) }, onFeedback = { navController.navigate(MdtBbsDestination.FEEDBACK) }) }
            composable(MdtBbsDestination.CATEGORIES) { CategoryRoute(onCategoryClick = { id -> navController.navigate(MdtBbsDestination.categoryThreads(id)) }) }
            composable(MdtBbsDestination.CATEGORY_THREADS_PATTERN) { CategoryThreadRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.SEARCH) { SearchRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.PROFILE) { ProfileRoute(onLogin = { navController.navigate(MdtBbsDestination.login("profile")) }, onVerifyPhone = { navController.navigate(MdtBbsDestination.PHONE_VERIFY) }, onNotifications = { navController.navigate(MdtBbsDestination.NOTIFICATIONS) }, onBookmarks = { navController.navigate(MdtBbsDestination.BOOKMARKS) }, onSettings = { navController.navigate(MdtBbsDestination.PROFILE_SETTINGS) }, onFeedback = { navController.navigate(MdtBbsDestination.FEEDBACK) }) }
            composable(MdtBbsDestination.NOTIFICATIONS) { NotificationsRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.NOTIFICATIONS)) }, onThread = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.BOOKMARKS) { BookmarksRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.BOOKMARKS)) }, onThread = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.LANLINK_ROOMS) { LanLinkRoomsRoute(onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.RESOURCES) { ResourcesRoute(onBack = { navController.popBackStack() }, onResource = { navController.navigate(MdtBbsDestination.resource(it)) }) }
            composable(MdtBbsDestination.RESOURCE_PATTERN) { entry -> ResourceDetailRoute(entry.arguments?.getString("resourceId")?.toLongOrNull() ?: return@composable, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.NOTICES) { NoticesRoute(onBack = { navController.popBackStack() }, onNotice = { navController.navigate(MdtBbsDestination.notice(it)) }) }
            composable(MdtBbsDestination.NOTICE_PATTERN) { entry -> NoticeDetailRoute(entry.arguments?.getString("noticeId") ?: return@composable, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.PROFILE_SETTINGS) { ProfileSettingsRoute(onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.PUBLIC_USER_PATTERN) { entry -> PublicUserRoute(entry.arguments?.getString("userId")?.toLongOrNull() ?: return@composable, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.FEEDBACK) { FeedbackRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.FEEDBACK)) }) }
            composable(MdtBbsDestination.LOGIN_PATTERN) { entry -> LoginRoute(entry.arguments?.getString("destination")?.ifBlank { null }, onComplete = { destination ->
                navController.popBackStack(); when {
                    destination?.startsWith("thread/") == true -> destination.removePrefix("thread/").let { navController.navigate(MdtBbsDestination.thread(it)) }
                    destination == MdtBbsDestination.FEEDBACK -> navController.navigate(MdtBbsDestination.FEEDBACK)
                }
            }, onRegister = { navController.navigate(MdtBbsDestination.REGISTER) }, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.REGISTER) { cn.mdtbbs.android.feature.auth.RegisterRoute(onComplete = { navController.popBackStack(MdtBbsDestination.HOME, false) }, onBack = { navController.popBackStack() }) }
            composable(MdtBbsDestination.PHONE_VERIFY) { cn.mdtbbs.android.feature.auth.PhoneVerifyRoute(onComplete = { navController.popBackStack() }) }
            composable(MdtBbsDestination.COMPOSE_THREAD) { ThreadComposerRoute(onBack = { navController.popBackStack() }, onLogin = { navController.navigate(MdtBbsDestination.login(MdtBbsDestination.COMPOSE_THREAD)) }, onCreated = { id, status ->
                if (status == "published") navController.navigate(MdtBbsDestination.thread(id.toString())) { popUpTo(MdtBbsDestination.HOME) }
                else navController.popBackStack(MdtBbsDestination.HOME, false)
            }) }
            composable(MdtBbsDestination.THREAD_PATTERN) { ThreadDetailRoute(onBack = { navController.popBackStack() }, onLogin = { id -> navController.navigate(MdtBbsDestination.login("thread/$id")) }, onPublicUser = { id -> navController.navigate(MdtBbsDestination.publicUser(id)) }) }
        }
    }
}

private data class NavigationItem(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)
