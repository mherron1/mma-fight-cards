export function createCube({ app, cube, faces, events, initialIndex = 0, onIndexChange, onSwipe }) {
  const SWIPE_THRESHOLD = 0.14;
  const GESTURE_THRESHOLD = 24;
  const SETTLE_MS = 420;
  const physicalOffsets = [0, 1, 2, -1];

  let currentIndex = events.length
    ? ((initialIndex % events.length) + events.length) % events.length
    : 0;
  let stepCount = 0;
  let rotation = 0;
  let width = app.clientWidth;
  let dragging = false;
  let pointerId = null;
  let pointerType = null;
  let startedOnSummary = false;
  let startX = 0;
  let startY = 0;
  let startRotation = 0;
  let scrollTarget = null;
  let lastY = 0;
  let lastMoveTime = 0;
  let scrollVelocity = 0;
  let pendingTransitionScroll = 0;
  let pendingTransitionScrollVelocity = 0;
  let pendingTransitionScrollMomentum = false;
  let momentumFrame = null;
  let gestureAxis = null;
  let pointerCaptured = false;
  let deferGesture = false;
  let gestureStartedDuringAnimation = false;
  let animating = false;
  let swipeQueue = [];
  let fallbackTimer = null;

  function stopScrollMomentum() {
    if (momentumFrame !== null) {
      cancelAnimationFrame(momentumFrame);
      momentumFrame = null;
    }
  }

  function usesNativeVerticalScroll() {
    return window.matchMedia('(max-width: 899px)').matches;
  }

  function startScrollMomentum(target, velocity) {
    const MIN_VELOCITY = 0.02;
    const FRICTION_TIME = 325;
    if (!target || Math.abs(velocity) < MIN_VELOCITY) return;

    let previousTime = 0;
    function continueMomentum(time) {
      const elapsed = previousTime ? Math.min(time - previousTime, 32) : 16;
      previousTime = time;

      const previousScrollTop = target.scrollTop;
      target.scrollTop += velocity * elapsed;
      if (Math.abs(target.scrollTop - previousScrollTop) < 0.1) {
        momentumFrame = null;
        return;
      }

      velocity *= Math.exp(-elapsed / FRICTION_TIME);
      if (Math.abs(velocity) < MIN_VELOCITY) {
        momentumFrame = null;
        return;
      }
      momentumFrame = requestAnimationFrame(continueMomentum);
    }

    momentumFrame = requestAnimationFrame(continueMomentum);
  }

  function flushTransitionScroll() {
    if (!pendingTransitionScroll && !pendingTransitionScrollMomentum) return;

    const frontPhysical = ((stepCount % 4) + 4) % 4;
    const target = faces[frontPhysical].querySelector('.fight-sections');
    if (target) target.scrollTop += pendingTransitionScroll;
    if (pendingTransitionScrollMomentum) {
      startScrollMomentum(target, pendingTransitionScrollVelocity);
    }

    pendingTransitionScroll = 0;
    pendingTransitionScrollVelocity = 0;
    pendingTransitionScrollMomentum = false;
  }

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
    flushTransitionScroll();
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
    stopScrollMomentum();
    startedOnSummary = Boolean(event.target.closest('summary'));
    pointerType = event.pointerType;
    deferGesture = startedOnSummary || pointerType === 'touch';
    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastY = startY;
    lastMoveTime = event.timeStamp;
    scrollVelocity = 0;
    const frontPhysical = ((stepCount % 4) + 4) % 4;
    const eventCard = event.target.closest('.event-card') ||
      (event.target.closest('.cube-stage')
        ? faces[frontPhysical].querySelector('.event-card')
        : null);
    scrollTarget = usesNativeVerticalScroll()
      ? eventCard
      : event.target.closest('.fight-sections') || eventCard?.querySelector('.fight-sections');
    gestureAxis = null;
    pointerCaptured = false;
    startRotation = rotation;
    gestureStartedDuringAnimation = animating;

    if (!animating && !deferGesture) cube.style.transition = 'none';
    if (!deferGesture) {
      app.setPointerCapture(pointerId);
      pointerCaptured = true;
    }
  });

  app.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!gestureAxis && Math.max(Math.abs(dx), Math.abs(dy)) > GESTURE_THRESHOLD) {
      gestureAxis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
      if (usesNativeVerticalScroll() && gestureAxis === 'vertical') return;
      if (deferGesture && gestureAxis === 'horizontal' && !animating) {
        cube.style.transition = 'none';
      }
      if (!pointerCaptured) {
        app.setPointerCapture(pointerId);
        pointerCaptured = true;
      }
    }

    if (usesNativeVerticalScroll() && gestureAxis === 'vertical') return;

    if (gestureStartedDuringAnimation) {
      if (gestureAxis === 'vertical') {
        const deltaY = event.clientY - lastY;
        const elapsed = event.timeStamp - lastMoveTime;
        pendingTransitionScroll -= deltaY;
        if (elapsed > 0 && elapsed <= 80) {
          const instantaneousVelocity = -deltaY / elapsed;
          scrollVelocity = scrollVelocity * 0.65 + instantaneousVelocity * 0.35;
        } else {
          scrollVelocity = 0;
        }
        lastY = event.clientY;
        lastMoveTime = event.timeStamp;
      }
      return;
    }

    if (!gestureAxis) return;

    if (gestureAxis === 'vertical') {
      if (scrollTarget) {
        const deltaY = event.clientY - lastY;
        const elapsed = event.timeStamp - lastMoveTime;
        scrollTarget.scrollTop -= deltaY;
        if (elapsed > 0 && elapsed <= 80) {
          const instantaneousVelocity = -deltaY / elapsed;
          scrollVelocity = scrollVelocity * 0.65 + instantaneousVelocity * 0.35;
        } else {
          scrollVelocity = 0;
        }
      }
      lastY = event.clientY;
      lastMoveTime = event.timeStamp;
      return;
    }

    render(startRotation + (dx / width) * 90, false);
  });

  function finishGesture(event, cancelled = false) {
    if (!dragging || event.pointerId !== pointerId) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const completedScrollTarget = scrollTarget;
    const completedScrollVelocity = scrollVelocity;
    const nativeVerticalScroll = usesNativeVerticalScroll() && gestureAxis === 'vertical';
    dragging = false;
    pointerId = null;
    pointerType = null;
    startedOnSummary = false;
    scrollTarget = null;
    pointerCaptured = false;
    const shouldRestoreCube = !deferGesture;
    deferGesture = false;

    if (cancelled) {
      gestureAxis = null;
      if (!nativeVerticalScroll && !gestureStartedDuringAnimation && !animating) {
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
      if (!usesNativeVerticalScroll()) {
        startScrollMomentum(completedScrollTarget, completedScrollVelocity);
      }
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

    onSwipe?.();
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
