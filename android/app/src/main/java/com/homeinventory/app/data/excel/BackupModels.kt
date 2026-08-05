package com.homeinventory.app.data.excel

data class BackupRow(
    val index: Int,
    val name: String,
    val locationName: String,
    val areaName: String,
    val note: String,
    val expireDate: String?,
)
