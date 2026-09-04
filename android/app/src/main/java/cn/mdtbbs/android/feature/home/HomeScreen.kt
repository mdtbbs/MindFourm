package cn.mdtbbs.android.feature.home

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.paging.LoadState
import androidx.paging.PagingData
import androidx.paging.compose.LazyPagingItems
import androidx.paging.compose.collectAsLazyPagingItems
import cn.mdtbbs.android.core.model.ThreadSummary
import cn.mdtbbs.android.ui.theme.MdtLime
import kotlinx.coroutines.flow.Flow
import java.time.Duration
import java.time.Instant

private val MdtBlue = Color(0xFF2476C9)

@Composable
fun HomeScreen(
    threads: Flow<PagingData<ThreadSummary>>,
    onThreadClick: (String) -> Unit,
    onNotifications: () -> Unit = {},
    onLanLinkRooms: () -> Unit = {},
    onResources: () -> Unit = {},
    onNotices: () -> Unit = {},
    onFeedback: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val items = threads.collectAsLazyPagingItems()
    Surface(modifier = modifier.fillMaxSize()) {
        HomeThreadList(items = items, onThreadClick = onThreadClick, onNotifications = onNotifications, onLanLinkRooms = onLanLinkRooms, onResources = onResources, onNotices = onNotices, onFeedback = onFeedback)
    }
}

@Composable
fun HomeThreadList(
    items: LazyPagingItems<ThreadSummary>,
    onThreadClick: (String) -> Unit,
    onNotifications: () -> Unit,
    onLanLinkRooms: () -> Unit,
    onResources: () -> Unit,
    onNotices: () -> Unit,
    onFeedback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val refresh = items.loadState.refresh
    when {
        refresh is LoadState.Loading && items.itemCount == 0 -> HomeSkeleton(modifier, onNotifications, onLanLinkRooms, onResources, onNotices, onFeedback)
        refresh is LoadState.Error && items.itemCount == 0 -> HomeMessage(
            title = "主题加载失败",
            message = "请检查网络后重试",
            action = "重试",
            onAction = items::retry,
            modifier = modifier,
        )
        refresh is LoadState.NotLoading && items.itemCount == 0 -> HomeEmptyFeed(modifier = modifier, onRefresh = items::refresh, onNotifications = onNotifications, onLanLinkRooms = onLanLinkRooms, onResources = onResources, onNotices = onNotices, onFeedback = onFeedback)
        else -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(key = "home-title") { HomeHeader(onNotifications, onLanLinkRooms, onResources, onNotices, onFeedback) }
            items(count = items.itemCount, key = { index -> items[index]?.id ?: "placeholder-$index" }) { index ->
                items[index]?.let { thread ->
                    ThreadCard(thread = thread, onClick = { onThreadClick(thread.id) })
                }
            }
            when (val append = items.loadState.append) {
                is LoadState.Loading -> item(key = "append-loading") { AppendLoading() }
                is LoadState.Error -> item(key = "append-error") {
                    AppendError(onRetry = items::retry)
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun HomeHeader(onNotifications: () -> Unit, onLanLinkRooms: () -> Unit, onResources: () -> Unit, onNotices: () -> Unit, onFeedback: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp)) {
                Box(contentAlignment = Alignment.Center) { Text("M", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.titleLarge) }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("MDT BBS", style = MaterialTheme.typography.titleMedium)
                Text("Mindustry 社区", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onNotifications) {
                Icon(Icons.Outlined.NotificationsNone, contentDescription = "通知", tint = MaterialTheme.colorScheme.onSurface)
            }
        }
        Row(modifier = Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).background(MdtLime, RoundedCornerShape(2.dp)))
            Spacer(Modifier.width(7.dp))
            Text("最新讨论", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.width(8.dp))
            Text("此刻社区正在发生什么", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(modifier = Modifier.padding(top = 4.dp)) {
            TextButton(onClick = onResources) { Text("资源中心") }
            TextButton(onClick = onNotices) { Text("公告") }
            TextButton(onClick = onLanLinkRooms) { Text("联机大厅") }
            TextButton(onClick = onFeedback) { Text("反馈") }
        }
    }
}

@Composable
fun ThreadCard(thread: ThreadSummary, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        tonalElevation = 1.dp,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = thread.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            thread.excerpt?.takeIf(String::isNotBlank)?.let { excerpt ->
                Spacer(Modifier.height(6.dp))
                Text(
                    text = excerpt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(MdtBlue.copy(alpha = .16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(thread.author.name.take(1).uppercase(), color = MdtBlue, style = MaterialTheme.typography.labelSmall)
                }
                Spacer(Modifier.width(7.dp))
                Text(thread.author.name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(7.dp))
                Text(relativeTime(thread.updatedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            thread.category?.let { category ->
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AssistChip(
                        onClick = {},
                        label = { Text(category.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        colors = AssistChipDefaults.assistChipColors(labelColor = MdtBlue),
                        border = null,
                    )
                    thread.tags.take(2).forEach { tag ->
                        Text("#${tag.name}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 7.dp))
                    }
                }
            }
            HorizontalDivider(modifier = Modifier.padding(top = 10.dp, bottom = 7.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
            Text(
                text = "${thread.replyCount} 回复  ·  ${thread.viewCount} 浏览",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun HomeSkeleton(modifier: Modifier, onNotifications: () -> Unit, onLanLinkRooms: () -> Unit, onResources: () -> Unit, onNotices: () -> Unit, onFeedback: () -> Unit) {
    val alpha by animateFloatAsState(
        targetValue = .55f,
        animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
        label = "skeleton",
    )
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { HomeHeader(onNotifications, onLanLinkRooms, onResources, onNotices, onFeedback) }
        items(5) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .height(148.dp)
                    .alpha(alpha)
                    .background(MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(14.dp)),
            ) {}
        }
    }
}

@Composable
private fun HomeMessage(title: String, message: String, action: String? = null, onAction: (() -> Unit)? = null, modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (action != null && onAction != null) TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
private fun HomeEmptyFeed(modifier: Modifier, onRefresh: () -> Unit, onNotifications: () -> Unit, onLanLinkRooms: () -> Unit, onResources: () -> Unit, onNotices: () -> Unit, onFeedback: () -> Unit) = LazyColumn(
    modifier = modifier.fillMaxSize(),
    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    item { HomeHeader(onNotifications, onLanLinkRooms, onResources, onNotices, onFeedback) }
    item {
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(20.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .45f)),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 34.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(18.dp), modifier = Modifier.size(58.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Forum, null, tint = MaterialTheme.colorScheme.secondary) }
                }
                Spacer(Modifier.height(16.dp))
                Text("这里还没有主题", style = MaterialTheme.typography.titleLarge)
                Text("先逛逛分类，或者成为第一个发起讨论的人。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                TextButton(onClick = onRefresh, modifier = Modifier.padding(top = 10.dp)) { Icon(Icons.Outlined.Refresh, null); Spacer(Modifier.width(4.dp)); Text("刷新内容") }
            }
        }
    }
}

@Composable
private fun AppendLoading() = Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp) }

@Composable
private fun AppendError(onRetry: () -> Unit) = Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
    Text("加载更多失败", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    TextButton(onClick = onRetry) { Text("重试") }
}

private fun relativeTime(time: Instant): String {
    val minutes = Duration.between(time, Instant.now()).toMinutes().coerceAtLeast(0)
    return when {
        minutes < 1 -> "刚刚"
        minutes < 60 -> "${minutes}分钟前"
        minutes < 1_440 -> "${minutes / 60}小时前"
        else -> "${minutes / 1_440}天前"
    }
}
