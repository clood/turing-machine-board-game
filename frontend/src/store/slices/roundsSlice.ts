import { PayloadAction, createSlice } from "@reduxjs/toolkit";

type Query = {
  verifier: Verifier;
  state: "solved" | "unsolved" | "unknown";
};

type Code = {
  shape: Shape;
  digit: Nullable<Digit>;
};

export type RoundsState = {
  code: Code[];
  queries: Query[];
  isPristine: boolean;
}[];

const initialState: RoundsState = [
  {
    code: (["triangle", "square", "circle"] as Shape[]).map((shape) => ({
      shape,
      digit: null,
    })),
    queries: (["A", "B", "C", "D", "E", "F"] as Verifier[]).map((verifier) => ({
      verifier,
      state: "unknown",
    })),
    isPristine: false,
  },
];

export const roundsSlice = createSlice({
  name: "rounds",
  initialState,
  reducers: {
