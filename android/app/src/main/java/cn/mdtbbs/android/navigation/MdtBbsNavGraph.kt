package cn.mdtbbs.android.navigation

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import cn.mdtbbs.android.feature.post.ThreadDetailRoute
import cn.mdtbbs.android.feature.home.HomeRoute
import cn.mdtbbs.android.feature.category.CategoryRoute
import cn.mdtbbs.android.feature.category.CategoryThreadRoute
import cn.mdtbbs.android.feature.search.SearchRoute

object MdtBbsDestination {
    const val HOME = "home"
    const val CATEGORIES = "categories"
    const val SEARCH = "search"
    const val CATEGORY_THREADS_PATTERN = "category/{categoryId}"
    const val THREAD_PATTERN = "thread/{threadId}"

    fun thread(id: String) = "thread/${Uri.encode(id)}"
    fun categoryThreads(id: String) = "category/${Uri.encode(id)}"
}

/**
 * One graph owns navigation state. Feature routes get navigation callbacks and
 * never build or parse route strings themselves.
 */
@Composable
fun MdtBbsNavHost(
    navController: NavHostController = rememberNavController(),
) {
    Scaffold(bottomBar = {
        NavigationBar {
            listOf(MdtBbsDestination.HOME to "首页", MdtBbsDestination.CATEGORIES to "分类", MdtBbsDestination.SEARCH to "搜索").forEach { (route, label) ->
                NavigationBarItem(
                    selected = navController.currentBackStackEntry?.destination?.route == route,
                    onClick = { navController.navigate(route) { launchSingleTop = true; restoreState = true; popUpTo(MdtBbsDestination.HOME) { saveState = true } } },
                    icon = { Text(label.take(1)) }, label = { Text(label) },
                )
            }
        }
    }) { padding ->
        NavHost(navController = navController, startDestination = MdtBbsDestination.HOME, modifier = Modifier.padding(padding)) {
            composable(MdtBbsDestination.HOME) { HomeRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.CATEGORIES) { CategoryRoute(onCategoryClick = { id -> navController.navigate(MdtBbsDestination.categoryThreads(id)) }) }
            composable(MdtBbsDestination.CATEGORY_THREADS_PATTERN) { CategoryThreadRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.SEARCH) { SearchRoute(onThreadClick = { id -> navController.navigate(MdtBbsDestination.thread(id)) }) }
            composable(MdtBbsDestination.THREAD_PATTERN) { ThreadDetailRoute(onBack = { navController.popBackStack() }) }
        }
    }
}
