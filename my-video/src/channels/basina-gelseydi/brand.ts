import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

/**
 * BAŞINA GELSEYDİ — channel identity shared by every episode.
 * Fonts are self-hosted (SIL OFL) and split latin / latin-ext so Turkish glyphs
 * (ş ğ ı İ ç ö ü) always render, offline.
 */
export const HEAD_FONT = 'BG Anton';
export const BODY_FONT = 'BG Montserrat';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-0130,U+0132-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

export const fontsReady = Promise.all([
	loadFont({family: HEAD_FONT, url: staticFile('fonts/Anton-latin.woff2'), unicodeRange: LATIN}),
	loadFont({family: HEAD_FONT, url: staticFile('fonts/Anton-latin-ext.woff2'), unicodeRange: LATIN_EXT}),
	loadFont({family: BODY_FONT, url: staticFile('fonts/Montserrat-latin.woff2'), weight: '100 900', unicodeRange: LATIN}),
	loadFont({family: BODY_FONT, url: staticFile('fonts/Montserrat-latin-ext.woff2'), weight: '100 900', unicodeRange: LATIN_EXT}),
]);

export const BRAND = {
	name: 'BAŞINA GELSEYDİ',
	handle: '@basinagelseydi',
	series: 'YA BÖYLE OLSAYDI?',
	ink: '#15121c',
	yellow: '#FFD23F',
	orange: '#FF7A2F',
	cyan: '#3EC5FF',
	pink: '#FF4F7B',
	paper: '#FFF8EC',
};
