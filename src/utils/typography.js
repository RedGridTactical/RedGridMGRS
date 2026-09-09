// Static fonts are bundled locally; loading them never requires a remote font service.
// Unmodified sources and their OFL licenses:
// github.com/jpt/barlow @ dc2940e2e04ef4ec96c07e23e0f02aefbddd343b
// github.com/IBM/plex @ bf260093582f04622aacc1e9f9ca604d7ccd0c42
export const FONTS = {
  regular: 'BarlowSemiCondensed-Regular',
  medium: 'BarlowSemiCondensed-Medium',
  semibold: 'BarlowSemiCondensed-SemiBold',
  mono: 'IBMPlexMono-Medium',
};

export const FONT_ASSETS = {
  [FONTS.regular]: require('../../assets/fonts/BarlowSemiCondensed-Regular.ttf'),
  [FONTS.medium]: require('../../assets/fonts/BarlowSemiCondensed-Medium.ttf'),
  [FONTS.semibold]: require('../../assets/fonts/BarlowSemiCondensed-SemiBold.ttf'),
  [FONTS.mono]: require('../../assets/fonts/IBMPlexMono-Medium.ttf'),
};

// Each family names one static face. Keep fontWeight neutral so native platforms
// use that face rather than synthesizing a second weight on top of it.
export const TYPE = {
  body: { fontFamily: FONTS.regular, fontWeight: '400' },
  label: { fontFamily: FONTS.medium, fontWeight: '400' },
  heading: { fontFamily: FONTS.semibold, fontWeight: '400' },
  data: { fontFamily: FONTS.mono, fontWeight: '400', writingDirection: 'ltr' },
};
