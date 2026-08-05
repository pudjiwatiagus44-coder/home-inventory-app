package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.ui.theme.Surface
import com.homeinventory.app.ui.theme.Foreground
import com.homeinventory.app.ui.theme.Danger

@Composable
fun AreaFormDialog(
    title: String,
    initial: AreaFormValues,
    isSaving: Boolean,
    errorMessage: String?,
    onSave: (AreaFormValues) -> Unit,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf(initial.name) }
    var color by remember { mutableStateOf(initial.color) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(text = title, fontSize = 16.sp)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("区域名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AREA_COLORS.forEach { value ->
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(Color(android.graphics.Color.parseColor(value)))
                            .border(
                                width = 2.dp,
                                color = if (value == color) Foreground else Surface,
                                shape = CircleShape,
                            )
                            .clickable { color = value },
                    )
                }
            }
            errorMessage?.let {
                Text(text = it, color = com.homeinventory.app.ui.theme.Danger, fontSize = 13.sp)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (onDelete != null) {
                    TextButton(onClick = onDelete) {
                        Text("删除", color = Danger)
                    }
                } else {
                    TextButton(onClick = onDismiss) {
                        Text("取消")
                    }
                }
                Button(
                    onClick = { onSave(AreaFormValues(name = name, color = color)) },
                    enabled = !isSaving,
                ) {
                    Text(if (isSaving) "保存中..." else "保存")
                }
            }
        }
    }
}
