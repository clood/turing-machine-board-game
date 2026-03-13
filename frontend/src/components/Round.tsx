import SolvedIcon from "@mui/icons-material/CheckBoxRounded";
import UnsolvedIcon from "@mui/icons-material/DisabledByDefaultRounded";
import BlankBoxIcon from "@mui/icons-material/CheckBoxOutlineBlankRounded";
import DeleteIcon from "@mui/icons-material/UndoRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import { alpha, useTheme } from "@mui/material/styles";
import { useAppDispatch } from "hooks/useAppDispatch";
import { useAppSelector } from "hooks/useAppSelector";
import { FC } from "react";
import { verifySingleQuery } from "deductions";
import { alertActions } from "store/slices/alertSlice";
import { RoundsState, roundsActions } from "store/slices/roundsSlice";
import ShapeIcon from "./ShapeIcon";
import SingleCharLabel from "./SingleCharLabel";
import TextField from "./TextField";

type Props = {
  round: RoundsState[number];
  index: number;
};

const Round: FC<Props> = ({ round, index }) => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const state = useAppSelector((state) => state);

  const codeDigits = round.code.map((c) => c.digit);
  const hasCompleteCode =
    codeDigits.length === 3 &&
    codeDigits.every((d) => d !== null && d >= 1 && d <= 5);

  return (
    <Box>
      <Grid container spacing={0.5}>
        {round.code.map((code) => (
          <Grid key={code.shape} item xs={4}>
            <TextField
              prefixId={`rounds__round-${index + 1}-${code.shape}`}
              customRadius={
                code.shape !== "square"
                  ? code.shape === "triangle"
                    ? theme.spacing(2, 0, 0, 0)
                    : theme.spacing(0, 2, 0, 0)
                  : undefined
              }
              value={code.digit}
              placeHolder="?"
              onChange={(value) => {
                dispatch(
                  roundsActions.updateCodeDigit({
                    index,
                    shape: code.shape,
                    digit: value ? (Number(value) as Digit) : null,
                  })
                );
              }}
              iconRender={
                <ShapeIcon
                  shape={code.shape as "triangle" | "square" | "circle"}
                  sizeMultiplier={0.5}
                />
              }
              type="number"
            />
          </Grid>
        ))}
      </Grid>

      <Box mt={0.5}>
        <Grid container spacing={0.5}>
          {round.queries.map((query) => (
            <Grid item xs={2} key={query.verifier}>
              <Button
                id={`rounds__round-${
                  index + 1
                }-verifier-${query.verifier.toLowerCase()}-button`}
                arial-label={query.verifier}
                sx={{
                  minWidth: "100%",
                  p: 0,
                  background:
                    query.verifier === "E" || query.verifier === "F"
                      ? alpha(theme.palette.primary.main, 0.1)
                      : null,
                  borderRadius: theme.spacing(
                    0,
                    0,
                    query.verifier === "F" ? 2 : 0,
                    query.verifier === "A" ? 2 : 0
                  ),
                }}
                onClick={async () => {
                  // (1) Code incomplete => toast 3s, do not change state (stay unknown)
                  if (!hasCompleteCode) {
                    dispatch(
                      alertActions.openAlert({
                        level: "info",
                        message:
                          "Veuillez saisir les 3 chiffres de cette manche pour pouvoir vérifier une lettre.",
                      })
                    );
                    return;
                  }

                  // (3) Already verified => toast 3s, keep current state
                  if (query.state !== "unknown") {
                    dispatch(
                      alertActions.openAlert({
                        level: "info",
                        message:
                          "Cette lettre a déjà été vérifiée pour cette manche.",
                      })
                    );
                    return;
                  }

                  // Code complete + unknown => auto verify and set solved/unsolved
                  const code = codeDigits as number[];
                  const newState = await verifySingleQuery(
                    state,
                    code,
                    query.verifier
                  );

                  // updateQueryState: unknown -> unsolved
                  dispatch(
                    roundsActions.updateQueryState({
                      index,
                      verifier: query.verifier,
                    })
                  );

                  // if solved => unsolved -> solved (second toggle)
                  if (newState === "solved") {
                    dispatch(
                      roundsActions.updateQueryState({
                        index,
                        verifier: query.verifier,
                      })
                    );
                  }
                }}
              >
                <Box width={1}>
                  <Box
                    sx={{
                      textAlign: "center",
                      borderRadius:
                        query.verifier === "F"
                          ? theme.spacing(0, 0, 2, 0)
                          : null,
                    }}
                  >
                    <SingleCharLabel>{query.verifier}</SingleCharLabel>
                    <Box position="relative">
                      <Box>
                        {query.state === "unknown" && (
                          <BlankBoxIcon
                            sx={{ color: theme.palette.primary.main }}
                          />
                        )}
                        {query.state === "solved" && (
                          <SolvedIcon sx={{ color: theme.palette.primary.dark }} />
                        )}
                        {query.state === "unsolved" && (
                          <UnsolvedIcon
                            sx={{ color: theme.palette.secondary.dark }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Button>
            </Grid>
          ))}
        </Grid>
      </Box>

      {round.isPristine && (
        <Box>
          <Box mt={2}>
            <Button
              id={`rounds__round-${index + 1}-undo-button`}
              aria-label="undo"
              color="secondary"
              fullWidth
              size="small"
              onClick={() => {
                dispatch(roundsActions.deleteRound(index));
              }}
            >
              <DeleteIcon />
            </Button>
          </Box>
        </Box>
      )}

      <Box my={2}>
        <Divider />
      </Box>
    </Box>
  );
};

export default Round;
