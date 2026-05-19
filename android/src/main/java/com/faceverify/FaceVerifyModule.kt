package com.faceverify

import android.graphics.BitmapFactory
import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlin.math.abs

class FaceVerifyModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "FaceVerifyModule"

  private val faceDetector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
      .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
      .build()
  )

  @ReactMethod
  fun checkQuality(imagePath: String, promise: Promise) {
    Thread {
      try {
        val cleanPath = imagePath.removePrefix("file://")
        val bitmap = BitmapFactory.decodeFile(cleanPath)

        if (bitmap == null) {
          promise.resolve(result(passed = false, reason = "no_face"))
          return@Thread
        }

        // Brightness — reject images taken in darkness
        val brightness = averageBrightness(bitmap)
        if (brightness < 40.0) {
          promise.resolve(result(passed = false, reason = "too_dark", brightness = brightness))
          return@Thread
        }

        // Sharpness — reject blurry captures
        val sharpness = laplacianVariance(bitmap)
        if (sharpness < 60.0) {
          promise.resolve(result(passed = false, reason = "blurry", sharpness = sharpness))
          return@Thread
        }

        // Face presence + pose
        val inputImage = InputImage.fromBitmap(bitmap, 0)
        val faces = Tasks.await(faceDetector.process(inputImage))

        if (faces.isEmpty()) {
          promise.resolve(result(passed = false, reason = "no_face"))
          return@Thread
        }

        val face = faces.first()
        if (abs(face.headEulerAngleY.toDouble()) > 25 ||
            abs(face.headEulerAngleX.toDouble()) > 25) {
          promise.resolve(result(passed = false, reason = "bad_pose"))
          return@Thread
        }

        promise.resolve(result(passed = true, sharpness = sharpness, brightness = brightness))
      } catch (e: Exception) {
        promise.resolve(result(passed = false, reason = "no_face"))
      }
    }.start()
  }

  // MARK: - Brightness (luminance average, sampled)

  private fun averageBrightness(bitmap: android.graphics.Bitmap): Double {
    val step = 8
    var total = 0.0
    var count = 0
    for (y in 0 until bitmap.height step step) {
      for (x in 0 until bitmap.width step step) {
        total += luma(bitmap.getPixel(x, y))
        count++
      }
    }
    return if (count > 0) total / count else 0.0
  }

  // MARK: - Sharpness (Laplacian variance, sampled)

  private fun laplacianVariance(bitmap: android.graphics.Bitmap): Double {
    val step = 8
    val values = mutableListOf<Double>()
    for (y in 1 until bitmap.height - 1 step step) {
      for (x in 1 until bitmap.width - 1 step step) {
        val c = luma(bitmap.getPixel(x, y))
        val t = luma(bitmap.getPixel(x, y - 1))
        val b = luma(bitmap.getPixel(x, y + 1))
        val l = luma(bitmap.getPixel(x - 1, y))
        val r = luma(bitmap.getPixel(x + 1, y))
        values.add(abs(t + b + l + r - 4 * c))
      }
    }
    if (values.isEmpty()) return 0.0
    val mean = values.average()
    return values.map { (it - mean) * (it - mean) }.average()
  }

  private fun luma(pixel: Int): Double =
    0.299 * Color.red(pixel) + 0.587 * Color.green(pixel) + 0.114 * Color.blue(pixel)

  // MARK: - Result builder

  private fun result(
    passed: Boolean,
    reason: String? = null,
    sharpness: Double? = null,
    brightness: Double? = null,
  ): WritableMap = Arguments.createMap().apply {
    putBoolean("passed", passed)
    reason?.let { putString("reason", it) }
    sharpness?.let { putDouble("sharpness", it) }
    brightness?.let { putDouble("brightness", it) }
  }
}
