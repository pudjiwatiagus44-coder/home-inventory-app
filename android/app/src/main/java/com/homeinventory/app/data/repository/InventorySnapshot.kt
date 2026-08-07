package com.homeinventory.app.data.repository

data class InventorySnapshot(
    val areas: List<AreaView> = emptyList(),
    val locations: List<LocationView> = emptyList(),
    val items: List<ItemView> = emptyList(),
) {
    data class AreaView(
        val id: String,
        val name: String,
        val color: String,
        val serverUpdatedAt: String? = null,
        val syncStatus: String,
    )

    data class LocationView(
        val id: String,
        val name: String,
        val areaId: String?,
        val serverUpdatedAt: String? = null,
        val syncStatus: String,
    )

    data class ItemView(
        val id: String,
        val name: String,
        val note: String,
        val expireDate: String?,
        val locationId: String?,
        val areaId: String?,
        val locationName: String?,
        val photoKey: String? = null,
        val serverUpdatedAt: String? = null,
        val syncStatus: String,
    )
}
