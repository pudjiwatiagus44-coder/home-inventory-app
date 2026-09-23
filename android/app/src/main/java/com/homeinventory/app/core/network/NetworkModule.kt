package com.homeinventory.app.core.network

import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.session.SessionStore
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    fun createApi(sessionStore: SessionStore, baseUrl: String = AppConfig.baseUrl): HomeInventoryApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(SessionCookieInterceptor(sessionStore))
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(HomeInventoryApi::class.java)
    }
}

class SessionCookieInterceptor(
    private val sessionStore: SessionStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val cookie = sessionStore.sessionCookie()
        val request = chain.request().newBuilder().apply {
            cookie?.let { header("Cookie", it) }
        }.build()
        val response = chain.proceed(request)

        if (cookie != null && response.code == 401) {
            sessionStore.invalidateSession()
        }

        return response
    }
}
