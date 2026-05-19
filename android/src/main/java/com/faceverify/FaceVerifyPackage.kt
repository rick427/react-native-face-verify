package com.faceverify

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class FaceVerifyPackage : ReactPackage {

  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectFaceQuality") { _, _ ->
        FaceVerifyPlugin()
      }
    }
  }

  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): MutableList<NativeModule> = mutableListOf()

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): MutableList<ViewManager<*, *>> = mutableListOf()
}
