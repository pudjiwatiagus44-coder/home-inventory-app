package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.ui.theme.Danger

@Composable
fun HouseholdSwitcherDialog(
    households: List<HouseholdDto>,
    currentHouseholdId: String?,
    isLoading: Boolean,
    errorMessage: String?,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("切换家庭", fontSize = 16.sp, fontWeight = FontWeight.SemiBold) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                errorMessage?.let { message ->
                    Text(
                        text = message,
                        fontSize = 13.sp,
                        color = Danger,
                    )
                }
                when {
                    isLoading && households.isEmpty() -> {
                        Text("加载中…", fontSize = 13.sp)
                    }

                    else -> {
                        households.forEach { household ->
                            OutlinedButton(
                                onClick = { onSelect(household.id) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    text = householdNameWithRole(household),
                                    fontSize = 14.sp,
                                )
                            }
                            if (household.id == currentHouseholdId) {
                                Text(
                                    text = "当前家庭",
                                    fontSize = 12.sp,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("关闭")
            }
        },
    )
}

private fun householdNameWithRole(household: HouseholdDto): String {
    val role = when (household.role) {
        "owner" -> "房主"
        "member" -> "成员"
        "readonly" -> "只读"
        else -> null
    }
    return if (role == null) household.name else "${household.name}（$role）"
}
