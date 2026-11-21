// The colibly theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in colibly.settings.json and the generated colibly.settings.ts;
// change them with `astryx experimental theme editor set colibly ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {coliblySettings} from './colibly.settings';

export const coliblyTheme = defineTheme({
  extends: coliblySettings,
  name: 'colibly',
});
