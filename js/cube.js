export function createCube({ app, cube, faces, events, initialIndex = 0, onIndexChange, onSwipe }) {
  const SWIPING_ENABLED = true;
  const SWIPE_THRESHOLD = 48;
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

    cube.style.height = `${faces[frontPhysical].scrollHeight}px`;
  }

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
    onIndexChange?.(currentIndex, count);
  }

  function completeTransition() {
    if (!animating) return;
    clearTimeout(fallbackTimer);
    animating = false;
    updateFaces();
  }

  function navigate(direction) {
    if (animating || !events.length) return false;

    currentIndex = (currentIndex + direction + events.length) % events.length;
    stepCount += direction;
    rotation = stepCount * -90;

    if (isMobileLayout()) {
      animating = true;
      syncCubeHeight();
      render(rotation, true);
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(completeTransition, SETTLE_MS + 120);
      window.scrollTo(0, 0);
      return true;
    }

    animating = true;
    render(rotation, true);
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(completeTransition, SETTLE_MS + 120);
    return true;
  }

  let pointerStart = null;
  app.addEventListener('pointerdown', event => {
    if (
      !SWIPING_ENABLED ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest('a, button, input, select, textarea, [data-no-swipe]')
    ) {
      pointerStart = null;
      return;
    }

    pointerStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });

  window.addEventListener('pointerup', event => {
    const start = pointerStart;
    pointerStart = null;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD ||
      Math.abs(deltaX) < Math.abs(deltaY) * 1.25
    ) {
      return;
    }

    if (navigate(deltaX < 0 ? 1 : -1)) onSwipe?.();
  });

  window.addEventListener('pointercancel', () => {
    pointerStart = null;
  });

  cube.addEventListener('transitionend', event => {
    if (event.propertyName === 'transform') completeTransition();
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
  render(rotation);

  return {
    next: () => navigate(1),
    previous: () => navigate(-1),
    getCurrentIndex: () => currentIndex
  };
}
