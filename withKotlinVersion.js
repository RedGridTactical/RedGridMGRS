/**
 * withKotlinVersion.js
 * Custom Expo config plugin that directly patches android/build.gradle
 * to pin the Kotlin version to 1.8.22, which is compatible with
 * expo-modules-core in Expo SDK 51.
 *
 * Place this file in the root of your project alongside app.json.
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const withKotlinVersion = (config) => {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Replace whatever kotlinVersion is set to with 1.8.22
    if (contents.includes('kotlinVersion =')) {
      config.modResults.contents = contents.replace(
        /kotlinVersion\s*=\s*["'][^"']+["']/g,
        'kotlinVersion = "1.8.22"'
      );
    } else {
      // If not present, inject it into the buildscript ext block
      config.modResults.contents = contents.replace(
        /buildscript\s*\{[\s\S]*?ext\s*\{/,
        (match) => match + '\n        kotlinVersion = "1.8.22"'
      );
    }

    return config;
  });
};

module.exports = withKotlinVersion;
