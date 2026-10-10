#import "AppDelegate.h"

#if __has_include(<Expo/Expo-Swift.h>)
#import <Expo/Expo-Swift.h>
#else
#import "Expo-Swift.h"
#endif
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface RedGridFieldViewController : UIViewController
@end
@implementation RedGridFieldViewController
- (BOOL)prefersHomeIndicatorAutoHidden { return YES; }
@end

@implementation ExpoReactNativeFactoryDelegate (RedGridBundleURL)

- (UIViewController *)createRootViewController { return [RedGridFieldViewController new]; }

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
@property (nonatomic, copy) NSDictionary *reactLaunchOptions;

- (UIWindow *)connectWindowScene:(UIWindowScene *)scene options:(UISceneConnectionOptions *)options;

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

  self.reactLaunchOptions = launchOptions;

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (UIWindow *)connectWindowScene:(UIWindowScene *)scene options:(UISceneConnectionOptions *)options
{
  if (self.rootWindow) {
    // Reconnect the existing single React root without losing in-memory navigation.
    self.rootWindow.windowScene = scene;
    [self.rootWindow makeKeyAndVisible];
    return self.rootWindow;
  }

  NSMutableDictionary *launchOptions = [self.reactLaunchOptions mutableCopy] ?: [NSMutableDictionary new];
  UIOpenURLContext *urlContext = options.URLContexts.anyObject;
  if (urlContext) {
    launchOptions[UIApplicationLaunchOptionsURLKey] = urlContext.URL;
    if (urlContext.options.sourceApplication) {
      launchOptions[UIApplicationLaunchOptionsSourceApplicationKey] = urlContext.options.sourceApplication;
    }
    if (urlContext.options.annotation) {
      launchOptions[UIApplicationLaunchOptionsAnnotationKey] = urlContext.options.annotation;
    }
  }
  for (NSUserActivity *activity in options.userActivities) {
    if ([activity.activityType isEqualToString:NSUserActivityTypeBrowsingWeb]) {
      // RCTLinkingManager reads these launch options for Linking.getInitialURL().
      launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey] = @{
        UIApplicationLaunchOptionsUserActivityTypeKey: activity.activityType,
        @"UIApplicationLaunchOptionsUserActivityKey": activity
      };
      break;
    }
  }

  self.rootWindow = [[UIWindow alloc] initWithWindowScene:scene];
  [self.reactNativeFactory startReactNativeWithModuleName:@"main"
                                               inWindow:self.rootWindow
                                          launchOptions:launchOptions];
  self.reactLaunchOptions = nil;
  return self.rootWindow;
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  BOOL handled = [super application:application openURL:url options:options];
  return [RCTLinkingManager application:application openURL:url options:options] || handled;
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

// UIKit owns the window lifecycle; the app retains one React root across reconnects.
@interface RedGridSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation RedGridSceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options
{
  if (![scene isKindOfClass:[UIWindowScene class]]) return;
  AppDelegate *delegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  BOOL reconnecting = delegate.window != nil;
  self.window = [delegate connectWindowScene:(UIWindowScene *)scene options:options];
  if (reconnecting) {
    [self scene:scene openURLContexts:options.URLContexts];
    for (NSUserActivity *activity in options.userActivities) {
      [self scene:scene continueUserActivity:activity];
    }
  }
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  AppDelegate *delegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  for (UIOpenURLContext *context in URLContexts) {
    NSMutableDictionary *options = [NSMutableDictionary dictionaryWithObject:@(context.options.openInPlace)
                                                                     forKey:UIApplicationOpenURLOptionsOpenInPlaceKey];
    if (context.options.sourceApplication) options[UIApplicationOpenURLOptionsSourceApplicationKey] = context.options.sourceApplication;
    if (context.options.annotation) options[UIApplicationOpenURLOptionsAnnotationKey] = context.options.annotation;
    [delegate application:UIApplication.sharedApplication openURL:context.URL options:options];
  }
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)activity
{
  [(AppDelegate *)UIApplication.sharedApplication.delegate
    application:UIApplication.sharedApplication continueUserActivity:activity
    restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *objects) {}];
}

// Expo modules still receive application callbacks in this SDK version. UIKit
// continues posting application state notifications for React Native AppState.
- (void)sceneDidBecomeActive:(UIScene *)scene
{
  [UIApplication.sharedApplication.delegate applicationDidBecomeActive:UIApplication.sharedApplication];
}

- (void)sceneWillResignActive:(UIScene *)scene
{
  [UIApplication.sharedApplication.delegate applicationWillResignActive:UIApplication.sharedApplication];
}

- (void)sceneDidEnterBackground:(UIScene *)scene
{
  [UIApplication.sharedApplication.delegate applicationDidEnterBackground:UIApplication.sharedApplication];
}

- (void)sceneWillEnterForeground:(UIScene *)scene
{
  [UIApplication.sharedApplication.delegate applicationWillEnterForeground:UIApplication.sharedApplication];
}

@end
