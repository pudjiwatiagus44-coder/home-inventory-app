package com.homeinventory.app.ui.dashboard.components

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TopBarTest {
    @Test
    fun topBarHasHouseholdDropdownAndSettingsMenu() {
        val source = topBarSource()

        assertTrue(source.contains("DropdownMenu"))
        assertTrue(source.contains("onDraftsClick"))
        assertTrue(source.contains("onHelp"))
        assertTrue(source.contains("onBackup"))
        assertTrue(source.contains("onImport"))
        assertTrue(source.contains("onInvite"))
        assertTrue(source.contains("onSignOut"))
        assertTrue(source.contains("onSetHouseholdDisplayName"))
    }

    @Test
    fun topBarUsesIconOnlyHouseholdSwitcherAndHamburgerSettings() {
        val source = topBarSource()

        assertTrue(source.contains("HamburgerMenuIcon"))
        assertTrue(source.contains("HouseholdSwitchIcon"))
        assertTrue(source.contains("HouseholdDropdownRow"))
        assertTrue(source.contains("onSetHouseholdDisplayName(household)"))
        assertTrue(source.contains("effectiveName"))
        assertTrue(source.contains("\"member\" -> \"成员\""))
        assertTrue(source.contains("onCreateHousehold"))
        assertTrue(source.contains("添加新地点"))
        assertFalse(source.contains("Text(\"设置\")"))
    }

    private fun topBarSource(): String =
        String(
            Files.readAllBytes(
                Path.of("src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt"),
            ),
        )
}
