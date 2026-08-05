package com.homeinventory.app.ui.dashboard

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryFormValidationTest {
    @Test
    fun itemNameIsRequiredAndMax120() {
        assertFalse(validateItemForm(name = "  ").isValid)
        assertFalse(validateItemForm(name = "x".repeat(121)).isValid)
        assertTrue(validateItemForm(name = "感冒药").isValid)
    }

    @Test
    fun noteMax1000() {
        assertFalse(validateItemForm(name = "药", note = "x".repeat(1001)).isValid)
        assertTrue(validateItemForm(name = "药", note = "x".repeat(1000)).isValid)
    }

    @Test
    fun locationNameRequiredAndMax80() {
        assertFalse(validateLocationForm("  ").isValid)
        assertFalse(validateLocationForm("x".repeat(81)).isValid)
        assertTrue(validateLocationForm("上层抽屉").isValid)
    }

    @Test
    fun areaNameRequiredAndMax80() {
        assertFalse(validateAreaForm("  ").isValid)
        assertFalse(validateAreaForm("x".repeat(81)).isValid)
        assertTrue(validateAreaForm("厨房").isValid)
    }
}
