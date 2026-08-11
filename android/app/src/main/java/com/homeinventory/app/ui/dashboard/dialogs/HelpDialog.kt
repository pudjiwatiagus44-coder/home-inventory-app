package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Surface

@Composable
fun HelpDialog(onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "使用说明",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            HelpSection(
                title = "清单管理",
                lines = listOf(
                    "点击顶部区域/位置条可筛选物品；长按区域/位置可重命名、删除（位置还能重新分配区域）。",
                    "右下角「+ 新增」添加物品；不选区域/位置也能保存，会进入「未分配」。",
                    "「物品」旁「未分配」按钮只看没选位置的物品。",
                    "搜索、排序（按过期日/名称）、过期 30 天内提醒「即将过期」。",
                ),
            )
            HelpSection(
                title = "拍照识别",
                lines = listOf(
                    "新增物品：拍正面照自动识别名称和备注；「识别日期」拍有效期自动填过期日。",
                    "「添加照片」可给物品补缩略图。",
                    "点缩略图看大图：双击放大 4 倍、双指捏合最多 6 倍、拖动查看。",
                    "服务器只存缩略图；清晰图保存在本机（换设备后放大变模糊）。",
                ),
            )
            HelpSection(
                title = "草稿箱",
                lines = listOf(
                    "识别中就能「存入草稿箱」，后台识别完成后自动补名称/备注。",
                    "顶部「草稿」查看列表：可编辑保存（建档）、直接保存、删除、点缩略图看大图。",
                    "「批量导入」一次选多张照片，全部自动存入草稿箱。",
                ),
            )
            HelpSection(
                title = "家庭共享",
                lines = listOf(
                    "同一账号属于多个家庭时，点顶部当前家庭名称可切换清单，App 会记住上次选择。",
                    "「邀请」生成链接发给家人；家人申请后你批准即可共同管理。",
                    "「家庭成员」里可移除成员、切换只读/全部权限。",
                    "「邀请使用本 App」分享下载链接，对方注册后成为独立用户。",
                ),
            )
            HelpSection(
                title = "备份与导入",
                lines = listOf(
                    "「备份」导出 Excel；「导入」先预检再提交，冲突可逐条选择跳过/都保留/覆盖。",
                ),
            )
            HelpSection(
                title = "常见问题",
                lines = listOf(
                    "新增后没显示：数据会自动刷新，也可在清单页下拉刷新。",
                    "识别失败：手动填写名称/备注/过期日即可。",
                    "换设备：草稿和本地清晰图不带走。",
                ),
            )
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(androidx.compose.ui.Alignment.End),
            ) {
                Text("关闭")
            }
        }
    }
}

@Composable
private fun HelpSection(title: String, lines: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        lines.forEach { line ->
            Text(
                text = "• $line",
                fontSize = 13.sp,
                color = MutedForeground,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
