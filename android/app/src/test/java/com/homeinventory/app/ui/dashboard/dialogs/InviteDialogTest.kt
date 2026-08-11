package com.homeinventory.app.ui.dashboard.dialogs

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertTrue
import org.junit.Test

class InviteDialogTest {
    @Test
    fun nonOwnerOnlySeesAppInviteSection() {
        val source = inviteDialogSource()

        assertTrue(source.contains("isOwner: Boolean"))
        assertTrue(source.contains("仅主账号可管理邀请和成员"))
        assertTrue(source.contains("邀请使用本 App"))
    }

    @Test
    fun memberRoleLabelIsMember() {
        val source = inviteDialogSource()

        assertTrue(source.contains("\"member\" -> \"成员\""))
    }

    private fun inviteDialogSource(): String =
        String(
            Files.readAllBytes(
                Path.of("src/main/java/com/homeinventory/app/ui/dashboard/dialogs/InviteDialog.kt"),
            ),
        )
}
