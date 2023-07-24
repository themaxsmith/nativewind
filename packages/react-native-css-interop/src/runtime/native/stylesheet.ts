import {
  Dimensions,
  StyleSheet as RNStyleSheet,
  Appearance,
} from "react-native";
import { createContext, useContext } from "react";

import {
  StyleSheetRegisterOptions,
  ExtractedStyle,
  StyleProp,
  StyleMeta,
} from "../../types";
import {
  animationMap,
  colorScheme,
  globalStyles,
  rem,
  styleMetaMap,
  vh,
  vw,
  warned,
  warnings,
} from "./globals";

const subscriptions = new Set<() => void>();

export const VariableContext = createContext<Record<string, unknown> | null>(
  null,
);

/**
 * This is a custom wrapper around the React Native Stylesheet.
 * It allows us to intercept the creation of styles and "tag" them wit the metadata
 */
export const StyleSheet = Object.assign({}, RNStyleSheet, {
  classNameMergeStrategy(c: string) {
    return c;
  },
  __subscribe(subscription: () => void) {
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  },
  __reset({ dimensions = Dimensions, appearance = Appearance } = {}) {
    globalStyles.clear();
    animationMap.clear();
    warnings.clear();
    warned.clear();
    rem.reset();
    vw.reset(dimensions);
    vh.reset(dimensions);
    colorScheme.reset(appearance);
    rootVariables = {};
    rootDarkVariables = {};
    defaultVariables = {};
    defaultDarkVariables = {};
  },
  register: (options: StyleSheetRegisterOptions) => {
    if (options.keyframes) {
      for (const [name, keyframes] of Object.entries(options.keyframes)) {
        animationMap.set(name, keyframes);
      }
    }

    if (options.declarations) {
      for (const [name, styles] of Object.entries(options.declarations)) {
        globalStyles.set(name, tagStyles(name, styles));
      }
    }

    if (options.defaultVariables) defaultVariables = options.defaultVariables;
    if (options.defaultDarkVariables) {
      defaultDarkVariables = {
        ...options.defaultVariables,
        ...options.defaultDarkVariables,
      };
    }
    if (options.rootVariables) {
      rootVariables = {
        ...options.rootVariables,
        ...defaultVariables,
      };
    }
    if (options.rootDarkVariables) {
      rootDarkVariables = {
        ...options?.rootVariables,
        ...options.rootDarkVariables,
        ...defaultDarkVariables,
      };
    }

    for (const subscription of subscriptions) {
      subscription();
    }
  },
  create: (styles: Record<string, ExtractedStyle>) => {
    const namedStyles: Record<string, StyleProp> = {};

    for (const [name, style] of Object.entries(styles)) {
      namedStyles[name] = tagStyles(name, style);
    }

    for (const subscription of subscriptions) {
      subscription();
    }

    return namedStyles;
  },
});

function tagStyles(
  name: string,
  styles: ExtractedStyle | ExtractedStyle[],
): StyleProp {
  if (Array.isArray(styles)) {
    let didTag = false;
    const taggedStyles = styles.map((s) => {
      const taggedStyle = tagStyles(name, s);
      didTag ||= styleMetaMap.has(s.style);
      return taggedStyle;
    });

    if (didTag) {
      styleMetaMap.set(taggedStyles, {});
    }

    return taggedStyles;
  } else {
    let hasMeta = false;
    const meta: StyleMeta = {};

    if (styles.isDynamic) {
      hasMeta = true;
    }

    if (styles.variables) {
      meta.variables = styles.variables;
      hasMeta = true;
    }

    if (Array.isArray(styles.media) && styles.media.length > 0) {
      meta.media = styles.media;
      hasMeta = true;
    }

    if (styles.pseudoClasses) {
      meta.pseudoClasses = styles.pseudoClasses;
      hasMeta = true;
    }

    if (styles.animations) {
      meta.animations = styles.animations;
      hasMeta = true;

      const requiresLayout = styles.animations.name?.some((nameObj) => {
        const name = nameObj.type === "none" ? "none" : nameObj.value;
        return animationMap.get(name)?.requiresLayout;
      });

      if (requiresLayout) {
        meta.requiresLayout = true;
      }
    }

    if (styles.container) {
      meta.container = {
        names: styles.container.names,
        type: styles.container.type ?? "normal",
      };
      hasMeta = true;
    }

    if (styles.containerQuery) {
      meta.containerQuery = styles.containerQuery;
      hasMeta = true;
    }

    if (styles.transition) {
      meta.transition = styles.transition;
      hasMeta = true;
    }
    if (styles.requiresLayout) {
      meta.requiresLayout = styles.requiresLayout;
      hasMeta = true;
    }

    if (styles.prop) {
      meta.prop = styles.prop;
      hasMeta = true;
    }

    if (process.env.NODE_ENV !== "production" && styles.warnings) {
      warnings.set(name, styles.warnings);
    }

    if (hasMeta) {
      styleMetaMap.set(styles.style, meta);
    }

    return styles.style;
  }
}

let rootVariables: Record<string, unknown> = {};
let rootDarkVariables: Record<string, unknown> = {};
let defaultVariables: Record<string, unknown> = {};
let defaultDarkVariables: Record<string, unknown> = {};

export function useVariables() {
  let $variables = useContext(VariableContext);

  // $variables will be null if this is a top-level component
  if ($variables === null) {
    return Appearance.getColorScheme() === "light"
      ? rootVariables
      : rootDarkVariables;
  } else {
    return Appearance.getColorScheme() === "light"
      ? {
          ...$variables,
          ...defaultVariables,
        }
      : {
          ...$variables,
          ...defaultDarkVariables,
        };
  }
}
