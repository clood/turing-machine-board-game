import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha } from "@mui/material/styles";
import { useAppDispatch } from "hooks/useAppDispatch";
import { FC, useEffect, useState } from "react";
import { commentsActions } from "store/slices/commentsSlice";
import { digitCodeActions } from "store/slices/digitCodeSlice";
import { registrationActions } from "store/slices/registrationSlice";
import { roundsActions } from "store/slices/roundsSlice";
import { parse as parseTuringInfo } from "parsing/turing-copy-paste";
import { parse as parseProblemBook } from "parsing/problem-book";

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
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const csvUrl = process.env.PUBLIC_URL
      ? `${process.env.PUBLIC_URL}/turing_machine.csv`
      : "/turing_machine.csv";

    fetch(csvUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch CSV");
        return res.text();
      })
      .then((text) => {
        const parsed = parseCsv(text);
        setRows(parsed);
        const uniqueLevels: string[] = [];
        for (const row of parsed) {
          if (!uniqueLevels.includes(row.level)) {
            uniqueLevels.push(row.level);
          }
        }
        setLevels(uniqueLevels);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleLevelClick(level: string) {
    const matching = rows.filter((r) => r.level === level);
    if (matching.length === 0) return;
    const random = matching[Math.floor(Math.random() * matching.length)];
    const cardText = random.info;
    const problem = parseTuringInfo(cardText) || parseProblemBook(cardText);
    if (problem === null) return;
    // Stocker le party_info original pour le partage
    dispatch(registrationActions.updatePartyInfo(cardText));
    dispatch(registrationActions.updateHash(problem.code.toUpperCase()));
    dispatch(roundsActions.reset());
    dispatch(commentsActions.reset());
    dispatch(digitCodeActions.reset());
    dispatch(registrationActions.fetchDone());
    dispatch(commentsActions.setCards(problem));
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" pt={2}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Could not load game setups. Please try another method.
      </Alert>
    );
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
