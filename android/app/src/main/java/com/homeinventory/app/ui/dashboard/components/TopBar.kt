package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.Foreground
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface
import com.homeinventory.app.ui.theme.SurfaceElevated

@Composable
@OptIn(ExperimentalFoundationApi::class)
fun TopBar(
    householdName: String?,
    households: List<HouseholdDto>,
    currentHouseholdId: String?,
    onSwitchHousehold: (String) -> Unit,
    onSetHouseholdDisplayName: (HouseholdDto) -> Unit,
    onCreateHousehold: () -> Unit,
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
        Box(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .defaultMinSize(minHeight = 40.dp),
            ) {
                Text(
                    text = householdName ?: "我的家",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                IconButton(
                    onClick = { householdMenuExpanded = true },
                    modifier = Modifier.size(36.dp),
                ) {
                    HouseholdSwitchIcon(color = Foreground)
                }
            }
            DropdownMenu(
                expanded = householdMenuExpanded,
                onDismissRequest = { householdMenuExpanded = false },
                modifier = Modifier
                    .background(SurfaceElevated)
                    .border(1.dp, Border, RoundedCornerShape(8.dp)),
            ) {
                households.forEach { household ->
                    HouseholdDropdownRow(
                        household = household,
                        selected = household.id == currentHouseholdId,
                        onClick = {
                            householdMenuExpanded = false
                            onSwitchHousehold(household.id)
                        },
                        onLongClick = {
                            householdMenuExpanded = false
                            onSetHouseholdDisplayName(household)
                        },
                    )
                }
                HorizontalDivider(color = Border)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "添加新地点",
                            color = Primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    },
                    onClick = {
                        householdMenuExpanded = false
                        onCreateHousehold()
                    },
                )
            }
        }
        TextButton(onClick = onDraftsClick) {
            Text("草稿")
            if (draftCount > 0) {
                Spacer(modifier = Modifier.width(3.dp))
                Box(
                    modifier = Modifier
                        .background(Primary, RoundedCornerShape(8.dp))
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
            IconButton(
                onClick = { settingsExpanded = true },
                modifier = Modifier.size(40.dp),
            ) {
                HamburgerMenuIcon(color = Foreground)
            }
            DropdownMenu(
                expanded = settingsExpanded,
                onDismissRequest = { settingsExpanded = false },
                modifier = Modifier
                    .background(SurfaceElevated)
                    .border(1.dp, Border, RoundedCornerShape(8.dp)),
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HouseholdDropdownRow(
    household: HouseholdDto,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .width(190.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            text = household.effectiveName ?: household.name,
            color = if (selected) Primary else Foreground,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        household.role?.let { role ->
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = householdRoleLabel(role),
                color = MutedForeground,
                fontSize = 12.sp,
            )
        }
    }
}

private fun householdRoleLabel(role: String): String = when (role) {
    "owner" -> "房主"
    "member" -> "管理"
    "contributor" -> "新增"
    "readonly" -> "只读"
    else -> "成员"
}

@Composable
private fun HamburgerMenuIcon(
    color: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        val strokeWidth = 2.dp.toPx()
        listOf(0.28f, 0.5f, 0.72f).forEach { y ->
            drawLine(
                color = color,
                start = Offset(size.width * 0.18f, size.height * y),
                end = Offset(size.width * 0.82f, size.height * y),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
private fun HouseholdSwitchIcon(
    color: Color,
    modifier: Modifier = Modifier.size(23.dp),
) {
    Canvas(modifier = modifier) {
        val strokeWidth = 2.2.dp.toPx()
        drawLine(
            color = color,
            start = Offset(size.width * 0.18f, size.height * 0.34f),
            end = Offset(size.width * 0.76f, size.height * 0.34f),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Square,
        )
        drawPath(
            color = color,
            path = Path().apply {
                moveTo(size.width * 0.76f, size.height * 0.20f)
                lineTo(size.width * 0.94f, size.height * 0.34f)
                lineTo(size.width * 0.76f, size.height * 0.48f)
                close()
            },
        )
        drawLine(
            color = color,
            start = Offset(size.width * 0.82f, size.height * 0.66f),
            end = Offset(size.width * 0.24f, size.height * 0.66f),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Square,
        )
        drawPath(
            color = color,
            path = Path().apply {
                moveTo(size.width * 0.24f, size.height * 0.52f)
                lineTo(size.width * 0.06f, size.height * 0.66f)
                lineTo(size.width * 0.24f, size.height * 0.80f)
                close()
            },
        )
    }
}
