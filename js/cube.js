export function createCube({ app, cube, faces, events, onIndexChange }) {
  const SWIPE_THRESHOLD = 0.14;
  const GESTURE_THRESHOLD = 24;
  const SETTLE_MS = 420;
  const physicalOffsets = [0, 1, 2, -1];

  let currentIndex = 0;
  let stepCount = 0;
  let rotation = 0;
  let width = app.clientWidth;
  let dragging = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startRotation = 0;
  let scrollTarget = null;
  let lastY = 0;
  let gestureAxis = null;
  let pointerCaptured = false;
  let deferGesture = false;
  let gestureStartedDuringAnimation = false;
  let animating = false;
  let swipeQueue = [];
  let fallbackTimer = null;

  function render(angle, animate = false) {
    cube.style.transition = animate
      ? `transform ${SETTLE_MS}ms cubic-bezier(.22,.72,.22,1)`
      : 'none';
    cube.style.transform = `translateZ(${-width / 2}px) rotateY(${angle}deg)`;
  }

  function updateFaces() {
    const count = events.length;
    if (!count) return;

    const frontPhysical = ((stepCount % 4) + 4) % 4;

    faces.forEach((face, physicalIndex) => {
      const physicalOffset = (physicalIndex - frontPhysical + 4) % 4;
      const eventOffset = physicalOffsets[physicalOffset];
      const eventIndex = (currentIndex + eventOffset + count) % count;
      face.toggleAttribute('data-front', physicalIndex === frontPhysical);
      face.innerHTML = events[eventIndex].__html;
    });

    if (onIndexChange) onIndexChange(currentIndex, count);
  }

  function completeTransition() {
    if (!animating) return;
    clearTimeout(fallbackTimer);
    updateFaces();
    animating = false;
    processQueue();
  }

  function processQueue() {
    if (animating || swipeQueue.length === 0 || events.length < 1) return;

    const direction = swipeQueue.shift();
    animating = true;

    currentIndex = (currentIndex + direction + events.length) % events.length;
    stepCount += direction;
    rotation = stepCount * -90;
    if (onIndexChange) onIndexChange(currentIndex, events.length);

    render(rotation, true);
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(completeTransition, SETTLE_MS + 120);
  }

  function enqueueSwipe(direction) {
    if (!events.length) return;
    swipeQueue.push(direction);
    processQueue();
  }

  cube.addEventListener('transitionend', event => {
    if (event.propertyName === 'transform') completeTransition();
  });

  app.addEventListener('pointerdown', event => {
    // Header controls should work without starting a cube drag.
    if (event.target.closest('[data-no-swipe], button, a, input, select, textarea')) return;
    if (dragging) return;
    const startedOnSummary = Boolean(event.target.closest('summary'));
    deferGesture = startedOnSummary;
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastY = startY;
    const frontPhysical = ((stepCount % 4) + 4) % 4;
    scrollTarget = event.target.closest('.fight-sections') ||
      (event.target.closest('.cube-stage')
        ? faces[frontPhysical].querySelector('.fight-sections')
        : null);
    gestureAxis = null;
    pointerCaptured = false;
    startRotation = rotation;
    gestureStartedDuringAnimation = animating;

    if (!animating && !deferGesture) cube.style.transition = 'none';
    if (!startedOnSummary) {
      app.setPointerCapture(pointerId);
      pointerCaptured = true;
    }
  });

  app.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId || gestureStartedDuringAnimation) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!gestureAxis && Math.max(Math.abs(dx), Math.abs(dy)) > GESTURE_THRESHOLD) {
      gestureAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
      if (deferGesture && gestureAxis === 'horizontal' && !animating) {
        cube.style.transition = 'none';
      }
      if (!pointerCaptured) {
        app.setPointerCapture(pointerId);
        pointerCaptured = true;
      }
    }

    if (!gestureAxis) return;

    if (gestureAxis === 'vertical') {
      if (scrollTarget) {
        scrollTarget.scrollTop -= event.clientY - lastY;
      }
      lastY = event.clientY;
      return;
    }

    render(startRotation + (dx / width) * 90, false);
  });

  function finishGesture(event, cancelled = false) {
    if (!dragging || event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    dragging = false;
    pointerId = null;
    scrollTarget = null;
    pointerCaptured = false;
    const shouldRestoreCube = !deferGesture;
    deferGesture = false;

    if (cancelled) {
      gestureAxis = null;
      if (!gestureStartedDuringAnimation && !animating) {
        render(rotation, true);
      }
      return;
    }

    if (!gestureAxis && Math.max(Math.abs(dx), Math.abs(dy)) > GESTURE_THRESHOLD) {
      gestureAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (!gestureAxis) {
      if (shouldRestoreCube && !gestureStartedDuringAnimation && !animating) render(rotation, true);
      return;
    }

    if (gestureAxis === 'vertical') {
      gestureAxis = null;
      return;
    }
    gestureAxis = null;

    if (Math.abs(dx) <= Math.abs(dy) * 1.1) {
      if (!gestureStartedDuringAnimation && !animating) render(rotation, true);
      return;
    }

    const threshold = Math.max(40, width * SWIPE_THRESHOLD);
    if (Math.abs(dx) < threshold) {
      if (!gestureStartedDuringAnimation && !animating) render(rotation, true);
      return;
    }

    enqueueSwipe(dx < 0 ? 1 : -1);
  }

  app.addEventListener('pointerup', event => finishGesture(event));
  app.addEventListener('pointercancel', event => finishGesture(event, true));

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') enqueueSwipe(1);
    if (event.key === 'ArrowRight') enqueueSwipe(-1);
  });

  window.addEventListener('resize', () => {
    width = app.clientWidth;
    render(rotation, false);
  });

  updateFaces();
  render(rotation, false);

  return {
    next: () => enqueueSwipe(1),
    previous: () => enqueueSwipe(-1),
    getCurrentIndex: () => currentIndex
  };
}
