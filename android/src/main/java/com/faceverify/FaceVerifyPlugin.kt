package com.faceverify

import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.sqrt

class FaceVerifyPlugin : FrameProcessorPlugin() {

  private val faceDetector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
      .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
      .build()
  )

  private fun orientationDegrees(frame: Frame): Int {
    val name = frame.orientation.toString().uppercase()
    return when {
      name.contains("LANDSCAPE_LEFT")        -> 90
      name.contains("PORTRAIT_UPSIDE_DOWN")  -> 180
      name.contains("LANDSCAPE_RIGHT")       -> 270
      else                                   -> 0
    }
  }

  /**
   * Computes Laplacian variance on the Y (luma) plane of the frame.
   * Samples every 8th pixel for performance. Higher = sharper.
   *
   * IMPORTANT: All returned numbers must be Double — JSI cannot convert Float.
   */
  private fun laplacianVariance(image: Image): Double {
    val plane = image.planes[0]          // Y plane
    val buffer: ByteBuffer = plane.buffer
    val rowStride = plane.rowStride
    val width = image.width
    val height = image.height
    val step = 8

    val values = mutableListOf<Double>()

    for (y in 1 until height - 1 step step) {
      for (x in 1 until width - 1 step step) {
        val center = (buffer.get(y * rowStride + x).toInt() and 0xFF).toDouble()
        val top    = (buffer.get((y - 1) * rowStride + x).toInt() and 0xFF).toDouble()
        val bottom = (buffer.get((y + 1) * rowStride + x).toInt() and 0xFF).toDouble()
        val left   = (buffer.get(y * rowStride + (x - 1)).toInt() and 0xFF).toDouble()
        val right  = (buffer.get(y * rowStride + (x + 1)).toInt() and 0xFF).toDouble()
        values.add(abs(top + bottom + left + right - 4.0 * center))
      }
    }

    if (values.isEmpty()) return 0.0
    val mean = values.average()
    return values.map { (it - mean) * (it - mean) }.average()
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any {
    val mediaImage: Image = frame.image
    val sharpness = laplacianVariance(mediaImage)
    val inputImage = InputImage.fromMediaImage(mediaImage, orientationDegrees(frame))

    return try {
      val faces = Tasks.await(faceDetector.process(inputImage))

      if (faces.isEmpty()) {
        return mapOf("detected" to false, "sharpness" to sharpness)
      }

      val face = faces.first()
      val box = face.boundingBox

      // All numeric values must be Double — JSI cannot convert Java Float.
      mapOf(
        "detected" to true,
        "bounds" to mapOf(
          "x"      to box.left.toDouble(),
          "y"      to box.top.toDouble(),
          "width"  to box.width().toDouble(),
          "height" to box.height().toDouble()
        ),
        "frameWidth"              to mediaImage.width.toDouble(),
        "frameHeight"             to mediaImage.height.toDouble(),
        "yawAngle"                to face.headEulerAngleY.toDouble(),
        "pitchAngle"              to face.headEulerAngleX.toDouble(),
        "rollAngle"               to face.headEulerAngleZ.toDouble(),
        "leftEyeOpenProbability"  to (face.leftEyeOpenProbability?.toDouble()  ?: -1.0),
        "rightEyeOpenProbability" to (face.rightEyeOpenProbability?.toDouble() ?: -1.0),
        "sharpness"               to sharpness
      )
    } catch (e: Exception) {
      mapOf("detected" to false, "sharpness" to sharpness)
    }
  }
}
