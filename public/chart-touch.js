(function installChartTouch(global) {
  "use strict";

  const document = global.document;
  if (!document?.addEventListener) return;

  const LONG_PRESS_MS = 240;
  const CANCEL_MOVE_DISTANCE = 5;

  let axisGesture = null;
  let plotGesture = null;

  function findTouch(touches, identifier) {
    return Array.from(touches || []).find((touch) => touch.identifier === identifier) || null;
  }

  function pointFor(container, touch) {
    const bounds = container.getBoundingClientRect();
    if (!(bounds.width > 0 && bounds.height > 0)) return null;
    const x = (touch.clientX - bounds.left) * container.clientWidth / bounds.width;
    const y = (touch.clientY - bounds.top) * container.clientHeight / bounds.height;
    if (!(Number.isFinite(x) && Number.isFinite(y))) return null;
    return { x, y };
  }

  function chartHit(event, touch) {
    for (const { key, chart, series } of global.chartPanes?.() || []) {
      const container = document.getElementById(`chart-${key}`);
      if (!chart || !series || !container?.contains(event.target)) continue;

      const point = pointFor(container, touch);
      if (!point) return null;
      const axisWidth = chart.priceScale("right").width();
      const paneHeight = container.clientHeight - chart.timeScale().height();
      const plotWidth = container.clientWidth - axisWidth;
      return {
        key,
        chart,
        series,
        container,
        point,
        onPriceAxis: axisWidth > 0 && point.x >= plotWidth &&
          point.x < container.clientWidth && point.y >= 0 && point.y < paneHeight,
        onPlot: point.x >= 0 && point.x < plotWidth &&
          point.y >= 0 && point.y < paneHeight,
      };
    }
    return null;
  }

  function finishAxisGesture() {
    if (!axisGesture) return;
    const { chart, vertTouchDrag } = axisGesture;
    axisGesture = null;
    chart.applyOptions({ handleScroll: { vertTouchDrag } });
  }

  function clearLongPressTimer(gesture) {
    if (gesture?.timer !== null) {
      global.clearTimeout(gesture.timer);
      gesture.timer = null;
    }
  }

  function finishPlotGesture(clearCrosshair = false) {
    if (!plotGesture) return;
    const gesture = plotGesture;
    plotGesture = null;
    clearLongPressTimer(gesture);
    if (gesture.locked) {
      gesture.chart.applyOptions({
        handleScroll: {
          horzTouchDrag: gesture.horzTouchDrag,
          vertTouchDrag: gesture.vertTouchDrag,
        },
      });
    }
    if (clearCrosshair) {
      global.setTimeout(() => {
        if (typeof global.endChartTouchTracking === "function") global.endChartTouchTracking();
        else gesture.chart.clearCrosshairPosition();
      }, 0);
    }
  }

  function updateCrosshair(gesture, touch) {
    const point = pointFor(gesture.container, touch);
    if (!point) return false;
    const time = gesture.chart.timeScale().coordinateToTime(point.x);
    const price = gesture.series.coordinateToPrice(point.y);
    if (time === null || time === undefined || !Number.isFinite(price)) return false;
    gesture.chart.setCrosshairPosition(price, time, gesture.series);
    if (typeof global.onCrosshair === "function") {
      global.onCrosshair({ time }, gesture.key);
    }
    return true;
  }

  function activatePlotGesture(gesture) {
    if (plotGesture !== gesture || gesture.phase !== "candidate") return;
    gesture.timer = null;
    if (global.state?.pinned) {
      if (typeof global.beginChartTouchTracking !== "function") {
        finishPlotGesture();
        return;
      }
      global.beginChartTouchTracking();
    }

    const options = gesture.chart.options();
    gesture.horzTouchDrag = options.handleScroll?.horzTouchDrag === true;
    gesture.vertTouchDrag = options.handleScroll?.vertTouchDrag === true;
    gesture.locked = true;
    gesture.phase = "tracking";
    gesture.resumed = false;
    gesture.moved = false;
    gesture.chart.applyOptions({
      handleScroll: { horzTouchDrag: false, vertTouchDrag: false },
    });
    updateCrosshair(gesture, gesture.lastTouch);
  }

  function startAxisGesture(hit, touch) {
    const options = hit.chart.options();
    const axisDrag = options.handleScale?.axisPressedMouseMove;
    if (!(axisDrag === true || axisDrag?.price === true)) return false;
    const vertTouchDrag = options.handleScroll?.vertTouchDrag === true;
    if (vertTouchDrag) return false;
    axisGesture = { chart: hit.chart, vertTouchDrag, identifier: touch.identifier };
    hit.chart.applyOptions({ handleScroll: { vertTouchDrag: true } });
    return true;
  }

  function startPlotCandidate(hit, touch) {
    const gesture = {
      key: hit.key,
      chart: hit.chart,
      series: hit.series,
      container: hit.container,
      identifier: touch.identifier,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      lastTouch: touch,
      phase: "candidate",
      timer: null,
      locked: false,
      resumed: false,
      moved: false,
    };
    gesture.timer = global.setTimeout(() => activatePlotGesture(gesture), LONG_PRESS_MS);
    plotGesture = gesture;
  }

  function start(event) {
    if (event.touches.length !== 1) {
      finishAxisGesture();
      finishPlotGesture(true);
      return;
    }

    const touch = event.touches[0];
    const hit = chartHit(event, touch);

    if (plotGesture?.phase === "idle") {
      if (!hit?.onPlot || hit.chart !== plotGesture.chart) {
        finishPlotGesture(true);
      } else {
        plotGesture.phase = "tracking";
        plotGesture.identifier = touch.identifier;
        plotGesture.startClientX = touch.clientX;
        plotGesture.startClientY = touch.clientY;
        plotGesture.lastTouch = touch;
        plotGesture.resumed = true;
        plotGesture.moved = false;
        return;
      }
    }

    if (axisGesture || plotGesture || !hit) return;
    if (hit.onPriceAxis && startAxisGesture(hit, touch)) return;
    if (hit.onPlot) startPlotCandidate(hit, touch);
  }

  function move(event) {
    if (!plotGesture || plotGesture.phase === "idle") return;
    const touch = findTouch(event.touches, plotGesture.identifier);
    if (!touch) return;

    const distance = Math.abs(touch.clientX - plotGesture.startClientX) +
      Math.abs(touch.clientY - plotGesture.startClientY);
    plotGesture.lastTouch = touch;

    if (plotGesture.phase === "candidate") {
      if (distance > CANCEL_MOVE_DISTANCE) finishPlotGesture();
      return;
    }

    if (plotGesture.phase !== "tracking") return;
    if (distance > CANCEL_MOVE_DISTANCE) plotGesture.moved = true;
    if (event.cancelable !== false) event.preventDefault();
    event.stopPropagation();
    updateCrosshair(plotGesture, touch);
  }

  function end(event) {
    if (axisGesture && !findTouch(event.touches, axisGesture.identifier)) {
      finishAxisGesture();
    }
    if (!plotGesture || plotGesture.phase === "idle" ||
      findTouch(event.touches, plotGesture.identifier)) return;

    if (plotGesture.phase === "candidate") {
      finishPlotGesture();
      return;
    }

    if (plotGesture.phase === "tracking") {
      if (plotGesture.resumed && !plotGesture.moved) {
        finishPlotGesture(true);
      } else {
        if (plotGesture.resumed && plotGesture.moved) event.stopPropagation();
        plotGesture.phase = "idle";
        plotGesture.identifier = null;
        plotGesture.resumed = false;
        plotGesture.moved = false;
      }
    }
  }

  function cancel() {
    finishAxisGesture();
    finishPlotGesture(true);
  }

  const passiveCapture = { capture: true, passive: true };
  document.addEventListener("touchstart", start, passiveCapture);
  document.addEventListener("touchmove", move, { capture: true, passive: false });
  document.addEventListener("touchend", end, passiveCapture);
  document.addEventListener("touchcancel", cancel, passiveCapture);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cancel();
  });
  global.addEventListener("blur", cancel);
  global.addEventListener("pagehide", cancel);
})(globalThis);
