import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import { usePaletteMode } from "hooks/usePaletteMode";
import { useState } from "react";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import MagnifyIcon from "@mui/icons-material/ManageSearchRounded";

// Les 125 codes (111 à 555), groupés par premier chiffre
function buildAllCodes(): { [key: number]: string[] } {
  const result: { [key: number]: string[] } = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  for (let b = 1; b <= 5; b += 1) {
    for (let y = 1; y <= 5; y += 1) {
      for (let p = 1; p <= 5; p += 1) {
        result[b].push(`${b}${y}${p}`);
      }
    }
  }
  return result;
}

// 3 états : "normal" | "greyed" | "outlined"
type CodeState = "normal" | "greyed" | "outlined";

const NEXT_STATE: Record<CodeState, CodeState> = {
  normal: "greyed",
  greyed: "outlined",
  outlined: "normal",
};

const allCodes = buildAllCodes();

export function ManualCodeList() {
  const { theme } = usePaletteMode();

  const [expanded, setExpanded] = useState(false);
  const [hide, setHide] = useState(false);

  // Map code → état
  const [codeStates, setCodeStates] = useState<Record<string, CodeState>>({});

  function getState(code: string): CodeState {
    return codeStates[code] ?? "normal";
  }

  function handleClick(code: string) {
    const current = getState(code);
    const next = NEXT_STATE[current];
    setCodeStates((prev) => ({ ...prev, [code]: next }));
  }

  function toggleExpanded() {
    setExpanded((v) => !v);
  }

  function toggleHidden() {
    setHide((v) => !v);
  }

  return (
    <Paper
      component="section"
      id="manual-code-list-section"
      sx={{ width: 320, margin: theme.spacing(0, "auto", 2) }}
    >
      <Box p={2} mt={2}>
        <Box display="flex" justifyContent="space-between" zIndex={1}>
          <Button onClick={toggleExpanded}>
            {expanded ? "Hide code list" : "Show code list"}
          </Button>
          {expanded && (
            <IconButton onClick={toggleHidden} disabled={!expanded}>
              <Tooltip
                id="manual-code-list-filter"
                title={hide ? "Show greyed codes" : "Hide greyed codes"}
              >
                <MagnifyIcon />
              </Tooltip>
            </IconButton>
          )}
        </Box>

        <Collapse in={expanded}>
          <Grid container spacing={8}>
            {[1, 2, 3, 4, 5].map((number) => (
              <Grid item xs={2} key={number}>
                {allCodes[number].map((code) => {
                  const state = getState(code);
                  // Le filtre masque uniquement les grisés
                  if (hide && state === "greyed") return null;

                  return (
                    <Grid item xs={2} key={code}>
                      <Box
                        component="span"
                        onClick={() => handleClick(code)}
                        sx={{
                          cursor: "pointer",
                          display: "inline-block",
                          userSelect: "none",
                          // État grisé : texte gris clair
                          color:
                            state === "greyed"
                              ? theme.palette.text.disabled
                              : theme.palette.text.primary,
                          // État entouré : bordure noire, texte noir forcé
                          border:
                            state === "outlined"
                              ? `1.5px solid ${theme.palette.text.primary}`
                              : "1.5px solid transparent",
                          borderRadius: "3px",
                          px: "2px",
                          lineHeight: 1.4,
                        }}
                      >
                        {code}
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            ))}
          </Grid>
        </Collapse>
      </Box>
    </Paper>
  );
}
