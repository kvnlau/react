/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {HostComponent, HostText, HostPortal} from 'shared/ReactWorkTags';
import warning from 'shared/warning';
import getComponentName from 'shared/getComponentName';

import type {Fiber} from './ReactFiber';
import type {Container, Instance, TextInstance} from './ReactFiberHostConfig';

import {
  getNextHydratableSibling,
  getFirstHydratableChild,
  getHostInstanceDisplayName,
  getHostInstanceProps,
  isTextInstance,
  getTextInstanceText,
  compareTextForHydrationWarning,
  comparePropValueForHydrationWarning,
} from './ReactFiberHostConfig';

const REACT_SPECIFIC_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
  children: null,
  dangerouslySetInnerHTML: null,
  suppressContentEditableWarning: null,
  suppressHydrationWarning: null,
};

let didWarnInvalidHydration = false;
let SUPPRESS_HYDRATION_WARNING;
if (__DEV__) {
  SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning';
}
export {SUPPRESS_HYDRATION_WARNING};

// TODO: Should PRINT_MAX_STRING_LENGTH remain hardcoded?
const PRINT_MAX_STRING_LENGTH = 100;
// TODO: Should PRINT_MAX_ARRAY_ITEMS remain hardcoded?
const PRINT_MAX_ARRAY_ITEMS = 3;
// TODO: Should PRINT_MAX_OBJECT_ITEMS remain hardcoded?
const PRINT_MAX_OBJECT_ITEMS = 3;
// TODO: Should PRINT_MAX_PROP_ITEMS remain hardcoded?
const PRINT_MAX_PROP_ITEMS = 3;

type DangerouslySetInnerHTMLString = {
  __html: string,
};

const PRINT_ELEMENT_MODE_DEFAULT: 0b0000 = 0b0000;
const PRINT_ELEMENT_MODE_OPENING_TAG_ONLY: 0b0001 = 0b0001;
const PRINT_CHILDREN_VALUE_MODE_DEFAULT: 0b0010 = 0b0010;
const PRINT_CHILDREN_VALUE_MODE_RAW: 0b0100 = 0b0100;

function isReactElement(value: mixed): boolean %checks {
  return (
    typeof value === 'object' && value !== null && value.$$typeof !== undefined
  );
}

function printReactElement(value: Object): string {
  const instanceDisplayName = getComponentName(value.type);
  // Add `key` prop to print it along with regular props if it's defined.
  const instanceProps = value.props
    ? value.key !== undefined && value.key !== null
      ? {key: value.key, ...value.props}
      : value.props
    : null;
  return instanceDisplayName === null
    ? '<...>'
    : printElementOrText(
        instanceDisplayName,
        instanceProps,
        null,
        PRINT_ELEMENT_MODE_DEFAULT,
        PRINT_CHILDREN_VALUE_MODE_DEFAULT,
      );
}

function clipStringWithEllipsis(str: string, clipAtLength: number): string {
  return (
    str.substring(0, clipAtLength) + (str.length > clipAtLength ? '...' : '')
  );
}

function printValue(value: mixed): string {
  try {
    if (value === null) {
      return 'null';
    } else if (value === undefined) {
      return 'undefined';
    } else if (typeof value === 'string') {
      return "'" + clipStringWithEllipsis(value, PRINT_MAX_STRING_LENGTH) + "'";
    } else if (Array.isArray(value)) {
      let ret = '[';

      const ic = value.length;
      for (let i = 0; i < ic; ++i) {
        ret += i > 0 ? ', ' : '';
        if (i >= PRINT_MAX_ARRAY_ITEMS) {
          ret += '...';
          break;
        }
        const item = value[i];
        ret += printValue(item);
      }
      ret += ']';
      return ret;
    } else if (isReactElement(value)) {
      return printReactElement(value);
    } else if (typeof value === 'function' && typeof value.name === 'string') {
      return clipStringWithEllipsis(
        'function ' + value.name,
        PRINT_MAX_STRING_LENGTH,
      );
    } else if (typeof value === 'object') {
      let ret = '{';
      const keys = Object.keys(value);
      const ic = keys.length;
      for (let i = 0; i < ic; ++i) {
        ret += i > 0 ? ', ' : '';
        if (i >= PRINT_MAX_OBJECT_ITEMS) {
          ret += '...';
          break;
        }
        const item = value[keys[i]];
        ret += printValue(keys[i]) + ': ' + printValue(item);
      }
      ret += '}';
      return ret;
    } else {
      return '...';
    }
  } catch (ex) {
    return '...';
  }
}

function escapeNonPrintableCharacters(str: string, quote: "'" | '"'): string {
  return str.replace(/[\s\S]/g, character => {
    switch (character) {
      case quote:
        return '\\' + character;
      case '\n':
        return '\\n';
      case '\t':
        return '\\t';
      default: {
        const charCode = character.charCodeAt(0);
        // Do not escape if the character is within the ASCII printable range:
        if (charCode >= 0x20 && charCode <= 0x7e) {
          return character;
        }
        const charCodeHex = charCode.toString(16);
        const longhand = charCodeHex.length > 2;
        return (
          '\\' +
          (longhand ? 'u' : 'x') +
          ('0000' + charCodeHex).slice(longhand ? -4 : -2)
        );
      }
    }
  });
}

function printQuotedStringValue(str: string, quote: "'" | '"'): string {
  return (
    quote +
    escapeNonPrintableCharacters(
      clipStringWithEllipsis(str, PRINT_MAX_STRING_LENGTH),
      quote,
    ) +
    quote
  );
}

function printCurlyValue(value: mixed): string {
  return '{' + printValue(value) + '}';
}

const SPACE_ONLY_RE = /^\s*$/;
const NON_EMPTY_WITH_SPACE_FROM_BOTH_SIDES_RE = /^\s+.+\s+$/;
// The ASCII printable range is from \x20 to \x7E. The tag brackets are '<' (\x3C) and '>' (\x3E).
const ASCII_PRINTABLE_EXCEPT_TAG_BRACKETS_RE = /^[\x20-\x3B\x3D\x3F-\x7E]*$/;

function shouldPrintStringAsRawUnescapedText(str: string): boolean {
  return (
    !SPACE_ONLY_RE.test(str) &&
    !NON_EMPTY_WITH_SPACE_FROM_BOTH_SIDES_RE.test(str) &&
    ASCII_PRINTABLE_EXCEPT_TAG_BRACKETS_RE.test(str)
  );
}

function printCurlyOrQuotedStringValue(value: mixed): string {
  if (typeof value === 'string') {
    if (
      (value === '' || shouldPrintStringAsRawUnescapedText(value)) &&
      value.indexOf('"') < 0
    ) {
      // Examples: `<meta charset="utf-8" />`, `<div data-reactroot="" />`.
      return printQuotedStringValue(value, '"');
    } else {
      // Examples: `<div>{'Foo\u00a0Bar'}</div>`.
      return '{' + printQuotedStringValue(value, "'") + '}';
    }
  } else {
    // Examples: `<div>{[object Object]}</div>`.
    return printCurlyValue(value);
  }
}

function printChildrenValueInner(
  children: mixed,
  printChildrenMode:
    | typeof PRINT_CHILDREN_VALUE_MODE_DEFAULT
    | typeof PRINT_CHILDREN_VALUE_MODE_RAW,
): string {
  if (printChildrenMode & PRINT_CHILDREN_VALUE_MODE_RAW && children === null) {
    return '';
  } else if (
    printChildrenMode & PRINT_CHILDREN_VALUE_MODE_RAW &&
    typeof children === 'string' &&
    shouldPrintStringAsRawUnescapedText(children)
  ) {
    // Print unquoted text content within a parent tag if special-character escaping is not required.
    // Example: `<div>parsnip</div>` instead of `<div>{'parsnip'}</div>`
    // Example: `<div>parsnip <span /></div>` instead of `<div>{['parsnip ', <span />]}</div>`
    return clipStringWithEllipsis(children, PRINT_MAX_STRING_LENGTH);
  } else if (isReactElement(children)) {
    return printReactElement(children);
  } else {
    return printCurlyValue(children);
  }
}

function printChildrenValue(
  children: mixed,
  printChildrenMode:
    | typeof PRINT_CHILDREN_VALUE_MODE_DEFAULT
    | typeof PRINT_CHILDREN_VALUE_MODE_RAW,
): string {
  if (Array.isArray(children)) {
    let ic = children.length;
    let isAllStrings = ic > 0;
    while (--ic > 0) {
      if (typeof children[ic] !== 'string') {
        isAllStrings = false;
        break;
      }
    }
    if (isAllStrings) {
      return printCurlyValue(children);
    } else {
      return children
        .map(child => printChildrenValueInner(child, printChildrenMode))
        .join('');
    }
  } else {
    return printChildrenValueInner(children, printChildrenMode);
  }
}

function printChildrenHTML(
  instanceHTML: DangerouslySetInnerHTMLString,
): string {
  // For simplicity, assuming for display purposes that HTML is equivalent to the printed JSX markup.
  return clipStringWithEllipsis(instanceHTML.__html, PRINT_MAX_STRING_LENGTH);
}

function printElementOpeningTag(
  instanceDisplayName: string,
  instanceProps: Object | null,
  selfClosing: boolean,
) {
  let ret = '<' + instanceDisplayName;
  if (instanceProps) {
    let i = 0;
    for (const propName in instanceProps) {
      if (
        !instanceProps.hasOwnProperty(propName) ||
        REACT_SPECIFIC_PROPS.hasOwnProperty(propName)
      ) {
        continue;
      }
      if (i >= PRINT_MAX_PROP_ITEMS) {
        ret += ' ...';
        break;
      }
      ret +=
        ' ' +
        propName +
        '=' +
        printCurlyOrQuotedStringValue(instanceProps[propName]);
      ++i;
    }
  }
  return ret + (selfClosing ? ' />' : '>');
}

function printElementClosingTag(instanceDisplayName: string): string {
  return '</' + instanceDisplayName + '>';
}

function isDangerouslySetInnerHTMLString(value: mixed): boolean %checks {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.__html != null &&
    // We need to ensure `__html` actually contains a string, as some tests put `false` in there.
    typeof value.__html === 'string'
  );
}

function printElementChildren(
  instanceProps: Object | null,
  instanceTextOrHTML: string | DangerouslySetInnerHTMLString | null,
) {
  if (instanceProps && instanceProps.children != null) {
    return printChildrenValue(
      instanceProps.children,
      PRINT_CHILDREN_VALUE_MODE_RAW,
    );
  } else if (
    instanceProps &&
    isDangerouslySetInnerHTMLString(instanceProps.dangerouslySetInnerHTML)
  ) {
    return printChildrenHTML(instanceProps.dangerouslySetInnerHTML);
  } else if (typeof instanceTextOrHTML === 'string') {
    return printChildrenValue(
      instanceTextOrHTML,
      PRINT_CHILDREN_VALUE_MODE_RAW,
    );
  } else if (isDangerouslySetInnerHTMLString(instanceTextOrHTML)) {
    return printChildrenHTML(instanceTextOrHTML);
  } else if (instanceTextOrHTML != null) {
    return printCurlyValue(instanceTextOrHTML);
  } else {
    return '';
  }
}

function printElementOrText(
  instanceDisplayName: string | null,
  instanceProps: Object | null,
  instanceTextOrHTML: string | DangerouslySetInnerHTMLString | null,
  printElementMode:
    | typeof PRINT_ELEMENT_MODE_DEFAULT
    | typeof PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
  printChildrenMode:
    | typeof PRINT_CHILDREN_VALUE_MODE_DEFAULT
    | typeof PRINT_CHILDREN_VALUE_MODE_RAW,
): string {
  if (
    instanceDisplayName !== null &&
    printElementMode & PRINT_ELEMENT_MODE_OPENING_TAG_ONLY
  ) {
    return printElementOpeningTag(instanceDisplayName, instanceProps, false);
  } else if (instanceDisplayName !== null) {
    const printedChildren = printElementChildren(
      instanceProps,
      instanceTextOrHTML,
    );
    if (printedChildren) {
      return (
        printElementOpeningTag(instanceDisplayName, instanceProps, false) +
        printedChildren +
        printElementClosingTag(instanceDisplayName)
      );
    } else {
      return printElementOpeningTag(instanceDisplayName, instanceProps, true);
    }
  } else if (isDangerouslySetInnerHTMLString(instanceTextOrHTML)) {
    return printChildrenHTML(instanceTextOrHTML);
  } else {
    return printChildrenValue(instanceTextOrHTML, printChildrenMode);
  }
}

function getHostInstanceDisplayStringForHydrationWarningMessage(
  instanceOrTextInstance: Container | Instance | TextInstance,
) {
  if (isTextInstance(instanceOrTextInstance)) {
    const textInstance: TextInstance = (instanceOrTextInstance: any);
    return printElementOrText(
      null,
      null,
      getTextInstanceText(textInstance),
      PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
      PRINT_CHILDREN_VALUE_MODE_DEFAULT,
    );
  } else {
    const instance: Container | Instance = (instanceOrTextInstance: any);
    return printElementOrText(
      getHostInstanceDisplayName(instance),
      {},
      null,
      PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
      PRINT_CHILDREN_VALUE_MODE_DEFAULT,
    );
  }
}

function printHostInstance(
  instanceOrTextInstance: Container | Instance | TextInstance,
  printChildrenMode:
    | typeof PRINT_CHILDREN_VALUE_MODE_DEFAULT
    | typeof PRINT_CHILDREN_VALUE_MODE_RAW,
) {
  let ret = '';
  if (isTextInstance(instanceOrTextInstance)) {
    const textInstance: TextInstance = (instanceOrTextInstance: any);
    ret += printElementOrText(
      null,
      null,
      getTextInstanceText(textInstance),
      PRINT_ELEMENT_MODE_DEFAULT,
      printChildrenMode,
    );
  } else {
    const instance: Container | Instance = (instanceOrTextInstance: any);
    const instanceDisplayName = getHostInstanceDisplayName(instance);
    const instanceProps = getHostInstanceProps(instance);
    let nextHydratableInstance = getFirstHydratableChild(instance);
    if (nextHydratableInstance) {
      ret += printElementOrText(
        instanceDisplayName,
        instanceProps,
        null,
        PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
        printChildrenMode,
      );
      while (nextHydratableInstance) {
        ret += printHostInstance(
          nextHydratableInstance,
          PRINT_CHILDREN_VALUE_MODE_RAW,
        );
        nextHydratableInstance = getNextHydratableSibling(
          nextHydratableInstance,
        );
      }
      ret += printElementClosingTag(instanceDisplayName);
    } else {
      ret += printElementOrText(
        instanceDisplayName,
        instanceProps,
        null,
        PRINT_ELEMENT_MODE_DEFAULT,
        printChildrenMode,
      );
    }
  }
  return ret;
}

export function findHydrationWarningHostInstanceIndex(
  returnFiber: Fiber,
  fiber: Fiber,
): number {
  let hydrationWarningHostInstanceIndex = 0;
  // Find index of `fiber`, the place where hydration failed, among immediate children host nodes of `returnFiber`.
  const startNode = returnFiber.child;
  let node: Fiber | null = startNode;
  search: while (node && node !== fiber) {
    if (node.tag === HostComponent || node.tag === HostText) {
      ++hydrationWarningHostInstanceIndex;
    } else if (node.tag === HostPortal) {
      // Do not count HostPortal and do not descend into them as they do not affect the index within the parent.
    } else if (node.child !== null) {
      // Do not descend into HostComponent or HostText as they do not affect the index within the parent.
      node.child.return = node;
      node = node.child;
      continue;
    }
    while (node && node.sibling === null) {
      if (node.return === null || node.return === startNode) {
        break search;
      }
      node = node.return;
    }
    if (node && node.sibling) {
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
  return hydrationWarningHostInstanceIndex;
}

function getHydrationDiff(
  parentInstance: Container | Instance,
  childInstanceDeletedIndex: number,
  childInstanceInsertedIndex: number,
  insertedInstanceDisplayName: string | null,
  insertedInstanceProps: Object | null,
  insertedText: string | null,
): string {
  // Prepending '\n' for readability to separate the diff from the warning message.
  let ret = '\n';
  const INDENT = '  ';
  const DIFF_ADDED = '\n+ ';
  const DIFF_REMOVED = '\n- ';
  const DIFF_UNCHANGED = '\n  ';
  ret +=
    DIFF_UNCHANGED +
    printElementOrText(
      getHostInstanceDisplayName(parentInstance),
      getHostInstanceProps(parentInstance),
      null,
      PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
      // TODO: Should we print curly values for top-level text nodes or raw text.
      PRINT_CHILDREN_VALUE_MODE_DEFAULT,
    );
  let inserted = false;
  const insert = () => {
    if (!inserted) {
      if (insertedInstanceDisplayName || typeof insertedText === 'string') {
        inserted = true;
        ret +=
          DIFF_ADDED +
          INDENT +
          printElementOrText(
            insertedInstanceDisplayName,
            insertedInstanceProps,
            insertedText,
            PRINT_ELEMENT_MODE_DEFAULT,
            // TODO: Should we print curly values for top-level text nodes or raw text.
            PRINT_CHILDREN_VALUE_MODE_DEFAULT,
          );
      }
    }
  };
  let nextHydratableInstance = getFirstHydratableChild(parentInstance);
  let index = 0;
  while (nextHydratableInstance) {
    if (index === childInstanceDeletedIndex) {
      ret +=
        DIFF_REMOVED +
        INDENT +
        printHostInstance(
          nextHydratableInstance,
          PRINT_CHILDREN_VALUE_MODE_DEFAULT,
        );
    } else {
      ret +=
        DIFF_UNCHANGED +
        INDENT +
        printHostInstance(
          nextHydratableInstance,
          PRINT_CHILDREN_VALUE_MODE_DEFAULT,
        );
    }
    if (index === childInstanceInsertedIndex) {
      insert();
    }
    ++index;
    nextHydratableInstance = getNextHydratableSibling(nextHydratableInstance);
  }
  insert();
  // TODO: Cannot tell if more sibling React elements were expected to be hydrated after the current one.
  ret +=
    DIFF_UNCHANGED +
    printElementClosingTag(getHostInstanceDisplayName(parentInstance));
  // Append '\n' for readability to separate the diff from the component stack that follows.
  ret += '\n';
  return ret;
}

function warnForTextDifference(
  hostText: string,
  renderedValue: string | number,
) {
  if (didWarnInvalidHydration) {
    return;
  }
  if (compareTextForHydrationWarning(hostText, renderedValue)) {
    return;
  }
  didWarnInvalidHydration = true;
  // TODO: As we're here in the terminology of universal hydration, should we stop saying 'Server' and 'Client'?
  warning(
    false,
    'Text content did not match. Server: %s Client: %s',
    JSON.stringify(hostText),
    JSON.stringify(renderedValue),
  );
}

function warnForPropDifference(
  propName: string,
  hostValue: mixed,
  renderedValue: mixed,
) {
  if (didWarnInvalidHydration) {
    return;
  }
  if (comparePropValueForHydrationWarning(hostValue, renderedValue)) {
    return;
  }
  didWarnInvalidHydration = true;
  // TODO: As we're here in the terminology of universal hydration, should we stop saying 'Server' and 'Client'?
  warning(
    false,
    'Prop `%s` did not match. Server: %s Client: %s',
    propName,
    JSON.stringify(hostValue),
    JSON.stringify(renderedValue),
  );
}

function warnForExtraAttributes(attributeNames: Set<string>) {
  if (didWarnInvalidHydration) {
    return;
  }
  didWarnInvalidHydration = true;
  const names = [];
  attributeNames.forEach(function(name) {
    names.push(name);
  });
  // TODO: As we're here in the terminology of universal hydration, should we stop saying 'from the server'?
  warning(false, 'Extra attributes from the server: %s', names);
}

function warnForDeletedHydratableInstance(
  parentContainer: Container | Instance,
  child: Instance | TextInstance,
) {
  if (__DEV__) {
    if (didWarnInvalidHydration) {
      return;
    }
    didWarnInvalidHydration = true;
    let nextHydratableInstance = getFirstHydratableChild(parentContainer);
    let childInstanceDeletedIndex = -1;
    let index = 0;
    while (nextHydratableInstance) {
      if (nextHydratableInstance === child) {
        childInstanceDeletedIndex = index;
        break;
      }
      ++index;
      nextHydratableInstance = getNextHydratableSibling(nextHydratableInstance);
    }
    // TODO: As we're here in the terminology of universal hydration, should we stop saying 'server HTML'?
    if (isTextInstance(child)) {
      const textInstance: TextInstance = (child: any);
      warning(
        false,
        'Did not expect server HTML to contain the text node %s in %s.%s',
        getHostInstanceDisplayStringForHydrationWarningMessage(textInstance),
        getHostInstanceDisplayStringForHydrationWarningMessage(parentContainer),
        getHydrationDiff(
          parentContainer,
          childInstanceDeletedIndex,
          -1,
          null,
          null,
          null,
        ),
      );
    } else {
      const instance: Instance = (child: any);
      warning(
        false,
        'Did not expect server HTML to contain a %s in %s.%s',
        getHostInstanceDisplayStringForHydrationWarningMessage(instance),
        getHostInstanceDisplayStringForHydrationWarningMessage(parentContainer),
        getHydrationDiff(
          parentContainer,
          childInstanceDeletedIndex,
          -1,
          null,
          null,
          null,
        ),
      );
    }
  }
}

function warnForInsertedHydratedInstance(
  parentContainer: Container | Instance,
  tag: string,
  props: Object,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__) {
    if (didWarnInvalidHydration) {
      return;
    }
    didWarnInvalidHydration = true;
    // TODO: As we're here in the terminology of universal hydration, should we stop saying 'server HTML'?
    warning(
      false,
      'Expected server HTML to contain a matching %s in %s.%s',
      printElementOrText(
        tag,
        props,
        null,
        PRINT_ELEMENT_MODE_OPENING_TAG_ONLY,
        PRINT_CHILDREN_VALUE_MODE_DEFAULT,
      ),
      getHostInstanceDisplayStringForHydrationWarningMessage(parentContainer),
      getHydrationDiff(
        parentContainer,
        hydrationWarningHostInstanceIsReplaced
          ? hydrationWarningHostInstanceIndex
          : -1,
        hydrationWarningHostInstanceIndex,
        tag,
        props,
        null,
      ),
    );
  }
}

function warnForInsertedHydratedTextInstance(
  parentContainer: Container | Instance,
  text: string,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__) {
    if (text === '') {
      // We expect to insert empty text nodes since they're not represented in the HTML.
      // TODO: Remove this special case if we can just avoid inserting empty text nodes.
      return;
    }
    if (didWarnInvalidHydration) {
      return;
    }
    didWarnInvalidHydration = true;
    // TODO: As we're here in the terminology of universal hydration, should we stop saying 'server HTML'?
    warning(
      false,
      'Expected server HTML to contain a matching text node for %s in %s.%s',
      printCurlyValue(text),
      getHostInstanceDisplayStringForHydrationWarningMessage(parentContainer),
      getHydrationDiff(
        parentContainer,
        hydrationWarningHostInstanceIsReplaced
          ? hydrationWarningHostInstanceIndex
          : -1,
        hydrationWarningHostInstanceIndex,
        null,
        null,
        text,
      ),
    );
  }
}

export function didNotMatchHydratedContainerTextInstance(
  parentContainer: Container,
  textInstance: TextInstance,
  renderedText: string,
) {
  if (__DEV__) {
    warnForTextDifference(getTextInstanceText(textInstance), renderedText);
  }
}

export function didNotMatchHydratedTextInstance(
  parentType: string,
  parentProps: Object,
  parentInstance: Instance,
  textInstance: TextInstance,
  renderedText: string,
) {
  if (__DEV__ && parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForTextDifference(getTextInstanceText(textInstance), renderedText);
  }
}

export function didNotMatchHydratedChildrenPropValue(
  type: string,
  props: Object,
  instance: Instance,
  hostChildrenText: string,
  renderedChildrenValue: string | number,
) {
  if (__DEV__ && props[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForTextDifference(hostChildrenText, renderedChildrenValue);
  }
}

export function didNotMatchHydratedPropValue(
  type: string,
  props: Object,
  instance: Instance,
  propKey: string,
  hostValue: mixed,
  renderedValue: mixed,
) {
  if (__DEV__ && props[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForPropDifference(propKey, hostValue, renderedValue);
  }
}

export function didNotMatchHydratedPropsHostInstanceHasExtraAttributes(
  type: string,
  props: Object,
  instance: Instance,
  attributeNames: Set<string>,
) {
  if (__DEV__ && props[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForExtraAttributes(attributeNames);
  }
}

export function didNotHydrateContainerInstance(
  parentContainer: Container,
  instance: Instance | TextInstance,
) {
  if (__DEV__) {
    warnForDeletedHydratableInstance(parentContainer, instance);
  }
}

export function didNotHydrateInstance(
  parentType: string,
  parentProps: Object,
  parentInstance: Instance,
  instance: Instance | TextInstance,
) {
  if (__DEV__ && parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForDeletedHydratableInstance(parentInstance, instance);
  }
}

export function didNotFindHydratableContainerInstance(
  parentContainer: Container,
  type: string,
  props: Object,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__) {
    warnForInsertedHydratedInstance(
      parentContainer,
      type,
      props,
      hydrationWarningHostInstanceIndex,
      hydrationWarningHostInstanceIsReplaced,
    );
  }
}

export function didNotFindHydratableContainerTextInstance(
  parentContainer: Container,
  text: string,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__) {
    warnForInsertedHydratedTextInstance(
      parentContainer,
      text,
      hydrationWarningHostInstanceIndex,
      hydrationWarningHostInstanceIsReplaced,
    );
  }
}

export function didNotFindHydratableInstance(
  parentType: string,
  parentProps: Object,
  parentInstance: Instance,
  type: string,
  props: Object,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__ && parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForInsertedHydratedInstance(
      parentInstance,
      type,
      props,
      hydrationWarningHostInstanceIndex,
      hydrationWarningHostInstanceIsReplaced,
    );
  }
}

export function didNotFindHydratableTextInstance(
  parentType: string,
  parentProps: Object,
  parentInstance: Instance,
  text: string,
  hydrationWarningHostInstanceIndex: number,
  hydrationWarningHostInstanceIsReplaced: boolean,
) {
  if (__DEV__ && parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    warnForInsertedHydratedTextInstance(
      parentInstance,
      text,
      hydrationWarningHostInstanceIndex,
      hydrationWarningHostInstanceIsReplaced,
    );
  }
}
