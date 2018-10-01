/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import invariant from 'shared/invariant';

// Renderers that don't support hydration
// can re-export everything from this module.

function shim(...args: any) {
  invariant(
    false,
    'The current renderer does not support hyration. ' +
      'This error is likely caused by a bug in React. ' +
      'Please file an issue.',
  );
}

// Hydration (when unsupported)
export const getHostInstanceDisplayName = shim;
export const getHostInstanceProps = shim;
export const isTextInstance = shim;
export const getTextInstanceText = shim;
export const compareTextForHydrationWarning = shim;
export const comparePropValueForHydrationWarning = shim;
export const supportsHydration = false;
export const canHydrateInstance = shim;
export const canHydrateTextInstance = shim;
export const getNextHydratableSibling = shim;
export const getFirstHydratableChild = shim;
export const hydrateInstance = shim;
export const hydrateTextInstance = shim;
