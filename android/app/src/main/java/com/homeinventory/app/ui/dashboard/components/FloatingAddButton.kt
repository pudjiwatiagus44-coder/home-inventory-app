package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
fun FloatingAddButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onBounds: (Rect) -> Unit = {},
) {
    Column(
        modifier = modifier
            .size(width = 64.dp, height = 64.dp)
            .clip(RoundedCornerShape(32.dp))
            .background(Primary)
            .clickable(onClick = onClick)
            .onGloballyPositioned { onBounds(it.boundsInRoot()) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("+", color = Surface, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Text("新增", color = Surface, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}
