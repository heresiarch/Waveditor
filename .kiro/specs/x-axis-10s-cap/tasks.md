# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - X-Axis Exceeds 10-Second Cap
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Setup**: Install vitest and fast-check as dev dependencies, create vitest.config.ts
  - **Scoped PBT Approach**: For the pan clamp bug, scope the property to cases where panning would push the viewport right edge past 10.0s; for rendering, scope to viewport positions where startTime > 9.0s on a wide canvas
  - Test that pan clamping allows `startTime` values causing viewport right edge > 10.0s (from Bug Condition: `isBugCondition(input)` where `input.time > 10.0 AND input.action == 'pan' AND viewportRightEdge > 10.0`)
  - Test that `drawXAxis` renders ticks/labels for t > 10.0 when viewport is panned past 10s (from Bug Condition: `input.action == 'renderXAxis' AND tickTime > 10.0`)
  - Test that `drawSpline` evaluates the spline for t > 10.0 when viewport is panned past 10s (from Bug Condition: `input.action == 'renderSpline' AND evaluationTime > 10.0`)
  - Use fast-check to generate random pan distances and canvas widths that trigger the bug condition
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "startTime=15.0 allows viewport right edge at 25.0s", "X-axis draws tick at t=12.4s")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Behavior Within 0-10s Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Setup**: Tests use the same vitest + fast-check infrastructure from task 1
  - Observe: Pan within 0-10s range on UNFIXED code - startTime updates smoothly based on drag delta
  - Observe: Drag control point vertically on UNFIXED code - Y value updates and spline rebuilds correctly
  - Observe: Spline rendering within 0-10s on UNFIXED code - curve pixels render accurately for active points
  - Write property-based test: for all `startTime` in [0, maxStart] where maxStart keeps viewport right edge <= 10.0, panning produces same `startTime` clamping behavior (from Preservation Requirements: right-click drag panning within 0-10s continues to scroll smoothly)
  - Write property-based test: for all valid control point indices and Y values, dragging produces same spline rebuild (from Preservation Requirements: left-click drag on control points continues to update Y values)
  - Write property-based test: for all viewport positions within 0-10s, spline evaluation produces same pixel output (from Preservation Requirements: control point circles and spline curve render accurately for active points in 0-10s)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for X-axis exceeding 10-second cap

  - [x] 3.1 Implement the fix
    - Add constant `const X_MAX_TIME = 10.0;` at the top of `src/CanvasEditor.ts` alongside existing constants
    - Clamp pan logic in `onMouseMove`: replace `maxStart = (this.waveData.length - 1) * 0.1` with `const visibleDuration = plotW / this.pixelsPerTenth * 0.1; const maxStart = Math.max(0, X_MAX_TIME - visibleDuration);` where `plotW = this.canvas.width - MARGIN_LEFT`
    - Add guard in `drawXAxis` tick loop: `if (t > X_MAX_TIME) continue;` to skip ticks/labels beyond 10.0s
    - Add guard in `drawSpline` pixel loop: `const t = this.xToTime(cx); if (t > X_MAX_TIME) break;` to stop evaluation beyond 10.0s
    - _Bug_Condition: isBugCondition(input) where input.time > 10.0 AND viewport/rendering exceeds boundary_
    - _Expected_Behavior: Pan clamp ensures viewport right edge <= 10.0s; no X-axis ticks for t > 10.0; no spline evaluation for t > 10.0_
    - _Preservation: All interactions within 0-10s range unchanged — panning, control point dragging, spline rendering, resize handling_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - X-Axis Capped at 10 Seconds
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (viewport right edge <= 10.0s, no ticks beyond 10.0s, no spline evaluation beyond 10.0s)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Behavior Within 0-10s Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite with `npx vitest --run`
  - Ensure all property-based tests (bug condition + preservation) pass
  - Verify no TypeScript compilation errors with `npx tsc --noEmit`
  - Ensure all tests pass, ask the user if questions arise.
