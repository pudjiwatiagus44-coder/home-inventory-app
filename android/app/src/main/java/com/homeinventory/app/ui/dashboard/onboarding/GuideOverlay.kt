package com.homeinventory.app.ui.dashboard.onboarding

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
fun GuideOverlay(
    title: String,
    text: String,
    stepNumber: Int,
    totalSteps: Int,
    targetBounds: Rect?,
    onNext: () -> Unit,
    onSkip: () -> Unit,
    showNext: Boolean = true,
    nextLabel: String = "下一步",
    modifier: Modifier = Modifier,
) {
    var overlayBounds by remember { mutableStateOf<Rect?>(null) }
    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            .onGloballyPositioned { overlayBounds = it.boundsInRoot() },
    ) {
        val density = LocalDensity.current
        val localTarget = targetBounds?.let { target ->
            val origin = overlayBounds?.topLeft ?: Offset.Zero
            Rect(
                left = target.left - origin.x,
                top = target.top - origin.y,
                right = target.right - origin.x,
                bottom = target.bottom - origin.y,
            )
        }
        val cardAtTop = localTarget?.let {
            it.center.y > with(density) { maxHeight.toPx() } * 0.45f
        } ?: false
        Canvas(Modifier.fillMaxSize()) {
            val scrim = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(Rect(0f, 0f, size.width, size.height))
                localTarget?.let { addRect(it) }
            }
            drawPath(scrim, Color(0x99000000))
            val target = localTarget
            if (target != null) {
                drawRect(
                    color = Primary,
                    topLeft = target.topLeft,
                    size = target.size,
                    style = Stroke(width = 2.dp.toPx()),
                )
                val tipX = target.center.x
                val rawTipY = if (cardAtTop) {
                    target.bottom + 10.dp.toPx()
                } else {
                    target.top - 10.dp.toPx()
                }
                val tipY = rawTipY.coerceIn(0f, size.height)
                val arrow = Path().apply {
                    if (cardAtTop) {
                        moveTo(tipX, tipY)
                        lineTo(tipX - 8.dp.toPx(), tipY - 12.dp.toPx())
                        lineTo(tipX + 8.dp.toPx(), tipY - 12.dp.toPx())
                    } else {
                        moveTo(tipX, tipY)
                        lineTo(tipX - 8.dp.toPx(), tipY + 12.dp.toPx())
                        lineTo(tipX + 8.dp.toPx(), tipY + 12.dp.toPx())
                    }
                    close()
                }
                drawPath(arrow, Primary)
            }
        }
        Column(
            modifier = Modifier
                .align(if (cardAtTop) Alignment.TopCenter else Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(16.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Surface)
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "$stepNumber / $totalSteps",
                    fontSize = 12.sp,
                    color = Primary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = onSkip) {
                    Text("✕", fontSize = 18.sp)
                }
            }
            Text(text = title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(text = text, fontSize = 14.sp, color = MutedForeground)
            if (showNext) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Button(onClick = onNext) {
                        Text(nextLabel)
                    }
                }
            }
        }
    }
}
