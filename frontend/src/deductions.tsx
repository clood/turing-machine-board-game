import { RootState, store } from "store";
import { alertActions } from "store/slices/alertSlice";
import { CommentsState } from "store/slices/commentsSlice";

export type Query = {
  code: number[];
  verifierIdx: number;
  result: boolean;
};

export type Verifier = string;

const myWorker = new Worker(
  "/turing-machine-board-game-solver/wasm/worker.mjs"
);

/**
 * LOGIQUE DE VÉRIFICATION POUR LES TESTS PAR LETTRE (OK/KO)
 * Compare le code saisi à la loi unique de la solution actuelle.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);

  const verifierCards = state.comments.map(({ criteriaCards }) => criteriaCards[0].id);
  if (mode === 1) {
    state.comments.forEach(({ criteriaCards }) => {
      if (criteriaCards[1]) verifierCards.push(criteriaCards[1].id);
    });
  }

  // 1. Identification de la loi active (basée sur la solution unique du setup)
  const solverResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [],
    mode,
    numVerifiers,
  });

  const activeLaws = solverResult.possibleVerifiers?.[slotIndex] || [];
  if (activeLaws.length === 0) return "unsolved";

  // 2. Test du code contre cette loi précise
  const testResult = await waitForWorker({
    type: "get_possible_codes",
    cards: [verifierCards[slotIndex]],
    possibleVerifiers: [activeLaws]
  });

  const codeStr = code.join('');
  return testResult.codes.includes(codeStr) ? "solved" : "unsolved";
}

/**
 * Vérifie la validité globale des déductions de l'utilisateur.
 */
export async function checkDeductions(state: RootState) {
  const numVerifiers = state.comments.length;
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);
  const cards = state.comments.map(({ criteriaCards }) => criteriaCards[0].id);
  if (mode === 1) {
    state.comments.forEach(({ criteriaCards }) => {
      if (criteriaCards[1]) cards.push(criteriaCards[1].id);
    });
  }

  const queries: Query[] = [];
  state.rounds.forEach((round) => {
    const code: number[] = [];
    round.code.forEach(c => {
      if (typeof c.digit === 'number') code.push(c.digit);
    });

    if (code.length === 3) {
      round.queries.forEach((q) => {
        if (q.state !== "unknown") {
          queries.push({
            code,
            verifierIdx: q.verifier.charCodeAt(0) - "A".charCodeAt(0),
            result: q.state === "solved",
          });
        }
      });
    }
  });

  const result = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries,
    mode,
    numVerifiers,
  });

  if (result.codes.length === 0) {
    store.dispatch(alertActions.openAlert({ 
      message: `Invalid deductions! No code matches these results.`, 
      level: "error" 
    }));
  } else {
    store.dispatch(alertActions.openAlert({ 
      message: `Deductions are valid! ${result.codes.length} possible codes remain.`, 
      level: "success" 
    }));
  }
}

/**
 * Récupère tous les codes possibles selon les critères sélectionnés.
 */
export async function getPossibleCodes(comments: CommentsState) {
  const cards = comments.map(({ criteriaCards }) => criteriaCards.map((card) => card.id));
  const possibleVerifiers: number[][] = comments.map(c => {
    const current: number[] = [];
    let idx = 0;
    c.criteriaCards.forEach(card => {
      for (let i = 0; i < card.criteriaSlots; i++) {
        if (!card.irrelevantCriteria.includes(i + 1)) current.push(idx);
        idx++;
      }
    });
    return current;
  });

  return waitForWorker({ type: "get_possible_codes", cards, possibleVerifiers });
}

// --- Communication Worker ---

let workId = 0;
const promiseResolves: { [id: number]: (value: any) => void } = {};

async function waitForWorker(data: any): Promise<any> {
  const id = workId++;
  return new Promise((res) => {
    promiseResolves[id] = res;
    myWorker.postMessage({ ...data, id });
  });
}

myWorker.onmessage = (e) => {
  const { id, ...rest } = e.data;
  if (promiseResolves[id]) {
    promiseResolves[id](rest);
    delete promiseResolves[id];
  }
};
