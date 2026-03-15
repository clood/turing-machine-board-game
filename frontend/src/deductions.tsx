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
 *
 * Strategy:
 * 1. Call solve_wasm with NO queries to get the unique solution code of the puzzle.
 * 2. Call solve_wasm with { enteredCode, verifier, result: true } → resultEntered
 * 3. Call solve_wasm with { solutionCode, verifier, result: true } → resultSolution
 * 4. If BOTH return codes.length > 0 → the verifier passes the entered code → "solved"
 *    Otherwise → "unsolved"
 *
 * Rationale: the verifier passes the entered code if and only if it also passes
 * the solution code in the same way. If result=true is consistent for both codes,
 * the verifier genuinely passes. If the solution code gives 0 results with result=true,
 * it means the verifier does NOT pass (the correct answer is false) → unsolved.
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

  // Step 1 : get the unique solution code via solve_wasm with no queries
  const solutionResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [],
    mode,
    numVerifiers,
  });

  if (solutionResult.codes.length !== 1) {
    // Puzzle has no unique solution — cannot determine result
    return "unsolved";
  }

  const solutionStr: string = solutionResult.codes[0]; // e.g. "532"
  const solutionCode: number[] = [
    Number(solutionStr[0]),
    Number(solutionStr[1]),
    Number(solutionStr[2]),
  ];

  // Step 2 : test the entered code with result=true for this verifier
  const resultForEnteredCode = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  // Step 3 : test the solution code with result=true for this verifier
  const resultForSolutionCode = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code: solutionCode, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  // Step 4 : if both are consistent with result=true → "solved", else → "unsolved"
  if (
    resultForEnteredCode.codes.length > 0 &&
    resultForSolutionCode.codes.length > 0
  ) {
    return "solved";
  }

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
