import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { alpha } from "@mui/material/styles";
import { useAppDispatch } from "hooks/useAppDispatch";
import { FC } from "react";
import { commentsActions } from "store/slices/commentsSlice";
import { digitCodeActions } from "store/slices/digitCodeSlice";
import { registrationActions } from "store/slices/registrationSlice";
import { roundsActions } from "store/slices/roundsSlice";
import { parse as parseTuringInfo } from "parsing/turing-copy-paste";
import { parse as parseProblemBook } from "parsing/problem-book";

// Import CSV as raw text (requires either a loader or manual fetch)
// We'll use a static import approach via require for CRA
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rawCsv: string = require("../turing_machine.csv");

interface CsvRow {
  level: string;
  info: string;
}

function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).slice(1).filter((l) => l.trim());
  return lines.map((line) => {
    const commaIdx = line.indexOf(",");
    const level = line.substring(0, commaIdx).trim();
    let info = line.substring(commaIdx + 1).trim();
    if (info.startsWith('"') && info.endsWith('"')) {
      info = info.slice(1, -1).replace(/""/g, '"');
    }
    return { level, info };
  });
}

const rows = parseCsv(rawCsv);

const levels: string[] = [];
for (const row of rows) {
  if (!levels.includes(row.level)) {
    levels.push(row.level);
  }
}

const LEVEL_LABELS: Record<string, string> = {
  easy: "Easy",
  classic: "Classic",
  hard: "Hard",
  extreme_hard_4: "Extreme Hard (4)",
  extreme_hard_5: "Extreme Hard (5)",
  extreme_hard_6: "Extreme Hard (6)",
  nightmare_4: "Nightmare (4)",
  nightmare_5: "Nightmare (5)",
  nightmare_6: "Nightmare (6)",
};

const AutoRegistration: FC = () => {
  const dispatch = useAppDispatch();

  function handleLevelClick(level: string) {
    const matching = rows.filter((r) => r.level === level);
    if (matching.length === 0) return;
    const random = matching[Math.floor(Math.random() * matching.length)];
    const cardText = random.info;
    const problem = parseTuringInfo(cardText) || parseProblemBook(cardText);
    if (problem === null) return;
    dispatch(registrationActions.updateHash(problem.code.toUpperCase()));
    dispatch(roundsActions.reset());
    dispatch(commentsActions.reset());
    dispatch(digitCodeActions.reset());
    dispatch(registrationActions.fetchDone());
    dispatch(commentsActions.setCards(problem));
  }

  return (
    <>
      <Alert severity="info" sx={{ mb: 1 }}>
        Choose a difficulty level to load a random game setup automatically.
      </Alert>
      <Box display="flex" flexWrap="wrap" gap={1} pt={0.5}>
        {levels.map((level) => (
          <Button
            key={level}
            variant="outlined"
            onClick={() => handleLevelClick(level)}
            sx={(theme) => ({
              background: alpha(theme.palette.primary.main, 0.05),
              fontFamily: "Kalam",
              fontSize: 18,
              textTransform: "none",
              "&:hover": {
                background: alpha(theme.palette.primary.main, 0.15),
              },
            })}
          >
            {LEVEL_LABELS[level] ?? level}
          </Button>
        ))}
      </Box>
    </>
  );
};

export default AutoRegistration;
