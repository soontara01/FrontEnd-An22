/** Depth of the product category tree: แผนก (1) > หมวด (2) > หมวดย่อย (3). */
export const CATEGORY_MAX_LEVEL = 3;

export type CategoryLevel = 1 | 2 | 3;

export const CATEGORY_LEVEL_LABEL: Record<CategoryLevel, string> = {
  1: 'แผนก',
  2: 'หมวด',
  3: 'หมวดย่อย',
};

/** Product category (master data). SKUs may only be assigned to active leaf categories. */
export interface Category {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  level: CategoryLevel;
  active: boolean;
  /** Read-only, server-derived: number of SKUs in this category */
  productCount: number;
}

export type CategoryPayload = Pick<Category, 'code' | 'name' | 'parentId' | 'active'>;

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

/** 'ไอที > คอมพิวเตอร์ > โน้ตบุ๊ก' for a category id ('' when unknown). */
export function categoryPath(list: readonly Category[], id: number | null): string {
  const byId = new Map(list.map((c) => [c.id, c]));
  const names: string[] = [];
  let current = id === null ? undefined : byId.get(id);
  while (current) {
    names.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return names.join(' > ');
}

/** True when no other category has this one as parent. */
export const isLeaf = (list: readonly Category[], id: number): boolean =>
  !list.some((c) => c.parentId === id);

/** Nested tree (roots first), each level sorted by code. */
export function buildTree(list: readonly Category[]): CategoryNode[] {
  const nodes = new Map<number, CategoryNode>(list.map((c) => [c.id, { ...c, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    (parent ? parent.children : roots).push(node);
  }
  const sort = (items: CategoryNode[]) => {
    items.sort((a, b) => a.code.localeCompare(b.code));
    items.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
