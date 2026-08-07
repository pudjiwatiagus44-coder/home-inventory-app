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

    fun read(
        context: Context,
        photoKey: String,
        maxDimension: Int = Int.MAX_VALUE,
    ): Bitmap? {
        val file = File(dir(context), photoKey)
        if (!file.exists()) {
            return null
        }
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            val options = BitmapFactory.Options().apply {
                inSampleSize = computeSampleSize(
                    bounds.outWidth,
                    bounds.outHeight,
                    maxDimension,
                )
            }
            BitmapFactory.decodeFile(file.absolutePath, options)
        } catch (_: OutOfMemoryError) {
            null
        } catch (_: Exception) {
            null
        }
    }

    fun delete(context: Context, photoKey: String) {
        File(dir(context), photoKey).delete()
    }

    private fun computeSampleSize(width: Int, height: Int, maxDimension: Int): Int {
        if (maxDimension >= Int.MAX_VALUE || width <= 0 || height <= 0) {
            return 1
        }
        var sample = 1
        while (
            width / sample > maxDimension * 2 ||
            height / sample > maxDimension * 2
        ) {
            sample *= 2
        }
        return sample
    }
}
