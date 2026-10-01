# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# expo-modules-core converts JS argument maps into Kotlin Records through
# kotlin-reflect at runtime (RecordTypeConverter: memberProperties -> javaField).
# With R8 optimization enabled, shrinking/merging inside expo.modules.* and
# kotlin-reflect makes that lookup return null and every location watch fails
# before the first fix. Keeping the Expo module layer and kotlin-reflect intact
# restores it; optimization still applies to the rest of the app.
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-dontwarn kotlin.reflect.**
-keep class expo.modules.** { *; }
