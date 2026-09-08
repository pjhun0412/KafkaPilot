export type ValueColumnTreeNode = {
  name: string;
  fullPath: string;
  children: Map<string, ValueColumnTreeNode>;
  leafPath?: string;
};

export function normalizeValueColumnPathKey(path: string) {
  return path.replace(/[-_\s]/g, "").toLowerCase();
}

export function createValueColumnTree(paths: string[]) {
  const root: ValueColumnTreeNode = { name: "", fullPath: "", children: new Map() };
  for (const path of paths) {
    const segments = path.split(".").filter(Boolean);
    let node = root;
    segments.forEach((segment, index) => {
      const fullPath = segments.slice(0, index + 1).join(".");
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, fullPath, children: new Map() };
        node.children.set(segment, child);
      }
      if (index === segments.length - 1) {
        child.leafPath = path;
      }
      node = child;
    });
  }
  return root;
}

export function getValueColumnLeafPaths(node: ValueColumnTreeNode): string[] {
  const paths: string[] = [];
  if (node.leafPath) paths.push(node.leafPath);
  for (const child of node.children.values()) {
    paths.push(...getValueColumnLeafPaths(child));
  }
  return paths;
}

export function getValueColumnGroupHintKey(name: string) {
  const key = normalizeValueColumnPathKey(name);
  if (key.includes("position") || key.includes("gps") || key.includes("location")) return "label.positionInfo";
  if (key.includes("vehicle") || key.includes("ego")) return "label.vehicleStatus";
  if (key.includes("time")) return "label.timeInfo";
  return "";
}

export function formatValueColumnLabel(path: string) {
  const segments = path.split(".").filter(Boolean);
  const leaf = segments.at(-1) ?? path;
  const parent = segments.at(-2) ?? "";
  return parent ? `${leaf} (...${parent})` : leaf;
}
