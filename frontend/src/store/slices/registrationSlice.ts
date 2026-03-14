import { PayloadAction, createSlice } from "@reduxjs/toolkit";

export type RegistrationState = {
  name: string;
  hash: string;
  partyInfo: string; // ← la chaîne complète pour le partage
  status: "new" | "fetch" | "ready";
};

const initialState: RegistrationState = {
  name: "",
  hash: "",
  partyInfo: "",
  status: "new",
};

export const registrationSlice = createSlice({
  name: "registration",
  initialState,
  reducers: {
    load: (_, action: PayloadAction<RegistrationState>) => action.payload,
    reset: (state) => {
      state.hash = "";
      state.partyInfo = "";
      state.status = "new";
    },
    fetch: (state) => ({
      ...state,
      status: "fetch",
    }),
    fetchBad: (state) => ({
      ...state,
      status: "new",
    }),
    fetchDone: (state) => ({
      ...state,
      status: "ready",
    }),
    updateName: (state, action: PayloadAction<string>) => {
      state.name = action.payload;
    },
    updateHash: (state, action: PayloadAction<string>) => {
      state.hash = action.payload
        .replace("#", "")
        .replaceAll(" ", "")
        .split(/(.{3})/)
        .filter((e) => e)
        .join(" ");
    },
    updatePartyInfo: (state, action: PayloadAction<string>) => {
      state.partyInfo = action.payload;
    },
  },
});

export const registrationActions = registrationSlice.actions;

export default registrationSlice.reducer;
