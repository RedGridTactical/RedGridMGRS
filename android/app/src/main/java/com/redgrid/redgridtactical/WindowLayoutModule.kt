package com.redgrid.redgridtactical

import android.app.Activity
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executor

/**
 * Reports Jetpack WindowManager folding features to JS as window-dp bounds.
 * Listens only while the host activity is resumed; nothing runs in the
 * background and nothing is stored. No fold means an empty feature list.
 */
class WindowLayoutModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private var adapter: WindowInfoTrackerCallbackAdapter? = null
  private var latest: WindowLayoutInfo? = null
  private val mainExecutor = Executor { command -> reactContext.runOnUiQueueThread(command) }
  private val consumer = Consumer<WindowLayoutInfo> { info ->
    latest = info
    if (reactContext.hasActiveReactInstance()) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NAME, toMap(info))
    }
  }

  init { reactContext.addLifecycleEventListener(this) }

  override fun getName(): String = NAME

  @ReactMethod
  fun getCurrent(promise: Promise) {
    val info = latest
    promise.resolve(if (info == null) emptyPayload() else toMap(info))
  }

  // Required so NativeEventEmitter can subscribe without warnings.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  override fun onHostResume() {
    val activity: Activity = currentActivity ?: return
    if (adapter == null) adapter = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
    adapter?.addWindowLayoutInfoListener(activity, mainExecutor, consumer)
  }

  override fun onHostPause() { adapter?.removeWindowLayoutInfoListener(consumer) }

  override fun onHostDestroy() {
    adapter?.removeWindowLayoutInfoListener(consumer)
    adapter = null
    latest = null
  }

  override fun invalidate() {
    reactContext.removeLifecycleEventListener(this)
    onHostDestroy()
    super.invalidate()
  }

  private fun emptyPayload(): WritableMap = Arguments.createMap().apply { putArray("features", Arguments.createArray()) }

  private fun toMap(info: WindowLayoutInfo): WritableMap {
    val density = reactContext.resources.displayMetrics.density
    val features = Arguments.createArray()
    for (feature in info.displayFeatures) {
      if (feature !is FoldingFeature) continue
      val bounds = Arguments.createMap().apply {
        putDouble("left", feature.bounds.left / density.toDouble())
        putDouble("top", feature.bounds.top / density.toDouble())
        putDouble("right", feature.bounds.right / density.toDouble())
        putDouble("bottom", feature.bounds.bottom / density.toDouble())
      }
      features.pushMap(Arguments.createMap().apply {
        putMap("bounds", bounds)
        putString("orientation", if (feature.orientation == FoldingFeature.Orientation.HORIZONTAL) "HORIZONTAL" else "VERTICAL")
        putString("state", if (feature.state == FoldingFeature.State.HALF_OPENED) "HALF_OPENED" else "FLAT")
        putBoolean("isSeparating", feature.isSeparating)
        putString("occlusionType", if (feature.occlusionType == FoldingFeature.OcclusionType.FULL) "FULL" else "NONE")
      })
    }
    return Arguments.createMap().apply { putArray("features", features) }
  }

  companion object {
    const val NAME = "RedGridWindowLayout"
    const val EVENT_NAME = "RedGridWindowLayoutChanged"
  }
}
