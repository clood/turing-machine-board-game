import { RootState, store } from "store";
import { alertActions } from "store/slices/alertSlice";
import { CommentsState } from "store/slices/commentsSlice";

export type Query = {
  code: number[];
  verifierIdx: number;
  result: boolean;
};

// Type pour les lettres de vérificateurs (A, B, C...)
export type Verifier = string;

const myWorker = new Worker(
  "/turing-machine-board-game-solver/wasm/worker.mjs"
);

function checkDigits(state: RootState, possibleCodes: string[]) {
  const digits = { triangle: new Set(), square: new Set(), circle: new Set() };
  for (const code of possibleCodes) {
    digits.triangle.add(Number(code[0]));
    digits.square.add(Number(code[1]));
    digits.circle.add(Number(code[2]));
  }
  for (const { shape, digit } of state.digitCode) {
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

export async function checkDeductions(state: RootState) {
  const numVerifiers = state.comments.length;
  const mode = (() => {
    if (state.comments[0].nightmare) {
      return 2;
    }
    if (state.comments[0].criteriaCards.length > 1) {
      return 1;
    }
    return 0;
  })();
  const cards = [
    ...state.comments.map(({ criteriaCards }) => {
      return criteriaCards[0].id;
    }),
    ...(mode === 1
      ? state.comments.map(({ criteriaCards }) => {
          return criteriaCards[1].id;
        })
      : []),
  ];

  const queries: Query[] = [];
  for (const round of state.rounds) {
    const code: number[] = [];
    for (const { digit } of round.code) {
      if (!(digit !== null && digit >= 1 && digit <= 5)) {
        continue;
      }
      code.push(digit);
    }
    if (code.length !== 3) {
      continue;
    }
    for (const query of round.queries) {
      if (query.state === "unknown") {
        continue;
      }
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
    store.dispatch(
      alertActions.openAlert({
        message: `There are no more possible codes.`,
        level: "error",
      })
    );
  } else if (
    !(
      checkVerifiers(state, result.possibleVerifiers) &&
      checkDigits(state, result.codes) &&
      checkLetters(state, result.possibleLetters)
    )
  ) {
    store.dispatch(
      alertActions.openAlert({
        message: `You have made an invalid deduction!`,
        level: "warning",
      })
    );
  } else {
    store.dispatch(
      alertActions.openAlert({
        message: `All deductions are valid so far!`,
        level: "success",
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Verifier functions — mirrors of cards.hpp verifier_t lambdas
// code = [blue/triangle, yellow/square, purple/circle]  (1-indexed digits)
// ---------------------------------------------------------------------------

type VerifierFn = (code: number[]) => boolean;

const CARD_VERIFIERS: Record<number, VerifierFn[]> = {
  1:  [c => c[0] === 1,  c => c[0] > 1],
  2:  [c => c[0] < 3,    c => c[0] === 3,  c => c[0] > 3],
  3:  [c => c[1] < 3,    c => c[1] === 3,  c => c[1] > 3],
  4:  [c => c[1] < 4,    c => c[1] === 4,  c => c[1] > 4],
  5:  [c => c[0] % 2 === 0, c => c[0] % 2 !== 0],
  6:  [c => c[1] % 2 === 0, c => c[1] % 2 !== 0],
  7:  [c => c[2] % 2 === 0, c => c[2] % 2 !== 0],
  8:  [c => c[0] < 3,    c => c[0] === 3,  c => c[0] > 3,  c => c[1] < 3],
  9:  [c => c[1] < 3,    c => c[1] === 3,  c => c[1] > 3,  c => c[2] < 3],
  10: [c => c[0] < 4,    c => c[0] === 4,  c => c[0] > 4,  c => c[1] < 4],
  11: [c => c[0] < 3,    c => c[0] === 3,  c => c[0] > 3],
  12: [c => c[1] < 3,    c => c[1] === 3,  c => c[1] > 3],
  13: [c => c[2] < 3,    c => c[2] === 3,  c => c[2] > 3],
  14: [c => c[0] < 4,    c => c[0] === 4,  c => c[0] > 4],
  15: [c => c[1] < 4,    c => c[1] === 4,  c => c[1] > 4],
  16: [c => c[2] < 4,    c => c[2] === 4,  c => c[2] > 4],
  17: [c => c[0] % 2 === 0, c => c[0] % 2 !== 0, c => c[1] % 2 === 0, c => c[1] % 2 !== 0],
  18: [c => (c[0] + c[1] + c[2]) % 2 === 0, c => (c[0] + c[1] + c[2]) % 2 !== 0],
  19: [c => c[0] + c[1] < 6, c => c[0] + c[1] === 6, c => c[0] + c[1] > 6],
  20: [
    c => c[0] === c[1] && c[1] === c[2],
    c => ((c[0]===c[1])||(c[0]===c[2])||(c[1]===c[2])) && !(c[0]===c[1]&&c[1]===c[2]),
    c => c[0]!==c[1] && c[0]!==c[2] && c[1]!==c[2],
  ],
  21: [
    c => c[0]!==c[1] && c[0]!==c[2] && c[1]!==c[2],
    c => ((c[0]===c[1])||(c[0]===c[2])||(c[1]===c[2])) && !(c[0]===c[1]&&c[1]===c[2]),
  ],
  22: [
    c => c[0]<c[1] && c[1]<c[2],
    c => c[0]>c[1] && c[1]>c[2],
    c => !(c[0]<c[1]&&c[1]<c[2]) && !(c[0]>c[1]&&c[1]>c[2]),
  ],
  23: [c => c[0]+c[1]+c[2] < 6, c => c[0]+c[1]+c[2] === 6, c => c[0]+c[1]+c[2] > 6],
  24: [
    c => c[1]===c[0]+1 && c[2]===c[1]+1,
    c => c[1]===c[0]-1 && c[2]===c[1]-1,
    c => !(c[1]===c[0]+1&&c[2]===c[1]+1) && !(c[1]===c[0]-1&&c[2]===c[1]-1),
  ],
  25: [
    c => c[0]<=c[1] && c[0]<=c[2],
    c => c[1]<=c[0] && c[1]<=c[2],
    c => c[2]<=c[0] && c[2]<=c[1],
  ],
  26: [c => c[0]<3, c => c[1]<3, c => c[2]<3],
  27: [c => c[0]<4, c => c[1]<4, c => c[2]<4],
  28: [c => c[0]===1, c => c[1]===1, c => c[2]===1],
  29: [c => c[0]===3, c => c[1]===3, c => c[2]===3],
  30: [c => c[0]===4, c => c[1]===4, c => c[2]===4],
  31: [c => c[0]>1, c => c[1]>1, c => c[2]>1],
  32: [c => c[0]>3, c => c[1]>3, c => c[2]>3],
  33: [
    c => c[0]%2===0, c => c[0]%2!==0,
    c => c[1]%2===0, c => c[1]%2!==0,
    c => c[2]%2===0, c => c[2]%2!==0,
  ],
  34: [
    c => c[0]<=c[1] && c[0]<=c[2],
    c => c[1]<=c[0] && c[1]<=c[2],
    c => c[2]<=c[0] && c[2]<=c[1],
  ],
  35: [
    c => c[0]>=c[1] && c[0]>=c[2],
    c => c[1]>=c[0] && c[1]>=c[2],
    c => c[2]>=c[0] && c[2]>=c[1],
  ],
  36: [c => c[0]+c[1]===4, c => c[0]+c[2]===4, c => c[1]+c[2]===4],
  37: [c => c[0]+c[1]===4, c => c[0]+c[2]===4, c => c[1]+c[2]===4],
  38: [c => c[0]+c[1]===6, c => c[0]+c[2]===6, c => c[1]+c[2]===6],
  39: [c => c[0]===1, c => c[0]>1, c => c[1]===1, c => c[1]>1, c => c[2]===1, c => c[2]>1],
  40: [
    c => c[0]<3,  c => c[0]===3, c => c[0]>3,
    c => c[1]<3,  c => c[1]===3, c => c[1]>3,
    c => c[2]<3,  c => c[2]===3, c => c[2]>3,
  ],
  41: [
    c => c[0]<4,  c => c[0]===4, c => c[0]>4,
    c => c[1]<4,  c => c[1]===4, c => c[1]>4,
    c => c[2]<4,  c => c[2]===4, c => c[2]>4,
  ],
  42: [
    c => c[0]<c[1] && c[0]<c[2],
    c => c[0]>c[1] && c[0]>c[2],
    c => c[1]<c[0] && c[1]<c[2],
    c => c[1]>c[0] && c[1]>c[2],
    c => c[2]<c[0] && c[2]<c[1],
    c => c[2]>c[0] && c[2]>c[1],
  ],
  43: [
    c => c[0]<c[1],  c => c[0]<c[2],
    c => c[0]===c[1], c => c[0]===c[2],
    c => c[0]>c[1],  c => c[0]>c[2],
  ],
  44: [
    c => c[0]>c[1],  c => c[1]<c[2],
    c => c[0]===c[1], c => c[1]===c[2],
    c => c[0]<c[1],  c => c[1]>c[2],
  ],
  45: [
    c => c.filter(v=>v===1).length === 0,
    c => c.filter(v=>v===3).length === 0,
    c => c.filter(v=>v===1).length === 1,
    c => c.filter(v=>v===3).length === 1,
    c => c.filter(v=>v===1).length === 2,
    c => c.filter(v=>v===3).length === 2,
  ],
  46: [
    c => c.filter(v=>v===3).length === 0,
    c => c.filter(v=>v===4).length === 0,
    c => c.filter(v=>v===3).length === 1,
    c => c.filter(v=>v===4).length === 1,
    c => c.filter(v=>v===3).length === 2,
    c => c.filter(v=>v===4).length === 2,
  ],
  47: [
    c => c.filter(v=>v===1).length === 0,
    c => c.filter(v=>v===4).length === 0,
    c => c.filter(v=>v===1).length === 1,
    c => c.filter(v=>v===4).length === 1,
    c => c.filter(v=>v===1).length === 2,
    c => c.filter(v=>v===4).length === 2,
  ],
  48: [
    c => c[0]<c[1],  c => c[0]===c[1], c => c[0]>c[1],
    c => c[0]<c[2],  c => c[0]===c[2], c => c[0]>c[2],
    c => c[1]<c[2],  c => c[1]===c[2], c => c[1]>c[2],
  ],
};

/**
 * Logique de vérification générique pour les clics sur les lettres.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  const mode = state.comments[0].nightmare ? 2 : (state.comments[0].criteriaCards.length > 1 ? 1 : 0);

  const verifierCards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1 ? state.comments.map(({ criteriaCards }) => criteriaCards[1].id) : []),
  ];

  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);
  const cardId = state.comments[slotIndex]?.criteriaCards[0]?.id;

  if (!cardId || !CARD_VERIFIERS[cardId]) return "unsolved";

  // Récupère les sous-indices de lois valides pour la solution du jeu
  const solutionResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards,
    queries: [], // On ne passe pas de requêtes pour trouver la "vraie" loi
    mode,
    numVerifiers,
  });

  const activeSubIndices: number[] = solutionResult.possibleVerifiers?.[slotIndex] ?? [];

  // On teste si le code saisi satisfait LA loi active pour ce vérificateur
  const cardVerifiers = CARD_VERIFIERS[cardId];
  for (const subIdx of activeSubIndices) {
    if (cardVerifiers[subIdx] && cardVerifiers[subIdx](code)) {
      return "solved";
    }
  }

  return "unsolved";
}

export async function getPossibleCodes(comments: CommentsState) {
  const cards = comments.map(({ criteriaCards }) => criteriaCards.map((card) => card.id));
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

let workId = 0;
const promiseResolves: { [id: number]: any } = {};
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
