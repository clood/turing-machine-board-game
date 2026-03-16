import { RootState, store } from "store";
import { alertActions } from "store/slices/alertSlice";
import { CommentsState } from "store/slices/commentsSlice";

export type Query = {
  code: number[];
  verifierIdx: number;
  result: boolean;
};

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
      // the verifiers are 1-indexed in the frontend
      if (possibleVerifiers[i].includes(criteria - 1)) {
        return false;
      }
    }
    // extreme mode
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
        verifierIdx: query.verifier.charCodeAt(0),
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

  console.log(result);
  console.log(state);
  if (result.codes.length === 0) {
    store.dispatch(
      alertActions.openAlert({
        message: `There are no more possible codes.
          Please double-check that you have the correct verifiers and that your query results are correct.
          If this problem still occurs, please file a bug report.`,
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

/**
 * Verifies a single query (one verifier for one code) against the WASM solver.
 * Sends the code with result=true and result=false, and checks which one
 * yields possible codes. Returns "solved" if true works, "unsolved" otherwise.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: Verifier
): Promise<"solved" | "unsolved"> {
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

  const verifierIdx = verifier.charCodeAt(0);

  // Test with result = true (solved)
  const resultTrue = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  // Test with result = false (unsolved)
  const resultFalse = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code, verifierIdx, result: false }],
    mode,
    numVerifiers,
  });

  // If "solved" yields possible codes and "unsolved" does not, it's solved.
  // If "unsolved" yields possible codes and "solved" does not, it's unsolved.
  // If both yield codes, we compare: the correct answer is the one that
  // doesn't eliminate possibilities (both are valid in theory, but the game
  // guarantees exactly one answer per verifier+code combo).
  if (resultTrue.codes.length > 0 && resultFalse.codes.length === 0) {
    return "solved";
  }
  if (resultFalse.codes.length > 0 && resultTrue.codes.length === 0) {
    return "unsolved";
  }

  // Both have codes — this means the single query alone can't determine
  // the answer (other queries are needed to narrow down). In this case,
  // we need to include all existing known queries to get the right context.
  const existingQueries: Query[] = [];
  for (const round of state.rounds) {
    const roundCode: number[] = [];
    for (const { digit } of round.code) {
      if (!(digit !== null && digit >= 1 && digit <= 5)) {
        continue;
      }
      roundCode.push(digit);
    }
    if (roundCode.length !== 3) {
      continue;
    }
    for (const query of round.queries) {
      if (query.state === "unknown") {
        continue;
      }
      existingQueries.push({
        code: roundCode,
        verifierIdx: query.verifier.charCodeAt(0),
        result: query.state === "solved",
      });
    }
  }

  // Test with all existing queries + this new one as solved
  const contextResultTrue = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [...existingQueries, { code, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  // Test with all existing queries + this new one as unsolved
  const contextResultFalse = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [...existingQueries, { code, verifierIdx, result: false }],
    mode,
    numVerifiers,
  });

  if (
    contextResultTrue.codes.length > 0 &&
    contextResultFalse.codes.length === 0
  ) {
    return "solved";
  }

  // Default to unsolved
  return "unsolved";
}

export async function getPossibleCodes(comments: CommentsState) {
  const cards = comments.map(({ criteriaCards }) => {
    return criteriaCards.map((card) => card.id);
  });
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
  console.log(cards, possibleVerifiers);

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
  resolve(data);
  delete promiseResolves[data.id];
};
