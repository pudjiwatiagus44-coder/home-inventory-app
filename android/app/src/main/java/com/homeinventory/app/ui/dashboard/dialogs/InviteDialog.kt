package com.homeinventory.app.ui.dashboard.dialogs

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.ui.dashboard.InviteUiState
import com.homeinventory.app.ui.dashboard.JoinRequestsUiState
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
fun InviteDialog(
    state: InviteUiState,
    joinRequests: JoinRequestsUiState,
    onRegenerate: () -> Unit,
    onRefreshRequests: () -> Unit,
    onApproveRequest: (String) -> Unit,
    onRejectRequest: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(text = "邀请家人", fontSize = 16.sp)
            Text(
                text = "生成链接后发给家人；家人申请加入后，你可以在这里直接批准或拒绝。",
                fontSize = 13.sp,
            )

            when {
                state.isGenerating -> {
                    Text(
                        text = "生成中…",
                        fontSize = 13.sp,
                    )
                }

                state.link != null -> {
                    Text(
                        text = state.link,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        OutlinedButton(
                            onClick = { copyLink(context, state.link) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("复制链接")
                        }
                        Button(
                            onClick = { shareLink(context, state.link) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("分享")
                        }
                    }
                }

                state.errorMessage != null -> {
                    Text(
                        text = state.errorMessage,
                        fontSize = 13.sp,
                        color = Danger,
                    )
                    TextButton(onClick = onRegenerate) {
                        Text("重新生成")
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(text = "加入申请", fontSize = 15.sp)
                TextButton(onClick = onRefreshRequests) {
                    Text("刷新")
                }
            }

            joinRequests.errorMessage?.let { message ->
                Text(
                    text = message,
                    fontSize = 13.sp,
                    color = Danger,
                )
            }

            when {
                joinRequests.isLoading -> {
                    Text(
                        text = "加载中…",
                        fontSize = 13.sp,
                    )
                }

                joinRequests.requests.isEmpty() -> {
                    Text(
                        text = "暂无待处理的加入申请",
                        fontSize = 13.sp,
                    )
                }

                else -> {
                    joinRequests.requests.forEach { request ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(androidx.compose.ui.graphics.Color(0xFFF7F5EF))
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = request.email,
                                fontSize = 13.sp,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                            )
                            request.createdAt?.let {
                                Text(
                                    text = "申请于 ${formatRequestTime(it)}",
                                    fontSize = 12.sp,
                                    color = androidx.compose.ui.graphics.Color(0xFF6B7280),
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                OutlinedButton(
                                    onClick = { onRejectRequest(request.id) },
                                    enabled = joinRequests.pendingRequestId == null,
                                    modifier = Modifier.weight(1f),
                                ) {
                                    Text("拒绝")
                                }
                                Button(
                                    onClick = { onApproveRequest(request.id) },
                                    enabled = joinRequests.pendingRequestId == null,
                                    modifier = Modifier.weight(1f),
                                ) {
                                    Text("批准")
                                }
                            }
                        }
                    }
                }
            }

            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text("关闭")
            }
        }
    }
}

private fun formatRequestTime(value: String): String {
    return try {
        val instant = java.time.Instant.parse(value)
        val local = java.time.ZonedDateTime.ofInstant(
            instant,
            java.time.ZoneId.systemDefault(),
        )
        "${local.monthValue}月${local.dayOfMonth}日 ${local.hour}:${local.minute.toString().padStart(2, '0')}"
    } catch (_: Exception) {
        value
    }
}

private fun copyLink(context: Context, link: String) {
    val clipboard =
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("家庭邀请链接", link))
    Toast.makeText(context, "链接已复制", Toast.LENGTH_SHORT).show()
}

private fun shareLink(context: Context, link: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, link)
    }
    context.startActivity(Intent.createChooser(intent, "邀请家人加入"))
}
