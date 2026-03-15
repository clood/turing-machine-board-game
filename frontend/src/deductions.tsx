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
  }
  return true;
}

function checkLetters(state: RootState, possibleLetters: string[][]) {
  if (!state.comments[0].nightmare) return true;
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

// --- Logique de vérification corrigée ---

/**
 * Vérifie si un code saisi est OK ou KO pour un vérificateur donné.
 * La logique compare si le code saisi respecte la MEME loi que le code solution.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);

  const verifierCards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1 ? state.comments.map(({ criteriaCards }) => criteriaCards[1].id) : []),
  ];

  // 1. On récupère d'abord les lois (indices de critères) qui sont valides pour la SOLUTION du jeu
  // En envoyant 0 queries, le worker nous donne ce qui est possible pour le setup actuel
  const baseResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [],
    mode,
    numVerifiers,
  });

  // activeCriteria contient les indices des lois valides pour la solution (ex: [0] pour "Bleu=5")
  const activeCriteria = baseResult.possibleVerifiers?.[slotIndex] || [];

  // 2. On demande au worker si le code saisi (ex: 432) est compatible avec CES critères précis
  // On utilise get_possible_codes car il permet de tester un code contre des critères fixes
  const testResult = await waitForWorker({
    type: "get_possible_codes",
    cards: [verifierCards[slotIndex]], // On ne teste que la carte concernée
    possibleVerifiers: [activeCriteria]
  });

  // On transforme le code [4,3,2] en string "432" pour comparer avec les codes possibles renvoyés
  const codeStr = code.join('');
  const isMatch = testResult.codes.includes(codeStr);

  return isMatch ? "solved" : "unsolved";
}

// --- Reste des fonctions originales ---

export async function checkDeductions(state: RootState) {
  const numVerifiers = state.comments.length;
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);
  const cards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1 ? state.comments.map(({ criteriaCards }) => criteriaCards[1].id) : []),
  ];

  const queries: Query[] = [];
  for (const round of state.rounds) {
    const code = round.code.map(c => c.digit).filter((d): d is number => d !== null);
    if (code.length === 3) {
      for (const query of round.queries) {
        if (query.state !== "unknown") {
          queries.push({
            code,
            verifierIdx: query.verifier.charCodeAt(0) - "A".charCodeAt(0),
            result: query.state === "solved",
          });
        }
      }
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
    store.dispatch(alertActions.openAlert({ message: `Invalid deductions!`, level: "error" }));
  } else {
    store.dispatch(alertActions.openAlert({ message: `Deductions are valid!`, level: "success" }));
  }
}

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

let workId = 0;
const promiseResolves: { [id: number]: any } = {};

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
