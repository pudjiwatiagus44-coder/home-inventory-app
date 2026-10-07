package com.homeinventory.app.data.remote

data class DeepSeekCredentialStatusDto(val configured: Boolean, val maskedKey: String? = null, val lastVerifiedAt: String? = null)
data class DeepSeekSaveRequest(val apiKey: String)
data class DeepSeekValidationDto(val status: DeepSeekCredentialStatusDto, val elapsedMs: Long)
data class DeepSeekDeleteDto(val deleted: Boolean)
data class RecognitionProvidersDto(val providers: List<String>)
