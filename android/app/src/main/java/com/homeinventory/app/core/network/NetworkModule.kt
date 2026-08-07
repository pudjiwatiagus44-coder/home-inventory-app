package com.homeinventory.app.core.network

import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.session.SessionStore
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object NetworkModule {
    fun createApi(sessionStore: SessionStore, baseUrl: String = AppConfig.baseUrl): HomeInventoryApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
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
