import type { Preset } from '@/effects/config';
import { defaultPreset } from '@/effects/presets/default';
import { ephemeral } from '@/effects/presets/ephemeral';

// Named presets shown in the GUI dropdown. To add one: tune in the GUI,
// hit "copy preset", paste into a new file here and register it below.
// A preset may also declare `tweens` — see TweenSpec in config.ts.
export const PRESETS: Record<string, Preset> = {
    default: defaultPreset,
    ephemeral,
};
