'use client';

import Link from 'next/link';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {themes, defaultThemeSlug} from '@/astryx-themes';
import {ColorModeProvider, setColorMode, useStoredColorMode} from '@/components/ColorMode';

export function Providers({children}: {children: React.ReactNode}) {
  const mode = useStoredColorMode();
  const toggle = () => setColorMode(mode === 'dark' ? 'light' : 'dark');

  return (
    <ColorModeProvider value={{mode, toggle}}>
      <Theme theme={themes[defaultThemeSlug]} mode={mode}>
        <LinkProvider component={Link}>{children}</LinkProvider>
      </Theme>
    </ColorModeProvider>
  );
}
