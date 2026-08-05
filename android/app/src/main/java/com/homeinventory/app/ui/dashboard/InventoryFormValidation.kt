package com.homeinventory.app.ui.dashboard

data class FormValidation(val isValid: Boolean, val message: String? = null)

fun validateItemForm(name: String, note: String = ""): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "物品名称不能为空")
    if (name.length > 120) return FormValidation(false, "物品名称不能超过 120 个字符")
    if (note.length > 1000) return FormValidation(false, "备注不能超过 1000 个字符")
    return FormValidation(true)
}

fun validateLocationForm(name: String): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "位置名称不能为空")
    if (name.length > 80) return FormValidation(false, "位置名称不能超过 80 个字符")
    return FormValidation(true)
}

fun validateAreaForm(name: String): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "区域名称不能为空")
    if (name.length > 80) return FormValidation(false, "区域名称不能超过 80 个字符")
    return FormValidation(true)
}
