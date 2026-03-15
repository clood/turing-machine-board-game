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

// --- Fonctions internes utilisées par checkDeductions ---

function checkDigits(state: RootState, possibleCodes: string[]) {
  const digits = { triangle: new Set(), square: new Set(), circle: new Set() };
  for (const code of possibleCodes) {
    digits.triangle.add(Number(code[0]));
    digits.square.add(Number(code[1]));
    digits.circle.add(Number(code[2]));
  }
  for (const { shape, digit } of state.digitCode) {
    // @ts-ignore
    if (digits[shape as keyof typeof digits].has(digit)) {
      return false;
    }
  }
  return true;
}

function checkVerifiers(state: RootState, possibleVerifiers: number[][]) {
  for (let i = 0; i < state.comments.length; i += 1) {
    const firstCard = state.comments[i].criteriaCards[0];
    for (const criteria of firstCard.irrelevantCriteria) {
      if (possibleVerifiers[i].includes(criteria - 1)) {
        return false;
      }
    }
    const secondCard = state.comments[i].criteriaCards[1] || {
      irrelevantCriteria: [],
    };
    for (const criteria of secondCard.irrelevantCriteria) {
      if (
        possibleVerifiers[i].includes(criteria - 1 + firstCard.criteriaSlots)
      ) {
        return false;
      }
    }
  }
  return true;
}

function checkLetters(state: RootState, possibleLetters: string[][]) {
  if (!state.comments[0] || !state.comments[0].nightmare) {
    return true;
  }
  for (let i = 0; i < state.comments.length; i += 1) {
    const letters = state.comments[i].letters;
    for (const letter of letters) {
      if (letter.isIrrelevant && possibleLetters[i].includes(letter.letter)) {
        return false;
      }
    }
  }
  return true;
}

// --- Nouvelle fonction pour vos tests OK/KO par lettre ---

/**
 * Cette fonction est appelée quand on clique sur une lettre (A, B, C...)
 * Elle valide si le code saisi respecte la loi de la solution.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  if (numVerifiers === 0) return "unsolved";

  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);

  const verifierCards = state.comments.map(c => c.criteriaCards[0].id);
  if (mode === 1) {
    state.comments.forEach(c => {
      if (c.criteriaCards[1]) verifierCards.push(c.criteriaCards[1].id);
    });
  }

  // On demande au worker de trouver la solution unique du setup
  const solverResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [],
    mode,
    numVerifiers,
  });

  // On teste si VOTRE code respecte l'indice de loi de la solution
  const result = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [{
      code: code,
      verifierIdx: slotIndex,
      result: true
    }],
    mode,
    numVerifiers,
  });

  // Si après avoir forcé "votre code est vrai", il reste des solutions possibles 
  // (incluant le code 532), alors c'est OK (solved). Sinon KO (unsolved).
  return result.codes.length > 0 ? "solved" : "unsolved";
}

// --- Fonctions d'origine exportées ---

export async function checkDeductions(state: RootState) {
  if (state.comments.length === 0) return;

  const numVerifiers = state.comments.length;
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);
  
  const cards = state.comments.map(c => c.criteriaCards[0].id);
  if (mode === 1) {
    state.comments.forEach(c => {
      if (c.criteriaCards[1]) cards.push(c.criteriaCards[1].id);
    });
  }

  const queries: Query[] = [];
  state.rounds.forEach(round => {
    const code: number[] = [];
    round.code.forEach(c => {
      if (typeof c.digit === 'number') code.push(c.digit);
    });
    if (code.length === 3) {
      round.queries.forEach(q => {
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
      message: "There are no more possible codes.",
      level: "error",
    }));
  } else if (!(checkVerifiers(state, result.possibleVerifiers) && checkDigits(state, result.codes) && checkLetters(state, result.possibleLetters))) {
    store.dispatch(alertActions.openAlert({
      message: "You have made an invalid deduction!",
      level: "warning",
    }));
  } else {
    store.dispatch(alertActions.openAlert({
      message: "All deductions are valid so far!",
      level: "success",
    }));
  }
}

export async function getPossibleCodes(comments: CommentsState) {
  const cards = comments.map(c => c.criteriaCards.map(card => card.id));
  const possibleVerifiers: number[][] = [];
  for (const comment of comments) {
    const current: number[] = [];
    let criteriaIdx = 0;
    for (const criteriaCard of comment.criteriaCards) {
      for (let i = 0; i < criteriaCard.criteriaSlots; i += 1) {
        if (!criteriaCard.irrelevantCriteria.includes(i + 1)) {
          current.push(criteriaIdx);
        }
        criteriaIdx += 1;
      }
    }
    possibleVerifiers.push(current);
  }

  return waitForWorker({
    type: "get_possible_codes",
    cards,
    possibleVerifiers,
  });
}

// --- Gestion du Worker ---

let workId = 0;
const promiseResolves: { [id: number]: (value: any) => void } = {};

async function waitForWorker(data: { [key: string]: any }): Promise<any> {
  const currentWorkId = workId++;
  return new Promise((res) => {
    promiseResolves[currentWorkId] = res;
    myWorker.postMessage({ ...data, id: currentWorkId });
  });
}

myWorker.onmessage = function onmessage(e) {
  const data = e.data;
  const resolve = promiseResolves[data.id];
  if (resolve) {
    resolve(data);
    delete promiseResolves[data.id];
  }
};
