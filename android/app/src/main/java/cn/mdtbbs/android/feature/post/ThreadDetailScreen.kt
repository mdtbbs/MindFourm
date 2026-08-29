package cn.mdtbbs.android.feature.post

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import cn.mdtbbs.android.core.model.ThreadDetail
import java.time.Instant

@Composable
fun ThreadDetailRoute(
    onBack: () -> Unit,
    viewModel: ThreadDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    ThreadDetailScreen(state = state, onBack = onBack, onRetry = viewModel::load)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadDetailScreen(
    state: ThreadDetailUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("主题详情", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Text("‹", style = MaterialTheme.typography.headlineMedium) }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        when (state) {
            ThreadDetailUiState.Loading -> Loading(modifier = Modifier.padding(padding))
            is ThreadDetailUiState.Error -> DetailError(
                modifier = Modifier.padding(padding),
                onRetry = onRetry,
            )
            is ThreadDetailUiState.Content -> ThreadDetailContent(
                thread = state.thread,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun Loading(modifier: Modifier = Modifier) = Column(
    modifier = modifier.fillMaxSize(),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
) { CircularProgressIndicator() }

@Composable
private fun DetailError(modifier: Modifier, onRetry: () -> Unit) = Column(
    modifier = modifier.fillMaxSize().padding(32.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    Text("主题暂时无法加载", style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
    Text("请检查网络后重试", color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(16.dp))
    Button(onClick = onRetry) { Text("重试") }
}

@Composable
private fun ThreadDetailContent(thread: ThreadDetail, modifier: Modifier = Modifier) {
    val summary = thread.summary
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(summary.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (summary.author.avatarUrl != null) {
                    AsyncImage(
                        model = summary.author.avatarUrl,
                        contentDescription = null,
                        modifier = Modifier.size(34.dp).clip(RoundedCornerShape(17.dp)),
                    )
                } else {
                    Text(
                        text = summary.author.name.take(1).uppercase(),
                        modifier = Modifier.size(34.dp).clip(RoundedCornerShape(17.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .padding(top = 6.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(summary.author.name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        "${relativeTime(summary.createdAt)} · ${summary.replyCount} 回复 · ${summary.viewCount} 浏览",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                summary.category?.let { category ->
                    AssistChip(onClick = {}, enabled = false, label = { Text(category.name) })
                }
                summary.tags.take(4).forEach { tag ->
                    AssistChip(
                        onClick = {}, enabled = false,
                        label = { Text("#${tag.name}") },
                        colors = AssistChipDefaults.assistChipColors(
                            disabledLabelColor = MaterialTheme.colorScheme.primary,
                        ),
                    )
                }
            }
        }
        item { HorizontalDivider() }
        item { MarkdownContent(thread.content) }
        if (summary.updatedAt != summary.createdAt) {
            item {
                Text(
                    "更新于 ${relativeTime(summary.updatedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** A deliberately small, safe Markdown renderer for M1 source Markdown. */
@Composable
fun MarkdownContent(markdown: String) {
    val lines = markdown.lines()
    var index = 0
    val blocks = mutableListOf<MarkdownBlock>()
    while (index < lines.size) {
        val line = lines[index]
        if (line.trimStart().startsWith("```")) {
            val code = StringBuilder()
            index++
            while (index < lines.size && !lines[index].trimStart().startsWith("```")) {
                code.appendLine(lines[index++])
            }
            if (index < lines.size) index++
            blocks += MarkdownBlock.Code(code.toString().trimEnd())
        } else if (line.matches(Regex("^!\\[[^]]*]\\([^)]+\\)$"))) {
            val match = Regex("^!\\[([^]]*)]\\(([^)]+)\\)$").find(line)!!
            blocks += MarkdownBlock.Image(match.groupValues[1], match.groupValues[2])
            index++
        } else {
            blocks += MarkdownBlock.Text(line)
            index++
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Code -> Text(
                    block.value,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                )
                is MarkdownBlock.Image -> AsyncImage(
                    model = block.url,
                    contentDescription = block.alt.ifBlank { null },
                    modifier = Modifier.fillMaxWidth(),
                )
                is MarkdownBlock.Text -> MarkdownText(block.value)
            }
        }
    }
}

private sealed interface MarkdownBlock {
    data class Text(val value: String) : MarkdownBlock
    data class Code(val value: String) : MarkdownBlock
    data class Image(val alt: String, val url: String) : MarkdownBlock
}

@Composable
private fun MarkdownText(value: String) {
    val uriHandler = LocalUriHandler.current
    val heading = Regex("^(#{1,6})\\s+(.+)$").find(value)
    val quote = value.startsWith("> ")
    val list = Regex("^(?:[-*+] |\\d+\\. )(.+)$").find(value)
    val displayed = when {
        heading != null -> heading.groupValues[2]
        quote -> value.removePrefix("> ")
        list != null -> "• ${list.groupValues[1]}"
        else -> value
    }
    val style = when {
        heading != null -> when (heading.groupValues[1].length) {
            1 -> MaterialTheme.typography.headlineSmall
            2 -> MaterialTheme.typography.titleLarge
            else -> MaterialTheme.typography.titleMedium
        }
        quote -> MaterialTheme.typography.bodyMedium
        else -> MaterialTheme.typography.bodyLarge
    }
    val annotated = inlineMarkdown(displayed)
    androidx.compose.foundation.text.ClickableText(
        text = annotated,
        style = style.copy(color = if (quote) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface),
        onClick = { offset ->
            annotated.getStringAnnotations("url", offset, offset).firstOrNull()?.let { uriHandler.openUri(it.item) }
        },
    )
}

private fun inlineMarkdown(text: String): AnnotatedString = buildAnnotatedString {
    val token = Regex("(\\*\\*[^*]+\\*\\*)|(\\*[^*]+\\*)|(`[^`]+`)|(\\[[^]]+]\\([^)]+\\))")
    var start = 0
    token.findAll(text).forEach { match ->
        append(text.substring(start, match.range.first))
        val value = match.value
        when {
            value.startsWith("**") -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(value.drop(2).dropLast(2)) }
            value.startsWith("*") -> withStyle(SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic)) { append(value.drop(1).dropLast(1)) }
            value.startsWith("`") -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0x1A3B82F6))) { append(value.drop(1).dropLast(1)) }
            else -> {
                val link = Regex("\\[([^]]+)]\\(([^)]+)\\)").find(value)!!
                pushStringAnnotation("url", link.groupValues[2])
                withStyle(SpanStyle(color = Color(0xFF2563EB), textDecoration = TextDecoration.Underline)) { append(link.groupValues[1]) }
                pop()
            }
        }
        start = match.range.last + 1
    }
    append(text.substring(start))
}

private fun relativeTime(time: Instant): String = DateUtils.getRelativeTimeSpanString(
    time.toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS,
).toString()
