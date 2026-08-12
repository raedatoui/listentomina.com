import type { EffectConfig } from '@/effects/config';
import { defaultPreset } from '@/effects/presets/default';

// Named presets shown in the GUI dropdown. To add one: tune in the GUI,
// hit "copy preset", paste into a new file here and register it below.
export const PRESETS: Record<string, Partial<EffectConfig>> = {
    default: defaultPreset,
};
