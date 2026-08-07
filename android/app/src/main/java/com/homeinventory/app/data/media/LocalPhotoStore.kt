package com.homeinventory.app.data.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

object LocalPhotoStore {
    private fun dir(context: Context): File =
        File(context.filesDir, "photos").apply { mkdirs() }

    fun save(context: Context, photoKey: String, bytes: ByteArray) {
        File(dir(context), photoKey).writeBytes(bytes)
    }

    fun read(context: Context, photoKey: String): Bitmap? {
        val file = File(dir(context), photoKey)
        if (!file.exists()) {
            return null
        }
        val bytes = file.readBytes()
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    fun delete(context: Context, photoKey: String) {
        File(dir(context), photoKey).delete()
    }
}
