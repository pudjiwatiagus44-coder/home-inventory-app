package com.homeinventory.app.data.recognition

/** Stores only provider names and account/task ownership, never API keys. */
class RecognitionSettings(
    private val accountId: () -> String?,
    private val read: (String) -> String?,
    private val write: (String, String?) -> Unit,
) {
    fun provider(): String = accountId()?.let { read("provider:$it") }?.takeIf { it == "DEEPSEEK" } ?: "DOUBAO"
    fun select(provider: String) {
        require(provider == "DOUBAO" || provider == "DEEPSEEK")
        val account = accountId() ?: throw IllegalStateException("请重新登录后设置识别服务")
        write("provider:$account", provider)
    }
    fun captureDraft(id: String) {
        write("draft-provider:$id", provider())
        write("draft-account:$id", accountId())
    }
    fun providerForDraft(id: String): String {
        val owner = read("draft-account:$id")
        if (owner != null && owner != accountId()) throw IllegalStateException("此草稿属于其他登录账号，请切回原账号")
        return read("draft-provider:$id")?.takeIf { it == "DEEPSEEK" } ?: "DOUBAO"
    }
    fun forgetDraft(id: String) {
        write("draft-provider:$id", null)
        write("draft-account:$id", null)
    }
}
