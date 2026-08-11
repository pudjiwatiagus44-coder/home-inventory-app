package com.homeinventory.app.ui.dashboard.dialogs

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpDialogTest {
    @Test
    fun helpDialogContainsFeedbackForm() {
        val source = String(
            Files.readAllBytes(
                Path.of("src/main/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialog.kt"),
            ),
        )
        assertTrue(source.contains("意见反馈"))
        assertTrue(source.contains("提交反馈"))
    }
}
