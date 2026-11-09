export function createCube({ app, cube, faces, events, initialIndex = 0, onIndexChange, onFacesUpdated, onSwipe }) {
  const SWIPING_ENABLED = true;
  const SWIPE_THRESHOLD = 0.14;
  const SETTLE_MS = 420;
  const EDGE_RESISTANCE = 0.25;
  const EDGE_MAX_ROTATION = 10;
  const physicalOffsets = [0, 1, 2, -1];
  const isMobileLayout = () => window.matchMedia('(max-width: 899px)').matches;

  let currentIndex = events.length
    ? ((initialIndex % events.length) + events.length) % events.length
    : 0;
  let stepCount = 0;
  let rotation = 0;
  let animating = false;
  let fallbackTimer = null;
  const pendingSwipes = [];
  const cardResizeObserver = new ResizeObserver(syncCubeHeight);

  function render(angle, animate = false) {
    const width = app.clientWidth;
    cube.style.setProperty('--cube-depth', `${width / 2}px`);
    cube.style.transition = animate
      ? `transform ${SETTLE_MS}ms cubic-bezier(.22,.72,.22,1)`
      : 'none';
    cube.style.transform = `translateZ(${-width / 2}px) rotateY(${angle}deg)`;
  }

  function syncCubeHeight() {
    if (!isMobileLayout()) {
      cube.style.height = '';
      faces.forEach(face => { face.style.height = ''; });
      return;
    }

    const cards = faces
      .map(face => face.querySelector('.event-card'))
      .filter(Boolean);
    const tallestHeight = Math.max(0, ...cards.map(card => Math.ceil(card.scrollHeight)));

    faces.forEach(face => { face.style.height = `${tallestHeight}px`; });
    cube.style.height = `${tallestHeight}px`;
  }

  function updateFaces() {
    const count = events.length;
    if (!count) return;

    const frontPhysical = ((stepCount % 4) + 4) % 4;

    faces.forEach((face, physicalIndex) => {
      const physicalOffset = (physicalIndex - frontPhysical + 4) % 4;
      const eventOffset = physicalOffsets[physicalOffset];
      const eventIndex = (currentIndex + eventOffset + count) % count;
      face.toggleAttribute('data-out-of-range', currentIndex + eventOffset < 0 || currentIndex + eventOffset >= count);
      if (face.dataset.eventIndex !== String(eventIndex)) {
        face.innerHTML = events[eventIndex].__html;
        face.dataset.eventIndex = String(eventIndex);
      }
      face.toggleAttribute('data-front', physicalIndex === frontPhysical);
    });

    cardResizeObserver.disconnect();
    faces.forEach(face => {
      const card = face.querySelector('.event-card');
      if (card) cardResizeObserver.observe(card);
    });
    syncCubeHeight();
    onFacesUpdated?.();
  }

  function getCurrentRotation() {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(cube).transform);
    const currentAngle = -Math.atan2(matrix.m13, matrix.m11) * 180 / Math.PI;
    return currentAngle + 360 * Math.round((rotation - currentAngle) / 360);
  }

  function interruptTransition(currentAngle) {
    clearTimeout(fallbackTimer);
    animating = false;
    render(currentAngle);
    updateFaces();
  }

  function completeTransition() {
    if (!animating) return;
    clearTimeout(fallbackTimer);
    animating = false;
    cube.classList.remove('is-rotating');
    updateFaces();
    if (pendingSwipes.length) navigate(pendingSwipes.shift());
  }

  function settleRotation(angle) {
    animating = true;
    cube.classList.add('is-rotating');
    render(angle, true);
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(completeTransition, SETTLE_MS + 50);
  }

  function canNavigate(direction) {
    const nextIndex = currentIndex + direction;
    return !animating && nextIndex >= 0 && nextIndex < events.length;
  }

  function navigate(direction) {
    if (!canNavigate(direction)) return false;

    const nextIndex = currentIndex + direction;
    currentIndex = nextIndex;
    stepCount += direction;
    rotation = stepCount * -90;
    onIndexChange?.(currentIndex, events.length);

    if (isMobileLayout()) {
      settleRotation(rotation);
      window.scrollTo(0, 0);
      return true;
    }

    settleRotation(rotation);
    return true;
  }

  function queueSwipe(direction) {
    if (!animating) return navigate(direction);
    const targetIndex = currentIndex + pendingSwipes.reduce((index, swipe) => index + swipe, 0) + direction;
    if (targetIndex < 0 || targetIndex >= events.length) return false;
    pendingSwipes.push(direction);
    return true;
  }

  const GESTURE_THRESHOLD = 8;
  let gesture = null;
  app.addEventListener('pointerdown', event => {
    if (
      !SWIPING_ENABLED ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest('a, button, input, select, textarea, [data-no-swipe]')
    ) {
      gesture = null;
      return;
    }

    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: rotation,
      width: app.clientWidth,
      axis: null
    };
  });

  app.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= GESTURE_THRESHOLD) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      if (gesture.axis === 'horizontal') {
        if (animating) {
          const currentAngle = getCurrentRotation();
          // Keep the visible face intact until it is closer to the new front face.
          gesture.queueOnly = pendingSwipes.length > 0 || Math.abs(rotation - currentAngle) > 45;
          if (!gesture.queueOnly) {
            interruptTransition(currentAngle);
            gesture.startRotation = currentAngle;
          }
        }
        app.setPointerCapture(event.pointerId);
      }
    }

    if (gesture.axis !== 'horizontal') return;

    event.preventDefault();
    if (gesture.queueOnly) return;
    if (isMobileLayout()) cube.classList.add('is-rotating');
    const direction = deltaX < 0 ? 1 : -1;
    if (canNavigate(direction)) {
      render(gesture.startRotation + (deltaX / gesture.width) * 90);
    } else {
      const edgeRotation = Math.sign(deltaX) * Math.min(
        (Math.abs(deltaX) / gesture.width) * 90 * EDGE_RESISTANCE,
        EDGE_MAX_ROTATION
      );
      render(gesture.startRotation + edgeRotation);
    }
  });

  function finishGesture(event, cancelled = false) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const currentGesture = gesture;
    gesture = null;
    if (currentGesture.axis !== 'horizontal') return;

    const deltaX = event.clientX - currentGesture.startX;
    const commitThreshold = Math.max(40, currentGesture.width * SWIPE_THRESHOLD);
    if (cancelled || Math.abs(deltaX) < commitThreshold) {
      if (!currentGesture.queueOnly) settleRotation(rotation);
      return;
    }

    const direction = deltaX < 0 ? 1 : -1;
    const swipeDirection = direction === 1 ? 'left' : 'right';
    if (currentGesture.queueOnly) {
      if (queueSwipe(direction)) onSwipe?.(swipeDirection);
      return;
    }

    if (navigate(direction)) onSwipe?.(swipeDirection);
    else settleRotation(rotation);
  }

  app.addEventListener('pointerup', event => finishGesture(event));
  app.addEventListener('pointercancel', event => finishGesture(event, true));

  cube.addEventListener('transitionend', event => {
    if (event.target === cube && event.propertyName === 'transform') {
      completeTransition();
    }
  });

  document.addEventListener('keydown', event => {
    if (SWIPING_ENABLED && event.key === 'ArrowLeft') navigate(1);
    if (SWIPING_ENABLED && event.key === 'ArrowRight') navigate(-1);
  });

  window.addEventListener('resize', () => {
    render(rotation);
    syncCubeHeight();
  });

  updateFaces();
  onIndexChange?.(currentIndex, events.length);
  render(rotation);

  return {
    next: () => navigate(1),
    previous: () => navigate(-1),
    getCurrentIndex: () => currentIndex
  };
}
