# Contributing to Red Grid Tactical

Thanks for your interest in contributing to Red Grid Tactical. This guide covers how to get involved.

## Ways to Contribute

### Bug Reports
Open an [issue](https://github.com/RedGridTactical/RedGridMGRS/issues) with:
- Device and OS version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

### Feature Requests
Open an [issue](https://github.com/RedGridTactical/RedGridMGRS/issues) or start a [discussion](https://github.com/RedGridTactical/RedGridMGRS/discussions/categories/ideas). Check the [roadmap](README.md#roadmap) first to see if it's already planned.

### Testing
We need testers, especially on Android. See [Testing](#testing) below.

### Code
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test on at least one platform (iOS or Android)
5. Submit a pull request

## Setup

```bash
git clone https://github.com/RedGridTactical/RedGridMGRS.git
cd RedGridMGRS
npm install
npx expo start
```

Requirements: Node 18+, Expo CLI, iOS Simulator or Android Emulator (or physical device with Expo Go).

## Architecture

- **Stack:** React Native 0.76.5 / Expo SDK 52 / JavaScript (no TypeScript)
- **Pattern:** Hooks-based, no class components
- **Theming:** `useColors()` from `src/utils/ThemeContext.js`
- **State:** React hooks + AsyncStorage for persistence
- **Privacy:** Zero-network — never add analytics, tracking, or network calls

### Key Directories
```
src/
  components/    # Reusable UI components and tactical tools
  hooks/         # Custom hooks (useLocation, useIAP, useSettings, useTheme)
  screens/       # Tab screens (Tools, Report, WaypointLists, Theme)
  utils/         # Core utilities (mgrs.js, tactical.js, storage.js, haptics.js, voice.js)
```

## Code Standards

- JavaScript only, no TypeScript
- Hooks-based functional components
- Use `useColors()` for all colors — never hardcode color values
- No network calls of any kind (analytics, tracking, crash reporting, etc.)
- Run tests before submitting: `npx jest --no-cache --verbose`

## Testing

### Automated Tests
```bash
npx jest --no-cache --verbose
```
142 tests total, 139 currently passing. If your change breaks existing tests, fix them before submitting.

### Becoming a Tester
We need closed testing participants, especially on Android (Google Play requires 12 testers before production release). To join:
- Email redgridtactical@gmail.com with your Google Play email
- Or open an issue requesting tester access

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Test on at least one platform
- Don't include unrelated formatting or refactoring changes
- Pro features (IAP-gated) require a valid purchase to test in production builds

## What We're Looking For

Check the [roadmap](README.md#roadmap) for planned features. High-value contributions:
- Bug fixes and stability improvements
- Accessibility enhancements
- New tactical tools or report templates
- Performance optimizations
- Test coverage improvements

## License

By contributing, you agree that your contributions will be licensed under the [MIT + Commons Clause](LICENSE) license.

## Questions?

- [Discussions](https://github.com/RedGridTactical/RedGridMGRS/discussions)
- [Issues](https://github.com/RedGridTactical/RedGridMGRS/issues)
- Email: redgridtactical@gmail.com
