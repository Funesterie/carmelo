// Polyfills pour les méthodes modernes si besoin (pour Vite/TS)
if (!Array.prototype.includes) {
  Array.prototype.includes = function <T>(this: T[], searchElement: T, fromIndex?: number) {
    return this.indexOf(searchElement, fromIndex) !== -1;
  };
}
if (!Array.prototype.flat) {
  Array.prototype.flat = function <A, D extends number = 1>(this: A, depth?: D) {
    const flattened: FlatArray<A, D>[] = [];
    const initialDepth = typeof depth === "number" && !Number.isNaN(depth) ? depth : 1;
    (function flat(arr: unknown[], d: number | undefined) {
      for (let i = 0; i < arr.length; i += 1) {
        const item = arr[i];
        if (Array.isArray(item) && ((d ?? 0) > 0 || d === undefined)) {
          flat(item, d === undefined ? 1 : d - 1);
        } else {
          flattened.push(item as FlatArray<A, D>);
        }
      }
    })(Array.isArray(this) ? (this as unknown[]) : [this], initialDepth);
    return flattened;
  };
}
// Polyfill Object.entries
if (!Object.entries) {
  Object.entries = function <T extends object>(obj: T) {
    const ownProps = Object.keys(obj) as Array<keyof T>;
    const resArray = new Array<[string, T[keyof T]]>(ownProps.length);
    for (let i = ownProps.length - 1; i >= 0; i -= 1) {
      const key = ownProps[i];
      resArray[i] = [String(key), obj[key]];
    }
    return resArray;
  };
}
