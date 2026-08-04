package com.homeinventory.app.core.network

import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.session.SessionStore
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object NetworkModule {
    fun createApi(sessionStore: SessionStore, baseUrl: String = AppConfig.baseUrl): HomeInventoryApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val requestBuilder = chain.request().newBuilder()
                sessionStore.sessionCookie()?.let { cookie ->
                    requestBuilder.header("Cookie", cookie)
                }
                chain.proceed(requestBuilder.build())
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(HomeInventoryApi::class.java)
    }
}
