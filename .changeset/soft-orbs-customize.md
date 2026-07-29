---
'orb-ui': minor
---

Add typed theme configuration objects with `balanced`, `calm`, and `expressive` presets plus
theme-specific appearance, geometry, and motion overrides. String theme names remain shorthand for
the balanced preset. Add application-wide defaults through `OrbThemeProvider`, responsive
`--orb-ui-*` variables, stable semantic slots, replaceable built-in control chrome, and completely
custom theme renderers that retain Orb's normalized signal and accessible lifecycle contract. Theme
motion exposes semantic response exponent, activity rise/fall, and state transition timing
separately from provider volume normalization.
