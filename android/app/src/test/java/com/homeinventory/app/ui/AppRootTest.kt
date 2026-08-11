package com.homeinventory.app.ui

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertTrue
import org.junit.Test

class AppRootTest {
    @Test
    fun appRootRechecksForUpdatesOnResume() {
        val source = String(
            Files.readAllBytes(
                Path.of("src/main/java/com/homeinventory/app/ui/AppRoot.kt"),
            ),
        )

        assertTrue(source.contains("Lifecycle.Event.ON_RESUME"))
        assertTrue(source.contains("viewModel.checkForUpdates()"))
    }
}
