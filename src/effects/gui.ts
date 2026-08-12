// The lil-gui tweak panel. Presets (a folder of committed objects) replace
// the prototype's localStorage save / defaults.js export: pick one from the
// dropdown, tune, then "copy preset" emits a ready-to-paste object literal
// for src/effects/presets/.

import GUI from 'lil-gui';
import { BASE, type EffectConfig, type LiveParams, SETTINGS_KEYS } from '@/effects/config';
import { PRESETS } from '@/effects/presets';

export interface GuiHooks {
    play(): void;
    doMove(): void;
    /** primary placement / arrangement inputs changed — rebuild cells */
    invalidateCells(): void;
    /** target placement changed — rebuild only if the mark is docked there */
    invalidateTarget(): void;
    /** user grabbed the progress slider */
    stopPlaying(): void;
    /** user grabbed the move slider */
    scrubMove(): void;
    /** a preset was applied over params */
    onPresetApplied(): void;
}

const literal = (v: EffectConfig[keyof EffectConfig]) => (typeof v === 'string' ? `'${v}'` : String(v));

export function buildGui(params: LiveParams, hooks: GuiHooks, initialPreset: string): GUI {
    const gui = new GUI({ title: 'MINA · wgpu effects' });

    const state = { preset: initialPreset };
    const presetDefaults = () => ({ ...BASE, ...PRESETS[state.preset] });
    const actions = {
        copyPreset: () => {
            const lines = SETTINGS_KEYS.map((key) => `    ${key}: ${literal(params[key])},`);
            const body = `const preset: Partial<EffectConfig> = {\n${lines.join('\n')}\n};\n`;
            navigator.clipboard?.writeText(body).catch(() => {});
            console.log(body); // in case clipboard access is blocked
            copyCtrl.name('copied ✓');
            setTimeout(() => copyCtrl.name('copy preset'), 1200);
        },
    };
    gui.add(state, 'preset', Object.keys(PRESETS)).onChange(() => {
        Object.assign(params, BASE, PRESETS[state.preset]);
        hooks.onPresetApplied();
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
    });
    const copyCtrl = gui.add(actions, 'copyPreset').name('copy preset');

    const fSeq = gui.addFolder('Sequence');
    fSeq.add(hooks, 'play').name('▶ play');
    fSeq.add(params, 'progress', 0, 1, 0.001).name('progress').listen().onChange(hooks.stopPlaying);
    fSeq.add(params, 'duration', 1, 20, 0.1).name('duration (s)');
    fSeq.add(params, 'stagger', 0, 3, 0.01).name('ray stagger').onChange(hooks.invalidateCells);
    fSeq.add(params, 'density', 0.3, 1, 0.01).name('line density').onChange(hooks.invalidateCells);
    fSeq.add(params, 'maxRays', 1, 6, 1).name('rays / vertex').onChange(hooks.invalidateCells);
    fSeq.add(params, 'autoplay').name('autoplay on load');

    const fLogo = gui.addFolder('Logo');
    fLogo.add(params, 'logoScale', 0.05, 1.2, 0.01).name('scale').onChange(hooks.invalidateCells);
    fLogo.add(params, 'logoX', 0.1, 0.9, 0.005).name('centre X').onChange(hooks.invalidateCells);
    fLogo.add(params, 'logoY', 0.1, 0.9, 0.005).name('centre Y').onChange(hooks.invalidateCells);

    const fMove = gui.addFolder('Move');
    fMove.add(hooks, 'doMove').name('⇄ move');
    fMove.add(params, 'move', 0, 1, 0.001).name('move progress').listen().onChange(hooks.scrubMove);
    fMove.add(params, 'moveDelay', 0, 3, 0.05).name('move delay (s)');
    fMove.add(params, 'moveDur', 0.5, 8, 0.1).name('move time (s)');
    fMove.add(params, 'moveStagger', 0, 1, 0.01).name('move stagger');
    fMove.add(params, 'moveFade', 0.05, 1.5, 0.05).name('fade time');
    fMove.add(params, 'newLinesBy', 0.1, 1, 0.05).name('new lines by');
    // when the mark is currently AT the target placement (i.e. after a move),
    // these sliders reposition it in real time so it can be placed by eye
    fMove.add(params, 'logoScale2', 0.05, 1.2, 0.01).name('target scale').onChange(hooks.invalidateTarget);
    fMove.add(params, 'logoX2', 0, 1, 0.005).name('target X').onChange(hooks.invalidateTarget);
    fMove.add(params, 'logoY2', 0, 1, 0.005).name('target Y').onChange(hooks.invalidateTarget);
    fMove.add(params, 'autoMove').name('auto move');

    const fRev = gui.addFolder('Reveal');
    fRev.add(params, 'whiteDur', 0.01, 0.5, 0.01).name('white flash');
    fRev.add(params, 'colorDur', 0.02, 2, 0.01).name('white → colour');
    fRev.add(params, 'texDur', 0.05, 3, 0.01).name('colour → texture');
    fRev.add(params, 'whiteLevel', 0, 1, 0.01).name('flash level');
    fRev.add(params, 'colorSat', 0, 2, 0.01).name('colour sat');
    fRev.add(params, 'colorBoost', 0.3, 2, 0.01).name('colour bright');
    fRev.add(params, 'hold', 0.02, 1, 0.01).name('handoff');

    fLogo.add(params, 'dotSize', 0, 3, 0.01).name('dot size');
    fLogo.add(params, 'dotStart', 0, 1, 0.005).name('dot start');
    fLogo.add(params, 'dotStagger', 0, 0.45, 0.005).name('dot stagger');
    fLogo.add(params, 'dotGrow', 0.01, 0.4, 0.005).name('dot grow');
    fLogo.add(params, 'dotPulse', 0, 5, 0.05).name('dot pulse');
    fLogo.add(params, 'dotTiming').name('dots @').disable().listen();

    const fLine = gui.addFolder('Lines');
    fLine.add(params, 'lineWidth', 0, 20, 0.5).name('thickness');
    fLine.add(params, 'taper', 0, 1, 0.01).name('motion taper');
    fLine.add(params, 'lineH', 0, 360, 1).name('hue');
    fLine.add(params, 'lineS', 0, 100, 1).name('saturation');
    fLine.add(params, 'lineB', 0, 100, 1).name('brightness');

    const fGlow = gui.addFolder('Glow');
    fGlow.add(params, 'glow', 0, 2, 0.01).name('strength');
    fGlow.add(params, 'glowWidth', 0, 14, 0.1).name('width');
    fGlow.add(params, 'glowLayers', 1, 3, 1).name('layers');
    fGlow.add(params, 'glowFalloff', 0.4, 5, 0.1).name('falloff');
    fGlow.add(params, 'glowHue', -180, 180, 1).name('hue shift');
    fGlow.add(params, 'bloom', 0, 3, 0.01).name('bloom');
    fGlow.add(params, 'bloomRadius', 0.5, 4, 0.05).name('bloom radius');
    fGlow.add(params, 'bloomIdle', 0, 1, 0.01).name('bloom at rest');

    const fTrail = gui.addFolder('Trail');
    fTrail.add(params, 'trail', 0, 1, 0.01).name('amount');
    fTrail.add(params, 'trailBias', 0.1, 3, 0.05).name('bias');
    fTrail.add(params, 'trailDim', 0, 1, 0.01).name('tail brightness');
    fTrail.add(params, 'trailHue', -180, 180, 1).name('tail hue shift');
    fTrail.add(params, 'trailFade', 0.05, 1.5, 0.05).name('settle fade (s)');

    const fTex = gui.addFolder('Texture');
    fTex.add(params, 'texScale', 0.2, 4, 0.01).name('start scale');

    gui.controllersRecursive().forEach((c) => {
        if (!SETTINGS_KEYS.includes(c.property as keyof EffectConfig)) return;
        c.$name.style.cursor = 'pointer';
        c.$name.title = 'double-click to reset to the preset value';
        c.$name.addEventListener('dblclick', () => c.setValue(presetDefaults()[c.property as keyof EffectConfig]));
    });

    return gui;
}
