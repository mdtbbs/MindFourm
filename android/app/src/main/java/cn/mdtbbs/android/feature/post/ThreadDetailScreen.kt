package cn.mdtbbs.android.feature.post

import android.text.format.DateUtils
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalContext
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
    onLogin: (String) -> Unit,
    onPublicUser: (Long) -> Unit,
    viewModel: ThreadDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    ThreadDetailScreen(
        state = state,
        onBack = onBack,
        onRetry = viewModel::load,
        onLike = { viewModel.toggleLike(onLogin) },
        onBookmark = { viewModel.toggleBookmark(onLogin) },
        onReply = { content, parentReplyId -> viewModel.reply(onLogin, content, parentReplyId) },
        onUpdateThread = { title, content -> viewModel.updateThread(onLogin, title, content) },
        onDeleteThread = { viewModel.deleteThread(onLogin, onBack) },
        onUpdateReply = { replyId, content -> viewModel.updateReply(onLogin, replyId, content) },
        onDeleteReply = { replyId -> viewModel.deleteReply(onLogin, replyId) },
        onReport = { reason, detail -> viewModel.report(onLogin, reason, detail) },
        onUploadAttachments = { files -> viewModel.uploadAttachments(onLogin, files) },
        onPublicUser = onPublicUser,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadDetailScreen(
    state: ThreadDetailUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onReply: (String, Long?) -> Unit,
    onUpdateThread: (String, String) -> Unit,
    onDeleteThread: () -> Unit,
    onUpdateReply: (Long, String) -> Unit,
    onDeleteReply: (Long) -> Unit,
    onReport: (String, String?) -> Unit,
    onUploadAttachments: (List<PendingAttachment>) -> Unit,
    onPublicUser: (Long) -> Unit,
) {
    var replyComposerOpen by remember { mutableStateOf(false) }
    var replyTarget by remember { mutableStateOf<ThreadReplyTarget?>(null) }
    var editThreadOpen by remember { mutableStateOf(false) }
    var editReplyTarget by remember { mutableStateOf<ReplyEditTarget?>(null) }
    var deleteThreadOpen by remember { mutableStateOf(false) }
    var deleteReplyTarget by remember { mutableStateOf<ThreadReplyTarget?>(null) }
    var reportOpen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val attachmentPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val files = uris.mapNotNull { uri -> runCatching {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("无法读取附件")
            PendingAttachment(context.displayName(uri), context.contentResolver.getType(uri) ?: "application/octet-stream", bytes)
        }.getOrNull() }
        if (files.isNotEmpty()) onUploadAttachments(files)
    }
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("主题详情", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回") }
                },
                actions = { if (state is ThreadDetailUiState.Content && !state.thread.isOwner) TextButton(onClick = { reportOpen = true }) { Text("举报") } },
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
                onLike = onLike,
                onBookmark = onBookmark,
                onOpenReply = { replyTarget = null; replyComposerOpen = true },
                onReplyTo = { reply -> replyTarget = ThreadReplyTarget(reply.id, reply.author.name); replyComposerOpen = true },
                onEditThread = { editThreadOpen = true },
                onDeleteThread = { deleteThreadOpen = true },
                onEditReply = { reply -> editReplyTarget = ReplyEditTarget(reply.id, reply.content) },
                onDeleteReply = { reply -> deleteReplyTarget = ThreadReplyTarget(reply.id, reply.author.name) },
                onUploadAttachments = { attachmentPicker.launch(arrayOf("*/*")) },
                onOpenAuthor = onPublicUser,
                actionInProgress = state.actionInProgress,
                actionError = state.actionError,
                actionMessage = state.actionMessage,
            )
        }
    }
    if (replyComposerOpen) ReplyComposer(
        title = replyTarget?.authorName?.let { "回复 $it" } ?: "回复主题",
        initialContent = replyTarget?.authorName?.let { "@$it " }.orEmpty(),
        confirmLabel = "发送",
        onDismiss = { replyComposerOpen = false },
        onSubmit = { content -> replyComposerOpen = false; onReply(content, replyTarget?.id) },
    )
    if (editThreadOpen && state is ThreadDetailUiState.Content) ThreadEditor(
        title = "编辑主题",
        initialTitle = state.thread.summary.title,
        initialContent = state.thread.content,
        onDismiss = { editThreadOpen = false },
        onSubmit = { title, content -> editThreadOpen = false; onUpdateThread(title, content) },
    )
    editReplyTarget?.let { target -> ReplyComposer(
        title = "编辑回复",
        initialContent = target.content,
        confirmLabel = "保存",
        onDismiss = { editReplyTarget = null },
        onSubmit = { content -> editReplyTarget = null; onUpdateReply(target.id, content) },
    ) }
    if (deleteThreadOpen) DeleteConfirmation(
        message = "删除后主题将不再对其他用户显示，确定继续吗？",
        onDismiss = { deleteThreadOpen = false },
        onConfirm = { deleteThreadOpen = false; onDeleteThread() },
    )
    deleteReplyTarget?.let { target -> DeleteConfirmation(
        message = "确定删除 ${target.authorName} 的这条回复吗？",
        onDismiss = { deleteReplyTarget = null },
        onConfirm = { deleteReplyTarget = null; onDeleteReply(target.id) },
    ) }
    if (reportOpen) ReportComposer(onDismiss = { reportOpen = false }, onSubmit = { reason, detail -> reportOpen = false; onReport(reason, detail) })
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
private fun ThreadDetailContent(
    thread: ThreadDetail,
    modifier: Modifier = Modifier,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onOpenReply: () -> Unit,
    onReplyTo: (cn.mdtbbs.android.core.model.ThreadReply) -> Unit,
    onEditThread: () -> Unit,
    onDeleteThread: () -> Unit,
    onEditReply: (cn.mdtbbs.android.core.model.ThreadReply) -> Unit,
    onDeleteReply: (cn.mdtbbs.android.core.model.ThreadReply) -> Unit,
    onUploadAttachments: () -> Unit,
    onOpenAuthor: (Long) -> Unit,
    actionInProgress: Boolean,
    actionError: String?,
    actionMessage: String?,
) {
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
            Row(modifier = Modifier.clickable { summary.author.id.toLongOrNull()?.let(onOpenAuthor) }, verticalAlignment = Alignment.CenterVertically) {
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
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = onLike) { Text(if (thread.viewer?.liked == true) "已点赞" else "点赞") }
                OutlinedButton(onClick = onBookmark) { Text(if (thread.viewer?.bookmarked == true) "已收藏" else "收藏") }
                OutlinedButton(onClick = onOpenReply, enabled = !thread.locked) { Text(if (thread.locked) "主题已关闭" else "回复") }
            }
        }
        if (thread.isOwner) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onEditThread) { Text("编辑主题") }
                    TextButton(onClick = onUploadAttachments, enabled = !actionInProgress) { Text("上传附件") }
                    TextButton(onClick = onDeleteThread, enabled = !actionInProgress) { Text("删除主题", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        if (actionInProgress) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        actionError?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        actionMessage?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) } }
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
        item { HorizontalDivider() }
        item { Text("回复（${thread.replies.size}）", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        thread.replies.forEach { reply ->
            item(key = "reply-${reply.id}") {
                Column(
                    modifier = Modifier.padding(start = if (reply.parentReplyId == null) 0.dp else 16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("${reply.author.name} · ${relativeTime(reply.createdAt)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    reply.parentReplyId?.let { Text("回复 #$it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    MarkdownContent(reply.content)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = { onReplyTo(reply) }, enabled = !thread.locked && !actionInProgress) { Text("回复") }
                        if (reply.isOwner) {
                            TextButton(onClick = { onEditReply(reply) }, enabled = !actionInProgress) { Text("编辑") }
                            TextButton(onClick = { onDeleteReply(reply) }, enabled = !actionInProgress) { Text("删除", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReplyComposer(
    title: String,
    initialContent: String = "",
    confirmLabel: String,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var content by remember(initialContent) { mutableStateOf(initialContent) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(content, { content = it }, Modifier.fillMaxWidth(), label = { Text("回复内容（支持 Markdown）") }, minLines = 4) },
        confirmButton = { Button(onClick = { onSubmit(content.trim()) }, enabled = content.isNotBlank()) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ThreadEditor(
    title: String,
    initialTitle: String,
    initialContent: String,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit,
) {
    var editedTitle by remember(initialTitle) { mutableStateOf(initialTitle) }
    var editedContent by remember(initialContent) { mutableStateOf(initialContent) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(editedTitle, { editedTitle = it }, Modifier.fillMaxWidth(), label = { Text("标题") }, singleLine = true)
                OutlinedTextField(editedContent, { editedContent = it }, Modifier.fillMaxWidth(), label = { Text("正文（支持 Markdown）") }, minLines = 6)
            }
        },
        confirmButton = { Button(onClick = { onSubmit(editedTitle.trim(), editedContent.trim()) }, enabled = editedTitle.isNotBlank() && editedContent.isNotBlank()) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun DeleteConfirmation(message: String, onDismiss: () -> Unit, onConfirm: () -> Unit) = AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("确认删除") },
    text = { Text(message) },
    confirmButton = { Button(onClick = onConfirm) { Text("删除") } },
    dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
)

private data class ThreadReplyTarget(val id: Long, val authorName: String)
private data class ReplyEditTarget(val id: Long, val content: String)

@Composable
private fun ReportComposer(onDismiss: () -> Unit, onSubmit: (String, String?) -> Unit) {
    var reason by remember { mutableStateOf("spam") }
    var detail by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("举报主题") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "spam" to "垃圾信息",
                    "abuse" to "人身攻击",
                    "off_topic" to "跑题",
                    "copyright" to "侵权",
                    "other" to "其他",
                ).forEach { (value, label) ->
                    TextButton(onClick = { reason = value }) {
                        Text(if (reason == value) "✓ $label" else label)
                    }
                }
                OutlinedTextField(
                    value = detail,
                    onValueChange = { detail = it },
                    label = { Text("补充说明（可选）") },
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSubmit(reason, detail.ifBlank { null }) }) { Text("提交") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
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

private fun android.content.Context.displayName(uri: android.net.Uri): String = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
    ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    ?.takeIf { it.isNotBlank() }
    ?: "attachment.bin"
