# X-Axis 10-Second Cap Bugfix Design

## Overview

The `CanvasEditor` renders a time-based waveform editor where the X axis represents time in seconds. Currently the viewport and rendering logic derives its maximum time from `waveData.length`, which can be up to 20.0 seconds (201 slots at 0.1s each). The fix introduces a hard cap of 10.0 seconds so that panning, axis labels, and spline drawing never exceed that boundary. The change is minimal: one new constant and three localized guard clauses.

## Glossary

- **Bug_Condition (C)**: The condition where the viewport, labels, or spline rendering references a time value greater than 10.0 seconds
- **Property (P)**: The desired behavior — all time-axis rendering and interaction is clamped at 10.0 seconds maximum
- **Preservation**: Existing behavior within the 0–10s window (panning, dragging control points, spline rendering, resizing) must remain unchanged
- **startTime**: The leftmost visible time in the viewport (seconds), controlled by panning
- **pixelsPerTenth**: Zoom factor — pixels per 0.1s slot (currently 8)
- **X_MAX_TIME**: New constant = 10.0 seconds, the hard upper bound for the time axis

## Bug Details

### Bug Condition

The bug manifests when the viewport or rendering logic attempts to display or evaluate time values beyond 10.0 seconds. This happens because the pan clamp uses `(waveData.length - 1) * 0.1` as its maximum (e.g., 20.0s for 201 slots), and the X-axis and spline rendering iterate through all visible tenths without any 10-second cap.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action: 'pan' | 'renderXAxis' | 'renderSpline', time: number }
  OUTPUT: boolean
  
  RETURN input.time > 10.0
         AND (
           (input.action == 'pan' AND viewportRightEdge > 10.0)
           OR (input.action == 'renderXAxis' AND tickTime > 10.0)
           OR (input.action == 'renderSpline' AND evaluationTime > 10.0)
         )
END FUNCTION
```

### Examples

- **Panning past 10s**: User right-click drags left — `startTime` can reach up to 19.0s (for 201-slot data), displaying empty time beyond 10.0s. Expected: pan stops so the right edge of the viewport cannot exceed 10.0s.
- **X-axis labels beyond 10s**: Tick marks and labels at 10.2, 10.4, … 20.0 are drawn. Expected: no ticks or labels drawn for t > 10.0.
- **Spline drawn beyond 10s**: The spline evaluator is called for t > 10.0, potentially drawing curve data past the boundary. Expected: spline evaluation stops at 10.0s.
- **Edge case — viewport exactly at 10s**: If the canvas is wide enough to show the full 10s without scrolling, panning should be locked at `startTime = 0`. Expected: no panning possible.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Right-click drag panning within 0–10s range continues to scroll smoothly
- Left-click drag on control points continues to update Y values and rebuild the spline
- Control point circles and spline curve render accurately for active points in 0–10s
- Canvas resize continues to trigger correct re-render within the capped domain
- Y-axis rendering and grid rendering remain identical
- Zoom level (pixelsPerTenth) behavior is unchanged

**Scope:**
All interactions that do NOT involve time values beyond 10.0 seconds are completely unaffected by this fix. This includes:
- All Y-axis operations (dragging, rendering, clamping)
- All rendering within the 0–10s time window
- Mouse hit-testing for control points
- ResizeObserver logic
- Spline construction from WaveData

## Hypothesized Root Cause

Based on the bug description, the issues are straightforward — there is no hard time cap anywhere in the code:

1. **Pan Clamp Uses waveData.length**: In `onMouseMove`, panning clamps `startTime` to `Math.max(0, Math.min(maxStart, ...))` where `maxStart = (this.waveData.length - 1) * 0.1`. For 201 slots this yields 20.0s. There is no consideration of a 10s cap, and crucially no consideration that the right edge of the viewport (startTime + visible duration) should also be bounded.

2. **X-Axis Draws All Visible Tenths**: `drawXAxis` iterates from `startTenth` to `startTenth + tenthsVisible` without any upper bound check on the time value. Any tick where `t > 10.0` should be skipped.

3. **Spline Evaluates Unbounded Time**: `drawSpline` iterates pixel-by-pixel across the plot width and evaluates `spline.evaluate(t)` for whatever time maps to that pixel. No check stops evaluation at 10.0s.

4. **No Shared MAX_TIME Constant**: The codebase lacks a single constant that defines the domain boundary, making it easy for all three sites to drift.

## Correctness Properties

Property 1: Bug Condition - Time axis capped at 10 seconds

_For any_ rendering or interaction event where the computed time value exceeds 10.0 seconds (isBugCondition returns true), the fixed CanvasEditor SHALL prevent that time from being displayed, evaluated, or reached by panning — specifically, pan clamp ensures viewport right edge <= 10.0s, X-axis labels/ticks are not drawn for t > 10.0, and spline is not evaluated for t > 10.0.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Behavior within 0–10s unchanged

_For any_ interaction or rendering event where the time value is within the 0–10.0 second range (isBugCondition returns false), the fixed CanvasEditor SHALL produce exactly the same visual output and state changes as the original code, preserving smooth panning, accurate control point dragging, correct spline rendering, and proper resize handling.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/CanvasEditor.ts`

**Specific Changes**:

1. **Add constant**: Introduce `const X_MAX_TIME = 10.0;` alongside the existing constants at the top of the file.

2. **Clamp pan logic in `onMouseMove`**: Replace the current `maxStart` calculation:
   ```typescript
   // Before:
   const maxStart = (this.waveData.length - 1) * 0.1;
   this.startTime = Math.max(0, Math.min(maxStart, this.panStartTime + dtSecs));
   
   // After:
   const visibleDuration = plotW / this.pixelsPerTenth * 0.1;
   const maxStart = Math.max(0, X_MAX_TIME - visibleDuration);
   this.startTime = Math.max(0, Math.min(maxStart, this.panStartTime + dtSecs));
   ```
   This ensures the viewport's right edge (`startTime + visibleDuration`) never exceeds `X_MAX_TIME`. Note: `plotW` needs to be derived from `this.canvas.width - MARGIN_LEFT` inside the handler.

3. **Guard in `drawXAxis`**: Add a check inside the tick-drawing loop to skip any tick where `t > X_MAX_TIME`:
   ```typescript
   if (t > X_MAX_TIME) continue;
   ```

4. **Guard in `drawSpline`**: Clamp the spline evaluation so it stops when time exceeds `X_MAX_TIME`:
   ```typescript
   const t = this.xToTime(cx);
   if (t > X_MAX_TIME) break;  // stop drawing beyond 10s
   ```

5. **No changes to**: `buildSplineFromData`, `drawGrid`, `drawYAxis`, `drawControlPoints`, `hitTestCircle`, `onMouseDown`, `onMouseUp`, `syncCanvasSize`, `setWaveData`, or any Y-axis logic.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate panning and inspect rendered output for time values beyond 10.0s. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Pan Past 10s Test**: Set up a 201-slot WaveData, simulate right-click drag far left — verify `startTime` can exceed what would place the right edge past 10.0s (will fail on unfixed code by succeeding to pan past)
2. **X-Axis Label Beyond 10s Test**: Pan to `startTime = 15.0`, call `drawXAxis` — verify labels at 15.2, 15.4 etc. are rendered (will show labels beyond 10s on unfixed code)
3. **Spline Beyond 10s Test**: Pan to `startTime = 9.0` with a wide canvas — verify `spline.evaluate` is called for t > 10.0 (will evaluate beyond 10s on unfixed code)
4. **Edge Case — Exactly 10s**: Viewport width exactly covers 10s — verify no panning is possible (may fail on unfixed code)

**Expected Counterexamples**:
- `startTime` reaches values like 15.0 or 19.0 on panning
- X-axis draws tick marks at 12.0, 14.0, etc.
- Spline evaluates at t = 11.0, 12.5, etc.
- Possible causes: pan clamp derived from waveData.length, no upper-bound check in rendering loops

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := canvasEditor_fixed.render(input)
  ASSERT no label/tick exists for t > 10.0
  ASSERT no spline evaluation for t > 10.0
  ASSERT startTime + visibleDuration <= 10.0
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT canvasEditor_original.render(input) = canvasEditor_fixed.render(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random viewport configurations within 0–10s and verifies rendering is identical
- It catches edge cases like startTime = 0, startTime = 9.9, narrow/wide canvases
- It provides strong guarantees that no within-range behavior changed

**Test Plan**: Observe behavior on UNFIXED code first for panning within 0–10s and rendering, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Pan Within Range Preservation**: Verify panning within 0–10s produces same startTime values before and after fix
2. **Control Point Drag Preservation**: Verify Y-value updates and spline rebuilds produce identical results
3. **Spline Rendering Preservation**: Verify spline curve pixels within 0–10s are identical before and after fix
4. **Resize Preservation**: Verify canvas resize triggers same re-render within capped domain

### Unit Tests

- Test that `X_MAX_TIME` constant equals 10.0
- Test pan clamping: startTime cannot result in viewport right edge > 10.0
- Test pan clamping: startTime still respects lower bound of 0
- Test drawXAxis skips ticks where t > 10.0
- Test drawSpline stops evaluation at t > 10.0
- Test edge case: canvas wide enough to show full 10s — no panning allowed

### Property-Based Tests

- Generate random `startTime` and `pixelsPerTenth` values — verify viewport right edge never exceeds 10.0 after pan clamping
- Generate random canvas widths — verify X-axis never renders labels beyond 10.0
- Generate random WaveData configurations — verify spline is never evaluated past 10.0

### Integration Tests

- Full render cycle with pan to boundary — visual output stays within 10s
- Resize canvas while panned near boundary — verify re-render respects cap
- Drag control point at t = 9.9 — verify spline updates correctly and doesn't bleed past 10s
