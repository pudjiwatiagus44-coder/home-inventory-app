package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
@OptIn(ExperimentalFoundationApi::class)
fun TopBar(
    householdName: String?,
    households: List<HouseholdDto>,
    currentHouseholdId: String?,
    onSwitchHousehold: (String) -> Unit,
    onRenameHousehold: () -> Unit,
    onDraftsClick: () -> Unit,
    draftCount: Int,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onInvite: () -> Unit,
    onHelp: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var householdMenuExpanded by remember { mutableStateOf(false) }
    var settingsExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f),
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "家",
                    color = Surface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = householdName ?: "我的家",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.combinedClickable(
                    onClick = {},
                    onLongClick = onRenameHousehold,
                ),
            )
            Box {
                TextButton(onClick = { householdMenuExpanded = true }) {
                    Text("⌄")
                }
                DropdownMenu(
                    expanded = householdMenuExpanded,
                    onDismissRequest = { householdMenuExpanded = false },
                ) {
                    households.forEach { household ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (household.id == currentHouseholdId) {
                                        "${household.name}（当前）"
                                    } else {
                                        household.name
                                    },
                                )
                            },
                            onClick = {
                                householdMenuExpanded = false
                                onSwitchHousehold(household.id)
                            },
                        )
                    }
                }
            }
        }
        TextButton(onClick = onDraftsClick) {
            Text("草稿")
            if (draftCount > 0) {
                Spacer(modifier = Modifier.width(3.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Primary)
                        .padding(horizontal = 5.dp, vertical = 1.dp),
                ) {
                    Text(
                        text = "$draftCount",
                        color = Surface,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        TextButton(onClick = onHelp) { Text("帮助") }
        Box {
            TextButton(onClick = { settingsExpanded = true }) {
                Text("设置")
            }
            DropdownMenu(
                expanded = settingsExpanded,
                onDismissRequest = { settingsExpanded = false },
            ) {
                DropdownMenuItem(
                    text = { Text("备份") },
                    onClick = {
                        settingsExpanded = false
                        onBackup()
                    },
                )
                DropdownMenuItem(
                    text = { Text("导入") },
                    onClick = {
                        settingsExpanded = false
                        onImport()
                    },
                )
                DropdownMenuItem(
                    text = { Text("邀请") },
                    onClick = {
                        settingsExpanded = false
                        onInvite()
                    },
                )
                DropdownMenuItem(
                    text = { Text("退出") },
                    onClick = {
                        settingsExpanded = false
                        onSignOut()
                    },
                )
            }
        }
    }
}
