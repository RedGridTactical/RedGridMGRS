#import "AppDelegate.h"

#if __has_include(<Expo/Expo-Swift.h>)
#import <Expo/Expo-Swift.h>
#else
#import "Expo-Swift.h"
#endif
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation ExpoReactNativeFactoryDelegate (RedGridBundleURL)

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return bridge.bundleURL ?: [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

@interface AppDelegate ()

@property (nonatomic, strong) UIWindow *rootWindow;
@property (nonatomic, strong) ExpoReactNativeFactoryDelegate *reactNativeDelegate;
@property (nonatomic, strong) ExpoReactNativeFactory *reactNativeFactory;

@end

@implementation AppDelegate

- (UIWindow *)window
{
  return self.rootWindow;
}

- (void)setWindow:(UIWindow *)window
{
  self.rootWindow = window;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  ExpoReactNativeFactoryDelegate *delegate = [ExpoReactNativeFactoryDelegate new];
  ExpoReactNativeFactory *factory = [[ExpoReactNativeFactory alloc] initWithDelegate:delegate];
  delegate.dependencyProvider = [RCTAppDependencyProvider new];

  self.reactNativeDelegate = delegate;
  self.reactNativeFactory = factory;
  [[self valueForKey:@"_expoAppDelegate"] setValue:factory forKey:@"factory"];

  self.rootWindow = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
  [factory startReactNativeWithModuleName:@"main"
                                 inWindow:self.rootWindow
                            launchOptions:launchOptions];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

@end
