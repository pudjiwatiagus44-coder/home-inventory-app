package com.homeinventory.app.ui.dashboard.onboarding

object OnboardingSteps {
    const val HIDDEN = -1
    const val WELCOME = 0
    const val ADD_ITEM = 1
    const val PHOTO = 2
    const val AREA = 3
    const val LOCATION = 4
    const val SAVE = 5
    const val DRAFT_BOX = 7
    const val DONE = 8
    const val TOTAL_STEPS = 8

    fun advance(
        current: Int,
        showItemForm: Boolean,
        showDraftsDialog: Boolean,
    ): Int = when (current) {
        ADD_ITEM -> if (showItemForm) PHOTO else current
        in PHOTO..SAVE -> if (!showItemForm) DRAFT_BOX else current
        DRAFT_BOX -> if (showDraftsDialog) DONE else current
        else -> current
    }
}
