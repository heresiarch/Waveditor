# Bugfix Requirements Document

## Introduction

The X axis (time axis) in CanvasEditor extends beyond 10 seconds because the pan clamp and rendering logic derive their maximum from `waveData.length` (default 201 slots = 20.0s). The axis should be fixed at a hard maximum of 10.0 seconds regardless of the underlying data length.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN panning the canvas THEN the system allows scrolling up to `(waveData.length - 1) * 0.1` seconds (e.g. 20.0s for a 201-slot wave), exceeding the 10-second boundary

1.2 WHEN rendering X axis labels and tick marks THEN the system draws them for all visible tenths without any 10-second cap, displaying time values beyond 10.0s

1.3 WHEN rendering the spline curve THEN the system evaluates and draws the curve for time values beyond 10.0 seconds if the viewport is panned past that point

### Expected Behavior (Correct)

2.1 WHEN panning the canvas THEN the system SHALL clamp the viewport so that the rightmost visible time never exceeds 10.0 seconds (i.e. `startTime` is limited so the view cannot scroll past 10.0s)

2.2 WHEN rendering X axis labels and tick marks THEN the system SHALL NOT draw any labels or ticks for time values greater than 10.0 seconds

2.3 WHEN rendering the spline curve THEN the system SHALL NOT evaluate or draw the curve for time values beyond 10.0 seconds

### Unchanged Behavior (Regression Prevention)

3.1 WHEN panning within the 0–10 second range THEN the system SHALL CONTINUE TO allow smooth horizontal scrolling via right-click drag

3.2 WHEN dragging control points vertically THEN the system SHALL CONTINUE TO update the Y value and rebuild the spline correctly

3.3 WHEN the waveData contains active points within the 0–10 second range THEN the system SHALL CONTINUE TO render their control circles and spline curve accurately

3.4 WHEN zooming or resizing the canvas THEN the system SHALL CONTINUE TO re-render the plot area correctly within the 0–10 second domain
