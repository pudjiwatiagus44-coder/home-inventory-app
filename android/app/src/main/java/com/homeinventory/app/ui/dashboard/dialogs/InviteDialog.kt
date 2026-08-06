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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.ui.dashboard.InviteUiState
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Surface

@Composable
fun InviteDialog(
    state: InviteUiState,
    onRegenerate: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(text = "邀请家人", fontSize = 16.sp)
            Text(
                text = "生成链接后发给家人，对方打开链接申请加入，你批准后就能共同维护清单。",
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

            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text("关闭")
            }
        }
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
