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

/**
 * Fonction de vérification d'une lettre spécifique (A-F) lors d'un clic dans une manche.
 * Réécrite pour ne tester que le code actuel contre la lettre sélectionnée.
 */
/**
 * Version corrigée : On envoie toutes les cartes pour garder les index alignés,
 * mais on ne pose qu'une seule question au worker pour la lettre cliquée.
 */
export async function verifySingleQuery(
  state: RootState,
  code: number[],
  verifier: string // Exemple: "A", "B", etc.
): Promise<"solved" | "unsolved"> {
  const numVerifiers = state.comments.length;
  
  // 1. On identifie l'index de la lettre (A=0, B=1...)
  const verifierIdxLetter = verifier.charCodeAt(0) - "A".charCodeAt(0);
  
  const mode = (() => {
    if (state.comments[0].nightmare) return 2;
    if (state.comments[0].criteriaCards.length > 1) return 1;
    return 0;
  })();

  // IMPORTANT : Le worker WASM a besoin de la liste complète des cartes 
  // pour que l'index de la lettre corresponde au bon emplacement.
  const allCards = [
    ...state.comments.map(({ criteriaCards }) => criteriaCards[0].id),
    ...(mode === 1
      ? state.comments.map(({ criteriaCards }) => criteriaCards[1]?.id).filter(Boolean)
      : []),
  ];

  const verifierIdxChar = verifier.charCodeAt(0);

  // 2. On demande au worker : "Si on considère que cette lettre est VRAIE pour ce code,
  // reste-t-il des solutions possibles ?"
  const result = await waitForWorker({
    type: "solve_wasm",
    verifierCards: allCards,
    queries: [{ code, verifierIdx: verifierIdxChar, result: true }],
    mode,
    numVerifiers,
  });

  // LOGS pour debug dans la console du navigateur (F12)
  console.log(`Test Lettre ${verifier} avec code ${code.join("")}`, result);

  // 3. Application des règles de décision
  
  // Règle 3.1 : Si le worker ne trouve aucune combinaison de cartes/codes 
  // qui valide ce test, c'est que c'est KO.
  if (!result || result.codes.length === 0) {
    store.dispatch(
      alertActions.openAlert({
        message: `KO: Le code ${code.join("")} ne passe pas le test ${verifier} (unsolved).`,
        level: "error",
      })
    );
    return "unsolved";
  }

  // Règle 3.2 : On vérifie si la lettre testée fait partie des "possibleLetters"
  // renvoyées par le solveur pour ce résultat.
  // Note: result.possibleLetters est un tableau de tableaux ou de strings selon le mode.
  const isLetterPossible = result.possibleLetters[verifierIdxLetter]?.includes(verifier);

  if (!isLetterPossible) {
    store.dispatch(
      alertActions.openAlert({
        message: `KO: La lettre ${verifier} est rejetée par le code ${code.join("")} (unsolved).`,
        level: "warning",
      })
    );
    return "unsolved";
  }

  // Règle 3.3 : Si on arrive ici, c'est OK
  store.dispatch(
    alertActions.openAlert({
      message: `OK: La lettre ${verifier} accepte le code ${code.join("")} (solved) !`,
      level: "success",
    })
  );
  return "solved";
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
