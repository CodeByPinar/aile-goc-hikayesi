export type View = [number, number, number];
export declare const viewOf: (a: [number, number], b: [number, number], aspect: number, hasFacts: boolean, focusX?: number) => View;
export declare const fitView: (v: View, aspect: number, GW: number, GH: number) => View;
export declare const focusXOf: (
  scene: { focus?: string[] },
  places: Record<string, { c: [number, number] }>,
  P: (c: [number, number]) => [number, number],
) => number | undefined;
export declare const firstYear: (years: unknown) => number | null;
