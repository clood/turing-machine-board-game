import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type CodeStateValue = "normal" | "greyed" | "outlined";

export type ManualCodeListState = Record<string, CodeStateValue>;

const initialState: ManualCodeListState = {};

const NEXT_STATE: Record<CodeStateValue, CodeStateValue> = {
  normal: "greyed",
  greyed: "outlined",
  outlined: "normal",
};

export const manualCodeListSlice = createSlice({
  name: "manualCodeList",
  initialState,
  reducers: {
    toggleCode: (state, action: PayloadAction<string>) => {
      const code = action.payload;
      const current: CodeStateValue = state[code] ?? "normal";
      state[code] = NEXT_STATE[current];
    },
    reset: () => initialState,
  },
});

export const manualCodeListActions = manualCodeListSlice.actions;
export default manualCodeListSlice.reducer;
