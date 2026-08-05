package com.homeinventory.app.core.session

object CookieHeaderParser {
    fun parse(setCookieHeader: String?): String? {
        if (setCookieHeader.isNullOrBlank()) return null
        val first = setCookieHeader.substringBefore(";").trim()
        return first.takeIf { it.startsWith("home_inventory_session=") }
    }
}
