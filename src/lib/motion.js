export const motionEase = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
};

export const motionDurationMs = {
  micro: 120,
  small: 200,
  medium: 320,
  large: 600,
};

export const motionDurationSec = {
  micro: motionDurationMs.micro / 1000,
  small: motionDurationMs.small / 1000,
  medium: motionDurationMs.medium / 1000,
  large: motionDurationMs.large / 1000,
};

export const motionTransitionCss = {
  microOut: `${motionDurationMs.micro}ms cubic-bezier(${motionEase.out.join(', ')})`,
  smallOut: `${motionDurationMs.small}ms cubic-bezier(${motionEase.out.join(', ')})`,
  smallInOut: `${motionDurationMs.small}ms cubic-bezier(${motionEase.inOut.join(', ')})`,
  mediumOut: `${motionDurationMs.medium}ms cubic-bezier(${motionEase.out.join(', ')})`,
  mediumInOut: `${motionDurationMs.medium}ms cubic-bezier(${motionEase.inOut.join(', ')})`,
  largeOut: `${motionDurationMs.large}ms cubic-bezier(${motionEase.out.join(', ')})`,
};

export const motionStagger = {
  step: 0.045,
  fastStep: 0.03,
  itemOffset: 10,
};

export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 0 },
  transition: {
    duration: motionDurationSec.medium,
    ease: motionEase.out,
  },
};

export const staggerVariants = {
  container: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: motionStagger.step,
      },
    },
  },
  containerFast: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: motionStagger.fastStep,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: motionStagger.itemOffset },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: motionDurationSec.small,
        ease: motionEase.out,
      },
    },
  },
};

// ──────────────────────────────────────────────────────────────
// Phase 4C — mode-aware motion resolution.
// `mode` is the resolved motion preference ('full' | 'reduced' | 'off').
//   • full    → return the rich variant unchanged
//   • reduced → opacity-only fade at small duration, no translation
//   • off     → instant (duration 0, no initial state)
// ──────────────────────────────────────────────────────────────

export function resolvePageTransition(mode) {
  if (mode === 'off') {
    return {
      initial: false,
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  if (mode === 'reduced') {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: {
        duration: motionDurationSec.small,
        ease: motionEase.out,
      },
    };
  }
  return pageTransition;
}

export function resolveStaggerVariants(mode, { fast = false } = {}) {
  if (mode === 'off') {
    // Disable the container stagger entirely.
    return {
      container: { hidden: {}, visible: {} },
      item: { hidden: { opacity: 1 }, visible: { opacity: 1 } },
    };
  }
  if (mode === 'reduced') {
    // Opacity-only fade, no y offset, keep a light stagger for perceived order.
    return {
      container: {
        hidden: {},
        visible: {
          transition: {
            staggerChildren: fast ? motionStagger.fastStep : motionStagger.step,
          },
        },
      },
      item: {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            duration: motionDurationSec.small,
            ease: motionEase.out,
          },
        },
      },
    };
  }
  return {
    container: fast ? staggerVariants.containerFast : staggerVariants.container,
    item: staggerVariants.item,
  };
}

// For AnimatePresence/icon swap transitions: pick the right timing.
export function resolveTransition(mode, fullTransition) {
  if (mode === 'off') return { duration: 0 };
  if (mode === 'reduced') {
    return {
      duration: motionDurationSec.micro,
      ease: motionEase.out,
    };
  }
  return fullTransition;
}
