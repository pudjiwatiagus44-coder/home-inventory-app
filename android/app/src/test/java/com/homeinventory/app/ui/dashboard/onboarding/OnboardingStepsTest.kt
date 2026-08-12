package com.homeinventory.app.ui.dashboard.onboarding

import org.junit.Assert.assertEquals
import org.junit.Test

class OnboardingStepsTest {
    @Test
    fun addItemAdvancesToPhotoWhenFormOpens() {
        assertEquals(
            OnboardingSteps.PHOTO,
            OnboardingSteps.advance(
                current = OnboardingSteps.ADD_ITEM,
                showItemForm = true,
                showDraftsDialog = false,
            ),
        )
    }

    @Test
    fun formStepAdvancesToDraftBoxWhenFormCloses() {
        assertEquals(
            OnboardingSteps.DRAFT_BOX,
            OnboardingSteps.advance(
                current = OnboardingSteps.PHOTO,
                showItemForm = false,
                showDraftsDialog = false,
            ),
        )
    }

    @Test
    fun draftBoxAdvancesToDoneWhenDraftsOpen() {
        assertEquals(
            OnboardingSteps.DONE,
            OnboardingSteps.advance(
                current = OnboardingSteps.DRAFT_BOX,
                showItemForm = false,
                showDraftsDialog = true,
            ),
        )
    }

    @Test
    fun welcomeStaysUntilUserStarts() {
        assertEquals(
            OnboardingSteps.WELCOME,
            OnboardingSteps.advance(
                current = OnboardingSteps.WELCOME,
                showItemForm = false,
                showDraftsDialog = false,
            ),
        )
    }
}
