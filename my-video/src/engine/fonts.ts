import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Self-hosted variable fonts (SIL Open Font License) so renders work fully offline.
export const TITLE_FONT = 'Cinzel';
export const CAPTION_FONT = 'Montserrat';

loadFont({family: TITLE_FONT, url: staticFile('fonts/Cinzel.woff2'), weight: '400 900'});
loadFont({family: CAPTION_FONT, url: staticFile('fonts/Montserrat.woff2'), weight: '100 900'});
