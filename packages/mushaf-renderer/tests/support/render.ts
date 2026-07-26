/**
 * A tiny element-tree renderer for snapshots.
 *
 * Both targets are pure, hook-free function components, so "rendering" them is
 * just calling them and walking the result. That is deliberate: it lets one
 * helper snapshot the web tree and the native tree identically, with no DOM, no
 * `react-dom`, and no deprecated `react-test-renderer` — and it makes the two
 * targets comparable element by element, which is how the tests prove they lay
 * out the same page.
 *
 * If a component ever needs state or effects, this helper stops being enough —
 * and that is a useful signal, because the renderer's page components are meant
 * to stay pure.
 */

import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

export interface TreeNode {
  readonly type: string;
  readonly props: Record<string, unknown>;
  readonly children: readonly (TreeNode | string)[];
}

function nameOf(type: unknown): string {
  if (typeof type === 'string') return type;
  if (type === Fragment) return 'Fragment';
  if (typeof type === 'function') return (type as { name?: string }).name || 'Anonymous';
  return String(type);
}

function renderChildren(children: ReactNode): (TreeNode | string)[] {
  if (children === null || children === undefined || children === false || children === true) {
    return [];
  }
  if (Array.isArray(children)) return children.flatMap(renderChildren);
  if (typeof children === 'string') return [children];
  if (typeof children === 'number') return [String(children)];
  if (isValidElement(children)) return [renderTree(children)];
  return [];
}

/** Resolve `element` into a plain, serialisable tree. */
export function renderTree(element: ReactElement): TreeNode {
  const type = element.type;
  const props = element.props as Record<string, unknown>;

  if (typeof type === 'function') {
    const rendered = (type as (props: unknown) => ReactNode)(props);
    if (!isValidElement(rendered)) {
      return { type: nameOf(type), props: {}, children: renderChildren(rendered) };
    }
    return renderTree(rendered);
  }

  const { children, ...rest } = props;
  return { type: nameOf(type), props: rest, children: renderChildren(children as ReactNode) };
}

/** Depth-first walk, parents before children. */
export function* walk(node: TreeNode): Generator<TreeNode> {
  yield node;
  for (const child of node.children) {
    if (typeof child !== 'string') yield* walk(child);
  }
}

/** Every node for which `predicate` holds. */
export function findAll(node: TreeNode, predicate: (node: TreeNode) => boolean): TreeNode[] {
  return [...walk(node)].filter(predicate);
}

/** Concatenated text of a node's direct string children. */
export function textOf(node: TreeNode): string {
  return node.children.filter((child): child is string => typeof child === 'string').join('');
}
