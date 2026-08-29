package cn.mdtbbs.android.feature.home

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun HomeRoute(
    onThreadClick: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    HomeScreen(
        threads = viewModel.threads,
        onThreadClick = onThreadClick,
    )
}
