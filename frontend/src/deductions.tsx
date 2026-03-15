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
 * How it works:
 *
 * 1. Call solve_wasm with NO queries to get the puzzle solution.
 *    This gives us:
 *    - solutionResult.codes[0]          → the unique solution code (e.g. "532")
 *    - solutionResult.possibleVerifiers → for each card slot i, the list of
 *      verifier sub-indices (0-based within the card) that are active in the
 *      solution. For a classic puzzle with one unique solution, each slot has
 *      exactly one active verifier sub-index.
 *
 * 2. Find which verifier sub-index (within its card) is the active one for
 *    the requested machine letter (e.g. "B" = slot index 1).
 *    possibleVerifiers[slotIndex][0] gives that sub-index.
 *
 * 3. Test the ENTERED code against that specific verifier sub-index:
 *    - Call solve_wasm with { code: enteredCode, verifierIdx: letterAsAscii, result: true }
 *    - AND separately with result: false
 *    The solutionCode already tells us the ground truth. We know the correct
 *    result for solutionCode (it must be true, since it's the solution and the
 *    active verifier passes it by definition).
 *
 * 4. Correct approach: compare what the active verifier does to the entered
 *    code vs what it does to the solution code.
 *    - Call solve_wasm with { code: solutionCode, verifierIdx: letter, result: true }
 *      → this MUST return codes (the solution verifier passes the solution code)
 *    - Call solve_wasm with { code: enteredCode, verifierIdx: letter, result: true }
 *      → if this also returns codes, it means result=true is consistent for
 *         both enteredCode and solutionCode → "solved"
 *      → if this returns 0 codes, result=true is NOT consistent for enteredCode
 *         → "unsolved"
 *
 * NOTE on verifierIdx in query_t (C++ side):
 *   query_t.verifierIdx is a CHAR ('A', 'B', 'C'...), i.e. the MACHINE SLOT letter.
 *   It is NOT the 0-based index within the card's verifier list.
 *   The solver uses it to eliminate letter-machine associations.
 *   So we correctly pass verifier.charCodeAt(0) as verifierIdx.
 *
 * NOTE on 1-based vs 0-based indexing:
 *   - irrelevantCriteria in the frontend is 1-based (slot 1, 2, 3...)
 *   - possibleVerifiers returned by the solver is 0-based
 *   - checkVerifiers already handles this with (criteria - 1)
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

  // verifierIdx as ASCII char: 'A'=65, 'B'=66, etc. — this is what solver expects
  const verifierIdx = verifier.charCodeAt(0);

  // Slot index of this verifier in the comments array (0-based: A=0, B=1, ...)
  const slotIndex = verifier.charCodeAt(0) - "A".charCodeAt(0);

  // Step 1: solve with no queries to get solution code + active verifier sub-indices
  const solutionResult = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [],
    mode,
    numVerifiers,
  });

  if (solutionResult.codes.length !== 1) {
    return "unsolved";
  }

  const solutionStr: string = solutionResult.codes[0]; // e.g. "532"
  const solutionCode: number[] = [
    Number(solutionStr[0]),
    Number(solutionStr[1]),
    Number(solutionStr[2]),
  ];

  // Step 2: test solutionCode with result=true for this verifier
  // This MUST return codes > 0 (the solution verifier passes the solution code)
  const resultForSolutionCode = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code: solutionCode, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  if (resultForSolutionCode.codes.length === 0) {
    // Should never happen for a valid puzzle, but guard anyway
    return "unsolved";
  }

  // Step 3: test the entered code with result=true for this verifier
  const resultForEnteredCode = await waitForWorker({
    type: "solve_wasm",
    verifierCards: cards,
    queries: [{ code, verifierIdx, result: true }],
    mode,
    numVerifiers,
  });

  // Step 4: if the entered code is also consistent with result=true → "solved"
  if (resultForEnteredCode.codes.length > 0) {
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
