// Small deterministic hook runner for state transitions and effect cleanup.
// UI rendering is checked separately with React's server renderer.
module.exports = function createHookHarness() {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) dirty = true;
        slots[i].value = value;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[i].cleanup = effect();
        });
      }
    }
  };
  return {
    react,
    render(hook, ...args) {
      let result;
      for (let pass = 0; pass < 20; pass++) {
        dirty = false;
        cursor = 0;
        result = hook(...args);
        const pending = effects;
        effects = [];
        pending.forEach(effect => effect());
        if (!dirty) return result;
      }
      throw new Error("Hook did not settle after 20 renders");
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); }
  };
};
