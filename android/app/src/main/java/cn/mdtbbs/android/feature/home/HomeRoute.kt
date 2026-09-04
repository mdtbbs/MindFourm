package cn.mdtbbs.android.feature.home

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun HomeRoute(
    onThreadClick: (String) -> Unit,
    onNotifications: () -> Unit,
    onLanLinkRooms: () -> Unit,
    onResources: () -> Unit,
    onNotices: () -> Unit,
    onFeedback: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    HomeScreen(
        threads = viewModel.threads,
        onThreadClick = onThreadClick,
        onNotifications = onNotifications,
        onLanLinkRooms = onLanLinkRooms,
        onResources = onResources,
        onNotices = onNotices,
        onFeedback = onFeedback,
    )
}
