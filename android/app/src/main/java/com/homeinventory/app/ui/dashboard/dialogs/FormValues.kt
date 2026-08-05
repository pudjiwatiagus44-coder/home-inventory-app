package com.homeinventory.app.ui.dashboard.dialogs

val AREA_COLORS = listOf("#64748b", "#256f6b", "#7c3aed", "#c2410c", "#be123c")

data class ItemFormValues(
    val name: String = "",
    val areaId: String = "",
    val locationId: String = "",
    val note: String = "",
    val expireDate: String? = null,
)

data class LocationFormValues(
    val name: String = "",
    val areaId: String = "",
)

data class AreaFormValues(
    val name: String = "",
    val color: String = AREA_COLORS.first(),
)
