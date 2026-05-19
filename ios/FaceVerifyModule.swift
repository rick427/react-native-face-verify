import Foundation
import MLKitFaceDetection
import MLKitVision
import UIKit

@objc(FaceVerifyModule)
class FaceVerifyModule: NSObject {

  private lazy var faceDetector: FaceDetector = {
    let opts = FaceDetectorOptions()
    opts.performanceMode = .accurate
    opts.classificationMode = .none
    opts.landmarkMode = .none
    opts.contourMode = .none
    opts.isTrackingEnabled = false
    return FaceDetector.faceDetector(options: opts)
  }()

  @objc
  func checkQuality(
    _ imagePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }

      let path = imagePath.hasPrefix("file://") ? String(imagePath.dropFirst(7)) : imagePath
      guard let image = UIImage(contentsOfFile: path) else {
        resolve(["passed": false, "reason": "no_face"])
        return
      }

      // Brightness — reject images taken in darkness
      let brightness = self.averageBrightness(image)
      if brightness < 40 {
        resolve(["passed": false, "reason": "too_dark", "brightness": brightness])
        return
      }

      // Sharpness — reject severely blurry captures
      let sharpness = self.laplacianVariance(image)
      if sharpness < 15 {
        resolve(["passed": false, "reason": "blurry", "sharpness": sharpness])
        return
      }

      // Face presence + pose
      let visionImage = VisionImage(image: image)
      visionImage.orientation = image.imageOrientation

      do {
        let faces = try self.faceDetector.results(in: visionImage)
        guard let face = faces.first else {
          resolve(["passed": false, "reason": "no_face"])
          return
        }

        if abs(face.headEulerAngleY) > 40 || abs(face.headEulerAngleX) > 40 {
          resolve(["passed": false, "reason": "bad_pose"])
          return
        }

        resolve(["passed": true, "sharpness": sharpness, "brightness": brightness])
      } catch {
        resolve(["passed": false, "reason": "no_face"])
      }
    }
  }

  // MARK: - Brightness (luminance average, sampled)

  private func averageBrightness(_ image: UIImage) -> Double {
    guard let pixels = pixelBuffer(image) else { return 0 }
    let (data, w, h, bpr, bpp) = pixels
    let step = 8
    var total = 0.0
    var count = 0
    for y in stride(from: 0, to: h, by: step) {
      for x in stride(from: 0, to: w, by: step) {
        let i = y * bpr + x * bpp
        total += luma(data, i)
        count += 1
      }
    }
    return count > 0 ? total / Double(count) : 0
  }

  // MARK: - Sharpness (Laplacian variance, sampled)

  private func laplacianVariance(_ image: UIImage) -> Double {
    guard let pixels = pixelBuffer(image) else { return 0 }
    let (data, w, h, bpr, bpp) = pixels
    let step = 8
    var values = [Double]()
    for y in stride(from: 1, to: h - 1, by: step) {
      for x in stride(from: 1, to: w - 1, by: step) {
        let c  = luma(data, y * bpr + x * bpp)
        let t  = luma(data, (y - 1) * bpr + x * bpp)
        let b  = luma(data, (y + 1) * bpr + x * bpp)
        let l  = luma(data, y * bpr + (x - 1) * bpp)
        let r  = luma(data, y * bpr + (x + 1) * bpp)
        values.append(abs(t + b + l + r - 4 * c))
      }
    }
    guard !values.isEmpty else { return 0 }
    let mean = values.reduce(0, +) / Double(values.count)
    return values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(values.count)
  }

  // MARK: - Helpers

  private typealias PixelBuffer = ([UInt8], Int, Int, Int, Int)

  private func pixelBuffer(_ image: UIImage) -> PixelBuffer? {
    guard let cg = image.cgImage else { return nil }
    let w = cg.width, h = cg.height
    let bpp = 4, bpr = w * bpp
    var data = [UInt8](repeating: 0, count: h * bpr)
    guard let ctx = CGContext(
      data: &data, width: w, height: h,
      bitsPerComponent: 8, bytesPerRow: bpr,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    return (data, w, h, bpr, bpp)
  }

  private func luma(_ data: [UInt8], _ i: Int) -> Double {
    0.299 * Double(data[i]) + 0.587 * Double(data[i + 1]) + 0.114 * Double(data[i + 2])
  }

  @objc
  func readAsBase64(
    _ imagePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      let path = imagePath.hasPrefix("file://") ? String(imagePath.dropFirst(7)) : imagePath
      guard let data = FileManager.default.contents(atPath: path) else {
        reject("READ_ERROR", "Could not read file at path: \(path)", nil)
        return
      }
      resolve(data.base64EncodedString())
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}
