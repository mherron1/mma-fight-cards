export function createCube({ app, cube, faces, events, initialIndex = 0, onIndexChange, onSwipe }) {
  const SWIPING_ENABLED = true;
  const SWIPE_THRESHOLD = 0.14;
  const SETTLE_MS = 420;
  const physicalOffsets = [0, 1, 2, -1];
  const isMobileLayout = () => window.matchMedia('(max-width: 899px)').matches;

  let currentIndex = events.length
    ? ((initialIndex % events.length) + events.length) % events.length
    : 0;
  let stepCount = 0;
  let rotation = 0;
  let animating = false;
  let fallbackTimer = null;

  function render(angle, animate = false) {
    const width = app.clientWidth;
    cube.style.setProperty('--cube-depth', `${width / 2}px`);
    cube.style.transition = animate
      ? `transform ${SETTLE_MS}ms cubic-bezier(.22,.72,.22,1)`
      : 'none';
    cube.style.transform = `translateZ(${-width / 2}px) rotateY(${angle}deg)`;
  }

  function syncCubeHeight(frontPhysical = ((stepCount % 4) + 4) % 4) {
    if (!isMobileLayout()) {
      cube.style.height = '';
      return;
    }

    const frontFace = faces[frontPhysical];
    cube.style.height = `${Math.max(
      frontFace.scrollHeight,
      Math.ceil(frontFace.getBoundingClientRect().height)
    )}px`;
  }

  const faceResizeObserver = new ResizeObserver(() => {
    if (!isMobileLayout() || cube.classList.contains('is-rotating')) return;
    const frontPhysical = ((stepCount % 4) + 4) % 4;
    syncCubeHeight(frontPhysical);
  });
  faces.forEach(face => faceResizeObserver.observe(face));

  function updateFaces() {
    const count = events.length;
    if (!count) return;

    const frontPhysical = ((stepCount % 4) + 4) % 4;

    faces.forEach((face, physicalIndex) => {
      const physicalOffset = (physicalIndex - frontPhysical + 4) % 4;
      const eventOffset = physicalOffsets[physicalOffset];
      const eventIndex = (currentIndex + eventOffset + count) % count;
      if (face.dataset.eventIndex !== String(eventIndex)) {
        face.innerHTML = events[eventIndex].__html;
        face.dataset.eventIndex = String(eventIndex);
      }
      face.toggleAttribute('data-front', physicalIndex === frontPhysical);
    });

    syncCubeHeight(frontPhysical);
  }

  function completeTransition() {
    if (!animating) return;
    clearTimeout(fallbackTimer);
    animating = false;
    cube.classList.remove('is-rotating');
    updateFaces();
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
      syncCubeHeight();
      settleRotation(rotation);
      window.scrollTo(0, 0);
      return true;
    }

    settleRotation(rotation);
    return true;
  }

  const GESTURE_THRESHOLD = 8;
  let gesture = null;
  app.addEventListener('pointerdown', event => {
    if (
      !SWIPING_ENABLED ||
      animating ||
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
      if (gesture.axis === 'horizontal') app.setPointerCapture(event.pointerId);
    }

    if (gesture.axis !== 'horizontal') return;

    event.preventDefault();
    if (isMobileLayout()) cube.classList.add('is-rotating');
    const direction = deltaX < 0 ? 1 : -1;
    render(
      canNavigate(direction)
        ? gesture.startRotation + (deltaX / gesture.width) * 90
        : gesture.startRotation
    );
  });

  function finishGesture(event, cancelled = false) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const currentGesture = gesture;
    gesture = null;
    if (currentGesture.axis !== 'horizontal') return;

    const deltaX = event.clientX - currentGesture.startX;
    const commitThreshold = Math.max(40, currentGesture.width * SWIPE_THRESHOLD);
    if (cancelled || Math.abs(deltaX) < commitThreshold) {
      settleRotation(rotation);
      return;
    }

    if (navigate(deltaX < 0 ? 1 : -1)) onSwipe?.();
  }

  app.addEventListener('pointerup', event => finishGesture(event));
  app.addEventListener('pointercancel', event => finishGesture(event, true));

  cube.addEventListener('transitionend', event => {
    if (event.target === cube && event.propertyName === 'transform') {
      completeTransition();
    } else if (event.propertyName === 'grid-template-rows' && !animating) {
      syncCubeHeight();
    }
  });

  document.addEventListener('keydown', event => {
    if (SWIPING_ENABLED && event.key === 'ArrowLeft') navigate(1);
    if (SWIPING_ENABLED && event.key === 'ArrowRight') navigate(-1);
  });

  window.addEventListener('resize', () => {
    syncCubeHeight();
    render(rotation);
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
