#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FaceVerifyModule, NSObject)

RCT_EXTERN_METHOD(
  checkQuality:(NSString *)imagePath
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  readAsBase64:(NSString *)imagePath
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
