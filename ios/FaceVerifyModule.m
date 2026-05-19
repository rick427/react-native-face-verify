#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FaceVerifyModule, NSObject)

RCT_EXTERN_METHOD(
  checkQuality:(NSString *)imagePath
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
