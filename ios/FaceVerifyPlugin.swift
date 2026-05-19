import VisionCamera
import MLKitFaceDetection
import MLKitVision
import UIKit
import AVFoundation
import Accelerate

@objc(FaceVerifyPlugin)
public class FaceVerifyPlugin: FrameProcessorPlugin {

  private var faceDetector: FaceDetector

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = [:]) {
    let opts = FaceDetectorOptions()
    opts.performanceMode = .fast
    opts.classificationMode = .all
    opts.landmarkMode = .none
    opts.contourMode = .none
    opts.isTrackingEnabled = false
    self.faceDetector = FaceDetector.faceDetector(options: opts)
    super.init(proxy: proxy, options: options)
  }

  public override func callback(
    _ frame: Frame,
    withArguments arguments: [AnyHashable: Any]?
  ) -> Any {
    let sharpness = laplacianVariance(frame.buffer)

    let image = VisionImage(buffer: frame.buffer)
    image.orientation = uiOrientation(from: frame)

    do {
      let faces = try faceDetector.results(in: image)
      guard let face = faces.first else {
        return ["detected": false, "sharpness": sharpness]
      }

      let bufW = Double(CVPixelBufferGetWidth(frame.buffer))
      let bufH = Double(CVPixelBufferGetHeight(frame.buffer))

      return [
        "detected": true,
        "bounds": [
          "x": Double(face.frame.origin.x),
          "y": Double(face.frame.origin.y),
          "width": Double(face.frame.size.width),
          "height": Double(face.frame.size.height),
        ],
        "frameWidth": bufW,
        "frameHeight": bufH,
        "yawAngle": Double(face.headEulerAngleY),
        "pitchAngle": Double(face.headEulerAngleX),
        "rollAngle": Double(face.headEulerAngleZ),
        "leftEyeOpenProbability": Double(face.leftEyeOpenProbability),
        "rightEyeOpenProbability": Double(face.rightEyeOpenProbability),
        "sharpness": sharpness,
      ]
    } catch {
      return ["detected": false, "sharpness": sharpness]
    }
  }

  // MARK: - Sharpness (Laplacian variance)

  /// Computes the Laplacian variance of the luma channel as a sharpness metric.
  /// Samples every 8th pixel for performance. Higher = sharper.
  private func laplacianVariance(_ buffer: CVPixelBuffer) -> Double {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }

    let pixels = base.assumingMemoryBound(to: UInt8.self)
    let step = 8
    var values: [Double] = []
    values.reserveCapacity(((width / step) - 2) * ((height / step) - 2))

    // BGRA layout — channel index 1 (G) is a reasonable luma approximation
    // without needing to know the exact pixel format.
    let channel = 1

    for y in stride(from: 1, to: height - 1, by: step) {
      for x in stride(from: 1, to: width - 1, by: step) {
        let center = Int(pixels[y * bytesPerRow + x * 4 + channel])
        let top    = Int(pixels[(y - 1) * bytesPerRow + x * 4 + channel])
        let bottom = Int(pixels[(y + 1) * bytesPerRow + x * 4 + channel])
        let left   = Int(pixels[y * bytesPerRow + (x - 1) * 4 + channel])
        let right  = Int(pixels[y * bytesPerRow + (x + 1) * 4 + channel])
        let lap = Double(abs(top + bottom + left + right - 4 * center))
        values.append(lap)
      }
    }

    guard !values.isEmpty else { return 0 }
    let mean = values.reduce(0, +) / Double(values.count)
    let variance = values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(values.count)
    return variance
  }

  // MARK: - Orientation helper

  private func uiOrientation(from frame: Frame) -> UIImage.Orientation {
    switch frame.orientation {
    case .portrait:           return .right
    case .portraitUpsideDown: return .left
    case .landscapeLeft:      return .up
    case .landscapeRight:     return .down
    @unknown default:         return .right
    }
  }
}
