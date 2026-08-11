package com.homeinventory.app.ui.dashboard.components

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertTrue
import org.junit.Test

class TopBarTest {
    @Test
    fun topBarHasHouseholdDropdownAndSettingsMenu() {
        val source = String(
            Files.readAllBytes(
                Path.of("src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt"),
            ),
        )
        assertTrue(source.contains("⌄"))
        assertTrue(source.contains("DropdownMenu"))
        assertTrue(source.contains("设置"))
        assertTrue(source.contains("备份"))
        assertTrue(source.contains("导入"))
        assertTrue(source.contains("邀请"))
        assertTrue(source.contains("退出"))
        assertTrue(source.contains("草稿"))
        assertTrue(source.contains("帮助"))
        assertTrue(source.contains("onRenameHousehold"))
    }
}
