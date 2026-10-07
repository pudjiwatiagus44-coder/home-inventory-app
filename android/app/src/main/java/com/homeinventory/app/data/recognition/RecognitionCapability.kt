package com.homeinventory.app.data.recognition

import com.homeinventory.app.core.network.HomeInventoryApi

/** Old servers ignore unknown provider queries. Verify support before sending images. */
suspend fun requireRecognitionProvider(api: HomeInventoryApi, provider: String) {
    if (provider != "DEEPSEEK") return
    val result = api.recognitionProviders()
    if (result.code() == 401) throw IllegalStateException("登录已失效，请重新登录")
    if (!result.isSuccessful || result.body()?.ok != true || result.body()?.data?.providers?.contains(provider) != true) {
        throw IllegalStateException("服务器尚未支持个人 DeepSeek，请更新服务器后再试")
    }
}
