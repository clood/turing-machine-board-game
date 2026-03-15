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

// --- Fonctions de validation existantes (conservées) ---

function checkDigits(state: RootState, possibleCodes: string[]) {
  const digits = { triangle: new Set(), square: new Set(), circle: new Set() };
  for (const code of possibleCodes) {
    digits.triangle.add(Number(code[0]));
    digits.square.add(Number(code[1]));
    digits.circle.add(Number(code[2]));
  }
  for (const { shape, digit } of state.digitCode) {
    // @ts-ignore
    if (digits[shape].has(digit)) {
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
  if (!state.comments[0].nightmare) {
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

// --- Nouvelle fonction de vérification pour les clics par lettre ---

/**
 * Vérifie si un code saisi est validé (solved) ou non (unsolved) par un vérificateur spécifique.
 * Utilise le worker WASM pour simuler si le code est compatible avec la solution.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  const mode = (() => {
    if (state.comments[0].nightmare) return 2;
    if (state.comments[0].criteriaCards.length > 1) return 1;
    return 0;
  })();

  const verifierCards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1 ? state.comments.map(({ criteriaCards }) => criteriaCards[1].id) : []),
  ];

  // Index du vérificateur (A=0, B=1, etc.)
  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);

  // On interroge le worker : si on considère ce test comme réussi (result: true),
  // existe-t-il toujours une solution possible (le code 532) ?
  const result = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [{
      code,
      verifierIdx: slotIndex,
      result: true,
    }],
    mode,
    numVerifiers,
  });

  // Si result.codes contient au moins une solution, c'est que le test est "OK"
  return result.codes.length > 0 ? "solved" : "unsolved";
}

// --- Fonctions globales de déduction ---

export async function checkDeductions(state: RootState) {
  const numVerifiers = state.comments.length;
  const mode = (() => {
    if (state.comments[0].nightmare) return 2;
    if (state.comments[0].criteriaCards.length > 1) return 1;
    return 0;
  })();
  
  const cards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1 ? state.comments.map(({ criteriaCards }) => criteriaCards[1].id) : []),
  ];

  const queries: Query[] = [];
  for (const round of state.rounds) {
    const code: number[] = [];
    for (const { digit } of round.code) {
      if (digit !== null && digit >= 1 && digit <= 5) code.push(digit);
    }
    if (code.length !== 3) continue;

    for (const query of round.queries) {
      if (query.state === "unknown") continue;
      queries.push({
        code,
        verifierIdx: query.verifier.charCodeAt(0) - "A".charCodeAt(0),
        result: query.state === "solved",
      });
    }
  }

  const result = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries,
    mode,
    numVerifiers,
  });

  if (result.codes.length === 0) {
    store.dispatch(alertActions.openAlert({
      message: `There are no more possible codes. Check your verifiers.`,
      level: "error",
    }));
  } else if (!(checkVerifiers(state, result.possibleVerifiers) && checkDigits(state, result.codes) && checkLetters(state, result.possibleLetters))) {
    store.dispatch(alertActions.openAlert({
      message: `You have made an invalid deduction!`,
      level: "warning",
    }));
  } else {
    store.dispatch(alertActions.openAlert({
      message: `All deductions are valid so far!`,
      level: "success",
    }));
  }
}

export async function getPossibleCodes(comments: CommentsState) {
  const cards = comments.map(({ criteriaCards }) => criteriaCards.map((card) => card.id));
  const possibleVerifiers: number[][] = [];
  for (const comment of comments) {
    const current: number[] = [];
    let criteriaIdx = 0;
    for (const criteriaCard of comment.criteriaCards) {
      for (let i = 0; i < criteriaCard.criteriaSlots; i += 1) {
        if (!criteriaCard.irrelevantCriteria.includes(i + 1)) current.push(criteriaIdx);
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

// --- Gestion de l'infrastructure Worker (Communication) ---

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
