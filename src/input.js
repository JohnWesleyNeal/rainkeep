import { clampAim, beginDrag, moveDrag, rebaseDrag } from "./controls.js";

export function createInputController({
  board,
  world,
  getSession,
  getAim,
  setAim,
  save,
  drop,
  rotate,
  pause,
  resume,
}) {
  const surface = board.closest(".landscape");
  let pointerId = null,
    drag = null,
    hold = null;
  const cancel = () => {
    pointerId = null;
    drag = null;
    hold = null;
  };
  const locate = (e) => {
    const p = world.pick(e.clientX, e.clientY, getSession().state.current);
    if (p) setAim(clampAim(p, getSession().state.current));
  };
  function nudge(dx, dy) {
    const { state, paused, result } = getSession();
    if (paused || state.over || state.dropping || result) return;
    const a = (world.quarter * Math.PI) / 2,
      c = Math.round(Math.cos(a)),
      s = Math.round(Math.sin(a)),
      aim = getAim();
    setAim(
      clampAim(
        { x: aim.x + c * dx + s * dy, y: aim.y - s * dx + c * dy },
        state.current,
      ),
    );
    rebaseDrag(drag, getAim());
    save();
  }
  surface.addEventListener("pointerdown", (e) => {
    const { state, paused, result } = getSession();
    if (
      e.target.closest("button,a") ||
      paused ||
      state.over ||
      result ||
      state.dropping ||
      pointerId !== null ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    e.preventDefault();
    pointerId = e.pointerId;
    board.setPointerCapture(pointerId);
    if (e.pointerType === "mouse") locate(e);
    else
      drag = beginDrag(
        { x: e.clientX, y: e.clientY },
        getAim(),
        11,
        world.quarter,
        world.dragBasis,
      );
    board.focus({ preventScroll: true });
  });
  surface.addEventListener("pointermove", (e) => {
    const { state, paused, result } = getSession();
    if (paused || state.over || result) return;
    if (e.pointerId === pointerId && drag) {
      if (state.dropping) {
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        return;
      }
      setAim(moveDrag(drag, { x: e.clientX, y: e.clientY }, state.current));
    } else if (
      e.pointerType === "mouse" &&
      !state.dropping &&
      !e.target.closest("button,a")
    )
      locate(e);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    surface.addEventListener(name, (e) => {
      if (e.pointerId === pointerId) {
        pointerId = null;
        drag = null;
        save();
      }
    });
  document.querySelectorAll("[data-nudge]").forEach((button) => {
    const [dx, dy] = button.dataset.nudge
      .split(",")
      .map(Number)
      .map((v) => v * 0.2);
    button.addEventListener("pointerdown", (e) => {
      if (button.disabled) return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      nudge(dx, dy);
      hold = { id: e.pointerId, dx, dy, next: performance.now() + 330 };
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(name, (e) => {
        if (hold?.id === e.pointerId) hold = null;
      });
    button.addEventListener("click", (e) => {
      if (e.detail === 0) nudge(dx, dy);
    });
  });
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", (e) => {
    const { state, paused, started, result } = getSession();
    if (
      result &&
      e.target === board &&
      ["Space", "Enter", "KeyR"].includes(e.code)
    ) {
      e.preventDefault();
      (e.code === "KeyR" ? rotate : drop)();
      return;
    }
    if (e.code === "Escape") {
      if (started) {
        e.preventDefault();
        if (paused && !result) resume();
        else pause();
      }
      return;
    }
    if (
      paused ||
      state.over ||
      ["A", "INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      )
    )
      return;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
        "KeyR",
      ].includes(e.code)
    )
      e.preventDefault();
    if (state.dropping) return;
    const step = e.shiftKey ? 1 : 0.2;
    if (e.code === "ArrowLeft") nudge(-step, 0);
    if (e.code === "ArrowRight") nudge(step, 0);
    if (e.code === "ArrowUp") nudge(0, -step);
    if (e.code === "ArrowDown") nudge(0, step);
    if (e.code === "KeyR") rotate();
    if (e.code === "Space") drop();
  });
  for (const [id, action] of [
    ["drop", drop],
    ["rotate", rotate],
  ]) {
    const button = document.getElementById(id);
    let resultPress = false;
    button.addEventListener("pointerdown", (e) => {
      if (button.disabled || (e.pointerType === "mouse" && e.button !== 0))
        return;
      if (getSession().result) {
        resultPress = true;
        return;
      }
      resultPress = false;
      e.preventDefault();
      action();
    });
    button.addEventListener("click", (e) => {
      if (resultPress || e.detail === 0) {
        resultPress = false;
        action();
      }
    });
    button.addEventListener("pointercancel", () => {
      resultPress = false;
    });
  }
  return {
    cancel,
    rebase() {
      rebaseDrag(drag, getAim());
    },
    resize() {
      if (drag) {
        drag.basis = world.dragBasis;
        rebaseDrag(drag, getAim());
      }
    },
    update(now) {
      if (hold && now >= hold.next) {
        nudge(hold.dx, hold.dy);
        hold.next = now + 100;
      }
    },
    get steering() {
      return pointerId !== null && board.hasPointerCapture(pointerId);
    },
  };
}
